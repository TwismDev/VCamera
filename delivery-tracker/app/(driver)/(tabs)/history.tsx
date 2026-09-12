import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { JobCard } from '@/components/JobCard';
import { Banner, EmptyState, Loading } from '@/components/ui';
import { useOrgJobs } from '@/hooks/useOrgJobs';
import { colors, spacing } from '@/lib/theme';
import { useActiveSession } from '@/state/session';

export default function DriverHistory() {
  const { org, userId } = useActiveSession();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { jobs, loading, error, reload } = useOrgJobs({
    orgId: org.id,
    driverId: userId,
    statuses: ['completed'],
  });

  if (loading) return <Loading label="Loading your history" />;

  return (
    <View style={styles.container}>
      {error ? <Banner tone="error" message={error} /> : null}

      <FlatList
        data={jobs}
        keyExtractor={(job) => job.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.textMuted}
            onRefresh={async () => {
              setRefreshing(true);
              await reload();
              setRefreshing(false);
            }}
          />
        }
        renderItem={({ item }) => (
          <JobCard
            job={item}
            currency={org.currency}
            onPress={() => router.push(`/(driver)/job/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <EmptyState title="Nothing yet" body="Deliveries you complete will be listed here." />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg },
});
