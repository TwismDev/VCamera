import type { JobStatus } from './types';

export function money(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return `$${n.toFixed(2)}`;
}

export function minutesLabel(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Elapsed time along a GPS trail, from first ping to last. */
export function durationLabel(ms: number): string {
  if (ms < 30_000) return 'under a minute';
  return minutesLabel(Math.max(1, Math.round(ms / 60_000)));
}

export function clockTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 15) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  assigned: 'Awaiting driver',
  accepted: 'Accepted',
  en_route: 'On the way',
  completed: 'Delivered',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

/** Statuses that still need someone to do something. */
export const OPEN_STATUSES: JobStatus[] = ['assigned', 'accepted', 'en_route'];
