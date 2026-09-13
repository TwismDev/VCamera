import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { listDrivers, rotateJoinCode, setDriverActive } from '@/api/profiles';
import { Banner, Button, Card, Heading, Loading, Row, Screen } from '@/components/ui';
import { initials } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import type { Profile } from '@/lib/types';
import { useActiveSession, useSession } from '@/state/session';

export default function Team() {
  const { org, profile } = useActiveSession();
  const { refresh, signOut } = useSession();

  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDrivers(await listDrivers(org.id));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your team');
    }
  }, [org.id]);

  useEffect(() => {
    let cancelled = false;

    listDrivers(org.id)
      .then((next) => {
        if (cancelled) return;
        setDrivers(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'Could not load your team');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [org.id]);

  const toggleDriver = async (driver: Profile, nextActive: boolean) => {
    // Update locally first so the switch does not lag behind the finger.
    setDrivers((current) =>
      current.map((row) => (row.id === driver.id ? { ...row, is_active: nextActive } : row)),
    );
    try {
      await setDriverActive(driver.id, nextActive);
    } catch (caught) {
      setDrivers((current) =>
        current.map((row) => (row.id === driver.id ? { ...row, is_active: !nextActive } : row)),
      );
      setError(caught instanceof Error ? caught.message : 'Could not update that driver');
    }
  };

  const regenerate = () => {
    Alert.alert(
      'Generate a new team code?',
      'The current code stops working straight away. Drivers already on the team stay on it.',
      [
        { text: 'Keep current code', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setBusy(true);
            try {
              await rotateJoinCode();
              await refresh();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'Could not change the code');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  if (loading) return <Loading label="Loading your team" />;

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.textMuted}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <Heading sub={`Signed in as ${profile.full_name || 'dispatcher'}`}>{org.name}</Heading>

        {error ? <Banner tone="error" message={error} /> : null}

        <Card>
          <Text style={styles.cardTitle}>Team code</Text>
          <Text style={styles.code}>{org.join_code}</Text>
          <Text style={styles.hint}>
            Drivers enter this once, when they first sign in, to join your team.
          </Text>
          <Button
            label="Generate a new code"
            variant="ghost"
            onPress={regenerate}
            loading={busy}
            style={styles.spaced}
          />
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Drivers</Text>
          {drivers.length === 0 ? (
            <Text style={styles.hint}>Nobody has joined yet. Share the code above.</Text>
          ) : (
            drivers.map((driver) => (
              <View key={driver.id} style={styles.driverRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(driver.full_name || '?')}</Text>
                </View>
                <View style={styles.driverMain}>
                  <Text style={styles.driverName}>{driver.full_name || 'Unnamed driver'}</Text>
                  <Text style={styles.driverMeta}>
                    {driver.phone ?? 'No phone number'}
                    {driver.is_active ? '' : '  ·  cannot be assigned work'}
                  </Text>
                </View>
                <Switch
                  value={driver.is_active}
                  onValueChange={(next) => void toggleDriver(driver, next)}
                  trackColor={{ true: colors.primary, false: colors.border }}
                />
              </View>
            ))
          )}
        </Card>

        <Card>
          <Row label="Currency" value={org.currency} />
          <Row label="Role" value="Dispatcher" />
        </Card>

        <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: spacing.sm },
  code: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 6,
    marginBottom: spacing.sm,
  },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  spaced: { marginTop: spacing.md },

  driverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  driverMain: { flex: 1 },
  driverName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  driverMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
});
