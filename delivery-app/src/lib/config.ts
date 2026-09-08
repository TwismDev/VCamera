/**
 * Runtime configuration. The Supabase URL and publishable key are meant to ship
 * inside the app bundle — the database is guarded by row level security, not by
 * keeping this key secret.
 */
const fallback = {
  supabaseUrl: 'https://vmsbetooodvyfiebyjmm.supabase.co',
  supabaseAnonKey: 'sb_publishable_EbNH1CKQVWQ09PDYJtkF0Q_bJ5FQpzJ',
};

export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || fallback.supabaseUrl,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || fallback.supabaseAnonKey,
  /** Optional. Without it the app routes with OSRM instead of Google. */
  googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  /** How often the driver's position is pushed while a delivery is underway. */
  tracking: {
    timeIntervalMs: 15_000,
    distanceIntervalM: 30,
  },
};
