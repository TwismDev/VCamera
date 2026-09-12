import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Field, Heading, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';

type Mode = 'sign-in' | 'sign-up';

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError('Enter your email address and password.');
      return;
    }
    if (mode === 'sign-up' && fullName.trim().length < 2) {
      setError('Enter your name so your team knows who you are.');
      return;
    }
    if (mode === 'sign-up' && password.length < 8) {
      setError('Choose a password of at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'sign-in') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signInError) throw signInError;
        // The session listener in SessionProvider takes it from here.
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (signUpError) throw signUpError;

        if (!data.session) {
          setNotice('Account created. Confirm your email address, then sign in.');
          setMode('sign-in');
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.top}>
          <Heading sub="Deliveries, arrival times and live position in one place.">
            Delivery Tracker
          </Heading>
        </View>

        {error ? <Banner tone="error" message={error} /> : null}
        {notice ? <Banner tone="success" message={notice} /> : null}

        {mode === 'sign-up' ? (
          <Field
            label="Your name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Alex Morgan"
            autoCapitalize="words"
          />
        ) : null}

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@company.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder={mode === 'sign-up' ? 'At least 8 characters' : 'Your password'}
          secureTextEntry
          autoCapitalize="none"
        />

        <Button
          label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
          onPress={submit}
          loading={busy}
        />

        <Pressable
          onPress={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setError(null);
            setNotice(null);
          }}
          style={styles.switch}
        >
          <Text style={styles.switchText}>
            {mode === 'sign-in' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.xxl, paddingBottom: spacing.lg },
  switch: { paddingVertical: spacing.lg, alignItems: 'center' },
  switchText: { color: colors.textMuted, fontSize: 14 },
});
