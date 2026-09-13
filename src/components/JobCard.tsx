import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Pill, Row } from '@/components/ui';
import { describeEta, isOverdue } from '@/lib/eta';
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS, formatMoney } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';
import type { Job } from '@/lib/types';

export function JobCard({
  job,
  currency,
  driverName,
  onPress,
}: {
  job: Job;
  currency: string;
  driverName?: string;
  onPress: () => void;
}) {
  const showEta = job.eta_at && ['accepted', 'en_route', 'arrived'].includes(job.status);
  const late = isOverdue(job.eta_at);

  return (
    <Card onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.reference}>{job.reference}</Text>
        <Pill label={JOB_STATUS_LABELS[job.status]} color={JOB_STATUS_COLORS[job.status]} />
      </View>

      <Text style={styles.address} numberOfLines={2}>
        {job.address}
      </Text>

      {job.customer_name ? <Text style={styles.customer}>{job.customer_name}</Text> : null}

      <View style={styles.divider} />

      <Row label="Products" value={`${job.product_count}`} />
      <Row label="Cash to collect" value={formatMoney(job.cash_to_collect, currency)} />
      {driverName ? <Row label="Driver" value={driverName} /> : null}
      {showEta ? (
        <Row
          label="Arriving in"
          value={describeEta(job.eta_at)}
          valueStyle={late ? styles.late : undefined}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  reference: { color: colors.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  address: { color: colors.text, fontSize: 16, fontWeight: '600', lineHeight: 22 },
  customer: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  late: { color: colors.danger },
});
