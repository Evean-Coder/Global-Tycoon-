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
test('QC05: quick decision durations, same identity tightening and paused budget', () => {
  const {createActionClock} = require('../src/actionClock');
  const {createGameState} = require('../src/state');
  const s = createGameState('T',['a','b'],2,{routeRevision:'opportunity-routes-v1',gameMode:'quick',quickRevision:'quick-mode-v1'});
  const time=fakeClock(), clock=createActionClock(time), fn=()=>{};
  for(const phase of ['waiting_roll','frozen_turn','jail_turn','buy','buy_airport','build_decide','buy_fundraise','flight','stock','auction_bid','direct_sale_ask','trade_confirm','self_rescue','opportunity_choose','route_choose']){
    s.phase=phase;s.pending={playerId:'p0'};
    s.opportunityStage={stageId:'stage'};s.routeFlow.activeChoice=phase==='route_choose'?{playerId:'p0',opportunityId:'later'}:null;
    clock.sync(s,fn,true,1800000);
    const expected=phase==='self_rescue'?45000:phase==='opportunity_choose'?30000:20000;
    assert.equal(clock.remainingMs,expected,phase);
    const id=clock.decisionId;time.advance(1000);clock.sync(s,fn,false,1800000);assert.equal(clock.decisionId,id);assert.equal(clock.remainingMs,expected-1000);
    clock.sync(s,fn,false,500);assert.equal(clock.remainingMs,500);clock.pause();time.advance(2000);clock.sync(s,fn,false,100);
    assert.equal(clock.remainingMs,100);assert.equal(clock.paused,true);clock.resume(fn);assert.equal(clock.remainingSeconds(),1);clock.clear();
  }
  assert.throws(()=>clock.sync(s,fn,false,-1),/预算/);
});
