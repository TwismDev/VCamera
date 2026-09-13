import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { subscribeToChanges } from '@/lib/realtime';
import { supabase } from '@/lib/supabase';
import type { JobPatch, JobWithDriver } from '@/lib/types';

const JOB_SELECT = '*, driver:profiles!jobs_driver_id_fkey (id, full_name, phone)';

type Scope = { orgId: string; driverId?: string | null };

/**
 * The job list for whoever is signed in — every job in the org for a boss, only
 * their own for a driver — kept live over Supabase realtime.
 */
export function useJobs(scope: Scope | null) {
  const [jobs, setJobs] = useState<JobWithDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const orgId = scope?.orgId ?? null;
  const driverId = scope?.driverId ?? null;

  const load = useCallback(async () => {
    if (!orgId) {
      setJobs([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from('jobs')
      .select(JOB_SELECT)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (driverId) query = query.eq('driver_id', driverId);

    const { data, error: queryError } = await query;
    if (queryError) setError(queryError.message);
    else {
      setError(null);
      setJobs((data ?? []) as unknown as JobWithDriver[]);
    }
    setLoading(false);
  }, [orgId, driverId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime deliberately triggers a refetch rather than patching state in
  // place: the payload has no joined driver, and job lists are small.
  useEffect(() => {
    if (!orgId) return;

    return subscribeToChanges(
      `jobs:${orgId}:${driverId ?? 'all'}`,
      { table: 'jobs', filter: `org_id=eq.${orgId}` },
      () => void load(),
    );
  }, [orgId, driverId, load]);

  return { jobs, loading, error, reload: load };
}

/** A single job, kept live. */
export function useJob(jobId: string | undefined) {
  const [job, setJob] = useState<JobWithDriver | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!jobId) return;
    const { data } = await supabase.from('jobs').select(JOB_SELECT).eq('id', jobId).maybeSingle();
    if (!mounted.current) return;
    setJob((data as unknown as JobWithDriver | null) ?? null);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!jobId) return;

    return subscribeToChanges(
      `job:${jobId}`,
      { table: 'jobs', filter: `id=eq.${jobId}`, event: 'UPDATE' },
      () => void load(),
    );
  }, [jobId, load]);

  return { job, loading, reload: load };
}

export async function updateJob(jobId: string, patch: JobPatch): Promise<void> {
  const { error } = await supabase.from('jobs').update(patch).eq('id', jobId);
  if (error) throw error;
}

/** Splits a list into the jobs still needing action and the ones that are done. */
export function usePartitionedJobs(jobs: JobWithDriver[]) {
  return useMemo(() => {
    const open = jobs.filter((job) => ['assigned', 'accepted', 'en_route'].includes(job.status));
    const closed = jobs.filter((job) => !['assigned', 'accepted', 'en_route'].includes(job.status));
    return { open, closed };
  }, [jobs]);
}
