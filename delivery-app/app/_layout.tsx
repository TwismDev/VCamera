import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/providers/AuthProvider';
// Imported for its side effect: registers the background location task before
// Android can wake the app headless into it.
import '@/services/tracking';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
          <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
          <Stack.Screen name="onboarding" options={{ title: 'Your team' }} />
          <Stack.Screen name="boss/index" options={{ title: 'Job board' }} />
          <Stack.Screen name="boss/new-job" options={{ title: 'New delivery' }} />
          <Stack.Screen name="boss/job/[id]" options={{ title: 'Delivery' }} />
          <Stack.Screen name="boss/map" options={{ title: 'Live map' }} />
          <Stack.Screen name="boss/eod" options={{ title: 'End of day' }} />
          <Stack.Screen name="boss/team" options={{ title: 'Team' }} />
          <Stack.Screen name="driver/index" options={{ title: 'My deliveries' }} />
          <Stack.Screen name="driver/job/[id]" options={{ title: 'Delivery' }} />
          <Stack.Screen name="driver/profile" options={{ title: 'Profile' }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
