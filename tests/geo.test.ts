import assert from 'node:assert/strict';
import test from 'node:test';

import { bearingDegrees, distanceMeters, formatDistance, isValidCoordinate, regionForPoints } from '../src/lib/geo.ts';

test('distance between two known points is accurate to within a percent', () => {
  // Cape Town city hall to the V&A Waterfront, about 2.6 km apart.
  const cityHall = { lat: -33.9258, lng: 18.4232 };
  const waterfront = { lat: -33.9036, lng: 18.4207 };

  const metres = distanceMeters(cityHall, waterfront);
  assert.ok(metres > 2400 && metres < 2600, `expected about 2.5 km, got ${metres}`);
});

test('distance from a point to itself is zero', () => {
  const point = { lat: 51.5074, lng: -0.1278 };
  assert.equal(distanceMeters(point, point), 0);
});

test('bearing due north is zero and due east is ninety', () => {
  const origin = { lat: 0, lng: 0 };
  assert.ok(Math.abs(bearingDegrees(origin, { lat: 1, lng: 0 })) < 0.001);
  assert.ok(Math.abs(bearingDegrees(origin, { lat: 0, lng: 1 }) - 90) < 0.001);
});

test('null island is rejected because it always means an unset coordinate', () => {
  assert.equal(isValidCoordinate({ lat: 0, lng: 0 }), false);
  assert.equal(isValidCoordinate({ lat: -33.9, lng: 18.4 }), true);
  assert.equal(isValidCoordinate({ lat: 91, lng: 0 }), false);
  assert.equal(isValidCoordinate(null), false);
  assert.equal(isValidCoordinate({ lat: Number.NaN, lng: 10 }), false);
});

test('a region covers every point it is given', () => {
  const region = regionForPoints([
    { lat: -33.9, lng: 18.4 },
    { lat: -33.8, lng: 18.6 },
  ]);

  assert.ok(region);
  assert.ok(region.latitude > -33.9 && region.latitude < -33.8);
  assert.ok(region.latitudeDelta >= 0.1);
  assert.ok(region.longitudeDelta >= 0.2);
});

test('a single point still gets a usable zoom level', () => {
  const region = regionForPoints([{ lat: -33.9, lng: 18.4 }]);
  assert.ok(region);
  assert.ok(region.latitudeDelta >= 0.01, 'should not zoom to the pavement');
});

test('a region needs at least one valid point', () => {
  assert.equal(regionForPoints([]), null);
  assert.equal(regionForPoints([{ lat: 0, lng: 0 }]), null);
});

test('distances read naturally in both unit systems', () => {
  assert.equal(formatDistance(450), '450 m');
  assert.equal(formatDistance(2500), '2.5 km');
  assert.equal(formatDistance(25000), '25 km');
  assert.equal(formatDistance(1609.344, 'imperial'), '1.0 mi');
  assert.equal(formatDistance(-5), '--');
});
