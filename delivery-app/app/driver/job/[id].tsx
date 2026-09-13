import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { STATUS_TONE } from '@/components/JobCard';
import { Banner, Button, Card, Field, Loading, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { clockTime, minutesLabel, money, STATUS_LABEL } from '@/lib/format';
import { isLatLng, kmLabel, type LatLng } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { updateJob, useJob } from '@/hooks/useJobs';
import { useAuth } from '@/providers/AuthProvider';
import {
  estimateEta,
  geocodeAddress,
  PROVIDER_LABEL,
  PROVIDER_USES_LIVE_TRAFFIC,
  type EtaEstimate,
} from '@/services/eta';
import { NAV_APP_LABEL, openDialer, openNavigation, type NavApp } from '@/services/navigation';
import {
  isTracking,
  requestTrackingPermissions,
  startTracking,
  stopTracking,
  trackingPlatformNote,
} from '@/services/tracking';
import { colors, radius, spacing, type } from '@/theme';

export default function DriverJobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const { job, loading } = useJob(id);

  const [busy, setBusy] = useState(false);
  const [etaInput, setEtaInput] = useState('');
  const [estimate, setEstimate] = useState<EtaEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [deliveredCount, setDeliveredCount] = useState('');
  const [cashCollected, setCashCollected] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');

  useEffect(() => {
    void isTracking().then(setTracking);
  }, [job?.status]);

  useEffect(() => {
    if (job && etaInput === '' && job.eta_minutes != null) setEtaInput(String(job.eta_minutes));
  }, [job, etaInput]);

  /** Resolves the drop's coordinates, geocoding and saving them if missing. */
  const destinationCoords = useCallback(async (): Promise<LatLng | null> => {
    if (!job) return null;
    if (isLatLng(job.address_lat, job.address_lng)) {
      return { lat: job.address_lat as number, lng: job.address_lng as number };
    }

    const coords = await geocodeAddress(job.address);
    if (coords) {
      await supabase
        .from('jobs')
        .update({ address_lat: coords.lat, address_lng: coords.lng })
        .eq('id', job.id);
    }
    return coords;
  }, [job]);

  async function patch(changes: Parameters<typeof updateJob>[1]) {
    if (!job) return false;
    setBusy(true);
    try {
      await updateJob(job.id, changes);
      return true;
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Auto-suggests a drive time; the driver still gets the last word. */
  async function calculateEta() {
    setEstimating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Location needed', 'Allow location access to work out a drive time.');
        return;
      }

      const [here, there] = await Promise.all([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        destinationCoords(),
      ]);

      if (!there) {
        Alert.alert(
          'Address not found',
          'That address could not be pinned on the map. Check the ETA in Waze and type it in instead.',
        );
        return;
      }

      const result = await estimateEta(
        { lat: here.coords.latitude, lng: here.coords.longitude },
        there,
      );
      setEstimate(result);
      setEtaInput(String(result.minutes));
    } catch (err) {
      Alert.alert('Could not work out an ETA', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setEstimating(false);
    }
  }

  async function sendEta(source: 'auto' | 'manual') {
    const minutes = Number.parseInt(etaInput, 10);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
      Alert.alert('Check the ETA', 'Enter the number of minutes, between 0 and 1440.');
      return;
    }
    await patch({
      eta_minutes: minutes,
      eta_at: new Date(Date.now() + minutes * 60_000).toISOString(),
      eta_source: source,
    });
  }

  async function beginDelivery() {
    if (!job || !profile?.org_id) return;

    const permission = await requestTrackingPermissions();
    if (!permission.ok) {
      Alert.alert(
        'Location sharing is required',
        permission.reason === 'foreground-denied'
          ? 'Your dispatcher needs to see where you are while a delivery is underway.'
          : trackingPlatformNote,
      );
      return;
    }

    const saved = await patch({ status: 'en_route' });
    if (!saved) return;

    // Hand the drop's coordinates to the tracker so it can keep the ETA fresh
    // from the driver's live position without re-reading the job each time.
    const destination = await destinationCoords();

    try {
      await startTracking({
        driverId: profile.id,
        orgId: profile.org_id,
        jobId: job.id,
        destination,
      });
      setTracking(true);
    } catch (err) {
      Alert.alert('Tracking did not start', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  async function finishDelivery() {
    if (!job) return;

    const delivered = Number.parseInt(deliveredCount || String(job.product_count), 10);
    const collected = Number.parseFloat(cashCollected || String(job.cash_to_collect));

    if (!Number.isFinite(delivered) || delivered < 0) {
      Alert.alert('Check the product count', 'Enter how many products you actually handed over.');
      return;
    }
    if (!Number.isFinite(collected) || collected < 0) {
      Alert.alert('Check the cash amount', 'Enter how much cash you actually collected.');
      return;
    }

    const saved = await patch({
      status: 'completed',
      delivered_product_count: delivered,
      cash_collected: collected,
      completion_notes: completionNotes.trim() || null,
    });
    if (!saved) return;

    await stopTracking().catch(() => undefined);
    setTracking(false);
    setCompleting(false);
    Alert.alert('Delivery logged', 'Your dispatcher has the numbers.', [
      { text: 'OK', onPress: () => router.replace('/driver') },
    ]);
  }

  if (loading) return <Loading />;
  if (!job) {
    return (
      <Screen>
        <Text style={type.body}>This job is no longer on your list.</Text>
      </Screen>
    );
  }

  const coords = isLatLng(job.address_lat, job.address_lng)
    ? { lat: job.address_lat as number, lng: job.address_lng as number }
    : null;

  return (
    <Screen>
      <Card>
        <Pill text={STATUS_LABEL[job.status]} tone={STATUS_TONE[job.status]} />
        <Text style={type.heading}>{job.address}</Text>
        {job.customer_name ? <Text style={styles.muted}>For {job.customer_name}</Text> : null}
        {job.notes ? <Text style={styles.notes}>{job.notes}</Text> : null}
        {job.customer_phone ? (
          <Button
            title={`Call ${job.customer_name || 'customer'}`}
            variant="secondary"
            onPress={() => openDialer(job.customer_phone as string)}
          />
        ) : null}
      </Card>

      <Card>
        <SectionTitle>What you’re carrying</SectionTitle>
        <Row label="Products" value={String(job.product_count)} emphasis />
        <Row label="Cash to collect" value={money(job.cash_to_collect)} emphasis />
      </Card>

      {job.status === 'assigned' ? (
        <Card>
          <SectionTitle>New job</SectionTitle>
          <Text style={styles.muted}>Accept it to get moving, or decline and say why.</Text>
          <Button
            title="Accept job"
            loading={busy}
            onPress={() => void patch({ status: 'accepted' })}
          />
          <Button
            title="Decline"
            variant="danger"
            loading={busy}
            onPress={() =>
              Alert.alert('Decline this job?', 'Your dispatcher will be told straight away.', [
                { text: 'Keep it', style: 'cancel' },
                {
                  text: 'Decline',
                  style: 'destructive',
                  onPress: () =>
                    void patch({ status: 'declined', decline_reason: 'Declined by driver' }),
                },
              ])
            }
          />
        </Card>
      ) : null}

      {job.status === 'accepted' || job.status === 'en_route' ? (
        <>
          <Card>
            <SectionTitle>Navigate</SectionTitle>
            <Text style={styles.muted}>
              Opens the address in your maps app. Come back here to send the ETA.
            </Text>
            {(['waze', 'google', 'system'] as NavApp[]).map((app) => (
              <Button
                key={app}
                title={`Open in ${NAV_APP_LABEL[app]}`}
                variant="secondary"
                onPress={() => void openNavigation(app, { address: job.address, coords })}
              />
            ))}
          </Card>

          <Card>
            <SectionTitle>Your ETA</SectionTitle>
            {job.eta_minutes != null ? (
              <>
                <Banner tone="info">
                  Sent: {minutesLabel(job.eta_minutes)} — arriving around {clockTime(job.eta_at)}
                </Banner>
                {job.status === 'en_route' ? (
                  <Text style={styles.muted}>
                    {job.eta_source === 'auto'
                      ? 'Updating by itself as you drive, so your dispatcher always sees a current number.'
                      : 'This is your typed ETA, so it stays put. Tap Calculate to hand it back to live traffic.'}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.muted}>Your dispatcher is waiting on an ETA.</Text>
            )}

            <Button
              title={estimating ? 'Working it out…' : 'Calculate drive time'}
              variant="secondary"
              loading={estimating}
              onPress={() => void calculateEta()}
            />

            {estimate ? (
              <>
                <Text
                  style={[
                    styles.estimate,
                    !PROVIDER_USES_LIVE_TRAFFIC[estimate.provider] && styles.estimateWeak,
                  ]}
                >
                  {PROVIDER_LABEL[estimate.provider]}
                  {estimate.distanceKm > 0 ? ` · ${kmLabel(estimate.distanceKm)}` : ''}
                </Text>
                {estimate.trafficDelayMinutes != null && estimate.trafficDelayMinutes > 0 ? (
                  <Text style={styles.estimateWeak}>
                    {estimate.trafficDelayMinutes} min of that is traffic
                  </Text>
                ) : null}
              </>
            ) : null}

            <Field
              label="Minutes until you arrive"
              value={etaInput}
              onChangeText={setEtaInput}
              keyboardType="number-pad"
              placeholder="25"
              hint="Adjust it if you know better — loading time, a stop on the way, traffic."
              style={styles.etaInput}
            />

            <Button
              title="Send ETA to dispatcher"
              loading={busy}
              disabled={!etaInput.trim()}
              onPress={() =>
                void sendEta(estimate && String(estimate.minutes) === etaInput.trim() ? 'auto' : 'manual')
              }
            />
          </Card>
        </>
      ) : null}

      {job.status === 'accepted' ? (
        <Button
          title="Start delivery & share location"
          loading={busy}
          onPress={() => void beginDelivery()}
        />
      ) : null}

      {job.status === 'en_route' ? (
        <>
          <Banner tone={tracking ? 'info' : 'warning'}>
            {tracking
              ? 'Your location is going to your dispatcher every few seconds.'
              : 'Location sharing has stopped. Tap below to start it again.'}
          </Banner>

          {!tracking ? (
            <Button title="Resume location sharing" variant="secondary" onPress={() => void beginDelivery()} />
          ) : null}

          {!completing ? (
            <Button
              title="Complete delivery"
              variant="success"
              onPress={() => {
                setDeliveredCount(String(job.product_count));
                setCashCollected(Number(job.cash_to_collect).toFixed(2));
                setCompleting(true);
              }}
            />
          ) : (
            <Card style={styles.completeCard}>
              <SectionTitle>Confirm what you delivered</SectionTitle>
              <Text style={styles.muted}>
                These go straight to your dispatcher. Change them if the drop was short.
              </Text>

              <View style={styles.pair}>
                <View style={styles.pairItem}>
                  <Field
                    label={`Products (sent ${job.product_count})`}
                    value={deliveredCount}
                    onChangeText={setDeliveredCount}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.pairItem}>
                  <Field
                    label={`Cash (due ${money(job.cash_to_collect)})`}
                    value={cashCollected}
                    onChangeText={setCashCollected}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <Field
                label="Anything to note?"
                value={completionNotes}
                onChangeText={setCompletionNotes}
                multiline
                placeholder="Left with reception, customer paid card, one box damaged…"
              />

              <Button title="Confirm delivery" variant="success" loading={busy} onPress={() => void finishDelivery()} />
              <Button title="Not yet" variant="secondary" onPress={() => setCompleting(false)} />
            </Card>
          )}
        </>
      ) : null}

      {job.status === 'completed' ? (
        <Card style={styles.completeCard}>
          <SectionTitle>Delivered</SectionTitle>
          <Row label="Finished at" value={clockTime(job.completed_at)} />
          <Row
            label="Products delivered"
            value={`${job.delivered_product_count ?? 0} of ${job.product_count}`}
            emphasis
          />
          <Row
            label="Cash collected"
            value={`${money(job.cash_collected)} of ${money(job.cash_to_collect)}`}
            emphasis
          />
          {job.completion_notes ? <Text style={styles.notes}>{job.completion_notes}</Text> : null}
        </Card>
      ) : null}

      {job.started_at || job.status === 'en_route' || job.status === 'completed' ? (
        <Button
          title={job.status === 'en_route' ? 'Show route so far' : 'Replay this run'}
          variant="secondary"
          onPress={() => router.push(`/replay/${job.id}`)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { ...type.body, color: colors.textMuted },
  notes: { ...type.body, backgroundColor: colors.bg, padding: spacing.md, borderRadius: radius.sm },
  estimate: { ...type.label, color: colors.primary },
  estimateWeak: { ...type.label, color: colors.textMuted },
  etaInput: { fontSize: 24, fontWeight: '700' },
  pair: { flexDirection: 'row', gap: spacing.md },
  pairItem: { flex: 1 },
  completeCard: { borderColor: colors.success, borderWidth: 2 },
});
