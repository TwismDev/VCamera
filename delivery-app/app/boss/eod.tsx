import * as Clipboard from 'expo-clipboard';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Empty, Loading, Row, Screen, SectionTitle } from '@/components/ui';
import { clockTime, money } from '@/lib/format';
import { addDays, isToday, useEndOfDay } from '@/hooks/useEndOfDay';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radius, spacing, type } from '@/theme';

/**
 * The knock-off sheet: what came in today, who is holding it, and which drops
 * came back short.
 */
export default function EndOfDay() {
  const { profile, org } = useAuth();
  const [day, setDay] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  const { jobs, totals, loading, reload } = useEndOfDay(profile?.org_id, day);

  const heading = useMemo(
    () =>
      day.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [day],
  );

  async function onRefresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  /** A plain-text version, for pasting into a handover message. */
  async function copySummary() {
    const lines = [
      `${org?.name ?? 'Deliveries'} — ${heading}`,
      '',
      ...jobs.map((job) => {
        const who = job.customer_name?.trim() || job.address;
        const amount = money(job.cash_collected);
        const short = Number(job.cash_collected ?? 0) < Number(job.cash_to_collect)
          ? ` (short of ${money(job.cash_to_collect)})`
          : '';
        return `${clockTime(job.completed_at)}  ${who} — ${amount}${short}`;
      }),
      '',
      `Deliveries: ${totals.deliveries}`,
      `Collected:  ${money(totals.collected)}`,
      `Expected:   ${money(totals.expected)}`,
      ...(totals.variance !== 0 ? [`Difference: ${money(totals.variance)}`] : []),
    ];

    await Clipboard.setStringAsync(lines.join('\n'));
    Alert.alert('Copied', 'The day’s summary is on your clipboard.');
  }

  if (loading) return <Loading label="Adding up the day…" />;

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.dayNav}>
        <Pressable onPress={() => setDay(addDays(day, -1))} style={styles.navButton} accessibilityLabel="Previous day">
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>
        <View style={styles.dayLabel}>
          <Text style={styles.dayText}>{isToday(day) ? 'Today' : heading}</Text>
          {isToday(day) ? <Text style={styles.daySub}>{heading}</Text> : null}
        </View>
        <Pressable
          onPress={() => setDay(addDays(day, 1))}
          disabled={isToday(day)}
          style={[styles.navButton, isToday(day) && styles.navDisabled]}
          accessibilityLabel="Next day"
        >
          <Text style={styles.navArrow}>›</Text>
        </Pressable>
      </View>

      <Card style={styles.headline}>
        <Text style={styles.headlineLabel}>COLLECTED</Text>
        <Text style={styles.headlineValue}>{money(totals.collected)}</Text>
        <Text style={styles.headlineSub}>
          across {totals.deliveries} {totals.deliveries === 1 ? 'delivery' : 'deliveries'}
        </Text>
      </Card>

      <Card>
        <Row label="Expected" value={money(totals.expected)} />
        <Row
          label="Difference"
          value={
            <Text style={[styles.variance, totals.variance < 0 && styles.varianceShort]}>
              {totals.variance === 0 ? 'balanced' : money(totals.variance)}
            </Text>
          }
        />
        {totals.items > 0 ? <Row label="Items delivered" value={String(totals.items)} /> : null}
      </Card>

      {totals.short.length > 0 ? (
        <Banner tone="warning">
          {totals.short.length} {totals.short.length === 1 ? 'delivery' : 'deliveries'} came back
          short of what was due.
        </Banner>
      ) : null}

      {totals.byDriver.length > 0 ? (
        <>
          <SectionTitle>Cash by driver</SectionTitle>
          {totals.byDriver.map((driver) => (
            <Card key={driver.driverId}>
              <Row label={driver.name} value={money(driver.collected)} emphasis />
              <Text style={styles.muted}>
                {driver.deliveries} {driver.deliveries === 1 ? 'delivery' : 'deliveries'}
              </Text>
            </Card>
          ))}
        </>
      ) : null}

      <SectionTitle>Deliveries ({jobs.length})</SectionTitle>
      {jobs.length === 0 ? (
        <Empty
          title="Nothing completed"
          body={isToday(day) ? 'Finished jobs land here through the day.' : 'No deliveries were completed on this day.'}
        />
      ) : (
        jobs.map((job) => {
          const short = Number(job.cash_collected ?? 0) < Number(job.cash_to_collect);
          return (
            <Card key={job.id} style={short ? styles.shortCard : undefined}>
              <View style={styles.jobHeader}>
                <Text style={styles.customer} numberOfLines={1}>
                  {job.customer_name?.trim() || job.address}
                </Text>
                <Text style={styles.amount}>{money(job.cash_collected)}</Text>
              </View>
              {job.customer_name?.trim() ? (
                <Text style={styles.muted} numberOfLines={1}>
                  {job.address}
                </Text>
              ) : null}
              <Text style={styles.muted}>
                {clockTime(job.completed_at)} · {job.driver?.full_name || 'Unassigned'}
              </Text>
              {short ? (
                <Text style={styles.shortNote}>Due {money(job.cash_to_collect)}</Text>
              ) : null}
              {job.completion_notes ? (
                <Text style={styles.notes}>{job.completion_notes}</Text>
              ) : null}
            </Card>
          );
        })
      )}

      {jobs.length > 0 ? (
        <Button title="Copy summary" variant="secondary" onPress={() => void copySummary()} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navDisabled: { opacity: 0.35 },
  navArrow: { fontSize: 26, color: colors.text, lineHeight: 30 },
  dayLabel: { flex: 1, alignItems: 'center' },
  dayText: { ...type.heading },
  daySub: { ...type.label },

  headline: { alignItems: 'center', gap: 2, borderColor: colors.primary, borderWidth: 2 },
  headlineLabel: { ...type.label, letterSpacing: 1 },
  headlineValue: { fontSize: 44, fontWeight: '800', color: colors.text },
  headlineSub: { ...type.body, color: colors.textMuted },

  variance: { ...type.body, fontWeight: '700' },
  varianceShort: { color: colors.danger },

  jobHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  customer: { ...type.heading, flex: 1 },
  amount: { fontSize: 19, fontWeight: '800', color: colors.text },
  muted: { ...type.body, color: colors.textMuted },
  shortCard: { borderColor: colors.danger },
  shortNote: { ...type.label, color: colors.danger },
  notes: { ...type.body, backgroundColor: colors.bg, padding: spacing.md, borderRadius: radius.sm },
});
