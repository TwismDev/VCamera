/** Arrival-time arithmetic and wording. Pure, so it is unit testable. */

export const MINUTE_MS = 60_000;

/** Whole minutes between now and an arrival time. Negative once it is overdue. */
export function minutesUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return null;
  return Math.round((target - now) / MINUTE_MS);
}

/** An arrival time this many minutes from now, as an ISO string. */
export function etaFromMinutes(minutes: number, now: number = Date.now()): string {
  const safe = Math.max(0, Math.round(minutes));
  return new Date(now + safe * MINUTE_MS).toISOString();
}

/** Rounds up to a tidier number so drivers quote 15 rather than 13 minutes. */
export function roundUpToStep(minutes: number, step = 5): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return step;
  return Math.ceil(minutes / step) * step;
}

/** Human wording for how long is left: "12 min", "1 h 05", "8 min late". */
export function describeEta(iso: string | null | undefined, now: number = Date.now()): string {
  const minutes = minutesUntil(iso, now);
  if (minutes === null) return 'No ETA yet';
  if (minutes < -1) return `${Math.abs(minutes)} min late`;
  if (minutes <= 0) return 'Due now';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h ${String(rest).padStart(2, '0')}`;
}

/** True when an arrival time has passed by more than the grace period. */
export function isOverdue(iso: string | null | undefined, now: number = Date.now(), graceMinutes = 2): boolean {
  const minutes = minutesUntil(iso, now);
  return minutes !== null && minutes < -graceMinutes;
}

/**
 * True when a position fix is too old to be shown as live. A driver in a tunnel
 * or with the app killed should read as "last seen", not as a current location.
 */
export function isPositionStale(
  iso: string | null | undefined,
  now: number = Date.now(),
  thresholdSeconds = 180,
): boolean {
  if (!iso) return true;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return true;
  return now - at > thresholdSeconds * 1000;
}

/**
 * Whether a freshly computed estimate is different enough from the one the
 * dispatcher already has to be worth pushing. Without this the app would
 * rewrite the ETA on every GPS tick and the job timeline would be unreadable.
 */
export function shouldRefreshEta(
  currentIso: string | null | undefined,
  nextIso: string,
  toleranceMinutes = 3,
): boolean {
  if (!currentIso) return true;
  const current = Date.parse(currentIso);
  const next = Date.parse(nextIso);
  if (Number.isNaN(current) || Number.isNaN(next)) return true;
  return Math.abs(next - current) >= toleranceMinutes * MINUTE_MS;
}
