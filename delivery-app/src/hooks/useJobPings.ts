import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { LocationPing } from '@/lib/types';

/** Breadcrumb trail for one job, oldest fix first. */
export function useJobPings(jobId: string | undefined) {
  const [pings, setPings] = useState<LocationPing[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!jobId) {
      setPings([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('location_pings')
      .select('*')
      .eq('job_id', jobId)
      .order('recorded_at', { ascending: true })
      .limit(3000);

    setPings((data ?? []) as LocationPing[]);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { pings, loading, reload: load };
}
