'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { controlledFixture, ownCity, grant, gameSpec } = require('./helpers/balanceFixtures');
const { createSession } = require('../scripts/balance/session');
const { observeTransition, summarizeObservations } = require('../scripts/balance/observe');
const stocks = require('../src/stocks');
const logic = require('../src/gameLogic');
const { semanticAction } = require('../scripts/balance/canonical');
function session(setup = () => {}, n = 2, die = null) {
  const f = controlledFixture({ players: n, setup(s) { s.phase = 'waiting_roll'; s.opportunityStage.resolved = true; setup(s); } });
  return createSession(gameSpec(n, 'controlled'), { controlledState: f.state, ...(die !== null ? { applyAction(s, action, rng, ctx) { rng.diceBag = [die]; return logic.apply(s, action, rng, ctx); } } : {}) });
}
function dispatch(s, action, reason = {}) {
  const before = s.auditSnapshot(), actor = s.nextActor(), outcome = s.dispatch(actor, { action, reason });
  assert.equal(outcome.ok, true, outcome.error);
  const after = s.auditSnapshot();
  return { before, after, outcome, entries: observeTransition(before, outcome, after, reason) };
}
function settlement(state, run, action = { type: 'controlled_calculation' }) {
  const before = globalThis.structuredClone(state), events = [];
  run(state, events);
  const outcome = { ok: true, source: 'controlled', step: 1, actorId: 'p0', action, events };
  return observeTransition(before, outcome, state);
}
function ownedStock(state, id, owner = 'p1', investor = 'p0', shares = 1) {
  ownCity(state, owner, id);
  state.stocks[id].holders[investor] = shares; state.players.find(p => p.id === investor).stocks[id] = shares;
}
function goPortfolio(state) {
  state.players[0].position = 41;
  ownCity(state, 'p0', '开罗');
  ownedStock(state, '东京'); ownedStock(state, '悉尼');
  state.stocks['开罗'].holders.p0 = 1; state.players[0].stocks['开罗'] = 1;
  state.airports['开罗国际机场'].ownerId = 'p0'; state.players[0].airports = ['开罗国际机场'];
  grant(state, 'p0', ['H5', 'H9', 'H10']);
}

