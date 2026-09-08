import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { JobCard } from '@/components/JobCard';
import { Banner, Button, Empty, Loading, Screen, SectionTitle } from '@/components/ui';
import { money } from '@/lib/format';
import { useJobs, usePartitionedJobs } from '@/hooks/useJobs';
import { useAuth } from '@/providers/AuthProvider';
import { isTracking } from '@/services/tracking';
import { colors, radius, spacing, type } from '@/theme';

export default function DriverJobs() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const { jobs, loading, reload } = useJobs(
    profile?.org_id ? { orgId: profile.org_id, driverId: profile.id } : null,
  );
  const { open, closed } = usePartitionedJobs(jobs);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    void isTracking().then(setSharing);
  }, [jobs]);

  async function onRefresh() {
    setRefreshing(true);
    await reload();
    setSharing(await isTracking());
    setRefreshing(false);
  }

  if (loading) return <Loading label="Fetching your run sheet…" />;

  const newJobs = open.filter((job) => job.status === 'assigned');
  const cashOnBoard = open
    .filter((job) => job.status !== 'assigned')
    .reduce((sum, job) => sum + Number(job.cash_to_collect), 0);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {sharing ? (
        <Banner tone="info">Location sharing is on — your dispatcher can see you.</Banner>
      ) : null}

      {newJobs.length > 0 ? (
        <Banner tone="warning">
          {newJobs.length} new {newJobs.length === 1 ? 'job needs' : 'jobs need'} your answer.
        </Banner>
      ) : null}

      <View style={styles.summary}>
        <Summary label="Jobs today" value={String(open.length)} />
        <Summary label="Cash to collect" value={money(cashOnBoard)} />
      </View>

      <SectionTitle>Active ({open.length})</SectionTitle>
      {open.length === 0 ? (
        <Empty title="Nothing assigned" body="New jobs land here the moment your dispatcher sends them." />
      ) : (
        open.map((job) => <JobCard key={job.id} job={job} href={`/driver/job/${job.id}`} />)
      )}

      {closed.length > 0 ? (
        <>
          <SectionTitle>Done ({closed.length})</SectionTitle>
          {closed.slice(0, 20).map((job) => (
            <JobCard key={job.id} job={job} href={`/driver/job/${job.id}`} />
          ))}
        </>
      ) : null}

      <Button title="Profile & permissions" variant="secondary" onPress={() => router.push('/driver/profile')} />
      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  tileValue: { fontSize: 24, fontWeight: '800', color: colors.text },
  tileLabel: { ...type.label },
});
