import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Field, Screen } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import type { Role } from '@/lib/types';
import { colors, radius, spacing, type } from '@/theme';

export default function SignUp() {
  const { signUp, signIn } = useAuth();
  const router = useRouter();

  const [role, setRole] = useState<Role>('driver');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!fullName.trim()) return setError('Please enter your name.');
    if (password.length < 6) return setError('Passwords need at least 6 characters.');

    setBusy(true);
    setError(null);
    try {
      await signUp({ email, password, fullName, phone, role });
      // With email confirmation switched off (the default for this project),
      // sign-up already returns a session; signing in covers the other case.
      await signIn(email, password).catch(() => undefined);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account');
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
        <Text style={type.heading}>What do you do?</Text>
        <Text style={styles.hint}>
          Joining an existing team with a code always makes you a driver — a dispatcher can promote
          you afterwards.
        </Text>
        <View style={styles.roles}>
          <RoleOption
            label="Driver"
            body="Receive jobs, navigate, share your location."
            selected={role === 'driver'}
            onPress={() => setRole('driver')}
          />
          <RoleOption
            label="Dispatcher"
            body="Create jobs, assign drivers, watch the map. Pick this if you're setting up the team."
            selected={role === 'boss'}
            onPress={() => setRole('boss')}
          />
        </View>

        <Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="Sam Taylor" />
        <Field
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="Optional"
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          hint="At least 6 characters."
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Create account" onPress={submit} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function RoleOption({
  label,
  body,
  selected,
  onPress,
}: {
  label: string;
  body: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.role, selected && styles.roleSelected]}
    >
      <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>{label}</Text>
      <Text style={styles.roleBody}>{body}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  roles: { gap: spacing.sm },
  role: {
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 2,
  },
  roleSelected: { borderColor: colors.primary, backgroundColor: '#EFF6FF' },
  roleLabel: { ...type.heading },
  roleLabelSelected: { color: colors.primary },
  roleBody: { ...type.body, color: colors.textMuted },
  hint: { ...type.body, color: colors.textMuted },
  error: { color: colors.danger, fontWeight: '600' },
});
