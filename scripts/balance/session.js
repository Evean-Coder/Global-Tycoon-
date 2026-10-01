'use strict';
const { createGameState, resetDeck } = require('../../src/state');
const { snapshot } = require('../../src/gameView');
const { beginOpportunityStage } = require('../../src/opportunities');
const { normalizeAction, resolveActorId, validateEnvelope } = require('../../src/actionValidation');
const { createActionClock } = require('../../src/actionClock');
const logic = require('../../src/gameLogic');
const { safe } = require('../../src/economy');
const { assetSummary } = require('../../src/assets');
const { createTrackedRng } = require('./random');
const { hashCanonical, semanticState } = require('./canonical');

const PHASE_ACTION = {
  waiting_roll: 'roll_dice', frozen_turn: 'respond_frozen', jail_turn: 'respond_jail', build_decide: 'respond_build',
  buy: 'buy', buy_airport: 'buy_airport', buy_fundraise: 'buy_fundraise', stock: 'stock_done',
  flight: 'flight', auction_bid: 'auction_respond', direct_sale_ask: 'direct_sale_respond',
  trade_confirm: 'stock_transfer', self_rescue: 'rescue_done',
};

// Kept in parity with the server guard; no server import/room/record side effect.
function assertEconomy(state) {
  for (const p of state.players) {
    safe(p.cash);
    for (const n of Object.values(p.opportunities.usage)) if (!Number.isSafeInteger(n) || n < 0) throw new Error('机遇额度无效');
  }
  for (const c of Object.values(state.cities)) {
    if (!Number.isSafeInteger(c.houseLevel) || c.houseLevel < 0 || c.houseLevel > 4) throw new Error('房屋等级无效');
    for (const n of c.buildCosts) { safe(n); if (n < 0) throw new Error('建房成本无效'); }
  }
  for (const st of Object.values(state.stocks)) {
    for (const k of ['price', 'operatingPrice', 'dividendFund', 'roundRent']) { safe(st[k]); if (st[k] < 0) throw new Error('股票金额无效'); }
    let total = 0;
    for (const n of Object.values(st.holders)) { if (!Number.isSafeInteger(n) || n < 0) throw new Error('持股无效'); total += n; }
    if (total > 20) throw new Error('持股超过发行量');
  }
}
function stripDecisionMetadata(value) {
  if (Array.isArray(value)) return value.map(stripDecisionMetadata);
  if (!value || typeof value !== 'object') return value;
  const excluded = new Set(['startedAt', 'socketId', 'connected', 'reconnectToken']);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.has(key)).map(([key, v]) => [key, stripDecisionMetadata(v)]));
}

