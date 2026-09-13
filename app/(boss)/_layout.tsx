import { Stack } from 'expo-router';
import React from 'react';

import { colors } from '@/lib/theme';

export default function BossLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="new-job" options={{ title: 'New delivery', presentation: 'modal' }} />
      <Stack.Screen name="job/[id]" options={{ title: 'Delivery' }} />
    </Stack>
  );
}
