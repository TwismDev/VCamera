import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { regionForPoints, type LatLng } from '@/lib/geo';
import { colors, radius } from '@/lib/theme';
import type { LatLngRow } from '@/lib/types';

/**
 * One delivery drawn on a map: where it is going, where the driver is, and the
 * ground they have covered.
 *
 * Android uses the Google provider explicitly; iOS falls back to Apple Maps so
 * the app still renders without a Google key on that platform.
 */
export function JobMap({
  destination,
  driver,
  trail = [],
  height = 220,
}: {
  destination: LatLng | null;
  driver: LatLng | null;
  trail?: LatLngRow[];
  height?: number;
}) {
  const region: Region | undefined = useMemo(() => {
    const points: LatLng[] = [];
    if (destination) points.push(destination);
    if (driver) points.push(driver);
    const computed = regionForPoints(points);
    return computed ?? undefined;
  }, [destination, driver]);

  if (!region) return null;

  const path = trail
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .map((point) => ({ latitude: point.lat, longitude: point.lng }));

  return (
    <View style={[styles.wrapper, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        region={region}
        showsUserLocation={false}
        toolbarEnabled={false}
      >
        {destination ? (
          <Marker
            coordinate={{ latitude: destination.lat, longitude: destination.lng }}
            title="Delivery address"
            pinColor={colors.danger}
          />
        ) : null}

        {driver ? (
          <Marker
            coordinate={{ latitude: driver.lat, longitude: driver.lng }}
            title="Driver"
            pinColor={colors.primary}
          />
        ) : null}

        {path.length > 1 ? (
          <Polyline coordinates={path} strokeColor={colors.info} strokeWidth={4} />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
});
