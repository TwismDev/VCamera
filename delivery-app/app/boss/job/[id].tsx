import { Picker } from '@react-native-picker/picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { STATUS_TONE } from '@/components/JobCard';
import { Banner, Button, Card, Loading, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { clockTime, minutesLabel, money, relativeTime, STATUS_LABEL } from '@/lib/format';
import { haversineKm, isLatLng, kmLabel } from '@/lib/geo';
import { updateJob, useJob } from '@/hooks/useJobs';
import { useDriverLocations } from '@/hooks/useDriverLocations';
import { useTeam } from '@/hooks/useTeam';
import { useAuth } from '@/providers/AuthProvider';
import { openDialer, openNavigation } from '@/services/navigation';
import { colors, radius, spacing, type } from '@/theme';

export default function BossJobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const { job, loading } = useJob(id);
  const { drivers } = useTeam(profile?.org_id);
  const { locations } = useDriverLocations(profile?.org_id);
  const [busy, setBusy] = useState(false);

  const driverPosition = useMemo(
    () => locations.find((location) => location.driver_id === job?.driver_id) ?? null,
    [locations, job?.driver_id],
  );

  const distanceToDrop = useMemo(() => {
    if (!job || !driverPosition) return null;
    if (!isLatLng(job.address_lat, job.address_lng)) return null;
    return haversineKm(
      { lat: driverPosition.lat, lng: driverPosition.lng },
      { lat: job.address_lat as number, lng: job.address_lng as number },
    );
  }, [job, driverPosition]);

  if (loading) return <Loading />;
  if (!job) return <Screen><Text style={type.body}>This job no longer exists.</Text></Screen>;

  async function patch(changes: Parameters<typeof updateJob>[1]) {
    if (!job) return;
    setBusy(true);
    try {
      await updateJob(job.id, changes);
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  const isFinished = ['completed', 'declined', 'cancelled'].includes(job.status);

  return (
    <Screen>
      <Card>
        <View style={styles.headerRow}>
          <Pill text={STATUS_LABEL[job.status]} tone={STATUS_TONE[job.status]} />
          <Text style={styles.timestamp}>Created {relativeTime(job.created_at)}</Text>
        </View>
        <Text style={type.heading}>{job.address}</Text>
        {job.customer_name ? <Text style={styles.muted}>For {job.customer_name}</Text> : null}
        {job.notes ? <Text style={styles.notes}>{job.notes}</Text> : null}
      </Card>

      <Card>
        <SectionTitle>The order</SectionTitle>
        <Row label="Products to deliver" value={String(job.product_count)} emphasis />
        <Row label="Cash to collect" value={money(job.cash_to_collect)} emphasis />
      </Card>

      <Card>
        <SectionTitle>Driver</SectionTitle>
        {job.driver ? (
          <>
            <Row label="Assigned to" value={job.driver.full_name || 'Unnamed'} />
            {job.driver.phone ? (
              <Button
                title={`Call ${job.driver.full_name || 'driver'}`}
                variant="secondary"
                onPress={() => openDialer(job.driver!.phone as string)}
              />
            ) : null}
          </>
        ) : (
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue=""
              onValueChange={(value) => value && patch({ driver_id: value as string })}
            >
              <Picker.Item label="Assign a driver…" value="" />
              {drivers.map((driver) => (
                <Picker.Item key={driver.id} label={driver.full_name} value={driver.id} />
              ))}
            </Picker>
          </View>
        )}

        {driverPosition ? (
          <>
            <Row label="Last position" value={relativeTime(driverPosition.updated_at)} />
            {distanceToDrop != null ? (
              <Row label="Distance to drop" value={kmLabel(distanceToDrop)} />
            ) : null}
            {driverPosition.battery_pct != null ? (
              <Row label="Phone battery" value={`${driverPosition.battery_pct}%`} />
            ) : null}
            <Button
              title="Show on live map"
              variant="secondary"
              onPress={() => router.push('/boss/map')}
            />
          </>
        ) : job.status === 'en_route' ? (
          <Banner tone="warning">
            No position received yet. The driver’s phone may still be getting a fix.
          </Banner>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>ETA</SectionTitle>
        {job.eta_minutes == null ? (
          <Text style={styles.muted}>The driver hasn’t sent an ETA yet.</Text>
        ) : (
          <>
            <Row label="Driver said" value={minutesLabel(job.eta_minutes)} emphasis />
            <Row label="Arriving around" value={clockTime(job.eta_at)} />
            <Row
              label="Source"
              value={job.eta_source === 'auto' ? 'Calculated by the app' : 'Typed by the driver'}
            />
            <Row label="Updated" value={relativeTime(job.eta_updated_at)} />
          </>
        )}
      </Card>

      {job.status === 'completed' ? (
        <Card style={styles.completedCard}>
          <SectionTitle>Completed</SectionTitle>
          <Row label="Delivered at" value={clockTime(job.completed_at)} />
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
          {shortfall(job.delivered_product_count, job.product_count) ||
          shortfall(job.cash_collected, job.cash_to_collect) ? (
            <Banner tone="warning">
              This delivery came back short of what was sent out. Check the driver’s note.
            </Banner>
          ) : null}
        </Card>
      ) : null}

      {job.status === 'declined' && job.decline_reason ? (
        <Banner tone="danger">Declined: {job.decline_reason}</Banner>
      ) : null}

      <Button
        title="Open address in maps"
        variant="secondary"
        onPress={() =>
          void openNavigation('system', {
            address: job.address,
            coords: isLatLng(job.address_lat, job.address_lng)
              ? { lat: job.address_lat as number, lng: job.address_lng as number }
              : null,
          })
        }
      />

      {!isFinished ? (
        <Button
          title="Cancel this job"
          variant="danger"
          loading={busy}
          onPress={() =>
            Alert.alert('Cancel job?', 'The driver will see it drop off their list.', [
              { text: 'Keep it', style: 'cancel' },
              { text: 'Cancel job', style: 'destructive', onPress: () => void patch({ status: 'cancelled' }) },
            ])
          }
        />
      ) : null}
    </Screen>
  );
}

function shortfall(actual: number | null, expected: number): boolean {
  return actual != null && Number(actual) < Number(expected);
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timestamp: { ...type.label },
  muted: { ...type.body, color: colors.textMuted },
  notes: { ...type.body, backgroundColor: colors.bg, padding: spacing.md, borderRadius: radius.sm },
  completedCard: { borderColor: colors.success },
  pickerWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
});
