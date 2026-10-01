'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSession } = require('../scripts/balance/session');
const { createTrackedRng } = require('../scripts/balance/random');
const { hashCanonical, semanticState, semanticAction } = require('../scripts/balance/canonical');
const { controlledFixture, ownCity, grant, gameSpec } = require('./helpers/balanceFixtures');
const { createActionClock } = require('../src/actionClock');
const stocks = require('../src/stocks');
const server = require('../server');
// The test worker imports without listening. The room is never registered, its
// record sentinel suppresses production persistence, and every timer is virtual.
test.after(() => server.io.close());
function harness(t, setup = null, n = 3) {
  const spec = gameSpec(n, 'controlled');
  const local = setup ? createSession(spec, { controlledState: controlledFixture({ players: n, setup(state) { state.opportunityStage.resolved = true; state.phase = 'waiting_roll'; setup(state); } }).state }) : createSession(spec);
  const state = local.auditSnapshot(), rng = createTrackedRng(spec.engineSeed);
  for (let i = 0; i < local.initial.randomCounts.engine; i++) rng();
  const clock = createActionClock({ now: () => 0, setTimeout: () => ({}), clearTimeout: () => {} });
  const sockets = state.players.map(p => ({ id: 'parity-' + p.id, emit() {} }));
  const room = { code: 'PARITY_ISOLATED', state, rng, players: state.players.map((p, seat) => ({ id: p.id, socketId: sockets[seat].id, connected: true })), actionClock: clock, gameRecord: { source: 'controlled', noPersistence: true }, events: [], lastEvents: [], eventSeq: 0, lastEventBase: 0, timers: {}, successfulActions: new Map() };
  server.startTimer(room); t.after(() => { clock.clear(); local.close(); });
  function dispatch(action, actor = local.nextActor(), expected = true) {
    const old = hashCanonical(semanticState(room.state));
    const outcome = local.dispatch(actor, { action });
    const receipt = server.runAction(room, sockets[Number(actor.slice(1))], outcome.rawAction);
    assert.equal(outcome.ok, expected, outcome.error); assert.equal(receipt.ok, expected, receipt.error);
    assert.deepEqual(semanticState(room.state), semanticState(local.auditSnapshot()));
    assert.equal(room.rng.calls, local.randomCounts().engine);
    if (expected) {
      assert.equal(receipt.revision, outcome.revision); assert.equal(receipt.decisionId, outcome.decisionId);
      assert.deepEqual(semanticAction(room.lastEvents, room.state.gameId), semanticAction(outcome.events, local.auditSnapshot().gameId));
    } else assert.equal(hashCanonical(semanticState(room.state)), old);
    assert.equal(room.gameRecord.noPersistence, true);
    return outcome;
  }
  return { local, room, dispatch };
}
function stockState(s) {
  s.firstRoundDone = true; ownCity(s, 'p1', '上海');
  s.phase = 'stock'; s.pending = { playerId: 'p0', type: 'stock', after: 'end' }; stocks.openStockWindow(s, 'p0');
}
test('基础对照：正常v2开局、换组、全员三选一、单骰与状态/修订/时钟相同', t => {
  const h = harness(t);
  let v = h.local.view('p0');
  h.dispatch({ type: 'opportunity_reroll', stageId: v.self.choice.stageId, candidateVersion: v.self.choice.candidateVersion });
  while (h.room.state.phase === 'opportunity_choose') {
    const actor = h.local.nextActor(); v = h.local.view(actor);
    h.dispatch({ type: 'opportunity_choose', stageId: v.self.choice.stageId, candidateVersion: v.self.choice.candidateVersion, opportunityId: v.self.choice.candidateIds[0] });
  }
  h.dispatch({ type: 'roll_dice' });
});
test('基础对照：正常买城、买机场、建设报价及现金一致', t => {
  const city = harness(t, s => { s.firstRoundDone = true; s.phase = 'buy'; s.pending = { playerId: 'p0', cityId: '上海' }; }); city.dispatch({ type: 'buy', decision: 'buy' });
  const airport = harness(t, s => { s.firstRoundDone = true; s.phase = 'buy_airport'; s.pending = { playerId: 'p0', airportId: '开罗国际机场' }; }); airport.dispatch({ type: 'buy_airport', decision: 'buy' });
  const build = harness(t, s => { ownCity(s, 'p0', '上海'); s.players[0].position = 36; s.phase = 'build_decide'; s.pending = { playerId: 'p0', cityId: '上海' }; grant(s, 'p0', ['H2']); });
  build.dispatch({ type: 'respond_build', decision: 'build', quoteVersion: build.local.view('p0').self.quotes.build['上海'].quoteVersion });
});
test('经营对照：股票买卖/转让真实目标、报价版本、窗口与资金一致', t => {
  const h = harness(t, stockState);
  let v = h.local.view('p0'), quote = v.stocks['上海'];
  h.dispatch({ type: 'stock_trade', windowId: v.self.stockWindow.windowId, orders: [{ cityId: '上海', side: 'buy', shares: 2, quoteVersion: quote.quoteVersion, listingEpoch: quote.listingEpoch }] });
  v = h.local.view('p0'); quote = v.stocks['上海'];
  h.dispatch({ type: 'stock_trade', windowId: v.self.stockWindow.windowId, orders: [{ cityId: '上海', side: 'sell', shares: 1, quoteVersion: quote.quoteVersion, listingEpoch: quote.listingEpoch }] });
  h.dispatch({ type: 'stock_transfer', windowId: h.local.view('p0').self.stockWindow.windowId, targetId: 'p2', cash: 3800, items: [{ cityId: '上海', shares: 1 }] });
  assert.equal(h.local.nextActor(), 'p2'); h.dispatch({ type: 'stock_transfer', accept: true });
  h.dispatch({ type: 'stock_done' });
});
test('经营对照：远程/航班、竞买真实买家、直接出售与募资/自救相同', t => {
  const remote = harness(t, s => { ownCity(s, 'p0', '上海'); grant(s, 'p0', ['H1', 'H2']); });
  remote.dispatch({ type: 'remote_build', cityId: '上海', quoteVersion: remote.local.view('p0').self.quotes.remote['上海'].quoteVersion });
  const flight = harness(t, s => { s.players[0].position = 6; s.phase = 'flight'; s.pending = { playerId: 'p0', fromAirportId: '开罗国际机场', free: false }; grant(s, 'p0', ['H7']); });
  flight.dispatch({ type: 'flight', target: '伦敦希思罗国际机场', quoteVersion: flight.local.view('p0').self.quotes.flight['伦敦希思罗国际机场'].quoteVersion });
  const auction = harness(t, s => { s.firstRoundDone = true; s.phase = 'buy'; s.pending = { playerId: 'p0', cityId: '上海' }; });
  auction.dispatch({ type: 'buy', decision: 'pass' });
  auction.dispatch({ type: 'auction_respond', decision: 'bid', amount: 15000 });
  const direct = harness(t, s => { ownCity(s, 'p0', '上海'); }); direct.dispatch({ type: 'sell_city', cityId: '上海', mode: 'direct' }); direct.dispatch({ type: 'direct_sale_respond', decision: 'buy' });
  const fund = harness(t, s => { ownCity(s, 'p0', '东京', 4); s.phase = 'buy'; s.pending = { playerId: 'p0', cityId: '上海' }; s.players[0].cash = 15000; });
  fund.dispatch({ type: 'buy_fundraise', decision: 'start' }); fund.dispatch({ type: 'rescue_mortgage', cityId: '东京' }); fund.dispatch({ type: 'buy_fundraise', decision: 'confirm' });
  const rescue = harness(t, s => { ownCity(s, 'p0', '上海'); s.players[0].cash = -5000; s.phase = 'self_rescue'; s.pending = { playerId: 'p0', due: 5000, reason: 'controlled', resume: 'end' }; }); rescue.dispatch({ type: 'rescue_mortgage', cityId: '上海' });
});
test('经营对照：过期/非法/错误身份及经济失败均拒绝，原状态不变', t => {
  for (const action of [{ type: 'roll_dice', gameId: 'stale' }, { type: 'roll_dice', actorRevision: 999 }, { type: 'roll_dice', decisionId: 'stale' }, { type: 'roll_dice', extra: 'ignored' }]) {
    const h = harness(t, () => {}); const expected = action.extra === 'ignored'; h.dispatch(action, 'p0', expected);
  }
  const illegal = harness(t, () => {}); illegal.dispatch({ type: 'buy', decision: 'buy' }, 'p0', false);
  const actor = harness(t, () => {}); actor.dispatch({ type: 'roll_dice' }, 'p1', false);
  const unsafe = harness(t, s => { ownCity(s, 'p0', '上海'); s.players[0].cash = Number.MAX_SAFE_INTEGER; }); unsafe.dispatch({ type: 'mortgage', cityId: '上海' }, 'p0', false);
  const stale = harness(t, stockState), v = stale.local.view('p0'), quote = v.stocks['上海'];
  stale.dispatch({ type: 'stock_trade', windowId: v.self.stockWindow.windowId, orders: [{ cityId: '上海', side: 'buy', shares: 1, quoteVersion: quote.quoteVersion + 1, listingEpoch: quote.listingEpoch }] }, 'p0', false);
});
test('经营对照：受控执行器部分修改后失败，两端副本均未提交', t => {
  const h = harness(t, () => {}), logic = require('../src/gameLogic'), original = logic.apply;
  try {
    logic.apply = state => { state.players[0].cash -= 100; throw new Error('controlled partial failure'); };
    h.dispatch({ type: 'roll_dice' }, 'p0', false);
  } finally { logic.apply = original; }
});
test('经营对照：合法破产至唯一胜者只执行正式终局结算，不写正式records', t => {
  const h = harness(t, s => { s.players[0].cash = -50000; s.phase = 'self_rescue'; s.pending = { playerId: 'p0', due: 50000, reason: 'controlled', resume: 'end' }; }, 2);
  h.dispatch({ type: 'rescue_done' });
  assert.equal(h.local.finishIfNeeded().outcome, 'natural'); assert.equal(h.room.state.winner, 'p1');
});
