import * as Location from 'expo-location';

import { config } from '@/lib/config';
import { haversineKm, isLatLng, type LatLng } from '@/lib/geo';

export type EtaEstimate = {
  minutes: number;
  distanceKm: number;
  provider: 'google' | 'osrm' | 'straight-line';
};

/** Very rough fallback: average urban delivery speed, in km/h. */
const FALLBACK_SPEED_KMH = 32;

/**
 * Turns a street address into coordinates using the OS geocoder (no API key),
 * falling back to OpenStreetMap's Nominatim when the platform geocoder is
 * unavailable or comes back empty.
 */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const query = address.trim();
  if (!query) return null;

  try {
    const results = await Location.geocodeAsync(query);
    const hit = results?.[0];
    if (hit && isLatLng(hit.latitude, hit.longitude)) {
      return { lat: hit.latitude, lng: hit.longitude };
    }
  } catch {
    // Platform geocoder unavailable (common on emulators without Play Services).
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'DeliveryTracker/1.0' } });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    const hit = json?.[0];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    return isLatLng(lat, lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

/**
 * Drive-time estimate from `from` to `to`.
 *
 * Uses the Google Directions API when a key is configured (it accounts for live
 * traffic), otherwise the public OSRM server, and as a last resort a
 * straight-line guess so the driver always gets a number to edit rather than an
 * error.
 */
export async function estimateEta(from: LatLng, to: LatLng): Promise<EtaEstimate> {
  if (config.googleMapsApiKey) {
    const google = await googleEta(from, to);
    if (google) return google;
  }

  const osrm = await osrmEta(from, to);
  if (osrm) return osrm;

  const distanceKm = haversineKm(from, to);
  return {
    // Road distance beats straight-line by roughly a third in most towns.
    minutes: Math.max(1, Math.round(((distanceKm * 1.35) / FALLBACK_SPEED_KMH) * 60)),
    distanceKm,
    provider: 'straight-line',
  };
}

async function googleEta(from: LatLng, to: LatLng): Promise<EtaEstimate | null> {
  try {
    const url =
      'https://maps.googleapis.com/maps/api/directions/json' +
      `?origin=${from.lat},${from.lng}` +
      `&destination=${to.lat},${to.lng}` +
      '&mode=driving&departure_time=now' +
      `&key=${config.googleMapsApiKey}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const json = await res.json();
    const leg = json?.routes?.[0]?.legs?.[0];
    if (!leg) return null;

    const seconds = leg.duration_in_traffic?.value ?? leg.duration?.value;
    if (typeof seconds !== 'number') return null;

    return {
      minutes: Math.max(1, Math.round(seconds / 60)),
      distanceKm: (leg.distance?.value ?? 0) / 1000,
      provider: 'google',
    };
  } catch {
    return null;
  }
}

async function osrmEta(from: LatLng, to: LatLng): Promise<EtaEstimate | null> {
  try {
    const url =
      'https://router.project-osrm.org/route/v1/driving/' +
      `${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&alternatives=false`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const json = await res.json();
    const route = json?.routes?.[0];
    if (!route || typeof route.duration !== 'number') return null;

    return {
      minutes: Math.max(1, Math.round(route.duration / 60)),
      distanceKm: (route.distance ?? 0) / 1000,
      provider: 'osrm',
    };
  } catch {
    return null;
  }
}
