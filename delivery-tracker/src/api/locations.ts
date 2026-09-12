import { supabase } from '@/lib/supabase';
import type { DriverLocation, DriverStatus, LatLngRow, PendingPing } from '@/lib/types';

/** Sends a batch of fixes. Returns how many the server accepted. */
export async function reportLocations(pings: PendingPing[]): Promise<number> {
  if (pings.length === 0) return 0;
  const { data, error } = await supabase.rpc('report_locations', { p_pings: pings });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function fetchDriverStatuses(orgId: string): Promise<DriverStatus[]> {
  const { data, error } = await supabase
    .from('driver_status')
    .select('*')
    .eq('org_id', orgId)
    .order('full_name');
  if (error) throw error;
  return (data ?? []) as DriverStatus[];
}

export async function fetchDriverLocation(driverId: string): Promise<DriverLocation | null> {
  const { data, error } = await supabase
    .from('driver_locations')
    .select('*')
    .eq('driver_id', driverId)
    .maybeSingle();
  if (error) throw error;
  return (data as DriverLocation | null) ?? null;
}

/** Breadcrumb trail for one run, oldest first, for drawing the travelled route. */
export async function fetchJobTrail(jobId: string, limit = 500): Promise<LatLngRow[]> {
  const { data, error } = await supabase
    .from('location_pings')
    .select('lat, lng, recorded_at')
    .eq('job_id', jobId)
    .order('recorded_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as LatLngRow[];
}
