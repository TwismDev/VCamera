import { supabase } from '@/lib/supabase';
import type { GeocodeResponse, RouteEstimate } from '@/lib/types';
import type { LatLng } from '@/lib/geo';

/**
 * Both calls go through Supabase edge functions rather than straight to a
 * mapping provider, so the routing API key never ships inside the app.
 */

export async function geocodeAddress(address: string, region?: string): Promise<GeocodeResponse> {
  const { data, error } = await supabase.functions.invoke<GeocodeResponse>('geocode', {
    body: { address, region },
  });
  if (error) throw new Error(await describeFunctionError(error, 'We could not find that address'));
  if (!data) throw new Error('We could not find that address');
  return data;
}

export async function estimateRoute(
  origin: LatLng,
  destination: LatLng | null,
  destinationAddress: string,
): Promise<RouteEstimate> {
  const { data, error } = await supabase.functions.invoke<RouteEstimate>('route-eta', {
    body: {
      origin,
      destination: destination ?? undefined,
      destination_address: destination ? undefined : destinationAddress,
    },
  });
  if (error) throw new Error(await describeFunctionError(error, 'We could not work out a route'));
  if (!data) throw new Error('We could not work out a route');
  return data;
}

/**
 * Edge function failures arrive as an opaque FunctionsHttpError whose body holds
 * the real reason. Pulling it out means the driver sees "We could not find that
 * address" rather than "Edge Function returned a non-2xx status code".
 */
async function describeFunctionError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (body && typeof body.error === 'string') return body.error;
    } catch {
      // body was not JSON; fall through
    }
  }
  return error instanceof Error && error.message ? `${fallback} (${error.message})` : fallback;
}
