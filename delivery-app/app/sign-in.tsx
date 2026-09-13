import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Button, Field, Screen } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing, type } from '@/theme';

export default function SignIn() {
  const { signIn } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <Screen>
        <Text style={type.title}>Delivery Tracker</Text>
        <Text style={styles.subtitle}>Sign in to see today’s runs.</Text>

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          placeholder="••••••••"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Sign in" onPress={submit} loading={busy} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>No account yet?</Text>
          <Link href="/sign-up" style={styles.link}>
            Create one
          </Link>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  subtitle: { ...type.body, color: colors.textMuted, marginBottom: spacing.md },
  error: { color: colors.danger, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.md },
  footerText: { ...type.body, color: colors.textMuted },
  link: { ...type.body, color: colors.primary, fontWeight: '700' },
});
