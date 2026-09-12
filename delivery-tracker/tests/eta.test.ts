import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeEta,
  etaFromMinutes,
  isOverdue,
  isPositionStale,
  minutesUntil,
  roundUpToStep,
  shouldRefreshEta,
} from '../src/lib/eta.ts';

const NOW = Date.parse('2026-09-12T10:00:00.000Z');
const at = (minutesFromNow: number): string => new Date(NOW + minutesFromNow * 60_000).toISOString();

test('minutes remaining counts down and then goes negative', () => {
  assert.equal(minutesUntil(at(20), NOW), 20);
  assert.equal(minutesUntil(at(0), NOW), 0);
  assert.equal(minutesUntil(at(-7), NOW), -7);
});

test('a missing or unparseable arrival time yields no number', () => {
  assert.equal(minutesUntil(null, NOW), null);
  assert.equal(minutesUntil('not a date', NOW), null);
});

test('an arrival time built from minutes reads back as those minutes', () => {
  assert.equal(minutesUntil(etaFromMinutes(25, NOW), NOW), 25);
});

test('a negative duration is clamped rather than put in the past', () => {
  assert.equal(minutesUntil(etaFromMinutes(-10, NOW), NOW), 0);
});

test('quoted times round up so drivers never promise false precision', () => {
  assert.equal(roundUpToStep(13), 15);
  assert.equal(roundUpToStep(15), 15);
  assert.equal(roundUpToStep(16), 20);
  assert.equal(roundUpToStep(0), 5);
});

test('remaining time is worded for a driver, not a clock', () => {
  assert.equal(describeEta(at(12), NOW), '12 min');
  assert.equal(describeEta(at(0), NOW), 'Due now');
  assert.equal(describeEta(at(-8), NOW), '8 min late');
  assert.equal(describeEta(at(95), NOW), '1 h 35');
  assert.equal(describeEta(null, NOW), 'No ETA yet');
});

test('a job is only overdue once it is past the grace period', () => {
  assert.equal(isOverdue(at(-1), NOW), false);
  assert.equal(isOverdue(at(-5), NOW), true);
  assert.equal(isOverdue(null, NOW), false);
});

test('a position goes stale once it stops being worth showing as live', () => {
  assert.equal(isPositionStale(at(-1), NOW), false);
  assert.equal(isPositionStale(at(-10), NOW), true);
  assert.equal(isPositionStale(null, NOW), true);
});

test('the ETA is only rewritten when it moved enough to matter', () => {
  const current = at(30);
  // A minute of drift is noise and must not touch the job.
  assert.equal(shouldRefreshEta(current, at(31)), false);
  // Five minutes later is worth telling the dispatcher about.
  assert.equal(shouldRefreshEta(current, at(36)), true);
  // Arriving sooner counts just as much as arriving later.
  assert.equal(shouldRefreshEta(current, at(24)), true);
  // With nothing on record, any estimate is an improvement.
  assert.equal(shouldRefreshEta(null, at(30)), true);
});
