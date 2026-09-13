import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { updateProfile } from '@/api/profiles';
import { Banner, Button, Card, Field, Heading, Row, Screen } from '@/components/ui';
import { size as queuedCount } from '@/lib/queue';
import { colors, spacing } from '@/lib/theme';
import { activeTrackedJobId, flushQueue, isTracking, stopTracking } from '@/lib/tracking';
import { useActiveSession, useSession } from '@/state/session';

export default function DriverProfile() {
  const { profile, org } = useActiveSession();
  const { refresh, signOut } = useSession();

  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [tracking, setTracking] = useState(false);
  const [trackedJob, setTrackedJob] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  const readTrackingState = React.useCallback(async () => {
    const snapshot = await readTrackingSnapshot();
    setTracking(snapshot.tracking);
    setTrackedJob(snapshot.jobId);
    setPending(snapshot.pending);
  }, []);

  useEffect(() => {
    let cancelled = false;

    readTrackingSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        setTracking(snapshot.tracking);
        setTrackedJob(snapshot.jobId);
        setPending(snapshot.pending);
      })
      .catch(() => {
        // The tracking summary is informational; a failure to read it should
        // not block the rest of this screen.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await updateProfile(profile.id, {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
      });
      await refresh();
      setNotice('Saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your details.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Heading sub={org.name}>Your details</Heading>

      {error ? <Banner tone="error" message={error} /> : null}
      {notice ? <Banner tone="success" message={notice} /> : null}

      <Field label="Name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Button label="Save" onPress={save} loading={busy} />

      <Card style={styles.spaced}>
        <Text style={styles.cardTitle}>Location sharing</Text>
        <Text style={styles.cardBody}>
          Your position is only shared while a delivery is underway, and only with your own
          dispatcher. It stops when you complete the job.
        </Text>

        <View style={styles.rows}>
          <Row label="Currently sharing" value={tracking ? 'Yes' : 'No'} />
          {trackedJob ? <Row label="For delivery" value={trackedJob.slice(0, 8)} /> : null}
          <Row label="Waiting to upload" value={`${pending}`} />
        </View>

        <Button
          label="Retry upload now"
          variant="ghost"
          onPress={async () => {
            await flushQueue();
            await readTrackingState();
          }}
          style={styles.spaced}
        />

        {tracking ? (
          <Button
            label="Stop sharing my location"
            variant="danger"
            onPress={async () => {
              await stopTracking();
              await readTrackingState();
            }}
            style={styles.spaced}
          />
        ) : null}
      </Card>

      <Button label="Sign out" variant="ghost" onPress={() => void signOut()} style={styles.spaced} />
    </Screen>
  );
}


async function readTrackingSnapshot(): Promise<{
  tracking: boolean;
  jobId: string | null;
  pending: number;
}> {
  const [tracking, jobId, pending] = await Promise.all([
    isTracking(),
    activeTrackedJobId(),
    queuedCount(),
  ]);
  return { tracking, jobId, pending };
}

const styles = StyleSheet.create({
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: spacing.xs },
  cardBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  rows: { marginTop: spacing.sm },
  spaced: { marginTop: spacing.md },
});
