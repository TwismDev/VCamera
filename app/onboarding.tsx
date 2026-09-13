import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { createOrg, joinOrg } from '@/api/profiles';
import { Banner, Button, Card, Field, Heading, Screen } from '@/components/ui';
import { colors, spacing } from '@/lib/theme';
import { useSession } from '@/state/session';

type Choice = 'boss' | 'driver' | null;

/**
 * Decides which side of the app the account lands on. Creating a team makes you
 * its dispatcher; entering a team code joins as a driver. The server enforces
 * this, so the choice here cannot be used to grant yourself dispatcher access to
 * someone else's team.
 */
export default function Onboarding() {
  const { refresh, signOut } = useSession();
  const [choice, setChoice] = useState<Choice>(null);
  const [teamName, setTeamName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (choice === 'boss') {
        if (teamName.trim().length < 2) throw new Error('Give your team a name.');
        await createOrg(teamName.trim());
      } else {
        if (code.trim().length < 4) throw new Error('Enter the code your dispatcher gave you.');
        await joinOrg(code.trim());
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!choice) {
    return (
      <Screen scroll>
        <Heading sub="One more step before you can start.">Set up your team</Heading>

        <Card onPress={() => setChoice('boss')}>
          <Text style={styles.optionTitle}>I dispatch the work</Text>
          <Text style={styles.optionBody}>
            Create a team, raise deliveries, and watch your drivers on a live map.
          </Text>
        </Card>

        <Card onPress={() => setChoice('driver')}>
          <Text style={styles.optionTitle}>I drive</Text>
          <Text style={styles.optionBody}>
            Join with the code your dispatcher gave you, then take jobs and report your progress.
          </Text>
        </Card>

        <Pressable onPress={() => void signOut()} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Heading
          sub={
            choice === 'boss'
              ? 'You will get a code to share with your drivers.'
              : 'Ask your dispatcher for the six-character team code.'
          }
        >
          {choice === 'boss' ? 'Create your team' : 'Join your team'}
        </Heading>

        {error ? <Banner tone="error" message={error} /> : null}

        {choice === 'boss' ? (
          <Field
            label="Team name"
            value={teamName}
            onChangeText={setTeamName}
            placeholder="Morgan Distribution"
            autoCapitalize="words"
          />
        ) : (
          <Field
            label="Team code"
            value={code}
            onChangeText={(next) => setCode(next.toUpperCase())}
            placeholder="ABC234"
            autoCapitalize="characters"
          />
        )}

        <Button
          label={choice === 'boss' ? 'Create team' : 'Join team'}
          onPress={submit}
          loading={busy}
        />

        <View style={styles.backRow}>
          <Button label="Back" variant="ghost" onPress={() => setChoice(null)} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  optionTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.xs },
  optionBody: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  backRow: { marginTop: spacing.md },
  signOut: { paddingVertical: spacing.lg, alignItems: 'center' },
  signOutText: { color: colors.textMuted, fontSize: 14 },
});
