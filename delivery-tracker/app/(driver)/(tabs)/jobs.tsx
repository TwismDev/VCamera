import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { JobCard } from '@/components/JobCard';
import { Banner, EmptyState, Loading } from '@/components/ui';
import { useOrgJobs } from '@/hooks/useOrgJobs';
import { colors, spacing } from '@/lib/theme';
import { OPEN_STATUSES } from '@/lib/types';
import { useActiveSession } from '@/state/session';

export default function DriverJobs() {
  const { org, userId } = useActiveSession();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { jobs, loading, error, reload } = useOrgJobs({
    orgId: org.id,
    driverId: userId,
    statuses: OPEN_STATUSES,
  });

  if (loading) return <Loading label="Loading your jobs" />;

  // Whatever is live comes first: a run in progress, then anything waiting on
  // an answer, then the rest.
  const ordered = [...jobs].sort((a, b) => rank(a.status) - rank(b.status));

  return (
    <View style={styles.container}>
      {error ? <Banner tone="error" message={error} /> : null}

      <FlatList
        data={ordered}
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
          <EmptyState
            title="Nothing assigned"
            body="New deliveries from your dispatcher will show up here."
          />
        }
      />
    </View>
  );
}

function rank(status: string): number {
  switch (status) {
    case 'en_route':
      return 0;
    case 'arrived':
      return 1;
    case 'assigned':
      return 2;
    case 'accepted':
      return 3;
    default:
      return 4;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg },
});
