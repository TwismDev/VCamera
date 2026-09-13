import { useCallback, useEffect, useState } from 'react';

import { fetchDriverStatuses } from '@/api/locations';
import { supabase } from '@/lib/supabase';
import type { DriverStatus } from '@/lib/types';

/**
 * The dispatcher's live view of the fleet.
 *
 * Position rows arrive over realtime and are merged straight into the list, so
 * markers move on the map as drivers do. Job changes are coarser and cannot be
 * patched into a joined view reliably, so they trigger a refetch instead.
 */
export function useDriverStatuses(orgId: string) {
  const [drivers, setDrivers] = useState<DriverStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setDrivers(await fetchDriverStatuses(orgId));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your drivers');
    }
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;

    fetchDriverStatuses(orgId)
      .then((next) => {
        if (cancelled) return;
        setDrivers(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'Could not load your drivers');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    const channel = supabase
      .channel(`fleet:${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations', filter: `org_id=eq.${orgId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          const row = payload.new as {
            driver_id: string;
            lat: number;
            lng: number;
            speed_mps: number | null;
            heading_deg: number | null;
            battery_pct: number | null;
            recorded_at: string;
            updated_at: string;
          };

          let unknownDriver = false;

          setDrivers((current) => {
            const index = current.findIndex((driver) => driver.driver_id === row.driver_id);
            if (index === -1) {
              // A driver this list has never seen means a new team member. Their
              // name and current job are not in this row, so a refetch is needed.
              unknownDriver = true;
              return current;
            }

            const next = [...current];
            next[index] = {
              ...current[index]!,
              lat: row.lat,
              lng: row.lng,
              speed_mps: row.speed_mps,
              heading_deg: row.heading_deg,
              battery_pct: row.battery_pct,
              position_recorded_at: row.recorded_at,
              position_updated_at: row.updated_at,
            };
            return next;
          });

          if (unknownDriver) void reload();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs', filter: `org_id=eq.${orgId}` },
        () => {
          void reload();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, reload]);

  return { drivers, loading, error, reload };
}
