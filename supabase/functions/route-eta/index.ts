// Works out how long the driver still has to go.
//
// Navigation apps such as Waze cannot hand an ETA back to another app, so the
// estimate is computed here from the driver's live position and the delivery
// address. With a Google server key the number accounts for current traffic;
// without one it falls back to the free OSRM router, which does not.
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { geocode, route, type Coordinate } from '../_shared/geo.ts';

interface RequestBody {
  origin?: Coordinate;
  destination?: Coordinate;
  destination_address?: string;
}

function isCoordinate(value: unknown): value is Coordinate {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.lat === 'number' &&
    typeof candidate.lng === 'number' &&
    Number.isFinite(candidate.lat) &&
    Number.isFinite(candidate.lng) &&
    Math.abs(candidate.lat) <= 90 &&
    Math.abs(candidate.lng) <= 180
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Use POST', 405);

  let payload: RequestBody;
  try {
    payload = await req.json();
  } catch {
    return fail('Expected a JSON body');
  }

  if (!isCoordinate(payload.origin)) {
    return fail('A valid current position is required');
  }

  let destination = payload.destination;
  if (!isCoordinate(destination)) {
    const address = (payload.destination_address ?? '').trim();
    if (address.length < 3) {
      return fail('A destination coordinate or address is required');
    }
    try {
      const located = await geocode(address);
      destination = { lat: located.lat, lng: located.lng };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Address lookup failed';
      return fail(message, 422);
    }
  }

  try {
    const result = await route(payload.origin, destination);
    const seconds = result.durationInTrafficSeconds ?? result.durationSeconds;
    return json({
      duration_seconds: result.durationSeconds,
      duration_in_traffic_seconds: result.durationInTrafficSeconds,
      distance_meters: result.distanceMeters,
      eta_minutes: Math.max(1, Math.round(seconds / 60)),
      eta_at: new Date(Date.now() + seconds * 1000).toISOString(),
      provider: result.provider,
      traffic_aware: result.trafficAware,
      destination,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not work out a route';
    return fail(message, 422);
  }
});
