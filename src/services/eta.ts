import * as Location from 'expo-location';

import { config } from '@/lib/config';
import { haversineKm, isLatLng, type LatLng } from '@/lib/geo';

export type EtaProvider =
  | 'google-routes'
  | 'google-directions'
  | 'mapbox'
  | 'osrm'
  | 'straight-line';

export type EtaEstimate = {
  minutes: number;
  distanceKm: number;
  provider: EtaProvider;
  /** Minutes of the estimate attributable to traffic, where the provider says. */
  trafficDelayMinutes: number | null;
};

/** Whether the number accounts for traffic conditions right now. */
export const PROVIDER_USES_LIVE_TRAFFIC: Record<EtaProvider, boolean> = {
  'google-routes': true,
  'google-directions': true,
  mapbox: true,
  osrm: false,
  'straight-line': false,
};

export const PROVIDER_LABEL: Record<EtaProvider, string> = {
  'google-routes': 'Google, live traffic',
  'google-directions': 'Google, live traffic',
  mapbox: 'Mapbox, live traffic',
  osrm: 'Road routing, no traffic',
  'straight-line': 'Rough estimate — check it in Waze',
};

/** Very rough last resort: average urban delivery speed, in km/h. */
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
 * Drive time from `from` to `to`, preferring whichever configured provider
 * models live traffic best.
 *
 * The ladder matters: Google's Routes API is the accurate, current one;
 * Directions is its legacy predecessor, kept for keys that predate the change;
 * Mapbox is a traffic-aware alternative on a generous free tier; OSRM routes on
 * real roads but knows nothing about traffic; and the straight-line guess only
 * exists so the driver always gets a number to edit rather than an error.
 */
export async function estimateEta(from: LatLng, to: LatLng): Promise<EtaEstimate> {
  if (config.googleMapsApiKey) {
    const routes = await googleRoutesEta(from, to);
    if (routes) return routes;

    const directions = await googleDirectionsEta(from, to);
    if (directions) return directions;
  }

  if (config.mapboxToken) {
    const mapbox = await mapboxEta(from, to);
    if (mapbox) return mapbox;
  }

  const osrm = await osrmEta(from, to);
  if (osrm) return osrm;

  const distanceKm = haversineKm(from, to);
  return {
    // Road distance beats straight-line by roughly a third in most towns.
    minutes: Math.max(1, Math.round(((distanceKm * 1.35) / FALLBACK_SPEED_KMH) * 60)),
    distanceKm,
    provider: 'straight-line',
    trafficDelayMinutes: null,
  };
}

const minutesFrom = (seconds: number) => Math.max(1, Math.round(seconds / 60));

/** "1234s" — the duration format the Routes API returns. */
function parseProtoDuration(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const seconds = Number.parseFloat(value.replace(/s$/, ''));
  return Number.isFinite(seconds) ? seconds : null;
}

/**
 * Routes API v2. `TRAFFIC_AWARE_OPTIMAL` is the most accurate setting Google
 * offers — it models current conditions along the whole route rather than
 * applying a blanket adjustment. `staticDuration` comes back alongside, which
 * gives the traffic delay for free.
 */
async function googleRoutesEta(from: LatLng, to: LatLng): Promise<EtaEstimate | null> {
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': config.googleMapsApiKey,
        // Required — the request is rejected without an explicit field mask.
        'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: 'DRIVE',
        // Departure time is omitted deliberately: with a traffic-aware
        // preference it defaults to now, and sending our own clock invites
        // "departure time in the past" errors from a skewed phone.
        routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
        computeAlternativeRoutes: false,
        units: 'METRIC',
      }),
    });

    if (!res.ok) return null;

    const json = await res.json();
    const route = json?.routes?.[0];
    const seconds = parseProtoDuration(route?.duration);
    if (seconds == null) return null;

    const staticSeconds = parseProtoDuration(route?.staticDuration);
    const delay =
      staticSeconds != null ? Math.max(0, Math.round((seconds - staticSeconds) / 60)) : null;

    return {
      minutes: minutesFrom(seconds),
      distanceKm: (route?.distanceMeters ?? 0) / 1000,
      provider: 'google-routes',
      trafficDelayMinutes: delay,
    };
  } catch {
    return null;
  }
}

/** The legacy Directions API, for keys issued before Routes replaced it. */
async function googleDirectionsEta(from: LatLng, to: LatLng): Promise<EtaEstimate | null> {
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

    const withTraffic = leg.duration_in_traffic?.value;
    const plain = leg.duration?.value;
    const seconds = withTraffic ?? plain;
    if (typeof seconds !== 'number') return null;

    return {
      minutes: minutesFrom(seconds),
      distanceKm: (leg.distance?.value ?? 0) / 1000,
      provider: 'google-directions',
      trafficDelayMinutes:
        typeof withTraffic === 'number' && typeof plain === 'number'
          ? Math.max(0, Math.round((withTraffic - plain) / 60))
          : null,
    };
  } catch {
    return null;
  }
}

/** Mapbox's `driving-traffic` profile, which folds in current conditions. */
async function mapboxEta(from: LatLng, to: LatLng): Promise<EtaEstimate | null> {
  try {
    const url =
      'https://api.mapbox.com/directions/v5/mapbox/driving-traffic/' +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=false&alternatives=false&access_token=${config.mapboxToken}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const json = await res.json();
    const route = json?.routes?.[0];
    if (!route || typeof route.duration !== 'number') return null;

    const typical = route.duration_typical;

    return {
      minutes: minutesFrom(route.duration),
      distanceKm: (route.distance ?? 0) / 1000,
      provider: 'mapbox',
      trafficDelayMinutes:
        typeof typical === 'number'
          ? Math.max(0, Math.round((route.duration - typical) / 60))
          : null,
    };
  } catch {
    return null;
  }
}

/** Free, keyless, real roads — but no idea what the traffic is doing. */
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
      minutes: minutesFrom(route.duration),
      distanceKm: (route.distance ?? 0) / 1000,
      provider: 'osrm',
      trafficDelayMinutes: null,
    };
  } catch {
    return null;
  }
}
