import * as Location from 'expo-location';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';

import { useRouter } from 'expo-router';

import { Banner, Button, Card, Field, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { pushUnavailableReason } from '@/services/push';
import {
  isTracking,
  requestTrackingPermissions,
  stopTracking,
  trackingPlatformNote,
} from '@/services/tracking';
import { colors, spacing, type } from '@/theme';

export default function DriverProfile() {
  const { profile, org, push, refresh, signOut } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [foreground, setForeground] = useState<string>('unknown');
  const [background, setBackground] = useState<string>('unknown');

  const readPermissions = useCallback(async () => {
    setTracking(await isTracking());
    setForeground((await Location.getForegroundPermissionsAsync()).status);
    setBackground((await Location.getBackgroundPermissionsAsync()).status);
  }, []);

  useEffect(() => {
    void readPermissions();
  }, [readPermissions]);

  async function save() {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), phone: phone.trim() || null })
      .eq('id', profile.id);
    setBusy(false);

    if (error) Alert.alert('Could not save', error.message);
    else {
      await refresh();
      Alert.alert('Saved', 'Your details are up to date.');
    }
  }

  return (
    <Screen>
      <Card>
        <SectionTitle>Your details</SectionTitle>
        <Field label="Full name" value={fullName} onChangeText={setFullName} />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Button title="Save" loading={busy} onPress={() => void save()} />
      </Card>

      <Card>
        <SectionTitle>Team</SectionTitle>
        <Row label="Working for" value={org?.name ?? '—'} />
        <Button
          title="Leave this team"
          variant="secondary"
          onPress={() =>
            Alert.alert(
              `Leave ${org?.name ?? 'this team'}?`,
              'You will stop sharing your location and lose access to every job. You need a join code to come back.',
              [
                { text: 'Stay', style: 'cancel' },
                {
                  text: 'Leave',
                  style: 'destructive',
                  onPress: async () => {
                    await stopTracking().catch(() => undefined);
                    const { error } = await supabase.rpc('leave_organization');
                    if (error) {
                      Alert.alert('Could not leave', error.message);
                      return;
                    }
                    await refresh();
                    router.replace('/');
                  },
                },
              ],
            )
          }
        />
      </Card>

      <Card>
        <SectionTitle>Job alerts</SectionTitle>
        <Row
          label="Notifications"
          value={
            <Pill
              text={push?.ok ? 'On' : push ? 'Off' : 'Checking…'}
              tone={push?.ok ? 'success' : push ? 'warning' : 'neutral'}
            />
          }
        />
        {push && !push.ok ? (
          <Banner tone="warning">{pushUnavailableReason[push.reason]}</Banner>
        ) : (
          <Text style={styles.muted}>
            You’ll be alerted when a job is sent to you, even with the app closed.
          </Text>
        )}
      </Card>

      <Card>
        <SectionTitle>Location sharing</SectionTitle>
        <Row
          label="Currently sharing"
          value={<Pill text={tracking ? 'On' : 'Off'} tone={tracking ? 'success' : 'neutral'} />}
        />
        <Row
          label="While using the app"
          value={<Pill text={foreground} tone={foreground === 'granted' ? 'success' : 'warning'} />}
        />
        <Row
          label="In the background"
          value={<Pill text={background} tone={background === 'granted' ? 'success' : 'warning'} />}
        />

        {background !== 'granted' ? <Banner tone="warning">{trackingPlatformNote}</Banner> : null}

        <Text style={styles.muted}>
          Sharing starts when you tap “Start delivery” and stops the moment you complete the job or
          sign out. It is never on between jobs.
        </Text>

        <Button
          title="Grant location access"
          variant="secondary"
          onPress={async () => {
            await requestTrackingPermissions();
            await readPermissions();
          }}
        />
        {tracking ? (
          <Button
            title="Stop sharing now"
            variant="danger"
            onPress={async () => {
              await stopTracking();
              await readPermissions();
            }}
          />
        ) : null}
      </Card>

      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { ...type.body, color: colors.textMuted, marginTop: spacing.sm },
});
