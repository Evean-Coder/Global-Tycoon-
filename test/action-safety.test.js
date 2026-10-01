'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameState: createState, snapshot } = require('../src/state');
const createGameState = (code, names) => createState(code, names, 1);
const logic = require('../src/gameLogic');

test('公开快照不暴露骰袋、机会卡顺序、随机种子或令牌', () => {
  const s = createGameState('SNAP', ['甲', '乙']);
  s.players[0].reconnectToken = 'secret';
  const out = snapshot(s);
  assert.equal('diceBag' in out, false);
  assert.equal('chanceDeck' in out, false);
  assert.equal('rngSeed' in out, false);
  assert.equal('reconnectToken' in out.players[0], false);
  assert.ok(out.board && out.players && out.stocks);
});

test('转让确认只使用保存的接收方，失败不产生部分成交', () => {
  const s = createGameState('ATOMIC', ['甲', '乙', '丙']);
  const cityId = '开罗';
  s.phase = 'stock';
  s.pending = { playerId: 'p0', kind: 'go_stock', after: 'end' };
  s.cities[cityId].ownerId = 'p2';
  s.stocks[cityId].holders.p0 = 1;
  s.players[0].stocks[cityId] = 1;
  logic.apply(s, { type: 'stock_transfer', targetId: 'p1', items: [{ cityId, shares: 1 }], cash: 100 }, () => 0.5);
  const before = JSON.stringify({ cash: s.players.map((p) => p.cash), holders: s.stocks[cityId].holders });
  logic.apply(s, { type: 'stock_transfer', targetId: 'p2', accept: true }, () => 0.5);
  assert.notEqual(JSON.stringify({ cash: s.players.map((p) => p.cash), holders: s.stocks[cityId].holders }), before);
  assert.equal(s.stocks[cityId].holders.p2 || 0, 0);
  assert.equal(s.stocks[cityId].holders.p1, 1);
  assert.equal(s.players[2].cash, 150000);
});
