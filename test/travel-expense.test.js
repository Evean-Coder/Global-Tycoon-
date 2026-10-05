'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createGameState, snapshot } = require('../src/state');
const expense = require('../src/travelExpense');
const { fixture, grant } = require('../scripts/light-balance/cases');

function game(n = 2, completed = 80) {
  const s = fixture(n); s.economyRevision = expense.REVISION; s.travelExpenseReceipts = {}; s.roundFlow.index = completed + 1;
  return s;
}
test('完整轮收费与预告边界、2/3/4人同表', () => {
  for (const n of [2, 3, 4]) for (const completed of [0, 77, 78, 79, 80, 117, 118, 119, 120, 250]) {
    const s = game(n, completed), events = [], info = expense.stage(s);
    const expected = completed >= 120 ? 3000 : completed >= 80 ? 1500 : 0;
    assert.equal(info.currentAmount, expected);
    const boundary = completed < 80 ? 80 : 120;
    assert.deepEqual(info.preview, [78, 79, 118, 119].includes(completed)
      ? { amount: boundary === 80 ? 1500 : 3000, startsAtRound: boundary + 1, roundsUntil: boundary - completed } : null);
    for (const p of s.players) { grant(s, p.id, ['H6', 'H11']); expense.settle(s, p.id, events); assert.equal(p.cash, 150000 - expected); }
    assert.equal(events.length, expected ? n : 0);
    assert.ok(events.every(e => Object.keys(e.cashDeltas).length === 1 && Object.keys(e.fundDeltas).length === 0));
  }
});
test('收费凭据幂等、下回合仍收费、死亡不收费', () => {
  const s = game(), events = []; expense.settle(s, 'p0', events); expense.settle(s, 'p0', events);
  assert.equal(s.players[0].cash, 148500); assert.equal(events.length, 1);
  s.turnId++; expense.settle(s, 'p0', events); assert.equal(s.players[0].cash, 147000);
  s.players[0].alive = false; s.turnId++; expense.settle(s, 'p0', events); assert.equal(events.length, 2);
  assert.equal(Object.keys(s.travelExpenseReceipts).length, 1);
});
test('非法整数不产生部分修改', () => {
  for (const setup of [s => { s.players[0].cash = NaN; }, s => { s.players[0].cash = -Number.MAX_SAFE_INTEGER; }, s => { s.settlementSeq = Number.MAX_SAFE_INTEGER; }, s => { s.turnId = 1.5; }]) {
    const s = game(); setup(s); const before = globalThis.structuredClone(s), events = [];
    assert.throws(() => expense.settle(s, 'p0', events)); assert.deepEqual(s, before); assert.deepEqual(events, []);
  }
});
test('显式构造才启用，旧v1/v2后期不扣费，公开快照无内部凭据', () => {
  for (const v of [1, 2]) {
    const s = createGameState('OLD', ['甲', '乙'], v); s.roundFlow.index = 121; expense.settle(s, 'p0', []);
    assert.equal(s.players[0].cash, 150000); assert.equal(s.economyRevision, undefined);
  }
  const s = createGameState('NEW', ['甲', '乙'], 2, { economyRevision: expense.REVISION }); s.roundFlow.index = 121;
  expense.settle(s, 'p0', []); const view = snapshot(s, 'p0');
  assert.equal(s.players[0].cash, 147000); assert.equal(view.travelExpenseReceipts, undefined);
});
