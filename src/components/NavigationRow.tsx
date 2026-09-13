import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import type { LatLng } from '@/lib/geo';
import { NAVIGATION_APP_LABELS, availableNavigationApps, openNavigation } from '@/lib/navigation';
import { colors, spacing } from '@/lib/theme';

/**
 * Hands the address off to whichever navigation app the driver prefers.
 *
 * These apps cannot report their ETA back, so the estimate shown elsewhere in
 * the app is computed separately rather than read out of Waze.
 */
export function NavigationRow({
  address,
  coordinate,
}: {
  address: string;
  coordinate: LatLng | null;
}) {
  const apps = availableNavigationApps();

  return (
    <View>
      <Text style={styles.label}>Navigate</Text>
      <View style={styles.row}>
        {apps.map((app, index) => (
          <Button
            key={app}
            label={NAVIGATION_APP_LABELS[app]}
            variant={index === 0 ? 'primary' : 'ghost'}
            onPress={() => void openNavigation(app, { address, coordinate })}
            style={styles.button}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  button: { flex: 1 },
});
