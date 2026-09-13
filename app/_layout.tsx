import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '@/components/ui';
import { colors } from '@/lib/theme';
// Imported for its side effect: the background location task must be defined
// at module load, because the OS can start it before any screen has mounted.
import '@/lib/tracking';
import { SessionProvider, useSession } from '@/state/session';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { initialising } = useSession();
  useAuthGate();

  if (initialising) return <Loading label="Signing you in" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}

/**
 * Keeps the visible screen in step with who is signed in. A driver can never
 * land on a dispatcher screen, and signing out from anywhere returns to the
 * login screen rather than leaving a stale stack behind.
 */
function useAuthGate() {
  const { initialising, session, profile, needsOnboarding } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initialising) return;

    const group = segments[0];
    const atSignIn = group === 'sign-in';
    const atOnboarding = group === 'onboarding';
    const atRoot = group === undefined || group === 'index';

    if (!session) {
      if (!atSignIn) router.replace('/sign-in');
      return;
    }

    if (needsOnboarding) {
      if (!atOnboarding) router.replace('/onboarding');
      return;
    }

    const home = profile?.role === 'boss' ? '/(boss)/(tabs)/jobs' : '/(driver)/(tabs)/jobs';
    const inWrongRole =
      (profile?.role === 'boss' && group === '(driver)') ||
      (profile?.role === 'driver' && group === '(boss)');

    if (atSignIn || atOnboarding || atRoot || inWrongRole) {
      router.replace(home);
    }
  }, [initialising, session, profile, needsOnboarding, segments, router]);
}
