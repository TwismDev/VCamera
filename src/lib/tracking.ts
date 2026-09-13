import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { reportLocations } from '@/api/locations';
import { trackingDistanceMeters, trackingIntervalSeconds } from '@/lib/env';
import { drain, enqueue, requeue, size as queueSize } from '@/lib/queue';
import type { PendingPing } from '@/lib/types';

/**
 * Live position sharing.
 *
 * Tracking runs only while a delivery is actually underway. It starts when the
 * driver taps "Start trip" and stops the moment the job is completed, declined
 * or cancelled. That is a deliberate limit: it keeps the dispatcher's map
 * useful without following anyone around off the clock, and it is what the
 * permission prompts promise.
 *
 * Every fix is written to a local queue first and only then sent. If the device
 * is out of signal the queue keeps the trail intact and flushes it later, so a
 * dead spot shows as a gap that fills in rather than as lost history.
 */

export const LOCATION_TASK = 'delivery-tracker.location-updates';
const ACTIVE_JOB_KEY = 'tracking.active-job.v1';

interface LocationTaskData {
  locations: Location.LocationObject[];
}

/**
 * The background task wakes in a bare JS context with no React state, so the
 * job it belongs to is read back from storage rather than captured in a closure.
 */
async function readActiveJobId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_JOB_KEY);
  } catch {
    return null;
  }
}

async function readBatteryPercent(): Promise<number | null> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    return level >= 0 ? Math.round(level * 100) : null;
  } catch {
    return null;
  }
}

function toPing(
  location: Location.LocationObject,
  jobId: string | null,
  batteryPct: number | null,
): PendingPing {
  return {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracy_m: location.coords.accuracy ?? null,
    speed_mps: location.coords.speed ?? null,
    heading_deg: location.coords.heading ?? null,
    battery_pct: batteryPct,
    recorded_at: new Date(location.timestamp).toISOString(),
    job_id: jobId,
  };
}

/**
 * Sends everything buffered locally. A failure puts the batch back so nothing
 * is dropped; the next fix will try again.
 */
export async function flushQueue(): Promise<{ sent: number; pending: number }> {
  const batch = await drain();
  if (batch.length === 0) return { sent: 0, pending: 0 };

  try {
    const accepted = await reportLocations(batch);
    return { sent: accepted, pending: await queueSize() };
  } catch (error) {
    await requeue(batch);
    console.warn('Position upload failed, keeping it queued', error);
    return { sent: 0, pending: await queueSize() };
  }
}

// Registered at module load: the OS may start this task in a fresh JS context
// where no component has mounted yet.
TaskManager.defineTask<LocationTaskData>(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Location task error', error.message);
    return;
  }

  const locations = data?.locations ?? [];
  if (locations.length === 0) return;

  const [jobId, batteryPct] = await Promise.all([readActiveJobId(), readBatteryPercent()]);
  await enqueue(...locations.map((location) => toPing(location, jobId, batteryPct)));
  await flushQueue();
});

export type PermissionOutcome =
  | { granted: true; background: boolean }
  | { granted: false; reason: string };

/**
 * Asks for location access in the order the platforms expect: foreground first,
 * then background. Background is requested but not required, so a driver who
 * only grants "while using the app" still gets tracked whenever the app is open
 * rather than being blocked outright.
 */
export async function requestTrackingPermissions(): Promise<PermissionOutcome> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) {
    return {
      granted: false,
      reason:
        'Location access is off. Turn it on in your device settings so your dispatcher can see your progress.',
    };
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  return { granted: true, background: background.granted };
}

export async function isTracking(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

export async function activeTrackedJobId(): Promise<string | null> {
  return (await isTracking()) ? readActiveJobId() : null;
}

export interface StartTrackingResult {
  started: boolean;
  background: boolean;
  message?: string;
}

export async function startTracking(jobId: string): Promise<StartTrackingResult> {
  const permission = await requestTrackingPermissions();
  if (!permission.granted) {
    return { started: false, background: false, message: permission.reason };
  }

  await AsyncStorage.setItem(ACTIVE_JOB_KEY, jobId);

  // Restarting over an existing session would drop the first fixes, so an
  // already-running tracker is left alone once the job id has been updated.
  if (await isTracking()) {
    return { started: true, background: permission.background };
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: trackingIntervalSeconds * 1000,
    distanceInterval: trackingDistanceMeters,
    // Without this iOS stops updates when it decides the device is stationary,
    // which reads on the dispatcher's map as a driver who vanished at a kerb.
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    ...(Platform.OS === 'android'
      ? {
          foregroundService: {
            notificationTitle: 'Delivery in progress',
            notificationBody: 'Sharing your location with your dispatcher until you complete the job.',
            notificationColor: '#2563EB',
          },
        }
      : {}),
  });

  return {
    started: true,
    background: permission.background,
    message: permission.background
      ? undefined
      : 'Background location is off, so your position updates only while this app is open. Allow "Always" in settings for hands-free tracking.',
  };
}

export async function stopTracking(): Promise<void> {
  try {
    if (await isTracking()) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch (error) {
    console.warn('Could not stop location updates', error);
  } finally {
    await AsyncStorage.removeItem(ACTIVE_JOB_KEY);
    // One last attempt so the tail of the run is not stranded on the device.
    await flushQueue();
  }
}

/** A single fix, for computing an ETA before the trip has started. */
export async function getCurrentPosition(): Promise<Location.LocationObject | null> {
  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) {
      const requested = await Location.requestForegroundPermissionsAsync();
      if (!requested.granted) return null;
    }
    return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch (error) {
    console.warn('Could not read the current position', error);
    return null;
  }
}
