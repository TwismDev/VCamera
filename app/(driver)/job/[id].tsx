import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  acceptJob,
  completeJob,
  declineJob,
  fetchJob,
  markArrived,
  startTrip,
  submitEta,
} from '@/api/jobs';
import { estimateRoute } from '@/api/routing';
import { CompletionForm } from '@/components/CompletionForm';
import { EtaPanel } from '@/components/EtaPanel';
import { JobMap } from '@/components/JobMap';
import { NavigationRow } from '@/components/NavigationRow';
import { Banner, Button, Card, Heading, Loading, Pill, Row, Screen } from '@/components/ui';
import { describeEta, shouldRefreshEta } from '@/lib/eta';
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS, formatMoney } from '@/lib/format';
import { isValidCoordinate, type LatLng } from '@/lib/geo';
import { dialPhone } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';
import { flushQueue, getCurrentPosition, startTracking, stopTracking } from '@/lib/tracking';
import type { EtaSource, Job } from '@/lib/types';
import { useActiveSession } from '@/state/session';

/** How often the live estimate is recomputed while driving. */
const ETA_REFRESH_MS = 120_000;

export default function DriverJobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { org } = useActiveSession();
  const router = useRouter();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [position, setPosition] = useState<LatLng | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    fetchJob(id)
      .then((next) => {
        if (cancelled) return;
        setJob(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'Could not load this delivery');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // The dispatcher can reassign or cancel underneath the driver, so the screen
  // follows the row rather than trusting what it loaded.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`driver-job:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${id}` },
        (payload) => setJob(payload.new as Job),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  const jobId = job?.id ?? null;
  const address = job?.address ?? '';
  const addressLat = job?.address_lat ?? null;
  const addressLng = job?.address_lng ?? null;
  const isRunning = job?.status === 'en_route';

  const destination = useMemo<LatLng | null>(
    () => (addressLat !== null && addressLng !== null ? { lat: addressLat, lng: addressLng } : null),
    [addressLat, addressLng],
  );

  // The arrival time last known to the server, held in a ref so recomputing it
  // does not re-create the refresh callback and restart its timer every time an
  // update lands.
  const lastEtaRef = useRef<string | null>(null);
  useEffect(() => {
    lastEtaRef.current = job?.eta_at ?? null;
  }, [job?.eta_at]);

  /**
   * While driving, the arrival time is refreshed from the live position so the
   * dispatcher sees it slip or improve without the driver touching the phone.
   * The write is skipped unless the estimate moved by a few minutes, otherwise
   * every GPS tick would rewrite the job and flood its timeline.
   */
  const refreshingEta = useRef(false);
  const refreshLiveEta = useCallback(async () => {
    if (!jobId || !isRunning || refreshingEta.current) return;
    refreshingEta.current = true;
    try {
      const fix = await getCurrentPosition();
      if (!fix) return;

      const origin: LatLng = { lat: fix.coords.latitude, lng: fix.coords.longitude };
      setPosition(origin);

      const estimate = await estimateRoute(
        origin,
        isValidCoordinate(destination) ? destination : null,
        address,
      );
      if (!shouldRefreshEta(lastEtaRef.current, estimate.eta_at)) return;

      lastEtaRef.current = estimate.eta_at;
      setJob(await submitEta(jobId, estimate.eta_at, 'auto', estimate.eta_minutes));
    } catch {
      // A missed refresh is not worth interrupting someone who is driving.
    } finally {
      refreshingEta.current = false;
    }
  }, [jobId, isRunning, destination, address]);

  useEffect(() => {
    if (!isRunning) return;

    // Deferred by a tick so the screen paints before the first network round
    // trip, rather than updating state during the same commit.
    const firstRun = setTimeout(() => void refreshLiveEta(), 0);
    const timer = setInterval(() => void refreshLiveEta(), ETA_REFRESH_MS);

    // Coming back to the app is a good moment to push anything the queue is
    // still holding from a patch of bad signal.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void flushQueue();
        void refreshLiveEta();
      }
    });

    return () => {
      clearTimeout(firstRun);
      clearInterval(timer);
      subscription.remove();
    };
  }, [isRunning, refreshLiveEta]);

  const run = async (action: () => Promise<Job>, successNotice?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setJob(await action());
      if (successNotice) setNotice(successNotice);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onDecline = () => {
    if (!job) return;
    Alert.alert('Decline this job?', 'It goes back to your dispatcher to give to someone else.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: () => {
          void run(() => declineJob(job.id)).then(() => router.back());
        },
      },
    ]);
  };

  const onStartTrip = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const tracking = await startTracking(job.id);
      if (!tracking.started) {
        setError(tracking.message ?? 'Location sharing could not be started.');
        return;
      }
      setJob(await startTrip(job.id));
      setNotice(tracking.message ?? 'Your dispatcher can now see where you are.');
    } catch (caught) {
      // The trip did not start, so tracking must not be left running.
      await stopTracking();
      setError(caught instanceof Error ? caught.message : 'Could not start the trip.');
    } finally {
      setBusy(false);
    }
  };

  const onComplete = async (deliveredCount: number, cashCollected: number, notes: string) => {
    if (!job) return;
    const updated = await completeJob(job.id, deliveredCount, cashCollected, notes);
    // Tracking is for the run, not the driver: it stops the moment the job does.
    await stopTracking();
    setJob(updated);
  };

  const onSubmitEta = async (etaAt: string, source: EtaSource, minutes: number) => {
    if (!job) return;
    setJob(await submitEta(job.id, etaAt, source, minutes));
    setNotice('Arrival time sent to your dispatcher.');
  };

  if (loading) return <Loading label="Loading delivery" />;
  if (!job) {
    return (
      <Screen>
        <Banner tone="error" message="That delivery could not be found." />
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {error ? <Banner tone="error" message={error} /> : null}
      {notice ? <Banner tone="success" message={notice} /> : null}

      <View style={styles.titleRow}>
        <Heading sub={job.address}>{job.reference}</Heading>
        <Pill label={JOB_STATUS_LABELS[job.status]} color={JOB_STATUS_COLORS[job.status]} />
      </View>

      {isRunning ? (
        <Banner
          tone="info"
          message="Location sharing is on for this delivery. It stops as soon as you complete it."
        />
      ) : null}

      {destination || position ? (
        <JobMap destination={destination} driver={position} height={180} />
      ) : null}

      <Card>
        <Row label="Products to deliver" value={`${job.product_count}`} />
        <Row label="Cash to collect" value={formatMoney(job.cash_to_collect, org.currency)} />
        {job.customer_name ? <Row label="Customer" value={job.customer_name} /> : null}
        {job.notes ? <Row label="Notes" value={job.notes} /> : null}
        {job.eta_at ? <Row label="You said" value={describeEta(job.eta_at)} /> : null}
        {job.customer_phone ? (
          <Pressable onPress={() => void dialPhone(job.customer_phone!)} style={styles.callRow}>
            <Text style={styles.callText}>Call {job.customer_phone}</Text>
          </Pressable>
        ) : null}
      </Card>

      {job.status === 'assigned' ? (
        <Card>
          <Text style={styles.cardTitle}>Can you take this one?</Text>
          <Text style={styles.cardBody}>
            Accept it and your dispatcher will ask for an arrival time next.
          </Text>
          <Button
            label="Accept job"
            onPress={() => void run(() => acceptJob(job.id), 'Accepted. Send an arrival time next.')}
            loading={busy}
            style={styles.spaced}
          />
          <Button label="Decline" variant="ghost" onPress={onDecline} style={styles.spaced} />
        </Card>
      ) : null}

      {job.status === 'accepted' || job.status === 'en_route' ? (
        <Card>
          <NavigationRow address={job.address} coordinate={destination} />
        </Card>
      ) : null}

      {job.status === 'accepted' ? (
        <>
          <Card>
            <EtaPanel
              address={job.address}
              destination={destination}
              currentEtaAt={job.eta_at}
              currentEtaSource={job.eta_source}
              onSubmit={onSubmitEta}
            />
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Ready to go?</Text>
            <Text style={styles.cardBody}>
              Starting the trip shares your position with your dispatcher until the delivery is
              complete.
            </Text>
            <Button label="Start trip" onPress={onStartTrip} loading={busy} style={styles.spaced} />
          </Card>
        </>
      ) : null}

      {job.status === 'en_route' ? (
        <Card>
          <Text style={styles.cardTitle}>On the way</Text>
          <Text style={styles.cardBody}>
            Your arrival time updates on its own as you drive. Tap below when you get there.
          </Text>
          <Button
            label="I have arrived"
            onPress={() => void run(() => markArrived(job.id), 'Your dispatcher knows you are there.')}
            loading={busy}
            style={styles.spaced}
          />
        </Card>
      ) : null}

      {job.status === 'en_route' || job.status === 'arrived' ? (
        <Card>
          <CompletionForm job={job} currency={org.currency} onComplete={onComplete} />
        </Card>
      ) : null}

      {job.status === 'completed' ? (
        <Card>
          <Text style={styles.cardTitle}>Done</Text>
          <Row label="Products delivered" value={`${job.delivered_count ?? job.product_count}`} />
          <Row label="Cash collected" value={formatMoney(job.cash_collected, org.currency)} />
          {job.completion_notes ? <Row label="Your note" value={job.completion_notes} /> : null}
          <Button
            label="Back to my jobs"
            variant="ghost"
            onPress={() => router.back()}
            style={styles.spaced}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { gap: spacing.sm, marginBottom: spacing.md },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: spacing.xs },
  cardBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  spaced: { marginTop: spacing.md },
  callRow: { paddingTop: spacing.md },
  callText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
});
