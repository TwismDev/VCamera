import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PendingPing } from './types';

/**
 * Holds position fixes that could not be sent.
 *
 * Delivery drivers lose signal in car parks, lifts and rural stretches. Without
 * a buffer those minutes would simply be missing from the dispatcher's map. The
 * queue is bounded so a long outage cannot fill the device's storage.
 */

const QUEUE_KEY = 'tracking.pending-pings.v1';
const MAX_QUEUED = 500;

let writeLock: Promise<unknown> = Promise.resolve();

/** Serialises access so the background task and the UI cannot interleave writes. */
function withLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = writeLock.then(operation, operation);
  writeLock = run.catch(() => undefined);
  return run;
}

async function readRaw(): Promise<PendingPing[]> {
  try {
    const stored = await AsyncStorage.getItem(QUEUE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as PendingPing[]) : [];
  } catch {
    return [];
  }
}

async function writeRaw(pings: PendingPing[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(pings));
  } catch (error) {
    console.warn('Could not persist the position queue', error);
  }
}

export async function enqueue(...pings: PendingPing[]): Promise<void> {
  if (pings.length === 0) return;
  await withLock(async () => {
    const existing = await readRaw();
    const merged = [...existing, ...pings];
    // Oldest fixes are dropped first: a stale position is worth less than a
    // recent one once the backlog has to be trimmed.
    await writeRaw(merged.slice(-MAX_QUEUED));
  });
}

/** Hands the whole backlog over and clears it in one atomic step. */
export async function drain(): Promise<PendingPing[]> {
  return withLock(async () => {
    const existing = await readRaw();
    if (existing.length > 0) await writeRaw([]);
    return existing;
  });
}

/** Puts a failed batch back at the front so ordering survives a retry. */
export async function requeue(pings: PendingPing[]): Promise<void> {
  if (pings.length === 0) return;
  await withLock(async () => {
    const existing = await readRaw();
    await writeRaw([...pings, ...existing].slice(-MAX_QUEUED));
  });
}

export async function size(): Promise<number> {
  const existing = await readRaw();
  return existing.length;
}

export async function clear(): Promise<void> {
  await withLock(() => writeRaw([]));
}
