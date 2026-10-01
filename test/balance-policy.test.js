'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { controlledFixture, ownCity, grant, gameSpec } = require('./helpers/balanceFixtures');
const { createSession } = require('../scripts/balance/session');
const { policyConfigs } = require('../scripts/balance/config');
const { createTrackedRng } = require('../scripts/balance/random');
const { decide, reserveFor, cityValue, buildValue, stockValue, opportunityScore } = require('../scripts/balance/policy');
const stocks = require('../src/stocks');
const configs = policyConfigs();
function scenario(setup) {
  const f = controlledFixture({ setup(s) { s.phase = 'waiting_roll'; s.opportunityStage.resolved = true; s.firstRoundDone = true; setup(s); } });
  return createSession(gameSpec(2, 'controlled'), { controlledState: f.state });
}
function choose(s, profile = 'neutral', memory = {}, actor = s.nextActor(), rng = createTrackedRng(42)) {
  return decide(s.view(actor), configs[profile], memory, rng);
}
function legal(s, decision, actor = s.nextActor()) {
  const result = s.dispatch(actor, decision);
  assert.equal(result.ok, true, result.error); return result;
}
function stockState(s, owner = 'p1') {
  for (const id of ['上海', '东京', '新加坡', '迪拜']) { ownCity(s, owner, id); s.stocks[id].rentHistory = [6000, 5000, 4000]; }
  s.phase = 'stock'; s.pending = { playerId: 'p0', type: 'stock' };
  stocks.openStockWindow(s, 'p0');
}

