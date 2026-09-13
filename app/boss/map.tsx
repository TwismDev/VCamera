import React, { useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { Card, Empty, Loading, Row, SectionTitle } from '@/components/ui';
import { config } from '@/lib/config';
import { money, relativeTime, STATUS_LABEL } from '@/lib/format';
import { isLatLng } from '@/lib/geo';
import { useDriverLocations } from '@/hooks/useDriverLocations';
import { useJobs } from '@/hooks/useJobs';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing, type } from '@/theme';

const FALLBACK_REGION: Region = {
  latitude: -37.8136,
  longitude: 144.9631,
  latitudeDelta: 0.4,
  longitudeDelta: 0.4,
};

/** Where every driver is right now, plus the drops they are heading to. */
export default function LiveMap() {
  const { profile } = useAuth();
  const { locations, loading } = useDriverLocations(profile?.org_id);
  const { jobs } = useJobs(profile?.org_id ? { orgId: profile.org_id } : null);
  const mapRef = useRef<MapView>(null);

  const activeJobs = useMemo(
    () => jobs.filter((job) => ['assigned', 'accepted', 'en_route'].includes(job.status)),
    [jobs],
  );

  const dropPins = useMemo(
    () => activeJobs.filter((job) => isLatLng(job.address_lat, job.address_lng)),
    [activeJobs],
  );

  const region = useMemo<Region>(() => {
    const points = [
      ...locations.map((location) => ({ lat: location.lat, lng: location.lng })),
      ...dropPins.map((job) => ({ lat: job.address_lat as number, lng: job.address_lng as number })),
    ];
    if (points.length === 0) return FALLBACK_REGION;

    const lats = points.map((point) => point.lat);
    const lngs = points.map((point) => point.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.6),
      longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.6),
    };
  }, [locations, dropPins]);

  if (loading) return <Loading label="Finding your drivers…" />;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        // Android needs a Google Maps key; iOS falls back to Apple Maps, which
        // needs none, so only opt into Google where a key actually exists.
        provider={
          Platform.OS === 'android' && config.googleMapsApiKey ? PROVIDER_GOOGLE : PROVIDER_DEFAULT
        }
        initialRegion={region}
        region={region}
        showsCompass
        showsTraffic
      >
        {locations.map((location) => (
          <Marker
            key={location.driver_id}
            coordinate={{ latitude: location.lat, longitude: location.lng }}
            title={location.driver?.full_name || 'Driver'}
            description={`Updated ${relativeTime(location.updated_at)}`}
            pinColor="#1D4ED8"
          />
        ))}

        {dropPins.map((job) => (
          <Marker
            key={job.id}
            coordinate={{ latitude: job.address_lat as number, longitude: job.address_lng as number }}
            title={job.address}
            description={`${job.product_count} products · ${money(job.cash_to_collect)} to collect`}
            pinColor="#B45309"
          />
        ))}
      </MapView>

      <View style={styles.panel}>
        <SectionTitle>Drivers ({locations.length})</SectionTitle>
        {locations.length === 0 ? (
          <Empty
            title="No live positions"
            body="Positions appear here once a driver starts a delivery."
          />
        ) : (
          locations.map((location) => {
            const job = activeJobs.find((candidate) => candidate.id === location.job_id);
            return (
              <Card key={location.driver_id}>
                <Text style={type.heading}>{location.driver?.full_name || 'Driver'}</Text>
                <Row label="Updated" value={relativeTime(location.updated_at)} />
                {job ? <Row label="On job" value={`${STATUS_LABEL[job.status]} · ${job.address}`} /> : null}
                {location.speed_mps != null && location.speed_mps > 0 ? (
                  <Row label="Speed" value={`${Math.round(location.speed_mps * 3.6)} km/h`} />
                ) : null}
                {location.battery_pct != null ? (
                  <Row label="Battery" value={`${location.battery_pct}%`} />
                ) : null}
              </Card>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  map: { height: '55%' },
  panel: { flex: 1, padding: spacing.lg, gap: spacing.md },
});