function createSession(gameSpec, options = {}) {
  if (!['formal', 'debug', 'controlled', 'audit'].includes(gameSpec.source) || ![2, 3, 4].includes(gameSpec.players)) throw new Error('对局来源或人数无效');
  if ((options.controlledState || options.applyAction) && gameSpec.source !== 'controlled') throw new Error('仅受控测试可注入状态或执行器');
  const rng = createTrackedRng(gameSpec.engineSeed);
  const policyRngs = Object.fromEntries(Array.from({ length: gameSpec.players }, (_, i) => [`p${i}`, createTrackedRng(gameSpec.policySeedsByPlayer[`p${i}`])]));
  let state;
  if (options.controlledState) state = globalThis.structuredClone(options.controlledState);
  else {
    state = createGameState('BALANCE', gameSpec.policiesBySeat.map((p, i) => `${p}-${i}`), 2);
    resetDeck(state, rng);
    beginOpportunityStage(state, 1, { kind: 'start' }, rng);
  }
  const clock = createActionClock({ now: () => 0, setTimeout: () => ({ virtual: true }), clearTimeout: () => {} });
  clock.sync(state, () => { throw new Error('即时策略不应触发虚拟超时'); });
  let step = 0, failure = null, lastOutcome = null;
  const stateHash = () => hashCanonical(semanticState(state));
  const randomCounts = () => ({ engine: rng.calls, policy: Object.fromEntries(Object.entries(policyRngs).map(([id, r]) => [id, r.calls])) });
  const initial = { stateHash: stateHash(), randomCounts: randomCounts() };

  function nextActor() {
    if (state.phase === 'game_over' || failure) return null;
    if (state.phase === 'opportunity_choose') {
      const stage = state.opportunityStage;
      const id = stage?.participantIds.find(id => state.players.some(p => p.id === id && p.alive) && !stage.participants[id].submitted);
      if (!id) throw new Error('机遇阶段无待提交参与者');
      return id;
    }
    const type = PHASE_ACTION[state.phase];
    if (!type) throw new Error(`未识别阶段：${state.phase}`);
    const id = resolveActorId(state, type);
    if (!state.players.some(p => p.id === id && p.alive)) throw new Error('没有有效行动者');
    return id;
  }

  function markError(error, context = {}) {
    failure ||= { message: error instanceof Error ? error.message : String(error), ...globalThis.structuredClone(context) };
  }
  function dispatch(actorId, decision) {
    const action = decision.action || decision;
    const raw = { gameId: state.gameId, actionId: `balance-${step + 1}`, decisionId: clock.decisionId, actorRevision: state.actorRevision[actorId], ...action };
    const beforePhase = state.phase, beforeRevision = state.revision, beforeHash = stateHash();
    let normalized;
    try {
      if (failure) throw new Error('样本已因工具异常停止');
      if (state.phase === 'game_over') throw new Error('对局已结束');
      const envelope = validateEnvelope(state, raw, actorId, clock);
      if (!envelope.ok) throw new Error(envelope.error);
      normalized = normalizeAction(state, raw, { actorId, source: 'player' });
      if (!normalized.ok) throw new Error(normalized.error);
      if (normalized.actorId !== actorId) throw new Error('还没轮到你行动');
      const candidate = globalThis.structuredClone(state);
      const res = (options.applyAction || logic.apply)(candidate, normalized.action, rng, { actorId, source: 'player' });
      assertEconomy(candidate);
      if (!res || res.rejected) throw new Error('当前状态下无法执行该操作');
      const nextState = res.state || candidate;
      if (JSON.stringify(nextState) === JSON.stringify(state)) throw new Error('操作未产生变化');
      state = nextState; state.revision++; state.actorRevision[actorId]++;
      step++;
      clock.sync(state, () => { throw new Error('即时策略不应触发虚拟超时'); }, ['auction_respond', 'direct_sale_respond'].includes(normalized.action.type));
      lastOutcome = { ok: true, source: gameSpec.source, actorId, step, rawAction: raw, action: normalized.action, beforePhase, afterPhase: state.phase, beforeRevision, revision: state.revision, events: res.events || [], beforeHash, stateHash: stateHash(), randomCounts: randomCounts(), decisionId: clock.decisionId };
    } catch (error) {
      markError(error, { actorId, action: raw });
      lastOutcome = { ok: false, source: gameSpec.source, actorId, step, rawAction: raw, action: normalized?.action || null, beforePhase, afterPhase: state.phase, beforeRevision, revision: state.revision, events: [], error: failure.message, beforeHash, stateHash: stateHash(), randomCounts: randomCounts(), decisionId: clock.decisionId };
    }
    return globalThis.structuredClone(lastOutcome);
  }
  function finishIfNeeded() {
    let outcome, reason;
    const alive = state.players.filter(p => p.alive);
    if (state.phase === 'game_over' && alive.length === 1 && state.winner === alive[0].id) { outcome = 'natural'; reason = 'last_survivor'; }
    else if (failure) { outcome = 'error'; reason = failure.message; }
    else if (state.phase === 'game_over') { outcome = 'error'; reason = '终局缺少唯一存活胜者'; }
    else if (state.roundFlow.index - 1 >= gameSpec.limits.rounds) { outcome = 'censored'; reason = 'round_limit'; }
    else if (step >= gameSpec.limits.actions) { outcome = 'censored'; reason = 'action_limit'; }
    else return null;
    return {
      ...globalThis.structuredClone(gameSpec), attemptId: gameSpec.attemptId || `${gameSpec.sampleId}-a1`,
      playerCount: gameSpec.players,
      outcome, reason, winnerId: outcome === 'natural' ? state.winner : null, phase: state.phase,
      actions: step, completeRounds: state.roundFlow.index - 1, revision: state.revision,
      players: state.players.map((p, seat) => ({ id: p.id, seat, policy: gameSpec.policiesBySeat[seat], alive: p.alive, cash: p.cash, assets: assetSummary(state, p.id), opportunities: globalThis.structuredClone(p.opportunities), lapEpoch: p.opportunities.lapEpoch })),
      rank: state.rank.slice(), finalEvents: state.phase === 'game_over' ? lastOutcome?.events || [] : [],
      stateHash: stateHash(), randomCounts: randomCounts(), error: globalThis.structuredClone(failure),
    };
  }
  return {
    initial, nextActor, dispatch, markError, finishIfNeeded,
    view: id => stripDecisionMetadata(snapshot(state, id, clock.view(state.gameId))),
    auditSnapshot: () => globalThis.structuredClone(state), randomCounts,
    policyRng: id => policyRngs[id], clockView: () => clock.view(state.gameId),
    get steps() { return step; }, close: () => clock.clear(),
  };
}
module.exports = { createSession, assertEconomy, PHASE_ACTION };
