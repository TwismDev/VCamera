import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { clockTime, minutesLabel, money, STATUS_LABEL } from '@/lib/format';
import type { JobStatus, JobWithDriver } from '@/lib/types';
import { colors, radius, spacing, type } from '@/theme';

import { Pill } from './ui';

export const STATUS_TONE: Record<JobStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  assigned: 'warning',
  accepted: 'info',
  en_route: 'info',
  completed: 'success',
  declined: 'danger',
  cancelled: 'neutral',
};

export function JobCard({
  job,
  href,
  showDriver,
}: {
  job: JobWithDriver;
  href: string;
  showDriver?: boolean;
}) {
  return (
    <Link href={href as never} asChild>
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.header}>
          <Pill text={STATUS_LABEL[job.status]} tone={STATUS_TONE[job.status]} />
          {job.status === 'en_route' && job.eta_at ? (
            <Text style={styles.eta}>ETA {clockTime(job.eta_at)}</Text>
          ) : job.eta_minutes != null ? (
            <Text style={styles.eta}>ETA {minutesLabel(job.eta_minutes)}</Text>
          ) : null}
        </View>

        <Text style={styles.address} numberOfLines={2}>
          {job.address}
        </Text>

        {showDriver ? (
          <Text style={styles.driver}>
            {job.driver?.full_name ? `Driver: ${job.driver.full_name}` : 'No driver assigned'}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <Metric label="Products" value={String(job.product_count)} />
          <Metric label="Collect" value={money(job.cash_to_collect)} />
        </View>
      </Pressable>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.75 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eta: { ...type.label, color: colors.primary },
  address: { ...type.heading },
  driver: { ...type.body, color: colors.textMuted },
  footer: {
    flexDirection: 'row',
    gap: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  metric: { gap: 2 },
  metricLabel: { ...type.label },
  metricValue: { fontSize: 18, fontWeight: '700', color: colors.text },
});
