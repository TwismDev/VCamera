import assert from 'node:assert/strict';
import test from 'node:test';

import { nativeUrl, webUrl } from '../src/lib/nav-urls.ts';

const coordinate = { lat: -33.9249, lng: 18.4241 };
const address = '24 Harbour Road, Cape Town';

test('Waze is handed coordinates and told to start navigating', () => {
  const url = nativeUrl('waze', { coordinate, address });
  assert.equal(url, 'waze://?ll=-33.9249,18.4241&navigate=yes');
});

test('Waze falls back to a text search when the address was never geocoded', () => {
  const url = nativeUrl('waze', { coordinate: null, address });
  assert.ok(url.startsWith('waze://?q='));
  assert.ok(url.includes('Harbour%20Road'));
  assert.ok(url.endsWith('&navigate=yes'));
});

test('the https link is used as the fallback when the app is not installed', () => {
  const url = webUrl('waze', { coordinate, address });
  assert.ok(url.startsWith('https://waze.com/ul?ll='));
  assert.ok(url.includes('navigate=yes'));
});

test('Google Maps opens in driving directions mode', () => {
  assert.ok(nativeUrl('google', { coordinate, address }).includes('directionsmode=driving'));
  assert.ok(webUrl('google', { coordinate, address }).includes('travelmode=driving'));
});

test('Apple Maps gets the driving flag', () => {
  assert.ok(nativeUrl('apple', { coordinate, address }).includes('dirflg=d'));
  assert.ok(webUrl('apple', { coordinate, address }).startsWith('https://maps.apple.com/'));
});

test('addresses are escaped so punctuation cannot break the link', () => {
  const url = webUrl('google', { coordinate: null, address: 'A&B Depot, Unit 3/4' });
  assert.ok(!url.includes('&B'), 'the ampersand must not start a new query parameter');
  assert.ok(url.includes('%26B'));
});
