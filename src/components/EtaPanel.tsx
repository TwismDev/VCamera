import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { estimateRoute } from '@/api/routing';
import { Banner, Button } from '@/components/ui';
import { etaFromMinutes, roundUpToStep } from '@/lib/eta';
import { formatClockTime } from '@/lib/format';
import { formatDistance, isValidCoordinate, type LatLng } from '@/lib/geo';
import { colors, radius, spacing } from '@/lib/theme';
import { getCurrentPosition } from '@/lib/tracking';
import type { EtaSource } from '@/lib/types';

const QUICK_MINUTES = [10, 15, 20, 30, 45, 60];

/**
 * How the driver commits to an arrival time.
 *
 * Two routes to the same answer, because neither alone is enough in practice:
 *
 *   Work it out   asks the routing service for a drive time from where the
 *                 driver is standing to the delivery address. With a Google
 *                 key on the server this accounts for current traffic.
 *
 *   Type it in    lets the driver override with what they actually know: a
 *                 stop on the way, a loading queue, a road they know is shut.
 *
 * The computed figure is rounded up to the next five minutes before it is
 * offered, because quoting a customer 13 minutes is false precision.
 */
export function EtaPanel({
  address,
  destination,
  currentEtaAt,
  currentEtaSource,
  onSubmit,
}: {
  address: string;
  destination: LatLng | null;
  currentEtaAt: string | null;
  currentEtaSource: EtaSource | null;
  onSubmit: (etaAt: string, source: EtaSource, minutes: number) => Promise<void>;
}) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [source, setSource] = useState<EtaSource>('manual');
  const [detail, setDetail] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computeEta = async () => {
    setError(null);
    setDetail(null);
    setWorking(true);
    try {
      const position = await getCurrentPosition();
      if (!position) {
        setError('Location access is needed to work out a drive time. Turn it on, or type the time in.');
        return;
      }

      const origin: LatLng = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      const target = isValidCoordinate(destination) ? destination : null;
      const estimate = await estimateRoute(origin, target, address);

      const rounded = roundUpToStep(estimate.eta_minutes, 5);
      setMinutes(rounded);
      setSource('auto');
      setDetail(
        `${formatDistance(estimate.distance_meters)} away, about ${estimate.eta_minutes} min driving${
          estimate.traffic_aware ? ' in current traffic' : ' (no live traffic data)'
        }. Rounded up to ${rounded} min.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not work out a drive time.');
    } finally {
      setWorking(false);
    }
  };

  const send = async () => {
    if (minutes === null) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit(etaFromMinutes(minutes), source, minutes);
      setDetail(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send your arrival time.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View>
      <Text style={styles.title}>Arrival time</Text>

      {currentEtaAt ? (
        <Text style={styles.current}>
          Your dispatcher has {formatClockTime(currentEtaAt)}
          {currentEtaSource === 'auto' ? ' (live estimate)' : ' (you entered it)'}.
        </Text>
      ) : (
        <Text style={styles.current}>Your dispatcher is waiting on an arrival time.</Text>
      )}

      {error ? <Banner tone="error" message={error} /> : null}

      <Button
        label="Work out my arrival time"
        variant="ghost"
        onPress={computeEta}
        loading={working}
        style={styles.compute}
      />

      <Text style={styles.label}>Or pick how long you need</Text>
      <View style={styles.quickRow}>
        {QUICK_MINUTES.map((value) => {
          const active = minutes === value && source === 'manual';
          return (
            <Pressable
              key={value}
              onPress={() => {
                setMinutes(value);
                setSource('manual');
                setDetail(null);
              }}
              style={[styles.quick, active && styles.quickActive]}
            >
              <Text style={[styles.quickText, active && styles.quickTextActive]}>{value} min</Text>
            </Pressable>
          );
        })}
      </View>

      {minutes !== null ? (
        <View style={styles.preview}>
          <Text style={styles.previewText}>
            Arriving about {formatClockTime(etaFromMinutes(minutes))}, {minutes} minutes from now.
          </Text>
          {detail ? <Text style={styles.previewDetail}>{detail}</Text> : null}
        </View>
      ) : null}

      <Button
        label="Send arrival time to dispatcher"
        onPress={send}
        disabled={minutes === null}
        loading={sending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: spacing.xs },
  current: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  compute: { marginBottom: spacing.lg },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  quick: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  quickActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  quickText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  quickTextActive: { color: colors.primaryText },
  preview: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  previewText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  previewDetail: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs, lineHeight: 18 },
});
