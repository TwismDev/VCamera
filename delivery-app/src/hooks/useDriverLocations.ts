import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { DriverLocationWithProfile } from '@/lib/types';

const SELECT = '*, driver:profiles!driver_locations_driver_id_fkey (id, full_name, phone)';

/** Live positions of every driver in the org. */
export function useDriverLocations(orgId: string | null | undefined) {
  const [locations, setLocations] = useState<DriverLocationWithProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orgId) {
      setLocations([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('driver_locations')
      .select(SELECT)
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false });

    setLocations((data ?? []) as unknown as DriverLocationWithProfile[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`driver_locations:${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations',
          filter: `org_id=eq.${orgId}`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, load]);

  return { locations, loading, reload: load };
}
