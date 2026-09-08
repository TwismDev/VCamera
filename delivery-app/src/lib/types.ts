import type { Tables, TablesInsert, TablesUpdate } from './database.types';

export type { Database, Tables, TablesInsert, TablesUpdate } from './database.types';

/**
 * Postgres check constraints keep these columns to a fixed set of values, but
 * they are plain `text` in the database, so the app narrows them here.
 */
export type Role = 'boss' | 'driver';

export type JobStatus =
  | 'assigned'
  | 'accepted'
  | 'en_route'
  | 'completed'
  | 'declined'
  | 'cancelled';

export type EtaSource = 'auto' | 'manual';

export type Organization = Tables<'organizations'>;

export type Profile = Omit<Tables<'profiles'>, 'role'> & { role: Role };

export type Job = Omit<Tables<'jobs'>, 'status' | 'eta_source'> & {
  status: JobStatus;
  eta_source: EtaSource | null;
};

export type JobPatch = TablesUpdate<'jobs'>;
export type JobInsert = TablesInsert<'jobs'>;

/** The slice of a driver's profile that gets joined onto rows for display. */
export type DriverSummary = Pick<Profile, 'id' | 'full_name' | 'phone'>;

export type JobWithDriver = Job & { driver: DriverSummary | null };

export type DriverLocation = Tables<'driver_locations'>;

export type DriverLocationWithProfile = DriverLocation & { driver: DriverSummary | null };

export type LocationPing = Tables<'location_pings'>;
