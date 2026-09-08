import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';

import { Banner, Button, Card, Empty, Loading, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useDriverLocations } from '@/hooks/useDriverLocations';
import { useTeam } from '@/hooks/useTeam';
import { useAuth } from '@/providers/AuthProvider';
import { openDialer } from '@/services/navigation';
import { colors, spacing, type } from '@/theme';

export default function Team() {
  const { profile, org, refresh } = useAuth();
  const { members, drivers, loading, reload } = useTeam(profile?.org_id);
  const { locations, reload: reloadLocations } = useDriverLocations(profile?.org_id);
  const [busy, setBusy] = useState(false);

  async function call(action: () => PromiseLike<{ error: { message: string } | null }>, done?: string) {
    setBusy(true);
    const { error } = await action();
    setBusy(false);

    if (error) {
      Alert.alert('That didn’t work', error.message);
      return;
    }
    await Promise.all([reload(), reloadLocations(), refresh()]);
    if (done) Alert.alert('Done', done);
  }

  if (loading) return <Loading />;

  const dispatchers = members.filter((member) => member.role === 'boss');

  return (
    <Screen>
      <Card>
        <SectionTitle>Driver join code</SectionTitle>
        <Text style={styles.code}>{org?.join_code ?? '——————'}</Text>
        <Text style={styles.muted}>
          A driver creates an account and enters this code once. Anyone joining with it comes in as
          a driver — promote them below if they should dispatch too.
        </Text>
        <Button
          title="Copy code"
          variant="secondary"
          onPress={async () => {
            if (!org?.join_code) return;
            await Clipboard.setStringAsync(org.join_code);
            Alert.alert('Copied', `${org.join_code} is on your clipboard.`);
          }}
        />
        <Button
          title="Generate a new code"
          variant="secondary"
          loading={busy}
          onPress={() =>
            Alert.alert(
              'New join code?',
              'The current code stops working straight away. Use this after someone leaves.',
              [
                { text: 'Keep it', style: 'cancel' },
                {
                  text: 'Replace it',
                  style: 'destructive',
                  onPress: () => void call(() => supabase.rpc('regenerate_join_code'), 'The old code no longer works.'),
                },
              ],
            )
          }
        />
      </Card>

      <SectionTitle>Drivers ({drivers.length})</SectionTitle>
      {drivers.length === 0 ? (
        <Empty title="No drivers yet" body="Share the join code above to get them on board." />
      ) : (
        drivers.map((driver) => {
          const position = locations.find((location) => location.driver_id === driver.id);
          return (
            <Card key={driver.id}>
              <Text style={type.heading}>{driver.full_name || 'Unnamed driver'}</Text>
              <Row
                label="Location"
                value={
                  position ? (
                    <Pill text={`Seen ${relativeTime(position.updated_at)}`} tone="success" />
                  ) : (
                    <Pill text="Not sharing" tone="neutral" />
                  )
                }
              />
              {driver.phone ? (
                <Button
                  title={`Call ${driver.phone}`}
                  variant="secondary"
                  onPress={() => openDialer(driver.phone as string)}
                />
              ) : null}
              <Button
                title="Make dispatcher"
                variant="secondary"
                loading={busy}
                onPress={() =>
                  Alert.alert(
                    `Make ${driver.full_name || 'this person'} a dispatcher?`,
                    'They will be able to see every job, every driver’s location, and change the join code.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Promote',
                        onPress: () =>
                          void call(() =>
                            supabase.rpc('set_member_role', { p_member: driver.id, p_role: 'boss' }),
                          ),
                      },
                    ],
                  )
                }
              />
              <Button
                title="Remove from team"
                variant="danger"
                loading={busy}
                onPress={() =>
                  Alert.alert(
                    `Remove ${driver.full_name || 'this driver'}?`,
                    'They lose access to every job immediately and stop sharing their location.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () =>
                          void call(
                            () => supabase.rpc('remove_member', { p_member: driver.id }),
                            'Generate a new join code so the old one can’t let them back in.',
                          ),
                      },
                    ],
                  )
                }
              />
            </Card>
          );
        })
      )}

      <SectionTitle>Dispatchers ({dispatchers.length})</SectionTitle>
      {dispatchers.map((boss) => (
        <Card key={boss.id}>
          <Text style={type.heading}>
            {boss.full_name || 'Unnamed'}
            {boss.id === profile?.id ? ' (you)' : ''}
          </Text>
          {boss.id !== profile?.id ? (
            <Button
              title="Change to driver"
              variant="secondary"
              loading={busy}
              onPress={() =>
                void call(() => supabase.rpc('set_member_role', { p_member: boss.id, p_role: 'driver' }))
              }
            />
          ) : (
            <Banner tone="info">
              You can’t change your own role. Another dispatcher has to do it.
            </Banner>
          )}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: { fontSize: 34, fontWeight: '800', letterSpacing: 8, textAlign: 'center', color: colors.text },
  muted: { ...type.body, color: colors.textMuted, marginBottom: spacing.sm },
});
