'use strict';
const { performance } = require('node:perf_hooks');
const ENTRY = performance.now();
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { compile, SCHEDULE } = require('./candidate');
const { ROOT, fingerprintSources, policyConfigs } = require('../balance/config');
const { createSession } = require('../balance/session');
const { decide } = require('../balance/policy');
const { digest, write } = require('../light-balance/control');
const { semanticState, hashCanonical } = require('../balance/canonical');
const LIMIT = 180000, ROUNDS = 250, ACTIONS = 6000;
function run() {
  const output = 'artifacts/gameplay-balance/remediation-20261005', dir = path.join(ROOT, output);
  if (fs.existsSync(dir)) throw new Error('候选目录已存在，禁止重开或覆盖');
  fs.mkdirSync(dir, { recursive: true });
  const before = fingerprintSources(), candidate = compile(), configs = policyConfigs();
  assert.equal(before.hash, '20010be375ec96c6ca77fcf1689b3f6dcd4b9a99e3f048b0c68941e2bbf1bcb4');
  const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/gameplay-balance/formal-corrected-20261001-1790865366064/summary.json')));
  const schedule = [2026100501, 2026100502, 2026100503].map((seed, i) => ({ id: 'go-' + (i + 1), seed, policies: i === 1 ? ['aviation', 'investment'] : ['investment', 'aviation'] }));
  const ledger = { limitMs: LIMIT, usedMs: 0, closed: false, runs: 1 };
  const saveBudget = () => { ledger.usedMs = performance.now() - ENTRY; write(dir, 'budget.json', ledger); };
  const guard = () => { if (performance.now() - ENTRY >= LIMIT) throw new Error('pilot_budget_stop'); };
  const protection = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/gameplay-balance/lightweight-20261003/protected-before.json')));
  const tools = ['candidate.js', 'investment-policy.js', 'run.js'];
  write(dir, 'registration.json', { source: 'controlled-normal-start-pilot', date: '2026-10-05', output, sourceHash: before.hash,
    schedule, rules: SCHEDULE, limits: { pairs: 3, trajectories: 6, rounds: ROUNDS, actions: ACTIONS, activityMs: LIMIT },
    policy: { version: 'original-balance-v1-20261001', configs }, hashes: Object.fromEntries(tools.map(f => [f, digest(fs.readFileSync(path.join(__dirname, f), 'utf8'))])),
    candidateHash: candidate.candidateHash, originalHash: candidate.originalHash, decision: '至少两组更早自然终局或同轮截断现金池较低；不得原自然→候选截断；胜率仅风险记录' });
  for (const file of tools) write(dir, 'executed-' + file, fs.readFileSync(path.join(__dirname, file), 'utf8'));
  write(dir, 'candidate-engine.js', candidate.source);
  const results = [];
  function trajectory(pair, variant) {
    guard();
    const spec = { source: 'controlled', sampleId: pair.id + '-' + variant, players: 2, engineSeed: pair.seed,
      policiesBySeat: pair.policies, policySeedsByPlayer: { p0: pair.seed + 10, p1: pair.seed + 20 }, limits: { rounds: ROUNDS, actions: ACTIONS } };
    const session = createSession(spec, variant === 'candidate' ? { applyAction: candidate.apply } : {}), initial = session.auditSnapshot();
    const memory = { p0: {}, p1: {} }, go = { count: 0, amount: 0, byStage: {} }, low = { p0: 150000, p1: 150000 }, recent = [];
    let outcome = null, prefix40 = null;
    try {
      for (;;) {
        guard(); outcome = session.finishIfNeeded(); if (outcome) break;
        const state = session.auditSnapshot();
        if (state.roundFlow.index - 1 >= 40 && prefix40 === null) prefix40 = hashCanonical(semanticState(state));
        const actor = session.nextActor(), seat = Number(actor.slice(1));
        const decision = decide(session.view(actor), configs[pair.policies[seat]], memory[actor], session.policyRng(actor));
        const r = session.dispatch(actor, decision); if (!r.ok) throw new Error(r.error); memory[actor] = decision.nextMemory;
        recent.push({ step: r.step, action: r.action, reason: decision.reason }); if (recent.length > 12) recent.shift();
        for (const event of r.events) { const m = event.text?.match(/跨过\/停在起点，获得 (\d+)/); if (m) { const amount = Number(m[1]), stage = state.roundFlow.index - 1 < 40 ? '0-39' : state.roundFlow.index - 1 < 80 ? '40-79' : '80+';
          go.count++; go.amount += amount; go.byStage[stage] ||= { count: 0, amount: 0 }; go.byStage[stage].count++; go.byStage[stage].amount += amount; } }
        const after = session.auditSnapshot(); for (const p of after.players) low[p.id] = Math.min(low[p.id], p.cash);
        if (session.steps % 250 === 0) { saveBudget(); console.log(pair.id + ' ' + variant + ' 轮 ' + (after.roundFlow.index - 1)); }
      }
    } catch (e) { outcome = { outcome: e.message === 'pilot_budget_stop' ? 'budget-stop' : 'error', reason: e.message }; }
    const final = session.auditSnapshot(), ending = outcome || {};
    const pool = s => s.players.reduce((n, p) => n + p.cash, 0) + Object.values(s.stocks).reduce((n, st) => n + st.dividendFund, 0);
    const result = { id: pair.id, variant, source: 'controlled-normal-start-pilot', initialHash: session.initial.stateHash, prefix40, outcome: ending.outcome, reason: ending.reason,
      winnerId: ending.outcome === 'natural' ? ending.winnerId : null, winnerPolicy: ending.outcome === 'natural' ? pair.policies[Number(ending.winnerId.slice(1))] : null,
      completeRounds: final.roundFlow.index - 1, actions: session.steps, initialCashPool: pool(initial), finalCashAndFundPool: pool(final), go, minCash: low,
      players: final.players.map((p, i) => ({ id: p.id, policy: pair.policies[i], alive: p.alive, cash: p.cash, opportunities: p.opportunities.selectedIds })),
      randomCounts: session.randomCounts(), finalHash: hashCanonical(semanticState(final)), recent, winnerClaim: ending.outcome === 'natural' ? 'last-survivor-only' : null };
    session.close(); assert.ok(result.actions <= ACTIONS && result.completeRounds <= ROUNDS); return result;
  }
  try {
    for (const pair of schedule) {
      for (const variant of ['baseline', 'candidate']) {
        if (performance.now() - ENTRY >= LIMIT) break;
        const result = trajectory(pair, variant); results.push(result); write(dir, pair.id + '-' + variant + '.json', result); saveBudget();
        console.log(pair.id + ' ' + variant + ' ' + result.outcome + ' ' + result.completeRounds + '轮 ' + (result.winnerPolicy || '无胜者'));
        if (['error', 'budget-stop'].includes(result.outcome)) break;
      }
      if (results.some(r => ['error', 'budget-stop'].includes(r.outcome))) break;
    }
    const pairs = schedule.map(pair => {
      const a = results.find(r => r.id === pair.id && r.variant === 'baseline'), b = results.find(r => r.id === pair.id && r.variant === 'candidate');
      if (!a || !b) return { id: pair.id, complete: false };
      assert.equal(a.initialHash, b.initialHash); if (a.prefix40 && b.prefix40) assert.equal(a.prefix40, b.prefix40);
      const eligible = ![a, b].some(r => ['error', 'budget-stop'].includes(r.outcome));
      return { id: pair.id, complete: eligible, earlyPrefixMatches: a.prefix40 === b.prefix40,
        earlierFinish: eligible && b.outcome === 'natural' && (a.outcome === 'censored' || b.completeRounds < a.completeRounds),
        lowerPoolAtSameCensor: eligible && a.outcome === 'censored' && b.outcome === 'censored' && a.completeRounds === b.completeRounds && b.finalCashAndFundPool < a.finalCashAndFundPool,
        lostNaturalFinish: a.outcome === 'natural' && b.outcome !== 'natural',
        investmentEarlierLoss: b.outcome === 'natural' && b.winnerPolicy !== 'investment' && (a.outcome !== 'natural' || a.winnerPolicy === 'investment' || b.completeRounds < a.completeRounds),
        baseline: { outcome: a.outcome, rounds: a.completeRounds, pool: a.finalCashAndFundPool, go: a.go.amount, winner: a.winnerPolicy },
        candidate: { outcome: b.outcome, rounds: b.completeRounds, pool: b.finalCashAndFundPool, go: b.go.amount, winner: b.winnerPolicy } };
    });
    const changed = Object.entries(protection).filter(([f, hash]) => digest(fs.readFileSync(path.join(ROOT, f), 'utf8')) !== hash).map(([f]) => f);
    assert.deepEqual(changed, []); assert.equal(fingerprintSources().hash, before.hash);
    const diagnostics = { oldCoverage: old.coverage, bankFlows: Object.fromEntries(Object.entries(old.economy).map(([k, v]) => [k, v.bankFlow])),
      totalBankFlow: Object.values(old.economy).reduce((n, v) => n + v.bankFlow, 0),
      shanghai: { price: 20000, zeroLevelRent: 6000, initialSharePrice: 4000, poolPerRent: 1200, dividendPerSharePerRent: 60, immediateOwnerCash: 4800, unissuedRemainderToOwner: true,
        shareHitPaybackIgnoringExit: 4000 / 60, cityHitPaybackIgnoringSaleAndShares: 20000 / 6000, note: '每次收租触发，不是每轮；本金退出/价差/H5/H6不同，不能直接相加保证收益。' } };
    const summary = { source: 'remediation-candidate', date: '2026-10-05', output, schedule, limits: { milliseconds: LIMIT, rounds: ROUNDS, actions: ACTIONS },
      trajectories: results.length, natural: results.filter(r => r.outcome === 'natural').length, censored: results.filter(r => r.outcome === 'censored').length,
      missing: 6 - results.length, pairs, results, diagnostics, protection: { sourceHash: before.hash, oldProtectedFiles: Object.keys(protection).length, changed },
      candidateDirectionPass: pairs.filter(p => p.complete && (p.earlierFinish || p.lowerPoolAtSameCensor)).length >= 2 && pairs.every(p => p.complete && !p.lostNaturalFinish),
      note: '有限候选，不证明胜率平衡；策略修正未混入起点候选对照，生产未修改。' };
    ledger.closed = true; saveBudget(); summary.budget = { ...ledger }; write(dir, 'results.json', summary);
    fs.writeFileSync(path.join(ROOT, 'docs/economy-remediation/results.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify({ pairs: pairs.length, trajectories: results.length, missing: summary.missing, directionPass: summary.candidateDirectionPass, usedMs: ledger.usedMs }));
    return summary;
  } finally { ledger.closed = true; saveBudget(); }
}
if (require.main === module) { try { const r = run(); process.exitCode = r.missing || r.results.some(x => ['error', 'budget-stop'].includes(x.outcome)) ? 2 : 0; } catch (e) { console.error(e.stack); process.exitCode = 2; } }
module.exports = { run, LIMIT, ROUNDS, ACTIONS };
