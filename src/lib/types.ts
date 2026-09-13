/** Shapes mirroring supabase/migrations/20260911090000_init.sql. */

export type AppRole = 'boss' | 'driver';

export type JobStatus =
  | 'unassigned'
  | 'assigned'
  | 'accepted'
  | 'declined'
  | 'en_route'
  | 'arrived'
  | 'completed'
  | 'cancelled';

export type EtaSource = 'auto' | 'manual';

export type JobEventType =
  | 'created'
  | 'assigned'
  | 'accepted'
  | 'declined'
  | 'eta_set'
  | 'trip_started'
  | 'arrived'
  | 'completed'
  | 'cancelled'
  | 'note';

export interface Org {
  id: string;
  name: string;
  join_code: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  org_id: string | null;
  role: AppRole;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  push_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  org_id: string;
  reference: string;
  created_by: string;
  assigned_to: string | null;

  customer_name: string | null;
  customer_phone: string | null;
  address: string;
  address_lat: number | null;
  address_lng: number | null;
  notes: string | null;

  product_count: number;
  cash_to_collect: number;

  status: JobStatus;

  eta_at: string | null;
  eta_minutes: number | null;
  eta_source: EtaSource | null;
  eta_updated_at: string | null;
  decline_reason: string | null;

  delivered_count: number | null;
  cash_collected: number | null;
  completion_notes: string | null;

  assigned_at: string | null;
  accepted_at: string | null;
  started_at: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobEvent {
  id: number;
  job_id: string;
  org_id: string;
  actor_id: string | null;
  type: JobEventType;
  message: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface DriverLocation {
  driver_id: string;
  org_id: string;
  job_id: string | null;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  battery_pct: number | null;
  recorded_at: string;
  updated_at: string;
}

/** Row of the driver_status view the dispatcher's map reads. */
export interface DriverStatus {
  driver_id: string;
  org_id: string | null;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  lat: number | null;
  lng: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  battery_pct: number | null;
  position_recorded_at: string | null;
  position_updated_at: string | null;
  job_id: string | null;
  job_reference: string | null;
  job_address: string | null;
  job_status: JobStatus | null;
  job_eta_at: string | null;
}

/** A position captured on the device, before it reaches the server. */
export interface PendingPing {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  battery_pct: number | null;
  recorded_at: string;
  job_id: string | null;
}

export interface RouteEstimate {
  duration_seconds: number;
  duration_in_traffic_seconds: number | null;
  distance_meters: number;
  eta_minutes: number;
  eta_at: string;
  provider: 'google' | 'osrm';
  traffic_aware: boolean;
  destination: { lat: number; lng: number };
}

export interface GeocodeResponse {
  lat: number;
  lng: number;
  formatted_address: string;
  provider: 'google' | 'nominatim';
  traffic_aware: boolean;
}

/** Statuses where the job still needs someone to act on it. */
export const OPEN_STATUSES: JobStatus[] = ['unassigned', 'assigned', 'accepted', 'en_route', 'arrived'];

/** Statuses where the driver app should be streaming position. */
export const TRACKING_STATUSES: JobStatus[] = ['en_route'];

/** One breadcrumb row as read back for drawing a travelled route. */
export interface LatLngRow {
  lat: number;
  lng: number;
  recorded_at: string;
}
