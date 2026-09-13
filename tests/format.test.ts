import assert from 'node:assert/strict';
import test from 'node:test';

import { formatRelative, initials, reconcile } from '../src/lib/format.ts';

const NOW = Date.parse('2026-09-12T10:00:00.000Z');
const ago = (seconds: number): string => new Date(NOW - seconds * 1000).toISOString();

test('a position age reads as a driver would say it', () => {
  assert.equal(formatRelative(ago(10), NOW), 'just now');
  assert.equal(formatRelative(ago(120), NOW), '2 min ago');
  assert.equal(formatRelative(ago(7200), NOW), '2 h ago');
  assert.equal(formatRelative(null, NOW), 'never');
});

test('initials cope with one name, several names and none', () => {
  assert.equal(initials('Alex Morgan'), 'AM');
  assert.equal(initials('Alex van der Merwe'), 'AM');
  assert.equal(initials('Alex'), 'AL');
  assert.equal(initials('   '), '?');
});

test('a delivery that matches the order is not flagged', () => {
  const result = reconcile(12, 12, 250, 250);
  assert.equal(result.matches, true);
  assert.equal(result.productShortfall, 0);
  assert.equal(result.cashShortfall, 0);
});

test('short products and short cash are both reported', () => {
  const result = reconcile(12, 10, 250, 200);
  assert.equal(result.matches, false);
  assert.equal(result.productShortfall, 2);
  assert.equal(result.cashShortfall, 50);
});

test('collecting more than expected shows as a negative shortfall', () => {
  const result = reconcile(12, 12, 250, 300);
  assert.equal(result.matches, false);
  assert.equal(result.cashShortfall, -50);
});

test('an unreported figure is treated as matching rather than as a loss', () => {
  const result = reconcile(12, null, 250, null);
  assert.equal(result.matches, true);
});

test('cash arithmetic does not leak floating point noise', () => {
  const result = reconcile(1, 1, 0.3, 0.1);
  assert.equal(result.cashShortfall, 0.2);
});
