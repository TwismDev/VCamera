import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Push notifications, so a driver hears about a job with the app closed.
 *
 * The device registers an Expo push token against the signed-in profile; a
 * database trigger on `jobs` hands the job id to the `notify-driver` edge
 * function, which does the sending. Nothing here talks to Expo's push service
 * directly — the token is all the client owns.
 */

/** Android needs the channel to exist before the first notification lands. */
export const JOBS_CHANNEL = 'jobs';

export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: 'simulator' | 'permission-denied' | 'no-project-id' | 'failed'; detail?: string };

// Notifications arriving while the app is open should still be seen — a driver
// glancing at the map shouldn't miss the next job.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Expo issues push tokens per EAS project, so this needs a project id. It is
 * written into app.json by `eas init`; without it, push is simply inert rather
 * than crashing the app.
 */
function easProjectId(): string | null {
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId;
  const fromEasConfig = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return (fromExtra as string) || fromEasConfig || null;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(JOBS_CHANNEL, {
    name: 'Delivery jobs',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1D4ED8',
    sound: 'default',
  });
}

/**
 * Asks for notification permission, gets a push token, and files it against the
 * signed-in profile. Safe to call on every sign-in: the token is upserted.
 */
export async function registerForPush(): Promise<PushRegistration> {
  if (!Device.isDevice) {
    return { ok: false, reason: 'simulator' };
  }

  const projectId = easProjectId();
  if (!projectId) {
    return { ok: false, reason: 'no-project-id' };
  }

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    return { ok: false, reason: 'permission-denied' };
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { error } = await supabase.rpc('register_device_token', {
      p_token: token,
      p_platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null,
      p_device_name: Device.deviceName ?? null,
    });
    if (error) return { ok: false, reason: 'failed', detail: error.message };

    return { ok: true, token };
  } catch (err) {
    return { ok: false, reason: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Drops this handset's token, so a signed-out phone stops buzzing. */
export async function unregisterFromPush(): Promise<void> {
  const projectId = easProjectId();
  if (!projectId || !Device.isDevice) return;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.rpc('unregister_device_token', { p_token: token });
  } catch {
    // No token to surrender — nothing to do.
  }
}

export async function getPermissionStatus(): Promise<Notifications.PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export type JobNotification = { jobId: string; event: 'assigned' | 'cancelled' };

/** Pulls our payload out of a notification, or null if it isn't one of ours. */
export function readJobNotification(
  response: Notifications.NotificationResponse | Notifications.Notification | null,
): JobNotification | null {
  if (!response) return null;

  const content =
    'notification' in response ? response.notification.request.content : response.request.content;
  const data = content.data as { jobId?: unknown; event?: unknown } | undefined;

  if (!data || typeof data.jobId !== 'string') return null;
  return {
    jobId: data.jobId,
    event: data.event === 'cancelled' ? 'cancelled' : 'assigned',
  };
}

export const pushUnavailableReason: Record<Exclude<PushRegistration, { ok: true }>['reason'], string> = {
  simulator: 'Push notifications only work on a real phone, not a simulator.',
  'permission-denied': 'Notifications are switched off for this app in your phone’s settings.',
  'no-project-id':
    'This build has no EAS project id, so Expo cannot issue a push token. Run `eas init` and rebuild.',
  failed: 'Could not register this phone for notifications.',
};
