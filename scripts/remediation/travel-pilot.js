'use strict';
const { performance } = require('node:perf_hooks');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { gzipSync } = require('node:zlib');
const { ROOT, fingerprintSources, policyConfigs } = require('../balance/config');
const { createSession } = require('../balance/session');
const { hashCanonical, semanticState } = require('../balance/canonical');
const { observeTransition } = require('../balance/observe');
const { createMeter, BudgetStop, digest } = require('../light-balance/control');
const policy = require('./investment-policy'), logic = require('../../src/gameLogic');
const expense = require('../../src/travelExpense'), { assetSummary } = require('../../src/assets');
const LIMIT = 180000, ROUNDS = 250, ACTIONS = 6000;
const SCHEDULE = [
  { id: 'travel-2', seed: 2026100511, policies: ['investment', 'aviation'] },
  { id: 'travel-3', seed: 2026100512, policies: ['property', 'investment', 'aviation'] },
  { id: 'travel-4', seed: 2026100513, policies: ['property', 'investment', 'aviation', 'cautious'] },
];
function coreHash(state) {
  const core = semanticState(state); delete core.economyRevision; delete core.travelExpenseReceipts;
  return hashCanonical(core);
}
// Reuse the frozen money observer without rewriting it: remove only the new
// fee from its post-action cash, then add that explicit bank sink to its rows.
function moneyRows(before, result, after) {
  const b = globalThis.structuredClone(before), adjusted = globalThis.structuredClone(after);
  if (b.pending?.resume?.kind === 'travel_expense') b.pending.resume = false;
  if (b.pending?.context?.resume?.kind === 'travel_expense') b.pending.context.resume = false;
  const fees = result.events.filter(e => e.kind === 'travel_expense');
  for (const e of fees) adjusted.players.find(p => p.id === e.playerId).cash += e.amount;
  const old = observeTransition(b, { ...result, events: result.events.filter(e => e.kind !== 'travel_expense') }, adjusted).filter(e => e.type === 'economy');
  const rows = old.concat(fees.map(e => ({ kind: 'travel_expense', playerId: e.playerId, bankFlow: -e.amount, cashDelta: -e.amount, settlementRef: e.settlementId })));
  const pool = s => s.players.reduce((n, p) => n + p.cash, 0) + Object.values(s.stocks).reduce((n, st) => n + st.dividendFund, 0);
  assert.equal(rows.reduce((n, e) => n + e.bankFlow, 0), pool(after) - pool(before), '真实现金/基金与银行流水必须对账');
  return rows;
}
function evaluate(results) {
  const ids = results.map(r => r.id + ':' + r.variant);
  if (new Set(ids).size !== ids.length || results.length > 6) throw new Error('重复或超额轨迹');
  const pairs = SCHEDULE.map(pair => {
    const a = results.find(r => r.id === pair.id && r.variant === 'baseline'), b = results.find(r => r.id === pair.id && r.variant === 'candidate');
    if (!a || !b) return { id: pair.id, complete: false };
    const complete = [a, b].every(r => ['natural', 'censored'].includes(r.outcome));
    const prefixMatches = a.initialCoreHash === b.initialCoreHash && a.prefixSteps === b.prefixSteps && a.prefixHash === b.prefixHash;
    return { id: pair.id, complete, prefixMatches,
      earlierNatural: complete && b.outcome === 'natural' && (a.outcome === 'censored' || b.completeRounds < a.completeRounds),
      lostNatural: a.outcome === 'natural' && b.outcome !== 'natural',
      investmentEarlierLoss: b.investmentElimination !== null && (a.investmentElimination === null || b.investmentElimination.round < a.investmentElimination.round),
      baseline: { outcome: a.outcome, round: a.completeRounds, winner: a.winnerPolicy },
      candidate: { outcome: b.outcome, round: b.completeRounds, winner: b.winnerPolicy } };
  });
  return { pairs, earlierNaturalPairs: pairs.filter(p => p.earlierNatural).length,
    effectPass: pairs.every(p => p.complete && p.prefixMatches && !p.lostNatural) && pairs.filter(p => p.earlierNatural).length >= 2,
    investmentReviewRequired: pairs.some(p => p.investmentEarlierLoss) };
}
function run() {
  const entry = performance.now(), dir = path.join(ROOT, 'artifacts/gameplay-balance/travel-expense-20261005');
  if (fs.existsSync(dir)) throw new Error('既有批次禁止重开/覆盖；预算中止也不另起同参数批次');
  fs.mkdirSync(dir, { recursive: true });
  const save = (file, data) => fs.writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2) + '\n');
  const meter = createMeter(dir, { caps: { pilot: LIMIT }, limit: LIMIT }); meter.begin('pilot');
  meter.ledger.used.pilot += performance.now() - entry;
  const sources = fingerprintSources(), configs = policyConfigs();
  const registration = { date: '2026-10-05', source: 'controlled-normal-start-pilot', schedule: SCHEDULE,
    limits: { trajectories: 6, rounds: ROUNDS, actions: ACTIONS, activityMs: LIMIT }, sourceHash: sources.hash,
    investmentPolicy: policy.VERSION, configs, economyRevision: expense.REVISION,
    candidateInitialization: '原正常开局会话；首个合法动作执行前加入显式经济修订与空凭据，不影响开局随机流。',
    prefixComparison: '仅排除经济修订/收费凭据；比较初态及跨入第81轮之前的完整动作状态，跨界动作可能自动收费而不计入此前前缀。',
    enableCondition: '至少两组更早自然结束、无原自然变候选截断、完整同前缀、必要回归通过、投资压力复核通过',
    resumePolicy: '本批次中止即保留证据并关闭，不允许重新启动绕过累计预算',
    traceFormat: 'gzip压缩JSONL，逐行动原始理由与事件；不修改旧观察器或旧批次',
    hashes: Object.fromEntries(['scripts/remediation/travel-pilot.js', 'scripts/remediation/investment-policy.js', 'src/travelExpense.js'].map(f => [f, digest(fs.readFileSync(path.join(ROOT, f), 'utf8'))])) };
  save('registration.json', registration);
  for (const file of Object.keys(registration.hashes)) fs.copyFileSync(path.join(ROOT, file), path.join(dir, 'executed-' + path.basename(file)));
  const results = [];
  function trajectory(pair, variant) {
    meter.guard(); const n = pair.policies.length, sampleId = pair.id + '-' + variant;
    const spec = { source: 'controlled', sampleId, players: n, engineSeed: pair.seed, policiesBySeat: pair.policies,
      policySeedsByPlayer: Object.fromEntries(pair.policies.map((_, i) => ['p' + i, pair.seed + (i + 1) * 10])), limits: { rounds: ROUNDS, actions: ACTIONS } };
    let initialized = false;
    const applyAction = (s, a, rng, context) => {
      if (!initialized && variant === 'candidate') { s.economyRevision = expense.REVISION; s.travelExpenseReceipts = {}; }
      initialized = true; return logic.apply(s, a, rng, context);
    };
    const session = createSession(spec, { applyAction }), memory = Object.fromEntries(pair.policies.map((_, i) => ['p' + i, {}]));
    const initial = session.auditSnapshot(), initialCoreHash = coreHash(initial);
    let prefixHash = initialCoreHash, prefixSteps = 0, prefixClosed = false, outcome = null, investmentElimination = null;
    const economy = {}, anchors = [], policies = {}, feeIds = new Set(), trace = [], investorId = 'p' + pair.policies.indexOf('investment');
    const feesByPlayer = Object.fromEntries(pair.policies.map((_, i) => ['p' + i, 0]));
    const describe = s => s.players.map((p, i) => ({ id: p.id, policy: pair.policies[i], alive: p.alive,
      assets: assetSummary(s, p.id), cities: p.cities.slice(), airports: p.airports.slice(), stocks: { ...p.stocks }, opportunities: p.opportunities.selectedIds.slice() }));
    try {
      for (;;) {
        meter.guard(); outcome = session.finishIfNeeded(); if (outcome) break;
        const before = session.auditSnapshot(), actor = session.nextActor(), seat = Number(actor.slice(1));
        const decision = policy.decide(session.view(actor), configs[pair.policies[seat]], memory[actor], session.policyRng(actor));
        const r = session.dispatch(actor, decision); if (!r.ok) throw new Error(r.error); memory[actor] = decision.nextMemory;
        const after = session.auditSnapshot();
        if (!prefixClosed && after.roundFlow.index - 1 < 80) { prefixHash = hashCanonical([prefixHash, coreHash(after)]); prefixSteps++; }
        else prefixClosed = true;
        const rows = moneyRows(before, r, after);
        for (const row of rows) { const item = economy[row.kind] ||= { bankFlow: 0, injected: 0, removed: 0, count: 0 }; item.bankFlow += row.bankFlow; item.injected += Math.max(0, row.bankFlow); item.removed += Math.max(0, -row.bankFlow); item.count++; }
        for (const e of r.events.filter(e => e.kind === 'travel_expense')) {
          assert.equal(feeIds.has(e.playerId + ':' + e.turnId), false, '同回合不得重复收费'); feeIds.add(e.playerId + ':' + e.turnId); feesByPlayer[e.playerId] += e.amount;
        }
        if (before.players.find(p => p.id === investorId).alive && !after.players.find(p => p.id === investorId).alive) {
          investmentElimination = { round: before.roundFlow.index, step: r.step, reason: before.pending?.reason || decision.reason.code,
            assetsBefore: assetSummary(before, investorId), action: r.action, rank: after.rank.slice(), feesPaid: feesByPlayer[investorId] };
        }
        const code = decision.reason.code; policies[actor] ||= {}; policies[actor][code] = (policies[actor][code] || 0) + 1;
        trace.push({ step: r.step, round: before.roundFlow.index, actor, action: r.action, reason: decision.reason,
          events: r.events.filter(e => ['travel_expense', 'bankrupt', 'rescue', 'reward', 'rent', 'buy', 'sale', 'auction'].includes(e.type)),
          cash: after.players.map(p => p.cash), funds: Object.values(after.stocks).reduce((v, st) => v + st.dividendFund, 0) });
        if ([80, 120].some(c => before.roundFlow.index - 1 < c && after.roundFlow.index - 1 >= c)) anchors.push({ completedRounds: after.roundFlow.index - 1, players: describe(after) });
        if (session.steps % 250 === 0) { meter.checkpoint(); console.log(sampleId + ' ' + (after.roundFlow.index - 1) + '轮 / ' + session.steps + '动作'); }
      }
    } catch (e) { outcome = { outcome: e instanceof BudgetStop ? 'budget-stop' : 'error', reason: e.message }; }
    const final = session.auditSnapshot(); session.close(); meter.checkpoint();
    const result = { id: pair.id, variant, ...spec, initialCoreHash, prefixHash, prefixSteps, outcome: outcome.outcome, reason: outcome.reason,
      winnerId: outcome.outcome === 'natural' ? final.winner : null, winnerPolicy: outcome.outcome === 'natural' ? pair.policies[Number(final.winner.slice(1))] : null,
      completeRounds: final.roundFlow.index - 1, actions: session.steps, feesByPlayer, fees: Object.values(feesByPlayer).reduce((a, b) => a + b, 0),
      investmentElimination, economy, policies, anchors, players: describe(final), finalRank: final.rank, finalHash: coreHash(final), randomCounts: session.randomCounts() };
    fs.writeFileSync(path.join(dir, sampleId + '-trace.jsonl.gz'), gzipSync(trace.map(t => JSON.stringify(t)).join('\n') + '\n'));
    save(sampleId + '.json', result); assert.ok(result.actions <= ACTIONS && result.completeRounds <= ROUNDS);
    console.log(sampleId + ' ' + result.outcome + ' ' + result.completeRounds + '轮 ' + (result.winnerPolicy || '无胜者')); return result;
  }
  try {
    for (const pair of SCHEDULE) {
      for (const variant of ['baseline', 'candidate']) {
        meter.guard(); const result = trajectory(pair, variant); results.push(result); save('partial-results.json', results);
        if (['error', 'budget-stop'].includes(result.outcome)) break;
      }
      if (results.some(r => ['error', 'budget-stop'].includes(r.outcome))) break;
    }
  } catch (e) { save('controller-stop.json', { reason: e.message, budgetStop: e instanceof BudgetStop }); }
  finally { meter.end(); meter.ledger.closed = true; meter.save(); }
  const verdict = evaluate(results);
  const summary = { ...registration, trajectories: results.length, natural: results.filter(r => r.outcome === 'natural').length,
    censored: results.filter(r => r.outcome === 'censored').length, missing: 6 - results.length, ...verdict, results, budget: meter.ledger,
    enabled: false, releaseDecision: '待结合必要回归与投资压力审查；工具不自动修改服务器', note: '有限节奏对照，不合并不同人数胜率，不代表总体胜率平衡' };
  save('results.json', summary); console.log(JSON.stringify({ trajectories: results.length, natural: summary.natural, effectPass: verdict.effectPass, investmentReviewRequired: verdict.investmentReviewRequired, usedMs: meter.total() }));
  return summary;
}
if (require.main === module) { try { const result = run(); process.exitCode = result.missing || result.results.some(r => ['error', 'budget-stop'].includes(r.outcome)) ? 2 : 0; } catch (e) { console.error(e.stack); process.exitCode = 2; } }
module.exports = { run, evaluate, coreHash, moneyRows, SCHEDULE, LIMIT, ROUNDS, ACTIONS };
