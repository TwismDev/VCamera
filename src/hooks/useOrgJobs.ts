import { useCallback, useEffect, useState } from 'react';

import { listDriverJobs, listOrgJobs } from '@/api/jobs';
import { supabase } from '@/lib/supabase';
import type { Job, JobStatus } from '@/lib/types';

interface Options {
  orgId: string;
  /** Set for a driver so only their own jobs are fetched and watched. */
  driverId?: string;
  statuses?: JobStatus[];
}

/**
 * Keeps a job list in step with the database.
 *
 * The first load is a plain query; after that the realtime channel patches the
 * list in place, so the dispatcher sees a driver accept a job or move to the
 * next stage without pulling to refresh.
 */
export function useOrgJobs({ orgId, driverId, statuses }: Options) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Callers pass a fresh array literal on most renders. Collapsing it to a
  // string gives the effects a dependency that only changes when the filter
  // really does, instead of on every render.
  const statusKey = statuses?.join(',') ?? '';

  useEffect(() => {
    let cancelled = false;

    fetchJobs(orgId, driverId, statusKey)
      .then((next) => {
        if (cancelled) return;
        setJobs(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'Could not load jobs');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, driverId, statusKey]);

  /** Manual refresh, for pull-to-refresh and after an action. */
  const reload = useCallback(async () => {
    try {
      setJobs(await fetchJobs(orgId, driverId, statusKey));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load jobs');
    }
  }, [orgId, driverId, statusKey]);

  useEffect(() => {
    const wanted = parseStatusKey(statusKey);

    const belongsHere = (job: Job): boolean => {
      if (job.org_id !== orgId) return false;
      if (driverId && job.assigned_to !== driverId) return false;
      return !wanted || wanted.includes(job.status);
    };

    const channel = supabase
      .channel(`jobs:${orgId}:${driverId ?? 'all'}:${statusKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs', filter: `org_id=eq.${orgId}` },
        (payload) => {
          setJobs((current) => {
            if (payload.eventType === 'DELETE') {
              const removed = payload.old as Partial<Job>;
              return current.filter((job) => job.id !== removed.id);
            }

            const row = payload.new as Job;
            const without = current.filter((job) => job.id !== row.id);

            // A row can leave the list either by being reassigned away from this
            // driver or by moving out of the status filter.
            if (!belongsHere(row)) return without;

            return [row, ...without].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, driverId, statusKey]);

  return { jobs, loading, error, reload };
}

function fetchJobs(orgId: string, driverId: string | undefined, statusKey: string): Promise<Job[]> {
  const wanted = parseStatusKey(statusKey);
  return driverId ? listDriverJobs(driverId, wanted) : listOrgJobs(orgId, wanted);
}

function parseStatusKey(statusKey: string): JobStatus[] | undefined {
  return statusKey ? (statusKey.split(',') as JobStatus[]) : undefined;
}
