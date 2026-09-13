import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { assignJob, cancelJob, fetchJob, fetchJobEvents } from '@/api/jobs';
import { fetchDriverLocation, fetchJobTrail } from '@/api/locations';
import { listDrivers } from '@/api/profiles';
import { Banner, Button, Card, Heading, Loading, Pill, Row, Screen } from '@/components/ui';
import { JobMap } from '@/components/JobMap';
import { describeEta, isOverdue } from '@/lib/eta';
import {
  JOB_STATUS_COLORS,
  JOB_STATUS_LABELS,
  formatDateTime,
  formatMoney,
  formatRelative,
  reconcile,
} from '@/lib/format';
import { dialPhone } from '@/lib/navigation';
import { colors, radius, spacing } from '@/lib/theme';
import type { DriverLocation, Job, JobEvent, LatLngRow, Profile } from '@/lib/types';
import { useActiveSession } from '@/state/session';
import { supabase } from '@/lib/supabase';

export default function BossJobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { org } = useActiveSession();
  const router = useRouter();

  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [driverPosition, setDriverPosition] = useState<DriverLocation | null>(null);
  const [trail, setTrail] = useState<LatLngRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    loadJobDetail(id, org.id)
      .then((detail) => {
        if (cancelled) return;
        setJob(detail.job);
        setEvents(detail.events);
        setDrivers(detail.drivers);
        setDriverPosition(detail.position);
        setTrail(detail.trail);
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
  }, [id, org.id]);

  // Follow the job and the assigned driver live, so this screen is usable as a
  // "where are they now" view without pulling to refresh.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`job-detail:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${id}` },
        (payload) => setJob(payload.new as Job),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'job_events', filter: `job_id=eq.${id}` },
        (payload) => {
          if (payload.eventType !== 'INSERT') return;
          setEvents((current) => [...current, payload.new as JobEvent]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    if (!job?.assigned_to || job.status !== 'en_route') return;
    const driverId = job.assigned_to;

    const channel = supabase
      .channel(`job-driver:${driverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          const row = payload.new as DriverLocation;
          setDriverPosition(row);
          setTrail((current) => [...current, { lat: row.lat, lng: row.lng, recorded_at: row.recorded_at }]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [job?.assigned_to, job?.status]);

  const assignedTo = job?.assigned_to ?? null;
  const driverName = useMemo(() => {
    if (!assignedTo) return null;
    return drivers.find((driver) => driver.id === assignedTo)?.full_name ?? 'Driver';
  }, [drivers, assignedTo]);

  const reassign = async (driverId: string) => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      setJob(await assignJob(job.id, driverId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not assign this delivery');
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = () => {
    if (!job) return;
    Alert.alert('Cancel this delivery?', 'The driver will be told it has been pulled.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel delivery',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            setJob(await cancelJob(job.id));
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not cancel this delivery');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
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

  const isFinished = job.status === 'completed' || job.status === 'cancelled';
  const report = reconcile(job.product_count, job.delivered_count, job.cash_to_collect, job.cash_collected);
  const destination =
    job.address_lat !== null && job.address_lng !== null
      ? { lat: job.address_lat, lng: job.address_lng }
      : null;

  return (
    <Screen scroll>
      {error ? <Banner tone="error" message={error} /> : null}

      <View style={styles.titleRow}>
        <Heading sub={job.address}>{job.reference}</Heading>
        <Pill label={JOB_STATUS_LABELS[job.status]} color={JOB_STATUS_COLORS[job.status]} />
      </View>

      {(destination || driverPosition) && !isFinished ? (
        <JobMap
          destination={destination}
          driver={driverPosition ? { lat: driverPosition.lat, lng: driverPosition.lng } : null}
          trail={trail}
          height={220}
        />
      ) : null}

      <Card>
        <Row label="Products" value={`${job.product_count}`} />
        <Row label="Cash to collect" value={formatMoney(job.cash_to_collect, org.currency)} />
        <Row label="Driver" value={driverName ?? 'Not assigned'} />
        {job.customer_name ? <Row label="Customer" value={job.customer_name} /> : null}
        {job.notes ? <Row label="Notes" value={job.notes} /> : null}
        {job.eta_at && !isFinished ? (
          <Row
            label="Arriving in"
            value={`${describeEta(job.eta_at)}  (${job.eta_source === 'auto' ? 'live estimate' : 'driver entered'})`}
            valueStyle={isOverdue(job.eta_at) ? styles.late : undefined}
          />
        ) : null}
        {job.status === 'en_route' && driverPosition ? (
          <Row label="Position updated" value={formatRelative(driverPosition.recorded_at)} />
        ) : null}
        {job.decline_reason ? <Row label="Declined because" value={job.decline_reason} /> : null}
        {job.customer_phone ? (
          <Pressable onPress={() => void dialPhone(job.customer_phone!)} style={styles.callRow}>
            <Text style={styles.callText}>Call {job.customer_phone}</Text>
          </Pressable>
        ) : null}
      </Card>

      {job.status === 'completed' ? (
        <Card style={report.matches ? styles.reportOk : styles.reportFlag}>
          <Text style={styles.cardTitle}>Completion report</Text>
          <Row label="Products ordered" value={`${job.product_count}`} />
          <Row label="Products delivered" value={`${job.delivered_count ?? job.product_count}`} />
          <Row label="Cash expected" value={formatMoney(job.cash_to_collect, org.currency)} />
          <Row label="Cash collected" value={formatMoney(job.cash_collected, org.currency)} />
          {job.completion_notes ? <Row label="Driver's note" value={job.completion_notes} /> : null}
          <Row label="Completed" value={formatDateTime(job.completed_at)} />

          {!report.matches ? (
            <View style={styles.mismatch}>
              <Text style={styles.mismatchText}>
                {report.productShortfall !== 0
                  ? `${Math.abs(report.productShortfall)} product${Math.abs(report.productShortfall) === 1 ? '' : 's'} ${report.productShortfall > 0 ? 'short' : 'over'}. `
                  : ''}
                {report.cashShortfall !== 0
                  ? `${formatMoney(Math.abs(report.cashShortfall), org.currency)} ${report.cashShortfall > 0 ? 'short' : 'over'} on cash.`
                  : ''}
              </Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      {!isFinished ? (
        <Card>
          <Text style={styles.cardTitle}>{job.assigned_to ? 'Reassign' : 'Send to a driver'}</Text>
          <View style={styles.driverList}>
            {drivers
              .filter((driver) => driver.is_active)
              .map((driver) => {
                const active = driver.id === job.assigned_to;
                return (
                  <Pressable
                    key={driver.id}
                    disabled={active || busy}
                    onPress={() => void reassign(driver.id)}
                    style={[styles.driverChip, active && styles.driverChipActive]}
                  >
                    <Text style={[styles.driverChipText, active && styles.driverChipTextActive]}>
                      {driver.full_name || 'Unnamed driver'}
                    </Text>
                  </Pressable>
                );
              })}
          </View>
          {drivers.length === 0 ? (
            <Text style={styles.hint}>No drivers have joined your team yet.</Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.cardTitle}>Timeline</Text>
        {events.length === 0 ? (
          <Text style={styles.hint}>Nothing has happened yet.</Text>
        ) : (
          events.map((event) => (
            <View key={event.id} style={styles.event}>
              <View style={styles.eventDot} />
              <View style={styles.eventBody}>
                <Text style={styles.eventMessage}>{event.message ?? event.type}</Text>
                <Text style={styles.eventTime}>{formatDateTime(event.created_at)}</Text>
              </View>
            </View>
          ))
        )}
      </Card>

      {!isFinished ? (
        <Button label="Cancel delivery" variant="danger" onPress={confirmCancel} loading={busy} />
      ) : null}
    </Screen>
  );
}


/** One round trip for everything this screen shows. */
async function loadJobDetail(jobId: string, orgId: string) {
  const [job, events, drivers] = await Promise.all([
    fetchJob(jobId),
    fetchJobEvents(jobId),
    listDrivers(orgId),
  ]);

  if (!job?.assigned_to) {
    return { job, events, drivers, position: null, trail: [] as LatLngRow[] };
  }

  const [position, trail] = await Promise.all([
    fetchDriverLocation(job.assigned_to),
    fetchJobTrail(job.id),
  ]);
  return { job, events, drivers, position, trail };
}

const styles = StyleSheet.create({
  titleRow: { gap: spacing.sm, marginBottom: spacing.md },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: spacing.sm },
  late: { color: colors.danger },

  callRow: { paddingTop: spacing.md },
  callText: { color: colors.primary, fontSize: 15, fontWeight: '600' },

  reportOk: { borderColor: colors.success },
  reportFlag: { borderColor: colors.warning },
  mismatch: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: '#D9770622',
  },
  mismatchText: { color: colors.text, fontSize: 14, lineHeight: 20 },

  driverList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  driverChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  driverChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  driverChipText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  driverChipTextActive: { color: colors.primaryText },

  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },

  event: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  eventBody: { flex: 1 },
  eventMessage: { color: colors.text, fontSize: 14 },
  eventTime: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
