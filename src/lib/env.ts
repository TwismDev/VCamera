/**
 * Reads the client configuration. EXPO_PUBLIC_* variables are inlined by Metro
 * at build time, so they must be referenced as literal property accesses rather
 * than looked up dynamically.
 */

function required(value: string | undefined, name: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill it in, then restart the bundler.`,
    );
  }
  return value.trim();
}

function numberOr(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const supabaseUrl = required(process.env.EXPO_PUBLIC_SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL');
export const supabaseAnonKey = required(
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
);

/** How often the driver app reports position while a delivery is running. */
export const trackingIntervalSeconds = numberOr(process.env.EXPO_PUBLIC_TRACKING_INTERVAL_SECONDS, 20);
export const trackingDistanceMeters = numberOr(process.env.EXPO_PUBLIC_TRACKING_DISTANCE_METERS, 50);
