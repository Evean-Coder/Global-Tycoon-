'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameState: createState } = require('../src/state');
// 保留旧版规则回归；新版规则由 gameplay-* 和 stocks-v2 覆盖。
const createGameState = (code, names) => createState(code, names, 1);
const { normalizeAction, resolveActorId } = require('../src/actionValidation');

function state() {
  const s = createGameState('VALIDATE', ['甲', '乙', '丙']);
  s.cities['开罗'].ownerId = 'p1';
  s.stocks['开罗'].holders.p0 = 2;
  s.players[0].stocks['开罗'] = 2;
  return s;
}

test('动作白名单拒绝未知类型、错误阶段和非法枚举', () => {
  const s = state();
  assert.equal(normalizeAction(s, null).ok, false);
  assert.equal(normalizeAction(s, { type: 'unknown' }).ok, false);
  assert.equal(normalizeAction(s, { type: 'buy', decision: 'buy' }).ok, false);
  s.phase = 'buy';
  assert.equal(normalizeAction(s, { type: 'buy', decision: 'maybe' }).ok, false);
  assert.deepEqual(normalizeAction(s, { type: 'buy', decision: 'pass', ignored: true }).action, { type: 'buy', decision: 'pass' });
});

test('金额、机场和城市标识必须是规范值', () => {
  const s = state();
  s.phase = 'auction_bid';
  s.pending = { type: 'auction', awaiting: 'p0', cityId: '开罗' };
  assert.equal(normalizeAction(s, { type: 'auction_respond', decision: 'bid', amount: 1.5 }).ok, false);
  s.phase = 'flight';
  s.pending = { playerId: 'p0', fromAirportId: '北京' };
  assert.equal(normalizeAction(s, { type: 'flight', target: '不存在的机场' }).ok, false);
  s.phase = 'mortgage';
  assert.equal(normalizeAction(s, { type: 'mortgage', cityId: '不存在的城市' }).ok, false);
});

test('拍卖出价必须满足起价、现金和当前最高价规则', () => {
  const s = state();
  s.phase = 'auction_bid';
  s.pending = { type: 'auction', awaiting: 'p0', cityId: '开罗', currentBid: 0, currentBidder: null };
  assert.equal(normalizeAction(s, { type: 'auction_respond', decision: 'bid', amount: 1 }).ok, false);
  assert.equal(normalizeAction(s, { type: 'auction_respond', decision: 'bid', amount: 100000000 }).ok, false);
  s.pending.currentBid = 20000;
  s.pending.currentBidder = 'p1';
  assert.equal(normalizeAction(s, { type: 'auction_respond', decision: 'bid', amount: 21000 }).ok, true);
  assert.equal(normalizeAction(s, { type: 'auction_respond', decision: 'end' }).ok, false);
  s.pending.currentBidder = 'p0';
  assert.equal(normalizeAction(s, { type: 'auction_respond', decision: 'end' }).ok, true);
});

test('股票订单和转让拒绝字符串、负数、重复与越限输入', () => {
  const s = state();
  s.phase = 'stock';
  s.pending = { playerId: 'p0', kind: 'go_stock', after: 'end' };
  assert.equal(normalizeAction(s, { type: 'stock_trade', orders: [{ cityId: '开罗', side: 'buy', shares: '1' }] }).ok, false);
  assert.equal(normalizeAction(s, { type: 'stock_trade', orders: [{ cityId: '开罗', side: 'buy', shares: -1 }] }).ok, false);
  assert.equal(normalizeAction(s, { type: 'stock_transfer', targetId: 'p1', items: [{ cityId: '开罗', shares: 1 }, { cityId: '开罗', shares: 1 }], cash: 0 }).ok, false);
  assert.equal(normalizeAction(s, { type: 'stock_transfer', targetId: 'p1', items: [{ cityId: '开罗', shares: 1 }], cash: '10' }).ok, false);
});

test('同城先卖后买按最终市场余量校验', () => {
  const s = createGameState('CAPACITY', ['甲', '乙']);
  s.phase = 'stock';
  s.turnIndex = 0;
  s.cities['开罗'].ownerId = 'p1';
  s.stocks['开罗'].holders.p0 = 2;
  s.stocks['开罗'].holders.p1 = 18;
  s.players[0].stocks['开罗'] = 2;
  const result = normalizeAction(s, {
    type: 'stock_trade',
    orders: [
      { cityId: '开罗', side: 'sell', shares: 2 },
      { cityId: '开罗', side: 'buy', shares: 2 },
    ],
  });
  assert.equal(result.ok, true);
});

test('城市所有者先卖后买按最终持股上限校验', () => {
  const s = createGameState('OWNER-CAP', ['甲', '乙']);
  s.phase = 'stock';
  s.turnIndex = 0;
  s.cities['开罗'].ownerId = 'p0';
  s.stocks['开罗'].holders.p0 = 4;
  s.players[0].stocks['开罗'] = 4;
  const result = normalizeAction(s, {
    type: 'stock_trade',
    orders: [
      { cityId: '开罗', side: 'sell', shares: 1 },
      { cityId: '开罗', side: 'buy', shares: 1 },
    ],
  });
  assert.equal(result.ok, true);
});

