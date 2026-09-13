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
  /** Optional. The best source of live-traffic ETAs, and the Android map. */
  googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  /** Optional. A traffic-aware alternative when there is no Google key. */
  mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '',
  /** How often the driver's position is pushed while a delivery is underway. */
  tracking: {
    timeIntervalMs: 15_000,
    distanceIntervalM: 30,
    /**
     * How often the ETA is recomputed from the driver's live position while
     * they are on the road. Every position fix would be far more accurate than
     * anyone needs and would burn routing quota; two minutes keeps the number
     * honest through a traffic jam without that cost.
     */
    etaRefreshMs: 120_000,
    /** Skip a refresh if the driver has barely moved since the last one. */
    etaRefreshMinMoveM: 150,
  },
};
