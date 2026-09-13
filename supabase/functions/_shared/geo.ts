import { fetchWithTimeout } from './http.ts';

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface GeocodeResult extends Coordinate {
  formattedAddress: string;
  provider: 'google' | 'nominatim';
}

export interface RouteResult {
  /** Free-flow travel time. */
  durationSeconds: number;
  /** Travel time including live traffic, when the provider reports it. */
  durationInTrafficSeconds: number | null;
  distanceMeters: number;
  provider: 'google' | 'osrm';
  /** True when the number accounts for current traffic conditions. */
  trafficAware: boolean;
}

const GOOGLE_KEY = Deno.env.get('GOOGLE_MAPS_SERVER_KEY') ?? '';

/**
 * Nominatim's acceptable-use policy requires a real identifying User-Agent.
 * Override it with NOMINATIM_USER_AGENT for your own deployment.
 */
const NOMINATIM_UA =
  Deno.env.get('NOMINATIM_USER_AGENT') ??
  'delivery-tracker/1.0 (self-hosted; contact: set NOMINATIM_USER_AGENT)';

export function hasGoogleKey(): boolean {
  return GOOGLE_KEY.length > 0;
}

export async function geocode(address: string, region?: string): Promise<GeocodeResult> {
  return hasGoogleKey() ? geocodeGoogle(address, region) : geocodeNominatim(address, region);
}

async function geocodeGoogle(address: string, region?: string): Promise<GeocodeResult> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', GOOGLE_KEY);
  if (region) url.searchParams.set('region', region);

  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) throw new Error(`Geocoding service returned ${res.status}`);

  const body = await res.json();
  if (body.status !== 'OK' || !body.results?.length) {
    throw new Error(describeGoogleStatus(body.status, 'We could not find that address'));
  }

  const top = body.results[0];
  return {
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    formattedAddress: top.formatted_address ?? address,
    provider: 'google',
  };
}

async function geocodeNominatim(address: string, region?: string): Promise<GeocodeResult> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', address);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  if (region) url.searchParams.set('countrycodes', region.toLowerCase());

  const res = await fetchWithTimeout(url.toString(), {
    headers: { 'User-Agent': NOMINATIM_UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Geocoding service returned ${res.status}`);

  const body = await res.json();
  if (!Array.isArray(body) || body.length === 0) {
    throw new Error('We could not find that address');
  }

  const top = body[0];
  return {
    lat: Number(top.lat),
    lng: Number(top.lon),
    formattedAddress: top.display_name ?? address,
    provider: 'nominatim',
  };
}

export async function route(origin: Coordinate, destination: Coordinate): Promise<RouteResult> {
  return hasGoogleKey() ? routeGoogle(origin, destination) : routeOsrm(origin, destination);
}

async function routeGoogle(origin: Coordinate, destination: Coordinate): Promise<RouteResult> {
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
  url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('departure_time', 'now');
  url.searchParams.set('traffic_model', 'best_guess');
  url.searchParams.set('key', GOOGLE_KEY);

  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) throw new Error(`Routing service returned ${res.status}`);

  const body = await res.json();
  if (body.status !== 'OK' || !body.routes?.length) {
    throw new Error(describeGoogleStatus(body.status, 'We could not work out a route'));
  }

  const leg = body.routes[0].legs[0];
  const inTraffic = leg.duration_in_traffic?.value ?? null;
  return {
    durationSeconds: leg.duration.value,
    durationInTrafficSeconds: inTraffic,
    distanceMeters: leg.distance.value,
    provider: 'google',
    trafficAware: inTraffic !== null,
  };
}

async function routeOsrm(origin: Coordinate, destination: Coordinate): Promise<RouteResult> {
  const base = Deno.env.get('OSRM_BASE_URL') ?? 'https://router.project-osrm.org';
  const path = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `${base}/route/v1/driving/${path}?overview=false&alternatives=false`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Routing service returned ${res.status}`);

  const body = await res.json();
  if (body.code !== 'Ok' || !body.routes?.length) {
    throw new Error('We could not work out a route to that address');
  }

  const top = body.routes[0];
  return {
    durationSeconds: Math.round(top.duration),
    durationInTrafficSeconds: null,
    distanceMeters: Math.round(top.distance),
    provider: 'osrm',
    trafficAware: false,
  };
}

function describeGoogleStatus(status: string, fallback: string): string {
  switch (status) {
    case 'ZERO_RESULTS':
      return fallback;
    case 'OVER_QUERY_LIMIT':
      return 'The mapping account has hit its quota';
    case 'REQUEST_DENIED':
      return 'The mapping account rejected the request. Check the server API key.';
    default:
      return fallback;
  }
}
