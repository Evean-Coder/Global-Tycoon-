'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createQuickClock, NODES } = require('../src/quickClock');
const { fakeClock } = require('./helpers/gameplayFixtures');

test('QC01: formal start owns one identity and excludes lobby time', () => {
  const time = fakeClock(), clock = createQuickClock(time);
  time.advance(60000);
  assert.equal(clock.read().elapsedMs, 0);
  assert.throws(() => clock.start(''), /身份/);
  clock.start('a', 1000);
  assert.equal(clock.read().elapsedMs, 0);
  assert.throws(() => clock.start('b'), /已开始/);
  time.advance(1000);
  assert.equal(clock.read().elapsedMs, 1000);
  clock.stop();
});
test('QC02: deadline boundaries, wall jumps, reads cannot extend', () => {
  const time = fakeClock(); let wall = 100;
  const clock = createQuickClock({ ...time, wallNow: () => wall });
  clock.start('a'); wall = 900000000;
  time.advance(1799000);
  assert.equal(clock.read().totalRemainingMs, 1000);
  wall = 0; assert.equal(clock.read().totalRemainingMs, 1000);
  time.advance(1000); assert.equal(clock.read().totalRemainingMs, 0);
  time.advance(1000); assert.equal(clock.read().elapsedMs, 1801000);
  clock.stop();
});
test('QC03: scheduled milestones catch up without repeat loops', () => {
  const time = fakeClock(), seen = [];
  const clock = createQuickClock({ ...time, onAdvance: t => seen.push(t.elapsedMs) });
  clock.start('a'); let prev = 0;
  for (const n of NODES) { time.advance(n - prev); prev = n; }
  assert.deepEqual(seen, NODES);
  time.advance(100000); assert.equal(seen.length, NODES.length);
  clock.stop();
  const jumps = []; const delayed = createQuickClock({ ...time, onAdvance: t => jumps.push(t.elapsedMs) });
  delayed.start('b'); time.advance(1700000); time.advance(100000);
  assert.deepEqual(jumps, [1700000, 1800000]); delayed.stop();
});
test('QC04: stopped time freezes and stale callbacks cannot affect restarted game', () => {
  const time = fakeClock(), callbacks = [], seen = [];
  const clock = createQuickClock({ ...time, setTimeout(fn, ms) { callbacks.push(fn); return time.setTimeout(fn, ms); }, onAdvance: t => seen.push(t.gameId) });
  clock.start('a'); time.advance(1234); clock.stop(); clock.stop();
  time.advance(5000); assert.equal(clock.read().elapsedMs, 1234);
  clock.start('b'); callbacks[0](); assert.deepEqual(seen, []);
  assert.equal(clock.read().elapsedMs, 0);
  time.advance(1800000); clock.stop();
  assert.equal(clock.read().totalRemainingMs, 0);
  assert.deepEqual(seen, ['b']);
});
