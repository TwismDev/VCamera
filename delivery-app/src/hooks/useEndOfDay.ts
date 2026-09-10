import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { JobWithDriver } from '@/lib/types';

const JOB_SELECT = '*, driver:profiles!jobs_driver_id_fkey (id, full_name, phone)';

/** Local midnight-to-midnight, so "today" means the dispatcher's today. */
export function dayRange(day: Date): { start: Date; end: Date } {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function isToday(day: Date): boolean {
  const now = new Date();
  return (
    day.getFullYear() === now.getFullYear() &&
    day.getMonth() === now.getMonth() &&
    day.getDate() === now.getDate()
  );
}

export function addDays(day: Date, delta: number): Date {
  const next = new Date(day);
  next.setDate(next.getDate() + delta);
  return next;
}

export type DriverTotal = {
  driverId: string;
  name: string;
  deliveries: number;
  collected: number;
};

/**
 * Everything delivered on one day, with the cash reconciliation a dispatcher
 * needs at knock-off: what was collected, what was due, and who is holding it.
 */
export function useEndOfDay(orgId: string | null | undefined, day: Date) {
  const [jobs, setJobs] = useState<JobWithDriver[]>([]);
  const [loading, setLoading] = useState(true);

  const { start, end } = useMemo(() => dayRange(day), [day]);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const load = useCallback(async () => {
    if (!orgId) {
      setJobs([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('jobs')
      .select(JOB_SELECT)
      .eq('org_id', orgId)
      .eq('status', 'completed')
      .gte('completed_at', startIso)
      .lte('completed_at', endIso)
      .order('completed_at', { ascending: true });

    setJobs((data ?? []) as unknown as JobWithDriver[]);
    setLoading(false);
  }, [orgId, startIso, endIso]);

  useEffect(() => {
    void load();
  }, [load]);

  // A job finishing while the sheet is open should land on it straight away.
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`eod:${orgId}:${startIso}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs', filter: `org_id=eq.${orgId}` },
        () => void load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, startIso, load]);

  const totals = useMemo(() => {
    const collected = jobs.reduce((sum, job) => sum + Number(job.cash_collected ?? 0), 0);
    const expected = jobs.reduce((sum, job) => sum + Number(job.cash_to_collect), 0);
    const items = jobs.reduce((sum, job) => sum + (job.delivered_product_count ?? 0), 0);

    const byDriver = new Map<string, DriverTotal>();
    for (const job of jobs) {
      const id = job.driver_id ?? 'unassigned';
      const existing = byDriver.get(id) ?? {
        driverId: id,
        name: job.driver?.full_name || 'Unassigned',
        deliveries: 0,
        collected: 0,
      };
      existing.deliveries += 1;
      existing.collected += Number(job.cash_collected ?? 0);
      byDriver.set(id, existing);
    }

    return {
      collected,
      expected,
      variance: collected - expected,
      deliveries: jobs.length,
      items,
      driverAdded: jobs.filter((job) => job.origin === 'driver').length,
      byDriver: [...byDriver.values()].sort((a, b) => b.collected - a.collected),
      short: jobs.filter((job) => Number(job.cash_collected ?? 0) < Number(job.cash_to_collect)),
    };
  }, [jobs]);

  return { jobs, totals, loading, reload: load };
}
