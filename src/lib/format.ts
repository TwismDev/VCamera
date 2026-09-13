/** Presentation helpers. Pure, so they are unit testable. */

import type { JobStatus } from './types';

export function formatMoney(amount: number | null | undefined, currency = 'USD'): string {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // An unrecognised currency code should not blank out the screen.
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "just now", "4 min ago", "2 h ago", "3 d ago". */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'never';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 'never';

  const seconds = Math.round((now - at) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} d ago`;
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  unassigned: 'Unassigned',
  assigned: 'Awaiting driver',
  accepted: 'Accepted',
  declined: 'Declined',
  en_route: 'On the way',
  arrived: 'At the address',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  unassigned: '#64748B',
  assigned: '#D97706',
  accepted: '#2563EB',
  declined: '#DC2626',
  en_route: '#0891B2',
  arrived: '#7C3AED',
  completed: '#16A34A',
  cancelled: '#475569',
};

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase();
  return `${(parts[0] ?? '').charAt(0)}${(parts[parts.length - 1] ?? '').charAt(0)}`.toUpperCase();
}

/**
 * Flags a completion report that does not match what was ordered, which is the
 * dispatcher's cue to follow it up.
 */
export function reconcile(
  ordered: number,
  delivered: number | null,
  cashExpected: number,
  cashCollected: number | null,
): { matches: boolean; productShortfall: number; cashShortfall: number } {
  const productShortfall = ordered - (delivered ?? ordered);
  const cashShortfall = Number((cashExpected - (cashCollected ?? cashExpected)).toFixed(2));
  return {
    matches: productShortfall === 0 && cashShortfall === 0,
    productShortfall,
    cashShortfall,
  };
}
