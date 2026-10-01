'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createActionClock } = require('../src/actionClock');

function fake() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  const api = {
    timers,
    now: () => now,
    setTimeout(fn, delay) { const id = ++seq; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) { now += ms; for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); } },
  };
  return api;
}

function game(phase = 'waiting_roll', cityId = null) {
  return { phase, turnIndex: 0, players: [{ id: 'p0', alive: true }], pending: cityId ? { type: 'auction', cityId, awaiting: 'p0', index: 0 } : null };
}

test('主行动 90 秒、子流程 60 秒，旧回调不能触发新决定', () => {
  const f = fake();
  const c = createActionClock(f);
  let hits = 0;
  c.sync(game(), () => { hits++; });
  assert.equal(c.remainingMs, 90000);
  f.advance(89999);
  assert.equal(hits, 0);
  c.sync(game('auction_bid', '开罗'), () => { hits++; });
  assert.equal(c.remainingMs, 60000);
  f.advance(60000);
  assert.equal(hits, 1);
});

test('同一决定不延时，连续不同城市重新计时，暂停恢复保留剩余时间', () => {
  const f = fake();
  const c = createActionClock(f);
  let hits = 0;
  c.sync(game('auction_bid', '开罗'), () => { hits++; });
  f.advance(10000);
  c.sync(game('auction_bid', '开罗'), () => { hits++; });
  assert.equal(c.remainingMs, 50000);
  c.pause();
  f.advance(100000);
  assert.equal(hits, 0);
  assert.equal(c.remainingMs, 50000);
  c.resume(() => { hits++; });
  f.advance(49999);
  assert.equal(hits, 0);
  f.advance(1);
  assert.equal(hits, 1);
  c.sync(game('auction_bid', '东京'), () => { hits++; });
  assert.equal(c.remainingMs, 60000);
});

test('进入结束阶段会清除当前定时器', () => {
  const f = fake();
  const c = createActionClock(f);
  let hits = 0;
  c.sync(game(), () => { hits++; });
  c.sync({ phase: 'game_over', turnIndex: 0, players: [{ id: 'p0', alive: true }], pending: null }, () => { hits++; });
  f.advance(100000);
  assert.equal(hits, 0);
  assert.equal(c.key, null);
  assert.equal(c.remainingMs, 0);
});

test('取消后的旧回调即使被执行也不会触发新决定', () => {
  const f = fake();
  const c = createActionClock(f);
  let hits = 0;
  c.sync(game('auction_bid', '开罗'), () => { hits++; });
  const stale = [...f.timers.values()][0].fn;
  c.sync(game('auction_bid', '东京'), () => { hits++; });
  stale();
  assert.equal(hits, 0);
  assert.equal(c.remainingMs, 60000);
  f.advance(60000);
  assert.equal(hits, 1);
});

test('同阶段同玩家的新决定也重新取得完整期限', () => {
  const f = fake();
  const c = createActionClock(f);
  c.sync(game('auction_bid', '开罗'), () => {});
  f.advance(25000);
  c.sync(game('auction_bid', '开罗'), () => {}, true);
  assert.equal(c.remainingMs, 60000);
  assert.equal(c.decisionId, 2);
});
