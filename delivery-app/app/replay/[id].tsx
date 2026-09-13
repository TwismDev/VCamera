import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { Button, Empty, Loading, Row, Screen, SectionTitle } from '@/components/ui';
import { useJob } from '@/hooks/useJobs';
import { useJobPings } from '@/hooks/useJobPings';
import { config } from '@/lib/config';
import { clockTime, durationLabel } from '@/lib/format';
import { isLatLng, kmLabel, pathDistanceKm } from '@/lib/geo';
import { colors, spacing, type } from '@/theme';

const FALLBACK_REGION: Region = {
  latitude: -37.8136,
  longitude: 144.9631,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

/**
 * Replays the GPS trail that was recorded while a delivery was underway.
 * The live map is "where is everyone now"; this is "where did this run go".
 */
export default function RouteReplay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading: jobLoading } = useJob(id);
  const { pings, loading: pingLoading } = useJobPings(id);
  const mapRef = useRef<MapView>(null);
  const [playIndex, setPlayIndex] = useState<number | null>(null);

  const coordinates = useMemo(
    () => pings.map((ping) => ({ latitude: ping.lat, longitude: ping.lng })),
    [pings],
  );

  const distanceKm = useMemo(
    () => pathDistanceKm(pings.map((ping) => ({ lat: ping.lat, lng: ping.lng }))),
    [pings],
  );

  const durationMs = useMemo(() => {
    if (pings.length < 2) return 0;
    return (
      new Date(pings[pings.length - 1].recorded_at).getTime() -
      new Date(pings[0].recorded_at).getTime()
    );
  }, [pings]);

  const drop =
    job && isLatLng(job.address_lat, job.address_lng)
      ? { latitude: job.address_lat as number, longitude: job.address_lng as number }
      : null;

  const region = useMemo<Region>(() => {
    const points = [
      ...coordinates,
      ...(drop ? [drop] : []),
    ];
    if (points.length === 0) return FALLBACK_REGION;

    const lats = points.map((point) => point.latitude);
    const lngs = points.map((point) => point.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.6 || 0.02),
      longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.6 || 0.02),
    };
  }, [coordinates, drop]);

  useEffect(() => {
    if (coordinates.length === 0) return;
    mapRef.current?.fitToCoordinates(drop ? [...coordinates, drop] : coordinates, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: false,
    });
  }, [coordinates, drop]);

  // Walk the trail in about ten seconds so a half-hour run is watchable.
  useEffect(() => {
    if (playIndex == null) return;
    if (playIndex >= pings.length - 1) {
      setPlayIndex(null);
      return;
    }
    const stepMs = Math.max(40, Math.min(180, 10_000 / Math.max(pings.length, 1)));
    const timer = setTimeout(() => setPlayIndex(playIndex + 1), stepMs);
    return () => clearTimeout(timer);
  }, [playIndex, pings.length]);

  if (jobLoading || pingLoading) return <Loading label="Loading the run…" />;
  if (!job) {
    return (
      <Screen>
        <Text style={type.body}>This job no longer exists.</Text>
      </Screen>
    );
  }

  const playing = playIndex != null;
  const cursor = (playing ? pings[playIndex] : pings[pings.length - 1]) ?? null;
  const live = playing && cursor ? { latitude: cursor.lat, longitude: cursor.lng } : null;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={
          Platform.OS === 'android' && config.googleMapsApiKey ? PROVIDER_GOOGLE : PROVIDER_DEFAULT
        }
        initialRegion={region}
        showsCompass
      >
        {coordinates.length >= 2 ? (
          <Polyline coordinates={coordinates} strokeColor={colors.primary} strokeWidth={4} />
        ) : null}

        {coordinates[0] ? (
          <Marker coordinate={coordinates[0]} title="Started here" pinColor="#15803D" />
        ) : null}

        {drop ? (
          <Marker coordinate={drop} title={job.address} description="Drop" pinColor="#B45309" />
        ) : null}

        {live ? (
          <Marker
            coordinate={live}
            title={job.driver?.full_name || 'Driver'}
            description={clockTime(cursor?.recorded_at)}
            pinColor="#1D4ED8"
          />
        ) : coordinates.length > 1 ? (
          <Marker
            coordinate={coordinates[coordinates.length - 1]}
            title="Last fix"
            pinColor="#1D4ED8"
          />
        ) : null}
      </MapView>

      <View style={styles.panel}>
        <SectionTitle>{job.address}</SectionTitle>
        {pings.length === 0 ? (
          <Empty
            title="No GPS trail"
            body="Nothing was recorded for this job. Tracking only runs between Start delivery and Complete delivery."
          />
        ) : (
          <>
            <Row label="Fixes" value={String(pings.length)} />
            <Row label="Distance" value={kmLabel(distanceKm)} emphasis />
            <Row label="On the road" value={durationLabel(durationMs)} />
            <Row
              label={playing ? 'At' : 'Last fix'}
              value={clockTime(cursor?.recorded_at)}
            />
            {cursor?.speed_mps != null && cursor.speed_mps > 0 ? (
              <Row label="Speed" value={`${Math.round(cursor.speed_mps * 3.6)} km/h`} />
            ) : null}

            {pings.length >= 2 ? (
              <Button
                title={playing ? 'Stop' : 'Play this run'}
                variant={playing ? 'secondary' : 'primary'}
                onPress={() => setPlayIndex(playing ? null : 0)}
              />
            ) : null}
          </>
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
