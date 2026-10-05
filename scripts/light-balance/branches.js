'use strict';
const assert = require('node:assert/strict');
const { fixture, own, airport, grant, metrics, order } = require('./cases');
const stocks = require('../../src/stocks');
const econ = require('../../src/economy');
const { createSession, assertEconomy } = require('../balance/session');
const { decide } = require('../balance/policy');
const { policyConfigs } = require('../balance/config');
const { hashCanonical, semanticState } = require('../balance/canonical');

function catalog() {
  const pairs = [];
  for (const theme of ['build', 'stock', 'flight', 'H5']) for (let condition = 0; condition < 3; condition++) {
    const id = theme + '-' + (condition + 1), s = fixture();
    s.players[0].cash = theme === 'build' ? [13000, 35000, 100000][condition] : theme === 'flight' ? [5500, 35000, 100000][condition] : [12000, 35000, 100000][condition];
    let first, alternative;
    if (theme === 'build') {
      own(s, 'p0', '上海'); own(s, 'p1', '东京', 4); s.players[0].position = 36;
      s.phase = 'build_decide'; s.pending = { type: 'build', playerId: 'p0', cityId: '上海' };
      first = { type: 'respond_build', decision: 'build', quoteVersion: econ.quoteBuild(s, { playerId: 'p0', cityId: '上海' }).quoteVersion };
      alternative = { type: 'respond_build', decision: 'pass' };
    } else if (theme === 'stock' || theme === 'H5') {
      const cities = theme === 'H5' ? ['上海', '东京', '悉尼'] : ['上海'];
      for (const city of cities) own(s, 'p1', city, theme === 'stock' && condition === 1 ? 2 : 0);
      if (theme === 'stock') {
        s.stocks['上海'].dividendFund = condition === 1 ? 4000 : 2000;
        if (condition === 2) { s.cities['上海'].mortgaged = true; s.players[1].cash = 3000; }
        stocks.refreshPrice(s, '上海', '受控分红');
      } else grant(s, 'p0', ['H5', 'H10']);
      s.phase = 'stock'; s.pending = { type: 'stock', playerId: 'p0', stage: 'end' }; stocks.openStockWindow(s, 'p0');
      first = { type: 'stock_trade', windowId: s.stockWindow.windowId, orders: cities.map(city => order(s, city, 'buy', theme === 'H5' ? 1 : 2)) };
      alternative = { type: 'stock_done' };
    } else {
      own(s, 'p0', '伦敦'); own(s, 'p1', '悉尼', 4); airport(s, 'p1', '伦敦希思罗国际机场');
      s.players[0].position = 6; s.phase = 'flight'; s.pending = { type: 'flight', playerId: 'p0', fromAirportId: '开罗国际机场', free: false };
      grant(s, 'p0', ['H7']);
      if (condition === 1) s.world.active.type = 'aviation';
      if (condition === 2) s.players[0].opportunities.usage.H7 = 1;
      const q = econ.quoteFlight(s, { playerId: 'p0', fromAirportId: '开罗国际机场', target: '伦敦希思罗国际机场' });
      first = { type: 'flight', target: '伦敦希思罗国际机场', quoteVersion: q.quoteVersion }; alternative = { type: 'flight', target: null };
    }
    assertEconomy(s);
    const i = pairs.length;
    pairs.push({ id, theme, condition: ['低现金', '一般现金', theme === 'stock' ? '高现金但抵押/清算风险' : '高现金'][condition],
      state: s, actions: [first, alternative], seed: 20261003 + i * 37,
      policySeeds: { p0: 193000 + i, p1: 203000 + i }, origin: 'synthetic-legal-local-state', reachableFromNormalStart: '未验证' });
  }
  return pairs;
}
function runBranch(pair, choice, guard = () => {}, onCheckpoint = () => {}, limits = { rounds: 10, actions: 160 }) {
  const initial = globalThis.structuredClone(pair.state), startRound = initial.roundFlow.index - 1;
  const spec = { sampleId: pair.id + '-' + choice, source: 'controlled', players: 2,
    engineSeed: pair.seed, policySeedsByPlayer: pair.policySeeds, policiesBySeat: ['neutral', 'neutral'],
    limits: { rounds: startRound + limits.rounds, actions: limits.actions } };
  const session = createSession(spec, { controlledState: initial });
  const memories = { p0: {}, p1: {} }, config = policyConfigs().neutral, trace = [], initialHash = session.initial.stateHash;
  let status = 'bounded', error = null;
  const flows = { systemCashAndFundDelta: 0, stockPrincipalNet: 0, opportunityRewards: 0, rentBankSupplement: 0, goRewards: 0, buildRecovery: 0, flightRecovery: 0 };
  let minCash = initial.players[0].cash;
  try {
    while (session.steps < limits.actions && session.auditSnapshot().roundFlow.index - 1 - startRound < limits.rounds) {
      guard();
      const end = session.finishIfNeeded();
      if (end) { status = end.outcome === 'error' ? 'error' : end.outcome === 'natural' ? 'natural-controlled' : 'bounded'; if (end.error) error = end.error; break; }
      const actorId = session.nextActor(), before = metrics(session.auditSnapshot());
      let decision;
      if (!session.steps) {
        assert.equal(actorId, 'p0'); decision = { action: pair.actions[choice] };
        if (decision.action.type === 'stock_trade') memories.p0 = { lastPhase: 'stock', windowId: initial.stockWindow.windowId,
          directions: Object.fromEntries(decision.action.orders.map(o => [o.cityId, 'buy'])), transferProposed: false };
      } else decision = decide(session.view(actorId), config, memories[actorId], session.policyRng(actorId));
      const result = session.dispatch(actorId, decision);
      if (!result.ok) { status = 'error'; error = { message: result.error, action: result.rawAction }; trace.push(result); break; }
      if (decision.nextMemory) memories[actorId] = decision.nextMemory;
      const after = metrics(session.auditSnapshot());
      const delta = after.cashTotal + after.funds - before.cashTotal - before.funds;
      flows.systemCashAndFundDelta += delta;
      for (const e of result.events) {
        if (e.kind === 'stock_trade' && ['buy', 'sell'].includes(e.side)) flows.stockPrincipalNet += (e.side === 'sell' ? 1 : -1) * e.amount;
        if (e.kind === 'opportunity_reward') flows.opportunityRewards += e.amount;
        if (e.kind === 'city_rent') flows.rentBankSupplement += e.bankSupplement;
        if (e.kind === 'build') flows.buildRecovery += e.finalAmount;
        if (e.kind === 'flight') flows.flightRecovery += e.finalAmount;
        const go = e.text?.match(/跨过\/停在起点，获得 (\d+)/); if (go) flows.goRewards += Number(go[1]);
      }
      minCash = Math.min(minCash, after.players[0].cash);
      trace.push({ step: result.step, actorId, action: result.action, beforeHash: result.beforeHash, stateHash: result.stateHash,
        before: { cash: before.players.map(p => p.cash), funds: before.funds }, after: { cash: after.players.map(p => p.cash), funds: after.funds },
        randomCounts: result.randomCounts, events: result.events });
      onCheckpoint();
    }
  } catch (e) { status = e.stage ? 'budget-stop' : 'error'; error = { message: e.message, stage: e.stage || null }; }
  const final = session.auditSnapshot(), actual = metrics(final), steps = session.steps, randomCounts = session.randomCounts(); session.close();
  const rounds = actual.completeRounds - startRound;
  assert.ok(rounds <= limits.rounds && steps <= limits.actions);
  const totalDelta = actual.cashTotal + actual.funds - metrics(initial).cashTotal - metrics(initial).funds;
  if (status !== 'error') assert.equal(flows.systemCashAndFundDelta, totalDelta);
  const known = flows.stockPrincipalNet + flows.opportunityRewards + flows.rentBankSupplement + flows.goRewards - flows.buildRecovery - flows.flightRecovery;
  flows.otherNetUnclassified = flows.systemCashAndFundDelta - known;
  return { pairId: pair.id, choice, initialHash, origin: pair.origin, reachableFromNormalStart: pair.reachableFromNormalStart,
    status, error, steps, rounds, minCash, initial: metrics(initial), final: actual, randomCounts, flows, trace,
    finalHash: hashCanonical(semanticState(final)), finalState: semanticState(final), winnerClaim: null };
}
function runPair(pair, guard, onCheckpoint, limits) {
  const branches = [];
  for (const choice of [0, 1]) {
    try { guard(); } catch (e) { if (!e.stage) throw e; break; }
    const result = runBranch(pair, choice, guard, onCheckpoint, limits); branches.push(result); if (['error', 'budget-stop'].includes(result.status)) break;
  }
  if (branches.length === 2) assert.equal(branches[0].initialHash, branches[1].initialHash);
  return { id: pair.id, theme: pair.theme, condition: pair.condition, seed: pair.seed, policySeeds: pair.policySeeds,
    initialState: semanticState(pair.state), actions: pair.actions, branches,
    complete: branches.length === 2 && branches.every(b => !['error', 'budget-stop'].includes(b.status)),
    randomDiverged: branches.length === 2 ? JSON.stringify(branches[0].randomCounts) !== JSON.stringify(branches[1].randomCounts) : null,
    scope: '只有首个决定不同，随后同一neutral策略；成对局面不是总体胜率样本，现金与资产差不是胜利' };
}
module.exports = { catalog, runBranch, runPair };