test('储备估值：实际租金、配套/H10、建设/股票现金口径', () => {
  const s = scenario(state => { ownCity(state, 'p0', '东京'); ownCity(state, 'p0', '新加坡'); ownCity(state, 'p1', '纽约', 4); grant(state, 'p0', ['H10']); });
  const v = s.view('p0');
  assert.equal(reserveFor(v, configs.neutral), 27000);
  assert.equal(cityValue(v, configs.property, '上海'), 26000);
  assert.equal(cityValue(v, configs.cautious, '上海'), 16000);
  assert.equal(buildValue(v, configs.property, '东京'), 12240);
  v.stocks['上海'].rentHistory = [1000, 2000, 3000]; v.stocks['上海'].dividendFund = 100;
  assert.equal(stockValue(v, '上海'), 4025); s.close();
});
test('决策记忆：同决策不重复建房，新个人回合重置，同分用本人随机源', () => {
  const s = scenario(state => { ownCity(state, 'p0', '上海'); grant(state, 'p0', ['H1']); });
  const d = choose(s); assert.equal(d.action.type, 'remote_build'); legal(s, d);
  assert.equal(choose(s, 'neutral', d.nextMemory).action.type, 'roll_dice');
  const v = s.view('p0'); v.decision.decisionId++;
  const nextTurn = decide(v, configs.neutral, d.nextMemory, createTrackedRng(42));
  assert.deepEqual(nextTurn.nextMemory.waitTargets, []);
  // Resetting turn memory must not restore the engine's once-per-lap H1 quota.
  assert.equal(nextTurn.action.type, 'roll_dice');
  assert.equal(typeof d.reason.cost, 'number'); s.close();
  const first = createSession(gameSpec()); const view = first.view('p0');
  const a = createTrackedRng(1), b = createTrackedRng(1);
  assert.deepEqual(decide(view, configs.neutral, {}, a), decide(view, configs.neutral, {}, b));
  assert.equal(a.calls, 1); first.close();
});
test('机遇选择：中性三阶段随机不换组，偏好评分且只阶段一换组', () => {
  for (const ordinal of [1, 2, 3]) {
    const s = scenario(state => { state.phase = 'opportunity_choose'; state.opportunityStage.resolved = false; state.opportunityStage.ordinal = ordinal; state.opportunityStage.participants.p0.candidateIds = ['H4', 'H5', 'H6']; });
    assert.equal(choose(s).action.type, 'opportunity_choose');
    assert.equal(choose(s, 'investment').action.opportunityId, 'H5');
    const property = choose(s, 'property');
    assert.equal(property.action.type, ordinal === 1 ? 'opportunity_reroll' : 'opportunity_choose');
    legal(s, property);
    if (ordinal === 1) { const after = choose(s, 'property', property.nextMemory); assert.equal(after.action.type, 'opportunity_choose'); legal(s, after); }
    s.close();
  }
  const s = scenario(state => { ownCity(state, 'p0', '上海'); grant(state, 'p0', ['H8']); state.players[0].opportunities.visitedAirportIds = ['上海浦东国际机场']; });
  assert.equal(opportunityScore(s.view('p0'), configs.property, 'H1'), 105);
  assert.equal(opportunityScore(s.view('p0'), configs.aviation, 'H8'), 70); s.close();
});
test('回合起手：合法位置赎回、普通与远程报价，然后掷骰', () => {
  const redeem = scenario(state => { ownCity(state, 'p0', '上海'); state.cities['上海'].mortgaged = true; state.players[0].position = 36; });
  const d = choose(redeem); assert.equal(d.action.type, 'redeem'); legal(redeem, d); redeem.close();
  const normal = scenario(state => { ownCity(state, 'p0', '上海'); state.players[0].position = 36; });
  const b = choose(normal); assert.equal(b.action.type, 'build_house'); legal(normal, b); normal.close();
  const empty = scenario(() => {}); assert.equal(choose(empty).action.type, 'roll_dice'); empty.close();
});
test('购买建设：所有偏好正常购置，现金储备不足拒绝，实际优惠报价', () => {
  for (const profile of Object.keys(configs)) {
    const s = scenario(state => { state.phase = 'buy'; state.pending = { cityId: '上海', playerId: 'p0' }; });
    const d = choose(s, profile); assert.equal(d.action.decision, 'buy'); legal(s, d); s.close();
  }
  const low = scenario(state => { state.phase = 'buy'; state.pending = { cityId: '上海', playerId: 'p0' }; state.players[0].cash = 25000; });
  assert.equal(choose(low).action.decision, 'pass'); low.close();
  const build = scenario(state => { ownCity(state, 'p0', '上海'); state.players[0].position = 36; state.phase = 'build_decide'; state.pending = { cityId: '上海', playerId: 'p0' }; grant(state, 'p0', ['H2']); });
  const d = choose(build); assert.equal(d.reason.cost, 10800); legal(build, d); build.close();
  const airport = scenario(state => { state.phase = 'buy_airport'; state.pending = { airportId: '上海浦东国际机场', playerId: 'p0' }; });
  legal(airport, choose(airport, 'aviation')); airport.close();
});
test('冻结监狱：储备允许才支付，否则按原正常选项', () => {
  for (const phase of ['frozen_turn', 'jail_turn']) for (const cash of [2000, 150000]) {
    const s = scenario(state => { state.phase = phase; state.players[0].cash = cash; state.players[0].frozen = phase === 'frozen_turn'; state.players[0].jailed = phase === 'jail_turn'; });
    const d = choose(s); assert.equal(d.action.decision, cash === 150000 ? 'pay' : phase === 'frozen_turn' ? 'pass' : 'roll');
    legal(s, d); s.close();
  }
});
test('竞买决策：读取实际买家预算，合法最低价与最高价结束', () => {
  const s = scenario(state => { state.phase = 'auction_bid'; state.pending = { awaiting: 'p1', cityId: '上海', currentBid: 0 }; });
  const d = choose(s); assert.equal(d.action.amount, 15000); assert.equal(d.reason.playerId, 'p1');
  const v = s.view('p1'); v.pending.currentBid = 15000; v.pending.currentBidder = 'p1';
  assert.equal(decide(v, configs.neutral, {}, createTrackedRng(42)).action.decision, 'end');
  v.players[1].cash = 16000; v.pending.currentBidder = 'p0';
  assert.equal(decide(v, configs.neutral, {}, createTrackedRng(42)).action.decision, 'pass'); s.close();
  const direct = scenario(state => { state.phase = 'direct_sale_ask'; state.pending = { awaiting: 'p1', cityId: '上海', currentBid: 0 }; });
  assert.equal(choose(direct).action.decision, 'buy'); direct.close();
});
test('股票减持：储备/比例触发低收益卖出，同窗口不反复买卖', () => {
  const s = scenario(state => { stockState(state); state.players[0].cash = 1000; state.stocks['上海'].holders.p0 = 4; state.players[0].stocks['上海'] = 4; state.players[1].cash = 0; });
  const d = choose(s); assert.equal(d.action.type, 'stock_trade'); assert.equal(d.action.orders[0].side, 'sell'); legal(s, d);
  const after = choose(s, 'neutral', d.nextMemory);
  assert.equal(after.action.type, 'stock_done'); s.close();
});
test('股票买入：窗口累计、发行量、城主上限和资产比例逐次有效', () => {
  const s = scenario(state => { stockState(state); });
  const first = choose(s, 'investment'); assert.equal(first.action.type, 'stock_trade');
  assert.equal(first.action.orders.length, 3); assert.equal(first.action.orders.reduce((n, o) => n + o.shares, 0), 6); legal(s, first);
  assert.equal(choose(s, 'investment', first.nextMemory).action.type, 'stock_done'); s.close();
  const capped = scenario(state => { stockState(state, 'p0'); state.stocks['上海'].holders.p0 = 4; state.players[0].stocks['上海'] = 4; state.stocks['东京'].holders.p1 = 20; });
  const d = choose(capped); assert.equal(d.action.orders.some(o => ['上海', '东京'].includes(o.cityId)), false); legal(capped, d); capped.close();
});
test('转让决策：减持一股95%价格，每窗口只一次，目标确认走同储备规则', () => {
  const s = scenario(state => { stockState(state); state.players[0].cash = 1000; state.stocks['上海'].holders.p0 = 4; state.players[0].stocks['上海'] = 4; });
  const d = choose(s); assert.equal(d.action.type, 'stock_transfer'); assert.equal(d.action.items[0].shares, 1); assert.equal(d.action.cash, 3800); legal(s, d);
  assert.equal(s.nextActor(), 'p1'); const response = choose(s); assert.equal(response.action.accept, true); legal(s, response);
  assert.notEqual(choose(s, 'neutral', d.nextMemory).action.type, 'stock_transfer'); s.close();
  const poor = scenario(state => { stockState(state); state.phase = 'trade_confirm'; state.pending = { fromId: 'p1', targetId: 'p0', items: [{ cityId: '上海', shares: 1 }], cash: 3800 }; state.players[0].cash = 1000; });
  assert.equal(choose(poor).action.accept, false); poor.close();
});
test('航班决策：公开下一骰等权评估，包含实际票价/机场费，H8无飞行奖金', () => {
  const s = scenario(state => {
    state.phase = 'flight'; state.pending = { playerId: 'p0', fromAirportId: '开罗国际机场', free: true }; state.players[0].position = 6;
    for (const id of ['奥克兰', '悉尼', '罗马', '阿姆斯特丹']) ownCity(state, 'p1', id, 4);
    grant(state, 'p0', ['H8']);
  });
  const d = choose(s, 'aviation'); assert.equal(d.action.type, 'flight'); assert.notEqual(d.action.target, null); legal(s, d);
  assert.equal(s.auditSnapshot().players[0].opportunities.visitedAirportIds.length, 0); s.close();
  const stay = scenario(state => { state.phase = 'flight'; state.pending = { playerId: 'p0', fromAirportId: '开罗国际机场', free: false }; state.players[0].position = 6; });
  assert.equal(choose(stay).action.target, null); legal(stay, choose(stay)); stay.close();
});
test('募资决策：可恢复购置及储备才募资，不可达取消', () => {
  const s = scenario(state => { ownCity(state, 'p0', '东京', 4); state.phase = 'buy'; state.pending = { playerId: 'p0', cityId: '上海' }; state.players[0].cash = 15000; });
  const start = choose(s); assert.equal(start.action.type, 'buy_fundraise'); legal(s, start);
  const raise = choose(s, 'neutral', start.nextMemory); assert.equal(raise.action.type, 'rescue_mortgage'); legal(s, raise);
  const confirm = choose(s, 'neutral', raise.nextMemory); assert.equal(confirm.action.decision, 'confirm'); legal(s, confirm); s.close();
  const bad = scenario(state => { state.phase = 'buy_fundraise'; state.pending = { playerId: 'p0', target: { kind: 'city', cityId: '上海' } }; state.players[0].cash = 1000; });
  const cancel = choose(bad); assert.equal(cancel.action.decision, 'cancel'); legal(bad, cancel); bad.close();
});
test('债务救援：最少股份优先，忽略主动投资储备，随后合法抵押', () => {
  const s = scenario(state => { ownCity(state, 'p1', '上海'); state.players[0].stocks['上海'] = 4; state.stocks['上海'].holders.p0 = 4; state.players[0].cash = -5000; state.phase = 'self_rescue'; state.pending = { playerId: 'p0', due: 5000, reason: 'test', resume: 'end' }; });
  const d = choose(s, 'cautious'); assert.equal(d.action.type, 'rescue_sell_stock'); assert.equal(d.action.shares, 2); legal(s, d); s.close();
  const mortgage = scenario(state => { ownCity(state, 'p0', '上海'); state.players[0].cash = -5000; state.phase = 'self_rescue'; state.pending = { playerId: 'p0', due: 5000, reason: 'test', resume: 'end' }; });
  assert.equal(choose(mortgage, 'cautious').action.type, 'rescue_mortgage'); legal(mortgage, choose(mortgage, 'cautious')); mortgage.close();
});
test('救援退出：有额度后拆房/出售，无可用资产才结束且不用认输', () => {
  const setup = state => {
    ownCity(state, 'p0', '上海', 1); ownCity(state, 'p0', '东京'); ownCity(state, 'p0', '新加坡');
    state.cities['东京'].mortgaged = true; state.cities['新加坡'].mortgaged = true;
    state.players[0].cash = -100000; state.phase = 'self_rescue'; state.pending = { playerId: 'p0', due: 100000, reason: 'test', resume: 'end' };
  };
  const s = scenario(setup); const d = choose(s); assert.equal(d.action.type, 'rescue_demolish'); legal(s, d);
  const sale = choose(s, 'neutral', d.nextMemory); assert.equal(sale.action.type, 'sell_city'); legal(s, sale); s.close();
  const empty = scenario(state => { state.players[0].cash = -1000; state.phase = 'self_rescue'; state.pending = { playerId: 'p0', due: 1000, reason: 'test', resume: 'end' }; });
  assert.equal(choose(empty).action.type, 'rescue_done'); legal(empty, choose(empty)); empty.close();
});
test('策略隔离：同一可见视图输出不受隐藏差异影响，五偏好共用行为入口', () => {
  const s = createSession(gameSpec()); const v = s.view('p0'), before = globalThis.structuredClone(v);
  const result = decide(v, configs.neutral, {}, createTrackedRng(22));
  const audit = s.auditSnapshot(); audit.diceBag = [10]; audit.opportunityStage.participants.p1.candidateIds = ['H1'];
  assert.deepEqual(decide(v, configs.neutral, {}, createTrackedRng(22)), result); assert.deepEqual(v, before);
  const source = fs.readFileSync(path.join(__dirname, '../scripts/balance/policy.js'), 'utf8');
  assert.doesNotMatch(source, /require\([^)]*(?:session|observe|storage|batch|server|random)\b/);
  assert.doesNotMatch(source, /type:\s*['"]surrender['"]/); s.close();
});