test('待确认接收方固定，不能改写目标或代替当前玩家认输', () => {
  const s = state();
  s.phase = 'trade_confirm';
  s.pending = { type: 'trade_confirm', fromId: 'p0', targetId: 'p1', items: [{ cityId: '开罗', shares: 1 }], cash: 10 };
  assert.equal(resolveActorId(s, 'stock_transfer'), 'p1');
  assert.equal(normalizeAction(s, { type: 'stock_transfer', targetId: 'p2', accept: true }).ok, false);
  assert.equal(normalizeAction(s, { type: 'stock_transfer', targetId: 'p1', accept: true }).ok, true);
  assert.equal(normalizeAction(s, { type: 'surrender' }).ok, false);
});

test('自救出售限定修订：上下文取自真实pending，忽略客户端伪造且拒绝身份错配', () => {
  const s = createState('RESCUE', ['甲', '乙']);
  s.phase = 'self_rescue';
  s.pending = { playerId: 'p0', kind: 'self_rescue', due: 50000, reason: '租金', resume: true };
  const raw = { type: 'sell_city', cityId: '上海', mode: 'auction', context: { type: 'self_rescue', playerId: 'p1', due: 0, reason: '伪造', resume: false } };
  const normalized = normalizeAction(s, raw, { actorId: 'p0', source: 'player' });
  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.action.context, { type: 'self_rescue', playerId: 'p0', due: 50000, reason: '租金', resume: true });
  s.pending.playerId = 'p1';
  assert.equal(normalizeAction(s, raw, { actorId: 'p0', source: 'player' }).ok, false);
  s.phase = 'waiting_roll'; s.pending = null;
  assert.equal(normalizeAction(s, raw).action.context, undefined);
});

test('自救出售限定修订：拍卖成交/流拍、直接出售成功/失败恢复原玩家', () => {
  const logic = require('../src/gameLogic');
  const { createRng } = require('../src/random');
  for (const mode of ['auction', 'direct']) for (const successful of [true, false]) for (const debt of [5000, 50000]) {
    const s = createState('RESCUE', ['甲', '乙']);
    s.phase = 'self_rescue'; s.firstRoundDone = true;
    s.players[0].cash = -debt; s.players[0].cities = ['上海']; s.cities['上海'].ownerId = 'p0';
    s.pending = { playerId: 'p0', kind: 'self_rescue', due: debt, reason: '真实债务', resume: false };
    const rng = createRng(22);
    const sale = normalizeAction(s, { type: 'sell_city', cityId: '上海', mode }, { actorId: 'p0', source: 'player' });
    assert.equal(sale.ok, true);
    logic.apply(s, sale.action, rng, { actorId: 'p0', source: 'player' });
    const before = globalThis.structuredClone(s);
    const invalid = normalizeAction(s, mode === 'auction' ? { type: 'auction_respond', decision: 'bid', amount: 1 } : { type: 'direct_sale_respond', decision: 'maybe' });
    assert.equal(invalid.ok, false); assert.deepEqual(s, before);
    const action = mode === 'auction' ? { type: 'auction_respond', decision: successful ? 'bid' : 'pass', ...(successful ? { amount: 15000 } : {}) } : { type: 'direct_sale_respond', decision: successful ? 'buy' : 'pass' };
    const response = normalizeAction(s, action, { actorId: 'p1', source: 'player' });
    assert.equal(response.ok, true);
    assert.doesNotThrow(() => logic.apply(s, response.action, rng, { actorId: 'p1', source: 'player' }));
    const proceeds = successful ? mode === 'auction' ? 15000 : 16000 : mode === 'auction' ? 10000 : 0;
    assert.equal(s.players[0].cash, -debt + proceeds);
    if (s.players[0].cash < 0) {
      assert.equal(s.phase, 'self_rescue');
      assert.deepEqual(s.pending, { playerId: 'p0', kind: 'self_rescue', due: debt, reason: '真实债务', resume: false });
    } else { assert.equal(s.turnIndex, 1); assert.equal(s.phase, 'waiting_roll'); }
  }
});

test('自救出售限定修订：未补足债务时保留原resume继续依据', () => {
  const logic = require('../src/gameLogic');
  const { createRng } = require('../src/random');
  const s = createState('RESCUE', ['甲', '乙']);
  s.phase = 'self_rescue'; s.firstRoundDone = true; s.players[0].cash = -50000;
  s.players[0].cities = ['上海']; s.cities['上海'].ownerId = 'p0';
  s.pending = { playerId: 'p0', kind: 'self_rescue', due: 50000, reason: '债务', resume: true };
  const sale = normalizeAction(s, { type: 'sell_city', cityId: '上海', mode: 'direct' });
  logic.apply(s, sale.action, createRng(22), { actorId: 'p0', source: 'player' });
  const pass = normalizeAction(s, { type: 'direct_sale_respond', decision: 'pass' });
  logic.apply(s, pass.action, createRng(22), { actorId: 'p1', source: 'player' });
  assert.equal(s.pending.playerId, 'p0'); assert.equal(s.pending.resume, true);
});
