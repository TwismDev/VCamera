import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { config } from '@/lib/config';
import { haversineKm, type LatLng } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { estimateEta } from './eta';

export const LOCATION_TASK_NAME = 'delivery-tracker-location';
const CONTEXT_KEY = 'delivery-tracker/tracking-context';
const ETA_STATE_KEY = 'delivery-tracker/eta-refresh';

/**
 * What the background task needs in order to file a position. It is kept in
 * AsyncStorage because the task can be woken into a fresh JS context with none
 * of the app's React state alive.
 */
type TrackingContext = {
  driverId: string;
  orgId: string;
  jobId: string | null;
  /**
   * Where the job is going. Carried here so the background task can refresh the
   * ETA without a database round trip on every position fix.
   */
  destination?: LatLng | null;
};

/** When the ETA was last recomputed, and from where. */
type EtaRefreshState = {
  at: number;
  from: LatLng;
};

export type PermissionOutcome =
  | { ok: true }
  | { ok: false; reason: 'foreground-denied' | 'background-denied' };

export async function getTrackingContext(): Promise<TrackingContext | null> {
  try {
    const raw = await AsyncStorage.getItem(CONTEXT_KEY);
    return raw ? (JSON.parse(raw) as TrackingContext) : null;
  } catch {
    return null;
  }
}

async function setTrackingContext(context: TrackingContext | null): Promise<void> {
  if (context) await AsyncStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
  else await AsyncStorage.removeItem(CONTEXT_KEY);
}

/**
 * Asks for location access in the order the platforms require: "while using the
 * app" first, then the separate "always" grant that background updates need.
 */
export async function requestTrackingPermissions(): Promise<PermissionOutcome> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return { ok: false, reason: 'foreground-denied' };

  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) return { ok: false, reason: 'background-denied' };

  return { ok: true };
}

export async function isTracking(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

/** Begins streaming this driver's position, tagged to the job they are running. */
export async function startTracking(context: TrackingContext): Promise<void> {
  await setTrackingContext(context);
  // A new job starts with a clean slate, so the first fix refreshes at once.
  await AsyncStorage.removeItem(ETA_STATE_KEY);

  if (await isTracking()) {
    // Already running — the stored context above re-tags pings to the new job.
    await pushCurrentPosition();
    return;
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: config.tracking.timeIntervalMs,
    distanceInterval: config.tracking.distanceIntervalM,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Delivery in progress',
      notificationBody: 'Your dispatcher can see your location until you complete the job.',
      notificationColor: '#1D4ED8',
      killServiceOnDestroy: false,
    },
  });

  await pushCurrentPosition();
}

export async function stopTracking(): Promise<void> {
  if (await isTracking()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  await setTrackingContext(null);
  await AsyncStorage.removeItem(ETA_STATE_KEY);
}

/** Takes a single reading now, so the boss sees a pin without waiting a cycle. */
export async function pushCurrentPosition(): Promise<void> {
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    await recordPositions([position]);
  } catch {
    // A single missed fix is not worth surfacing; the stream will catch up.
  }
}

async function batteryPercent(): Promise<number | null> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    return level >= 0 ? Math.round(level * 100) : null;
  } catch {
    return null;
  }
}

/**
 * Writes readings to Supabase: the newest one overwrites the driver's "where
 * are they now" row, and every reading is appended to the breadcrumb trail.
 */