test('观察骨架：来源/步骤/安全金额/结算引用有效，未知差额拒绝', () => {
  const s = session(); const state = s.auditSnapshot();
  const initial = observeTransition(null, { ok: true, source: 'controlled', step: 0, events: [] }, state);
  assert.equal(initial.filter(e => e.type === 'assets').length, 2);
  assert.equal(initial.every(e => e.source === 'controlled' && e.id && e.step === 0), true);
  assert.throws(() => observeTransition(null, { ok: true, source: 'unknown', step: 0 }, state), /来源/);
  const altered = globalThis.structuredClone(state); altered.players[0].cash++;
  assert.throws(() => observeTransition(state, { ok: true, source: 'controlled', step: 1, action: {}, events: [] }, altered), /无法对账/);
  const e = { kind: 'opportunity_reward', settlementId: 'same', playerId: 'p0', opportunityId: 'H12', amount: 1 };
  assert.throws(() => observeTransition(state, { ok: true, source: 'controlled', step: 1, action: {}, events: [e, e] }, altered), /重复结算/);
  assert.throws(() => observeTransition(state, { ok: true, source: 'controlled', step: 1, action: {}, events: [{ ...e, amount: 0.5 }] }, altered), /金额/); s.close();
});
test('观察标识：不同生成局标识的相同观察保持语义一致', () => {
  const s = session();
  const a = s.auditSnapshot(), b = globalThis.structuredClone(a);
  b.gameId = 'recreated-game';
  const outcome = { ok: true, source: 'controlled', step: 0, events: [] };
  const left = observeTransition(null, outcome, a), right = observeTransition(null, outcome, b);
  assert.deepEqual(semanticAction(left, a.gameId), semanticAction(right, b.gameId));
  s.close();
});
test('选择观察：候选、提交、生效和H12奖励分开，三个阶段有资产分层依据', () => {
  for (const ordinal of [1, 2, 3]) {
    const s = session(state => {
      state.phase = 'opportunity_choose'; state.opportunityStage.resolved = false; state.opportunityStage.ordinal = ordinal;
      state.opportunityStage.participants.p0.candidateIds = ['H12', 'H1', 'H2'];
      state.opportunityStage.participants.p1.candidateIds = ['H1', 'H4', 'H5'];
    });
    const state = s.auditSnapshot();
    const initial = observeTransition(null, { ok: true, source: 'controlled', step: 0, events: [] }, state);
    assert.equal(initial.filter(e => e.type === 'choice' && e.kind === 'offer').length, 2);
    const c = s.view('p0').self.choice;
    const first = dispatch(s, { type: 'opportunity_choose', stageId: c.stageId, candidateVersion: c.candidateVersion, opportunityId: 'H12' });
    assert.equal(first.entries.filter(e => e.type === 'opportunity').length, 0);
    assert.equal(first.entries.find(e => e.kind === 'submitted').assets, 150000);
    assert.equal(first.entries.find(e => e.kind === 'submitted').aliveCount, 2);
    const other = s.view('p1').self.choice;
    const second = dispatch(s, { type: 'opportunity_choose', stageId: other.stageId, candidateVersion: other.candidateVersion, opportunityId: 'H1' });
    const summary = summarizeObservations([...initial, ...first.entries, ...second.entries]);
    assert.equal(summary.abilities.H12.offered, 1); assert.equal(summary.abilities.H12.selected, 1);
    assert.equal(summary.abilities.H12.rewards, 6000); assert.equal(summary.choices[0].stage, ordinal); s.close();
  }
});
test('建设机遇观察：H1权限、H2/H3实际叠加与资讯折扣分开', () => {
  const s = session(state => { ownCity(state, 'p0', '上海'); ownCity(state, 'p0', '东京'); grant(state, 'p0', ['H1', 'H2', 'H3']); state.world.active = { type: 'construction' }; });
  const q = s.view('p0').self.quotes.remote['上海'];
  const result = dispatch(s, { type: 'remote_build', cityId: '上海', quoteVersion: q.quoteVersion });
  const summary = summarizeObservations(result.entries);
  assert.equal(summary.abilities.H1.permissions, 1); assert.equal(summary.abilities.H1.rewards, 0);
  assert.equal(summary.abilities.H2.savings, 1200); assert.equal(summary.abilities.H3.savings, 600);
  assert.equal(result.after.players[0].cash, 141600); assert.equal(summary.bankFlow, -8400);
  assert.equal(result.entries.filter(e => e.type === 'economy' && e.primary).flatMap(e => e.effects).find(e => e.id === 'construction').amount, 1800); s.close();
});
test('投资机遇观察：H4只奖励基础股息，H5实际GO，H6优惠不双计银行补足', () => {
  const state = controlledFixture({ setup(s) { ownedStock(s, '上海', 'p1', 'p0', 2); grant(s, 'p0', ['H4']); s.stocks['上海'].dividendFund = 10000; } }).state;
  const entries = settlement(state, (s, ev) => stocks.settleCityDividend(s, '上海', 'go', s.gameId + ':test:dividend', ev));
  const summary = summarizeObservations(entries);
  assert.equal(summary.abilities.H4.rewards, 200); assert.equal(summary.economy.retained_income.cashDelta, 9000);
  const go = session(goPortfolio, 2, 1); const goEntries = dispatch(go, { type: 'roll_dice' }).entries;
  assert.equal(summarizeObservations(goEntries).abilities.H5.rewards, 2000); go.close();
  const rent = session(s => { ownedStock(s, '上海'); grant(s, 'p0', ['H6', 'H11']); s.players[0].position = 35; }, 2, 1);
  const rentSummary = summarizeObservations(dispatch(rent, { type: 'roll_dice' }).entries);
  assert.equal(rentSummary.abilities.H6.savings, 600); assert.equal(rentSummary.bankFlow, 1680);
  assert.equal(rentSummary.abilities.H6.rewards, 0); rent.close();
});
test('航线机遇观察：H7付费优惠，免费不耗；H8只骰子首到，H9邻城GO', () => {
  for (const free of [true, false]) {
    const s = session(state => { state.phase = 'flight'; state.pending = { playerId: 'p0', fromAirportId: '开罗国际机场', free }; state.players[0].position = 6; grant(state, 'p0', ['H7', 'H8']); state.world.active = { type: 'aviation' }; });
    const q = s.view('p0').self.quotes.flight['伦敦希思罗国际机场'];
    const sum = summarizeObservations(dispatch(s, { type: 'flight', target: '伦敦希思罗国际机场', quoteVersion: q.quoteVersion }).entries);
    assert.equal(sum.abilities.H7.savings, free ? 0 : 1000); assert.equal(sum.abilities.H8.triggers, 0); s.close();
  }
  for (const visited of [true, false]) {
    const s = session(state => { grant(state, 'p0', ['H8']); state.players[0].position = 5; if (visited) state.players[0].opportunities.visitedAirportIds = ['开罗国际机场']; }, 2, 1);
    const sum = summarizeObservations(dispatch(s, { type: 'roll_dice' }).entries);
    assert.equal(sum.abilities.H8.rewards, visited ? 0 : 2000); assert.equal(sum.abilities.H8.statuses.exhausted, visited ? 1 : 0); s.close();
  }
  const go = session(goPortfolio, 2, 1);
  assert.equal(summarizeObservations(dispatch(go, { type: 'roll_dice' }).entries).abilities.H9.rewards, 1500); go.close();
});
test('防御机遇观察：H10计抵押城、H11仅正城市租金，H12只统一生效', () => {
  const go = session(state => { state.players[0].position = 41; for (const id of ['上海', '东京', '新加坡']) ownCity(state, 'p0', id); state.cities['上海'].mortgaged = true; grant(state, 'p0', ['H10']); }, 2, 1);
  const summary = summarizeObservations(dispatch(go, { type: 'roll_dice' }).entries);
  assert.equal(summary.abilities.H10.rewards, 0); assert.equal(summary.abilities.H10.statuses.unmet, 1); go.close();
  const airport = session(state => { state.players[0].position = 5; grant(state, 'p0', ['H11']); state.airports['开罗国际机场'].ownerId = 'p1'; state.players[1].airports = ['开罗国际机场']; }, 2, 1);
  const sum = summarizeObservations(dispatch(airport, { type: 'roll_dice' }).entries);
  assert.equal(sum.abilities.H11.triggers, 0); assert.equal(sum.economy.airport_fee.cashDelta, 0); airport.close();
});
test('使用机会：主动放弃有理由，被动不误标，重复机会去重且未知保留', () => {
  const s = session(state => { ownCity(state, 'p0', '上海'); grant(state, 'p0', ['H2']); state.players[0].position = 36; state.phase = 'build_decide'; state.pending = { cityId: '上海', playerId: 'p0' }; });
  const entries = dispatch(s, { type: 'respond_build', decision: 'pass' }, { code: 'build_declined', target: '上海' }).entries;
  assert.equal(entries.find(e => e.type === 'eligibility').status, 'declined');
  const original = entries.find(e => e.type === 'eligibility');
  const extra = { ...original, id: 'read-again', step: 2 };
  const unknown = { ...original, id: 'unknown', eligibilityKey: 'unknown', opportunityId: 'H3', condition: null, quotaAvailable: null, status: 'unknown' };
  const summary = summarizeObservations([...entries, extra, unknown]);
  assert.equal(summary.abilities.H2.statuses.declined, 1); assert.equal(summary.abilities.H3.statuses.unknown, 1); s.close();
});
test('结构化账务：租金/基金/银行完整对账，实际折扣不重复作为现金', () => {
  const s = session(state => { ownedStock(state, '上海'); grant(state, 'p0', ['H6', 'H11']); state.players[0].position = 35; }, 2, 1);
  const { entries } = dispatch(s, { type: 'roll_dice' });
  const summary = summarizeObservations(entries);
  assert.equal(summary.players.p0.cashDelta, -4320); assert.equal(summary.players.p1.cashDelta, 4800);
  assert.equal(summary.economy.city_rent_fund.fundDelta, 1200); assert.equal(summary.bankFlow, 1680);
  assert.equal(summary.abilities.H11.savings, 1080); assert.equal(summary.abilities.H11.rewards, 0); s.close();
});
test('股票账务：买卖、转让、分红、保留、清算与超持现金均可核对', () => {
  const state = controlledFixture({ setup(s) { ownedStock(s, '上海'); s.phase = 'stock'; stocks.openStockWindow(s, 'p0'); } }).state;
  for (const side of ['buy', 'sell']) {
    const entries = settlement(state, (s, ev) => stocks.applyStockTrade(s, stocks.planStockTrade(s, 'p0', s.stockWindow.windowId, [{ cityId: '上海', side, shares: 1, quoteVersion: s.stocks['上海'].quoteVersion, listingEpoch: s.stocks['上海'].listingEpoch }]), ev));
    assert.equal(summarizeObservations(entries).players.p0.cashDelta, side === 'buy' ? -4000 : 4000);
  }
  const transfer = settlement(state, (s, ev) => stocks.applyTransfer(s, stocks.planTransfer(s, 'p0', 'p1', [{ cityId: '上海', shares: 1 }], 3800), ev));
  assert.equal(summarizeObservations(transfer).bankFlow, 0);
  state.stocks['上海'].holders.p0 = 1; state.players[0].stocks['上海'] = 1;
  const cleared = settlement(state, (s, ev) => stocks.clearCityToBank(s, { cityId: '上海' }, ev));
  assert.equal(summarizeObservations(cleared).economy.stock_liquidation.cashDelta, 4000);
  assert.equal(summarizeObservations(cleared).players.p0.economy.stock_liquidation, 2000);
  const cap = controlledFixture({ setup(s) { ownedStock(s, '上海', 'p0', 'p0', 5); } }).state;
  assert.equal(summarizeObservations(settlement(cap, (s, ev) => stocks.enforceOwnerStockCap(s, s.players[0], '上海', ev))).economy.stock_forced_sell.cashDelta, 4000);
});
test('起点机会账务：GO/分红/机遇及奖罚逐笔拆分，未知差额不猜', () => {
  const go = session(state => { goPortfolio(state); grant(state, 'p0', ['H4', 'H5', 'H9', 'H10']); state.stocks['开罗'].dividendFund = 10000; }, 2, 1);
  const summary = summarizeObservations(dispatch(go, { type: 'roll_dice' }).entries);
  assert.equal(summary.economy.go.cashDelta, 10000); assert.equal(summary.abilities.H4.rewards, 100);
  assert.equal(summary.economy.retained_income.cashDelta, 9500); assert.equal(summary.abilities.H10.rewards, 2000); go.close();
  for (const type of ['reward', 'fine']) {
    const s = session(state => { state.players[0].position = 2; state.chanceDeck = [{ type, amount: 4000, name: 'controlled' }]; }, 2, 1);
    assert.equal(summarizeObservations(dispatch(s, { type: 'roll_dice' }).entries).economy['chance_' + type].cashDelta, type === 'reward' ? 4000 : -4000); s.close();
  }
});
test('经营救援账务：购置/抵押/赎回/冻结/监狱/自救股份与拍卖金额正确', () => {
  const mortgage = session(state => { ownCity(state, 'p0', '上海'); });
  assert.equal(summarizeObservations(dispatch(mortgage, { type: 'mortgage', cityId: '上海' }).entries).economy.mortgage.cashDelta, 10000); mortgage.close();
  const redeem = session(state => { ownCity(state, 'p0', '上海'); state.cities['上海'].mortgaged = true; state.cities['上海'].mortgageInterest = 500; state.players[0].position = 36; });
  assert.equal(summarizeObservations(dispatch(redeem, { type: 'redeem', cityId: '上海' }).entries).economy.redeem.cashDelta, -10500); redeem.close();
  const buy = session(state => { state.firstRoundDone = true; state.phase = 'buy'; state.pending = { playerId: 'p0', cityId: '上海' }; });
  assert.equal(summarizeObservations(dispatch(buy, { type: 'buy', decision: 'buy' }).entries).economy.city_purchase.cashDelta, -20000); buy.close();
  const debt = session(state => { ownedStock(state, '上海', 'p1', 'p0', 2); state.players[0].cash = -5000; state.phase = 'self_rescue'; state.pending = { playerId: 'p0', due: 5000 }; });
  assert.equal(summarizeObservations(dispatch(debt, { type: 'rescue_sell_stock', cityId: '上海', shares: 2, quoteVersion: debt.view('p0').stocks['上海'].quoteVersion }).entries).economy.rescue_stock_sell.cashDelta, 8000); debt.close();
  const sale = session(state => { ownCity(state, 'p0', '上海'); state.players[0].cash = -30000; state.phase = 'self_rescue'; state.pending = { playerId: 'p0', kind: 'self_rescue', due: 30000 }; });
  dispatch(sale, { type: 'sell_city', cityId: '上海', mode: 'auction' });
  const auction = summarizeObservations(dispatch(sale, { type: 'auction_respond', decision: 'bid', amount: 15000 }).entries);
  assert.equal(auction.bankFlow, 0); assert.equal(auction.economy.auction_sale.cashDelta, 15000); sale.close();
});
test('回合观察：股票多动作仍同回合，单动作多名关押跳过有独立计数', () => {
  const s = session(state => { state.players[1].jailed = true; state.players[1].position = 11; state.players[2].jailed = true; state.players[2].position = 32; }, 3, 1);
  const summary = summarizeObservations(dispatch(s, { type: 'roll_dice' }).entries);
  assert.equal(summary.completeRounds, 1); assert.equal(summary.players.p0.turns, 1); assert.equal(summary.players.p0.skippedTurns, 0);
  assert.equal(summary.players.p1.skippedTurns, 1); assert.equal(summary.players.p2.skippedTurns, 1); s.close();
  const stock = session(state => { state.phase = 'stock'; state.pending = { playerId: 'p0', after: 'end' }; ownedStock(state, '上海'); stocks.openStockWindow(state, 'p0'); });
  const st = stock.view('p0').stocks['上海'];
  const entries = dispatch(stock, { type: 'stock_trade', windowId: stock.view('p0').self.stockWindow.windowId, orders: [{ cityId: '上海', side: 'buy', shares: 1, quoteVersion: st.quoteVersion, listingEpoch: st.listingEpoch }] }).entries;
  assert.equal(entries.filter(e => e.type === 'progress' && e.kind === 'turn').length, 0); stock.close();
});
test('观察汇总：12项零样本保留，组合和完整现金基线核对，重复记录拒绝', () => {
  const s = session(state => { ownCity(state, 'p0', '上海'); grant(state, 'p0', ['H1', 'H2']); });
  const initial = observeTransition(null, { ok: true, source: 'controlled', step: 0, events: [] }, s.auditSnapshot());
  const q = s.view('p0').self.quotes.remote['上海'];
  const entries = dispatch(s, { type: 'remote_build', cityId: '上海', quoteVersion: q.quoteVersion }).entries;
  const summary = summarizeObservations([...initial, ...entries]);
  assert.equal(Object.keys(summary.abilities).length, 12); assert.equal(summary.abilities.H12.selected, 0);
  assert.equal(summary.combinations.remote_build.length, 1); assert.equal(summary.players.p0.initialAssets.cash + summary.players.p0.cashDelta, summary.players.p0.assets.cash);
  assert.throws(() => summarizeObservations([...entries, entries[0]]), /重复/); s.close();
});
