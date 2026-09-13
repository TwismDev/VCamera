/**
 * ETA provider ladder, exercised against stubbed HTTP.
 *
 * The routing services cannot be called from CI (and shouldn't be — they cost
 * money per request), so this asserts the behaviour that actually goes wrong in
 * practice: which provider is chosen, what is sent, how each response shape is
 * read, and that a failure downgrades rather than throwing.
 *
 * Run with `npm run test:eta`, which bundles the TypeScript first.
 */

// Stub the one native module the ETA service imports.
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'expo-location') return { geocodeAsync: async () => [] };
  return origLoad.call(this, request, ...rest);
};

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.test';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'x';

const MELB = { lat: -37.8136, lng: 144.9631 };
const GEELONG = { lat: -38.1499, lng: 144.3617 };

let calls = [];
function mockFetch(handlers) {
  calls = [];
  global.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ href, init });
    for (const [pattern, respond] of handlers) {
      if (href.includes(pattern)) return respond(init);
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
}

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const fail = (status) => ({ ok: false, status, json: async () => ({}), text: async () => '' });

const results = [];
function check(name, expectation, pass, detail) {
  results.push({ name, expectation, verdict: pass ? 'PASS' : `FAIL${detail ? ' — ' + detail : ''}` });
}

(async () => {
  // --- with a Google key, Routes API wins and traffic delay is derived -----
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-google-key';
  delete process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  delete require.cache[require.resolve('./.build/eta.cjs')];
  let eta = require('./.build/eta.cjs');

  mockFetch([
    ['routes.googleapis.com', () => ok({ routes: [{ duration: '1800s', staticDuration: '1500s', distanceMeters: 25000 }] })],
  ]);
  let r = await eta.estimateEta(MELB, GEELONG);
  check('Routes API is preferred when a Google key is set', 'google-routes',
    r.provider === 'google-routes', r.provider);
  check('"1800s" parses to 30 minutes', '30 min', r.minutes === 30, String(r.minutes));
  check('distance converts from metres', '25 km', r.distanceKm === 25, String(r.distanceKm));
  check('traffic delay = duration - staticDuration', '5 min',
    r.trafficDelayMinutes === 5, String(r.trafficDelayMinutes));

  const routesCall = calls.find((c) => c.href.includes('routes.googleapis.com'));
  check('Routes request sends the required field mask', 'present',
    Boolean(routesCall?.init?.headers?.['X-Goog-FieldMask']));
  check('Routes request asks for the most accurate traffic model', 'TRAFFIC_AWARE_OPTIMAL',
    String(routesCall?.init?.body).includes('TRAFFIC_AWARE_OPTIMAL'));
  check('Routes request does NOT send our own departure time', 'omitted',
    !String(routesCall?.init?.body).includes('departureTime'));
  check('the API key travels in a header, not the query string', 'header',
    Boolean(routesCall?.init?.headers?.['X-Goog-Api-Key']) && !routesCall.href.includes('test-google-key'));

  // --- Routes unavailable (e.g. not enabled) falls back to Directions ------
  mockFetch([
    ['routes.googleapis.com', () => fail(403)],
    ['maps.googleapis.com', () => ok({ routes: [{ legs: [{ duration: { value: 1200 }, duration_in_traffic: { value: 1500 }, distance: { value: 20000 } }] }] })],
  ]);
  r = await eta.estimateEta(MELB, GEELONG);
  check('a rejected Routes call falls back to legacy Directions', 'google-directions',
    r.provider === 'google-directions', r.provider);
  check('Directions prefers duration_in_traffic over plain duration', '25 min',
    r.minutes === 25, String(r.minutes));
  check('Directions derives traffic delay too', '5 min',
    r.trafficDelayMinutes === 5, String(r.trafficDelayMinutes));

  // --- no Google key at all: Mapbox is used when a token exists ------------
  delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN = 'test-mapbox-token';
  delete require.cache[require.resolve('./.build/eta.cjs')];
  eta = require('./.build/eta.cjs');

  mockFetch([
    ['api.mapbox.com', () => ok({ routes: [{ duration: 1860, duration_typical: 1620, distance: 24000 }] })],
  ]);
  r = await eta.estimateEta(MELB, GEELONG);
  check('Mapbox is used when there is no Google key', 'mapbox', r.provider === 'mapbox', r.provider);
  check('Mapbox uses the traffic profile', 'driving-traffic',
    calls.some((c) => c.href.includes('/driving-traffic/')));
  check('Mapbox delay comes from duration_typical', '4 min',
    r.trafficDelayMinutes === 4, String(r.trafficDelayMinutes));
  check('no Google call is made without a key', '0 calls',
    !calls.some((c) => c.href.includes('googleapis.com')));

  // --- no keys at all: OSRM, and it must not claim traffic knowledge -------
  delete process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  delete require.cache[require.resolve('./.build/eta.cjs')];
  eta = require('./.build/eta.cjs');

  mockFetch([
    ['router.project-osrm.org', () => ok({ routes: [{ duration: 2400, distance: 30000 }] })],
  ]);
  r = await eta.estimateEta(MELB, GEELONG);
  check('OSRM is the keyless fallback', 'osrm', r.provider === 'osrm', r.provider);
  check('OSRM reports no traffic delay', 'null', r.trafficDelayMinutes === null, String(r.trafficDelayMinutes));
  check('OSRM is flagged as NOT live traffic', 'false',
    eta.PROVIDER_USES_LIVE_TRAFFIC.osrm === false);

  // --- everything down: still a usable number, never an error --------------
  mockFetch([]);
  r = await eta.estimateEta(MELB, GEELONG);
  check('total routing failure still yields a number', 'straight-line',
    r.provider === 'straight-line', r.provider);
  check('...that is plausible for Melbourne to Geelong', '60-180 min',
    r.minutes > 60 && r.minutes < 180, `${r.minutes} min`);
  check('...and is honest about not knowing traffic', 'false',
    eta.PROVIDER_USES_LIVE_TRAFFIC['straight-line'] === false);

  // --- a malformed response must not be trusted ----------------------------
  mockFetch([['router.project-osrm.org', () => ok({ routes: [{ distance: 30000 }] })]]);
  r = await eta.estimateEta(MELB, GEELONG);
  check('a response with no duration is rejected, not read as zero', 'straight-line',
    r.provider === 'straight-line', r.provider);

  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    console.log(`${r.verdict === 'PASS' ? '  ok  ' : ' FAIL '} ${r.name.padEnd(width)}  ${r.expectation}`);
  }
  const failed = results.filter((r) => r.verdict !== 'PASS');
  console.log(`\n${results.length - failed.length}/${results.length} ETA checks passed`);
  if (failed.length) { failed.forEach((f) => console.log('  ' + f.name + ': ' + f.verdict)); process.exit(1); }
})();
