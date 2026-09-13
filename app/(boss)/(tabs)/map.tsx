import { useRouter } from 'expo-router';
import React, { useMemo, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { Banner, EmptyState, Loading, Pill } from '@/components/ui';
import { useDriverStatuses } from '@/hooks/useDriverStatuses';
import { describeEta, isPositionStale } from '@/lib/eta';
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS, formatRelative } from '@/lib/format';
import { regionForPoints, type LatLng } from '@/lib/geo';
import { colors, radius, spacing } from '@/lib/theme';
import { useActiveSession } from '@/state/session';

export default function FleetMap() {
  const { org } = useActiveSession();
  const router = useRouter();
  const { drivers, loading, error } = useDriverStatuses(org.id);
  const mapRef = useRef<MapView | null>(null);

  const located = useMemo(
    () => drivers.filter((driver) => driver.lat !== null && driver.lng !== null),
    [drivers],
  );

  const region = useMemo(() => {
    const points: LatLng[] = located.map((driver) => ({ lat: driver.lat!, lng: driver.lng! }));
    return regionForPoints(points, 2) ?? undefined;
  }, [located]);

  if (loading) return <Loading label="Finding your drivers" />;

  return (
    <View style={styles.container}>
      {error ? <Banner tone="error" message={error} /> : null}

      {region ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={region}
          showsUserLocation={false}
          toolbarEnabled={false}
        >
          {located.map((driver) => (
            <Marker
              key={driver.driver_id}
              coordinate={{ latitude: driver.lat!, longitude: driver.lng! }}
              title={driver.full_name || 'Driver'}
              description={
                driver.job_address
                  ? `${driver.job_reference}: ${driver.job_address}`
                  : 'No delivery in progress'
              }
              pinColor={
                isPositionStale(driver.position_recorded_at) ? colors.textMuted : colors.primary
              }
              onCalloutPress={() => {
                if (driver.job_id) router.push(`/(boss)/job/${driver.job_id}`);
              }}
            />
          ))}
        </MapView>
      ) : (
        <View style={styles.map}>
          <EmptyState
            title="No positions yet"
            body="Drivers appear here once they start a delivery. Tracking only runs while a job is underway."
          />
        </View>
      )}

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {drivers.length === 0 ? (
          <EmptyState title="No drivers yet" body="Share your team code from the Team tab." />
        ) : (
          drivers.map((driver) => {
            const stale = isPositionStale(driver.position_recorded_at);
            return (
              <Pressable
                key={driver.driver_id}
                style={styles.driverRow}
                onPress={() => {
                  if (driver.job_id) {
                    router.push(`/(boss)/job/${driver.job_id}`);
                  } else if (driver.lat !== null && driver.lng !== null) {
                    mapRef.current?.animateToRegion(
                      {
                        latitude: driver.lat,
                        longitude: driver.lng,
                        latitudeDelta: 0.02,
                        longitudeDelta: 0.02,
                      },
                      400,
                    );
                  }
                }}
              >
                <View style={styles.driverMain}>
                  <Text style={styles.driverName}>{driver.full_name || 'Unnamed driver'}</Text>
                  <Text style={styles.driverMeta}>
                    {driver.job_address ?? 'No delivery in progress'}
                  </Text>
                  <Text style={[styles.driverMeta, stale && styles.stale]}>
                    {driver.position_recorded_at
                      ? `Last seen ${formatRelative(driver.position_recorded_at)}`
                      : 'Never reported a position'}
                    {driver.battery_pct !== null ? `  ·  battery ${driver.battery_pct}%` : ''}
                  </Text>
                </View>

                <View style={styles.driverSide}>
                  {driver.job_status ? (
                    <Pill
                      label={JOB_STATUS_LABELS[driver.job_status]}
                      color={JOB_STATUS_COLORS[driver.job_status]}
                    />
                  ) : null}
                  {driver.job_eta_at ? (
                    <Text style={styles.eta}>{describeEta(driver.job_eta_at)}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  map: { flex: 1, minHeight: 240 },
  list: {
    maxHeight: '45%',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  driverRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  driverMain: { flex: 1, gap: 2 },
  driverName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  driverMeta: { color: colors.textMuted, fontSize: 13 },
  stale: { color: colors.warning },
  driverSide: { alignItems: 'flex-end', gap: spacing.xs },
  eta: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
