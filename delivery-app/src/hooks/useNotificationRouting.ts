import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { readJobNotification } from '@/services/push';

/**
 * Tapping a job notification should open that job, whether the app was already
 * running or was launched by the tap.
 */
export function useNotificationRouting(ready: boolean) {
  const router = useRouter();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    let active = true;

    const open = (jobId: string) => {
      // A cold start delivers the same response again on the next mount; only
      // navigate once per job.
      if (handled.current === jobId) return;
      handled.current = jobId;
      router.push(`/driver/job/${jobId}` as never);
    };

    // The tap that launched the app from cold.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!active) return;
      const job = readJobNotification(response);
      if (job) open(job.jobId);
    });

    // Taps while the app is running or backgrounded.
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const job = readJobNotification(response);
      if (job) open(job.jobId);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [ready, router]);
}