export async function recordPositions(positions: Location.LocationObject[]): Promise<void> {
  if (positions.length === 0) return;

  const context = await getTrackingContext();
  if (!context) return;

  // In a headless wake-up the client may not have rehydrated its session yet.
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;

  const sorted = [...positions].sort((a, b) => a.timestamp - b.timestamp);
  const latest = sorted[sorted.length - 1];

  const rows = sorted.map((position) => ({
    driver_id: context.driverId,
    org_id: context.orgId,
    job_id: context.jobId,
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy_m: position.coords.accuracy ?? null,
    speed_mps: position.coords.speed ?? null,
    heading_deg: position.coords.heading ?? null,
    recorded_at: new Date(position.timestamp).toISOString(),
  }));

  await Promise.all([
    supabase.from('driver_locations').upsert(
      {
        ...rows[rows.length - 1],
        battery_pct: await batteryPercent(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'driver_id' },
    ),
    supabase.from('location_pings').insert(rows),
  ]);

  if (__DEV__) {
    console.log(
      `[tracking] ${rows.length} fix(es), latest ${latest.coords.latitude.toFixed(5)},` +
        `${latest.coords.longitude.toFixed(5)}`,
    );
  }

  // A failed refresh must not cost us the position we just recorded.
  await maybeRefreshEta(context, latest).catch((err) => {
    if (__DEV__) console.warn('[eta] refresh failed', err);
  });
}

async function readEtaState(): Promise<EtaRefreshState | null> {
  try {
    const raw = await AsyncStorage.getItem(ETA_STATE_KEY);
    return raw ? (JSON.parse(raw) as EtaRefreshState) : null;
  } catch {
    return null;
  }
}

/**
 * Keeps the dispatcher's ETA honest while the driver is on the road.
 *
 * An ETA sent at the kerb is worth little twenty minutes into a jam, so this
 * recomputes it from the driver's live position and writes it back. It only
 * touches jobs whose ETA the app worked out itself: if the driver typed their
 * own number, they know something the routing engine does not, and it stands
 * until they ask for a fresh calculation.
 */
async function maybeRefreshEta(
  context: TrackingContext,
  position: Location.LocationObject,
): Promise<void> {
  const { jobId, destination } = context;
  if (!jobId || !destination) return;

  const here: LatLng = { lat: position.coords.latitude, lng: position.coords.longitude };
  const previous = await readEtaState();
  const now = Date.now();

  if (previous) {
    if (now - previous.at < config.tracking.etaRefreshMs) return;
    // Sitting still at a drop or a light is not worth a routing call.
    if (haversineKm(previous.from, here) * 1000 < config.tracking.etaRefreshMinMoveM) return;
  }

  // Claim the slot before the network call, so overlapping fixes don't both go.
  await AsyncStorage.setItem(ETA_STATE_KEY, JSON.stringify({ at: now, from: here }));

  // Cheaper than a routing request: check the job still wants an auto ETA.
  const { data: job } = await supabase
    .from('jobs')
    .select('status, eta_source')
    .eq('id', jobId)
    .maybeSingle();

  if (!job || job.status !== 'en_route' || job.eta_source !== 'auto') return;

  const estimate = await estimateEta(here, destination);

  await supabase
    .from('jobs')
    .update({
      eta_minutes: estimate.minutes,
      eta_at: new Date(now + estimate.minutes * 60_000).toISOString(),
      eta_source: 'auto',
    })
    .eq('id', jobId)
    .eq('status', 'en_route')
    .eq('eta_source', 'auto');

  if (__DEV__) {
    console.log(`[eta] refreshed to ${estimate.minutes} min via ${estimate.provider}`);
  }
}

/**
 * The background task itself. Defined at module scope so that it is registered
 * as soon as the bundle loads — including when Android wakes the app headless.
 */
if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
    LOCATION_TASK_NAME,
    async ({ data, error }) => {
      if (error) {
        if (__DEV__) console.warn('[tracking] task error', error.message);
        return;
      }
      if (!data?.locations?.length) return;

      try {
        await recordPositions(data.locations);
      } catch (err) {
        if (__DEV__) console.warn('[tracking] failed to record', err);
      }
    },
  );
}

export const trackingPlatformNote =
  Platform.OS === 'ios'
    ? 'Set location access to "Always" so tracking keeps running when the screen is off.'
    : 'Set location access to "Allow all the time" so tracking keeps running in the background.';
