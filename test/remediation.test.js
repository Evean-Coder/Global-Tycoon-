'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, own, grant } = require('../scripts/light-balance/cases');
const stocks = require('../src/stocks');
const original = require('../src/gameLogic');
const { compile, amount } = require('../scripts/remediation/candidate');
const revised = require('../scripts/remediation/investment-policy');
const base = require('../scripts/balance/policy');
const { createSession } = require('../scripts/balance/session');
const { policyConfigs } = require('../scripts/balance/config');
const { createTrackedRng } = require('../scripts/balance/random');
const config = policyConfigs().investment;
function session(s, applyAction) { return createSession({ source: 'controlled', players: 2, sampleId: 'remediation-fixture', engineSeed: 20261005,
  policySeedsByPlayer: { p0: 21, p1: 31 }, policiesBySeat: ['investment', 'aviation'], limits: { rounds: 200, actions: 10 } }, { controlledState: s, ...(applyAction ? { applyAction } : {}) }); }
function market(setup = () => {}) { const s = fixture(); for (const id of ['上海', '东京', '悉尼']) own(s, 'p1', id); s.phase = 'stock'; s.pending = { playerId: 'p0', type: 'stock', after: 'end' }; stocks.openStockWindow(s, 'p0'); setup(s); return session(s); }
function choose(s, memory = {}) { return revised.decide(s.view('p0'), config, memory, createTrackedRng(21)); }
function dispatch(s, d) { const r = s.dispatch('p0', d); assert.equal(r.ok, true, r.error); return r; }
test('无租金无上涨优势时保留现金；旧策略实际盲买复现', () => {
  const s = market();
  assert.equal(base.decide(s.view('p0'), config, {}, createTrackedRng(21)).action.type, 'stock_trade');
  assert.equal(choose(s).action.type, 'stock_done'); dispatch(s, choose(s)); s.close();
});
test('必要减持走实际银行价，不先折价5%向对手转让', () => {
  const s = market(st => { st.players[0].cash = 1000; st.players[0].stocks['上海'] = 4; st.stocks['上海'].holders.p0 = 4; });
  const old = base.decide(s.view('p0'), config, {}, createTrackedRng(21)); assert.equal(old.action.type, 'stock_transfer'); assert.equal(old.action.cash, 3800);
  const d = choose(s); assert.equal(d.action.type, 'stock_trade'); assert.equal(d.action.orders[0].side, 'sell'); assert.equal(d.reason.proceeds, 16000);
  dispatch(s, d); assert.equal(s.auditSnapshot().players[0].cash, 17000); assert.notEqual(choose(s, d.nextMemory).action.orders?.[0]?.side, 'buy'); s.close();
});
test('H5只补三座有效持股各一股，其他冷清股不增持', () => {
  const s = market(st => grant(st, 'p0', ['H5'])); const d = choose(s);
  assert.equal(d.reason.code, 'review_H5_eligibility'); assert.equal(d.action.orders.length, 3); assert.ok(d.action.orders.every(o => o.shares === 1));
  dispatch(s, d); assert.equal(choose(s, d.nextMemory).action.type, 'stock_done'); s.close();
});
test('公开收益正增益才买，股票额度和现金储备经过真实预检', () => {
  const s = market(st => { for (const id of ['上海', '东京', '悉尼']) st.stocks[id].rentHistory = [6000, 6000, 6000]; });
  const d = choose(s); assert.equal(d.action.type, 'stock_trade'); assert.ok(d.action.orders.reduce((n, o) => n + o.shares, 0) <= 6); dispatch(s, d);
  assert.equal(choose(s, d.nextMemory).action.type, 'stock_done'); s.close();
  const poor = market(st => { st.players[0].cash = 23000; for (const id of ['上海', '东京', '悉尼']) st.stocks[id].rentHistory = [6000, 6000, 6000]; });
  assert.equal(choose(poor).action.type, 'stock_done'); poor.close();
});
test('转让接受按实际份数与储备，不额外计算已含股息', () => {
  const s = market(st => { st.phase = 'trade_confirm'; st.pending = { fromId: 'p1', targetId: 'p0', items: [{ cityId: '上海', shares: 1 }], cash: 3800 }; st.players[1].stocks['上海'] = 1; st.stocks['上海'].holders.p1 = 1; });
  const d = choose(s); assert.equal(d.action.accept, true); dispatch(s, d); s.close();
  const s2 = market(st => { st.stocks['上海'].dividendFund = 40000; stocks.refreshPrice(st, '上海', '夹具'); });
  assert.ok(revised.estimate(s2.view('p0'), '上海').margin < 0); s2.close();
});
test('候选39/40/79/80真实起点支付与文本同值，保留机遇与股息', () => {
  const candidate = compile();
  for (const completed of [39, 40, 79, 80]) {
    const state = fixture(); state.roundFlow.index = completed + 1; state.phase = 'waiting_roll'; state.players[0].position = 40; state.diceBag = [10];
    own(state, 'p0', '上海'); state.stocks['上海'].dividendFund = 2000; grant(state, 'p0', ['H10']);
    const s = session(state, candidate.apply), before = state.players[0].cash;
    const r = dispatch(s, { action: { type: 'roll_dice' } });
    assert.equal(s.auditSnapshot().players[0].cash, before + amount(completed) + 2000 + 2000);
    assert.ok(r.events.some(e => e.text.includes('跨过/停在起点，获得 ' + amount(completed)))); s.close();
  }
  const state = fixture(); state.roundFlow.index = 81; state.phase = 'waiting_roll'; state.players[0].position = 40; state.diceBag = [10];
  const old = session(state, original.apply); dispatch(old, { action: { type: 'roll_dice' } }); assert.equal(old.auditSnapshot().players[0].cash, state.players[0].cash + 10000); old.close();
});
test('已用窗口额度不重置，城主四股满额不继续买本人股', () => {
  const s = market(st => { for (const id of ['上海', '东京', '悉尼']) st.stocks[id].rentHistory = [6000, 6000, 6000]; st.stockWindow.boughtTotal = 6; st.stockWindow.boughtByCity = { 上海: 2, 东京: 2, 悉尼: 2 }; });
  const d = choose(s); assert.equal(d.action.type, 'stock_done'); dispatch(s, d); s.close();
  const owned = market(st => { own(st, 'p0', '上海'); st.stocks['上海'].holders.p0 = 4; st.players[0].stocks['上海'] = 4; st.stocks['上海'].rentHistory = [30000, 30000, 30000]; });
  assert.equal(choose(owned).action.type, 'stock_done'); owned.close();
});
test('候选不改旧v1起点奖励；新策略不修改输入或非股票决策', () => {
  const st = fixture(); st.ruleVersion = 1; st.phase = 'waiting_roll'; st.players[0].position = 40; st.roundFlow.index = 121; st.diceBag = [10];
  const before = st.players[0].cash; compile().apply(st, { type: 'roll_dice' }, createTrackedRng(21), { actorId: 'p0' }); assert.equal(st.players[0].cash, before + 10000);
  const s = session(fixture()); const v = s.view('p0'), copy = globalThis.structuredClone(v);
  assert.deepEqual(revised.decide(v, config, {}, createTrackedRng(21)), base.decide(v, config, {}, createTrackedRng(21))); assert.deepEqual(v, copy); s.close();
});
