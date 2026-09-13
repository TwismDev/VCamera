import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { listDrivers } from '@/api/profiles';
import { JobCard } from '@/components/JobCard';
import { Banner, Button, EmptyState, Loading } from '@/components/ui';
import { useOrgJobs } from '@/hooks/useOrgJobs';
import { colors, radius, spacing } from '@/lib/theme';
import { OPEN_STATUSES, type JobStatus, type Profile } from '@/lib/types';
import { useActiveSession } from '@/state/session';

const FILTERS: { key: string; label: string; statuses: JobStatus[] | undefined }[] = [
  { key: 'open', label: 'Open', statuses: OPEN_STATUSES },
  { key: 'done', label: 'Completed', statuses: ['completed'] },
  { key: 'all', label: 'All', statuses: undefined },
];

export default function BossJobs() {
  const { org } = useActiveSession();
  const router = useRouter();
  const [filterKey, setFilterKey] = useState('open');
  const [refreshing, setRefreshing] = useState(false);
  const [drivers, setDrivers] = useState<Profile[]>([]);

  const statuses = useMemo(
    () => FILTERS.find((filter) => filter.key === filterKey)?.statuses,
    [filterKey],
  );

  const { jobs, loading, error, reload } = useOrgJobs({ orgId: org.id, statuses });

  React.useEffect(() => {
    listDrivers(org.id)
      .then(setDrivers)
      .catch(() => setDrivers([]));
  }, [org.id]);

  const driverNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const driver of drivers) map.set(driver.id, driver.full_name || 'Unnamed driver');
    return map;
  }, [drivers]);

  const refresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  if (loading) return <Loading label="Loading deliveries" />;

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        {FILTERS.map((filter) => {
          const active = filter.key === filterKey;
          return (
            <Pressable
              key={filter.key}
              onPress={() => setFilterKey(filter.key)}
              style={[styles.filter, active && styles.filterActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{filter.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Banner tone="error" message={error} /> : null}

      <FlatList
        data={jobs}
        keyExtractor={(job) => job.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textMuted} />
        }
        renderItem={({ item }) => (
          <JobCard
            job={item}
            currency={org.currency}
            driverName={item.assigned_to ? driverNames.get(item.assigned_to) : undefined}
            onPress={() => router.push(`/(boss)/job/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title="Nothing here yet"
            body="Raise a delivery and send it to one of your drivers."
          />
        }
      />

      <View style={styles.footer}>
        <Button label="New delivery" onPress={() => router.push('/(boss)/new-job')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  filter: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  filterTextActive: { color: colors.primaryText },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
