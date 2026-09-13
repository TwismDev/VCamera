/**
 * Path-distance maths used by route replay. Pure functions, no HTTP.
 *
 * Run with `npm run test:geo`.
 */

const { haversineKm, kmLabel, pathDistanceKm, isLatLng } = require('./.build/geo.cjs');

const MELB = { lat: -37.8136, lng: 144.9631 };
const GEELONG = { lat: -38.1499, lng: 144.3617 };
const BALLARAT = { lat: -37.5622, lng: 143.8503 };

const results = [];
function check(name, expectation, pass, detail) {
  results.push({ name, expectation, verdict: pass ? 'PASS' : `FAIL${detail ? ' — ' + detail : ''}` });
}

check('empty path is 0 km', '0', pathDistanceKm([]) === 0);
check('single point is 0 km', '0', pathDistanceKm([MELB]) === 0);

const thereAndBack = pathDistanceKm([MELB, GEELONG, MELB]);
const oneWay = haversineKm(MELB, GEELONG);
check(
  'there-and-back is twice the one-way leg',
  '2x',
  Math.abs(thereAndBack - oneWay * 2) < 1e-9,
  `got ${thereAndBack}, expected ${oneWay * 2}`,
);

const threeLeg = pathDistanceKm([MELB, GEELONG, BALLARAT]);
const sumLegs = haversineKm(MELB, GEELONG) + haversineKm(GEELONG, BALLARAT);
check(
  'three points sum both legs, not the chord',
  'sum of legs',
  Math.abs(threeLeg - sumLegs) < 1e-9,
  `got ${threeLeg}, expected ${sumLegs}`,
);

const melbGeelongKm = haversineKm(MELB, GEELONG);
check(
  'Melbourne–Geelong is about 65 km as the crow flies',
  '~65 km',
  melbGeelongKm > 60 && melbGeelongKm < 75,
  `got ${melbGeelongKm}`,
);

check('sub-kilometre label uses metres', 'm', kmLabel(0.42) === '420 m');
check('kilometre label uses one decimal', 'km', kmLabel(12.34) === '12.3 km');
check('isLatLng rejects a missing longitude', 'false', isLatLng(-37.8, null) === false);
check('isLatLng accepts Melbourne', 'true', isLatLng(MELB.lat, MELB.lng) === true);

const failed = results.filter((row) => row.verdict !== 'PASS');
for (const row of results) {
  console.log(`${row.verdict.padEnd(4)}  ${row.name}  (${row.expectation})`);
}
if (failed.length) {
  console.error(`\n${failed.length} geo check(s) FAILED`);
  process.exit(1);
}
console.log(`\nall ${results.length} geo checks passed`);
