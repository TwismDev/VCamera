import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Banner, Button, Card, Field, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing, type } from '@/theme';

/**
 * Everyone belongs to exactly one team. A dispatcher creates it and gets a join
 * code; drivers enter that code once and are wired to the same job board.
 *
 * Joining by code always lands you as a driver, whatever role you picked at
 * sign-up — the code is an invitation onto the team, not a handover of it. A
 * dispatcher can promote someone afterwards from the Team screen.
 */
export default function Onboarding() {
  const { profile, refresh, signOut } = useAuth();
  const router = useRouter();

  const [teamName, setTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const wantsToDispatch = profile?.role === 'boss';

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await action();
    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return;
    }
    await refresh();
    setBusy(false);
    router.replace('/');
  }

  return (
    <Screen>
      {wantsToDispatch ? (
        <Card>
          <Text style={type.heading}>Create your team</Text>
          <Text style={styles.body}>
            You’ll get a six-character code to hand to your drivers.
          </Text>
          <Field
            label="Business name"
            value={teamName}
            onChangeText={setTeamName}
            placeholder="Acme Deliveries"
          />
          <Button
            title="Create team"
            loading={busy}
            disabled={!teamName.trim()}
            onPress={() => run(() => supabase.rpc('create_organization', { p_name: teamName }))}
          />
        </Card>
      ) : null}

      <Card>
        <Text style={type.heading}>{wantsToDispatch ? 'Or join an existing team' : 'Join your team'}</Text>
        <Text style={styles.body}>Ask your dispatcher for the team code.</Text>
        <Field
          label="Team code"
          value={joinCode}
          onChangeText={(text) => setJoinCode(text.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          placeholder="ABC123"
          style={styles.code}
        />
        {wantsToDispatch ? (
          <Banner tone="info">
            Joining with a code puts you on the team as a driver. Whoever runs the team can promote
            you afterwards.
          </Banner>
        ) : null}
        <Button
          title="Join team"
          loading={busy}
          disabled={joinCode.trim().length < 6}
          onPress={() => run(() => supabase.rpc('join_organization', { p_code: joinCode }))}
        />
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { ...type.body, color: colors.textMuted, marginBottom: spacing.sm },
  code: { fontSize: 26, letterSpacing: 6, fontWeight: '700', textAlign: 'center' },
  error: { color: colors.danger, fontWeight: '600' },
});
