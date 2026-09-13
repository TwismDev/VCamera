import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { JobCard } from '@/components/JobCard';
import { Button, Empty, Loading, Screen, SectionTitle } from '@/components/ui';
import { money } from '@/lib/format';
import { useJobs, usePartitionedJobs } from '@/hooks/useJobs';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radius, spacing, type } from '@/theme';

export default function BossJobBoard() {
  const { profile, org, signOut } = useAuth();
  const router = useRouter();
  const { jobs, loading, reload } = useJobs(profile?.org_id ? { orgId: profile.org_id } : null);
  const { open, closed } = usePartitionedJobs(jobs);
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  if (loading) return <Loading label="Loading the job board…" />;

  const cashOutstanding = open.reduce((sum, job) => sum + Number(job.cash_to_collect), 0);
  const productsOut = open.reduce((sum, job) => sum + job.product_count, 0);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.summary}>
        <Summary label="Open jobs" value={String(open.length)} />
        <Summary label="Products out" value={String(productsOut)} />
        <Summary label="Cash due in" value={money(cashOutstanding)} />
      </View>

      <Button title="+ New delivery" onPress={() => router.push('/boss/new-job')} />

      <View style={styles.actions}>
        <Button
          title="Live map"
          variant="secondary"
          style={styles.action}
          onPress={() => router.push('/boss/map')}
        />
        <Button
          title="Team"
          variant="secondary"
          style={styles.action}
          onPress={() => router.push('/boss/team')}
        />
      </View>

      <Button
        title="End of day sheet"
        variant="secondary"
        onPress={() => router.push('/boss/eod')}
      />

      {org ? (
        <Text style={styles.teamCode}>
          {org.name} · driver join code <Text style={styles.code}>{org.join_code}</Text>
        </Text>
      ) : null}

      <SectionTitle>In progress ({open.length})</SectionTitle>
      {open.length === 0 ? (
        <Empty title="Nothing on the road" body="Create a delivery to get a driver moving." />
      ) : (
        open.map((job) => (
          <JobCard key={job.id} job={job} href={`/boss/job/${job.id}`} showDriver />
        ))
      )}

      {closed.length > 0 ? (
        <>
          <SectionTitle>Finished ({closed.length})</SectionTitle>
          {closed.slice(0, 25).map((job) => (
            <JobCard key={job.id} job={job} href={`/boss/job/${job.id}`} showDriver />
          ))}
        </>
      ) : null}

      <Link href="/driver" style={styles.switchLink}>
        Open the driver view
      </Link>
      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryTile}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: spacing.sm },
  summaryTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  summaryValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  summaryLabel: { ...type.label },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  teamCode: { ...type.body, color: colors.textMuted, textAlign: 'center' },
  code: { fontWeight: '800', letterSpacing: 2, color: colors.text },
  switchLink: { ...type.body, color: colors.primary, textAlign: 'center', marginTop: spacing.lg },
});
