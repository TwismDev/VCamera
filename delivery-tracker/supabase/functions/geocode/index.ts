// Turns the address the dispatcher types into coordinates, so the driver app
// can route to it and the map can pin it.
//
// The mapping API key stays here on the server; it is never shipped in the app.
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { geocode, hasGoogleKey } from '../_shared/geo.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Use POST', 405);

  let payload: { address?: string; region?: string };
  try {
    payload = await req.json();
  } catch {
    return fail('Expected a JSON body');
  }

  const address = (payload.address ?? '').trim();
  if (address.length < 3) return fail('Enter an address to look up');

  try {
    const result = await geocode(address, payload.region);
    return json({
      lat: result.lat,
      lng: result.lng,
      formatted_address: result.formattedAddress,
      provider: result.provider,
      traffic_aware: hasGoogleKey(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Address lookup failed';
    return fail(message, 422);
  }
});
