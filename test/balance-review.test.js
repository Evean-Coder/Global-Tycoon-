'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { temporaryRun } = require('./helpers/balanceFixtures');
const { newConfig, capacity, calibrationSummary, verifyEntries } = require('../scripts/review-balance-sampling');
const { phaseBudget } = require('../scripts/review-balance');
const { reviewSchedule, reviewAggregate, classify, validate } = require('../scripts/balance-review-stats');
const { buildSchedule } = require('../scripts/balance/schedule');
const { hashConfig } = require('../scripts/balance/config');
const { hashCanonical } = require('../scripts/balance/canonical');
const { runBatch, openBudget } = require('../scripts/balance/batch');
const { openRun } = require('../scripts/balance/storage');
const { playerUsage } = require('../scripts/review-balance-player-usage');
const fingerprint = { hash: 'fixture', commit: null, worktree: '', files: [] };
const copy = v => globalThis.structuredClone(v);

test('初筛冻结300局/180组，三人数各20中性，六配对各20种子双座位', () => {
  const config = newConfig('artifacts/gameplay-balance/fixture', 20, fingerprint), schedule = reviewSchedule(config);
  assert.equal(schedule.length, 300); assert.equal(new Set(schedule.map(s => s.groupId)).size, 180);
  assert.equal(schedule.slice(0, 60).every(s => s.experiment === 'neutral'), true);
  for (const n of [2, 3, 4]) assert.equal(schedule.filter(s => s.players === n && s.experiment === 'neutral').length, 20);
  const cross = schedule.filter(s => s.experiment === 'cross');
  assert.equal(cross.every(s => s.players === 2), true);
  assert.equal(new Set(cross.map(s => s.roster.join(','))).size, 6);
  for (const group of new Set(cross.map(s => s.groupId))) {
    const pair = cross.filter(s => s.groupId === group);
    assert.equal(pair.length, 2); assert.deepEqual(pair[0].policiesBySeat, pair[1].policiesBySeat.slice().reverse());
    assert.equal(pair[0].engineSeed, pair[1].engineSeed);
  }
  const old = { ...config, seedPrefix: 'old-independent-batch' };
  const oldSeeds = new Set(buildSchedule(old).map(s => s.engineSeed));
  assert.equal(schedule.some(s => oldSeeds.has(s.engineSeed)), false);
  verifyEntries(config); config.entryHashes['scripts/review-balance.js'] = 'changed';
  assert.throws(() => verifyEntries(config), /版本改变/);
});

test('校准预测只取实测最大成本，预算收缩完整组，拒绝缺局/零成本', () => {
  const rows = [2, 3, 4].flatMap(n => [1, 2, 3, 4].map(k => ({ n, computeMs: 1000 * k })));
  assert.equal(capacity(rows).games, 300);
  const reduced = capacity(rows, 60000 + 60000 * 1.25 * 3);
  assert.equal(reduced.seeds, 3); assert.equal(reduced.games, 45); assert.equal(reduced.groups, 27);
  assert.equal(capacity(rows, 60000).games, 0);
  assert.throws(() => capacity(rows.slice(1)), /无效|不足/);
  assert.throws(() => capacity(rows.map(r => ({ ...r, computeMs: 0 }))), /无效/);
  assert.throws(() => capacity(rows, NaN), /无效/);
});

test('校准耗时允许小数毫秒，报表取整且原始记录保留', () => {
  const rows = [2, 3, 4].flatMap(n => [1.1, 2.2, 3.3, 4.4].map(computeMs => ({ n, computeMs, outcome: 'natural' })));
  const result = calibrationSummary(rows);
  assert.equal(result[0].compute.mean, 3.5); assert.equal(result[0].compute.sum, 14);
  assert.equal(result[0].natural, 4); assert.equal(result[0].censored, 0);
  assert.equal(rows[0].computeMs, 1.1); assert.equal(capacity(rows).games, 300);
});

test('预算阶段自动暂停，独立额度可恢复，嵌套计费不重复且不关闭总预算', async t => {
  let base;
  t.after(() => base?.close());
  const f = temporaryRun(t, { games: 1 });
  let clock = 0;
  base = openBudget({ ...f.config, output: 'artifacts/gameplay-balance/meter' }, { root: f.root, cpuNow: () => clock, workNow: () => clock });
  const phase = phaseBudget(base, 1000);
  const endWork = phase.endWork;
  phase.endWork = token => { clock += 1000; return endWork(token); };
  const paused = await runBatch(f.config, { ...f, budget: phase });
  assert.equal(paused.status, 'paused'); assert.equal(paused.coverage.pending, 1);
  assert.equal(phase.exhausted(), true); phase.finish();
  assert.equal(base.computeMs, clock);
  const resumed = phaseBudget(base, 10000);
  const complete = await runBatch(f.config, { ...f, budget: resumed, resume: true });
  assert.equal(complete.status, 'complete'); resumed.finish();
  assert.equal(base.computeMs, clock); assert.equal(base.exhausted(), false);
  const store = openRun(f.config, { ...f, resume: true });
  const result = store.results(store.read('schedule.json'))[0];
  const independent = temporaryRun(t, { games: 1 });
  await runBatch(independent.config, independent);
  const other = openRun(independent.config, { ...independent, resume: true });
  assert.equal(result.stateHash, other.results(other.read('schedule.json'))[0].stateHash);
});

test('容许带判断必须满足证据与区间门槛，跨边界不宣称等效', () => {
  const gate = { adequate: true, reasons: [] }, interval = { stable: true, adjusted: [-.03, .04] };
  assert.equal(classify(.01, interval, gate, .05).label, '容许范围内');
  assert.equal(classify(.1, { stable: true, adjusted: [.06, .14] }, gate, .05).label, '明确偏离');
  assert.equal(classify(.1, { stable: true, adjusted: [-.01, .14] }, gate, .05).label, '值得复核');
  assert.equal(classify(.01, { stable: true, adjusted: [-.1, .14] }, gate, .05).label, '证据不足');
  assert.equal(classify(.01, interval, { adequate: false, reasons: ['样本不足'] }, .05).label, '证据不足');
  assert.equal(classify(null, interval, gate, .05).label, '证据不足');
});

test('玩家机遇口径：反复资格频率不替代每人至少一次真实使用/受益', () => {
  const players = [
    { id: 'a', selectedIds: ['H1'], eligibilityCoverage: 'complete-transition-observer', opportunityStatuses: { H1: { used: 1, available_unused: 999, unknown: 0 } }, opportunityBenefits: { H1: { permission: 1 } } },
    { id: 'b', selectedIds: ['H1'], eligibilityCoverage: 'complete-transition-observer', opportunityStatuses: {}, opportunityBenefits: {} },
    { id: 'c', selectedIds: ['H2'], opportunityStatuses: {}, opportunityBenefits: {} },
  ];
  const rows = [{ sampleId: 'synthetic', observationComplete: true, observations: { players: Object.fromEntries(players.map(p => [p.id, p])) } }, { observationComplete: false }];
  const value = playerUsage(rows).find(h => h.id === 'H1');
  assert.equal(value.selectedPlayers, 2); assert.equal(value.everUsedPlayers, 1);
  assert.equal(value.everBenefitPlayers, 1); assert.equal(value.everUsedRate, .5); assert.equal(value.unknownPlayers, 0);
  assert.equal(value.evidence[0].playerId, 'a');
  assert.equal(playerUsage(rows).find(h => h.id === 'H12').everUsedRate, null);
});

test('阶段墙钟守卫覆盖尚未计入操作台账的持续耗时', async t => {
  let base;
  t.after(() => base?.close());
  const f = temporaryRun(t);
  base = openBudget({ ...f.config, output: 'artifacts/gameplay-balance/meter' }, { root: f.root, cpuNow: () => 0, workNow: () => 0 });
  const phase = phaseBudget(base, 20);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(base.computeMs, 0); assert.equal(base.exhausted(), false);
  assert.equal(phase.exhausted(), true); phase.finish();
});

test('适配统计拒绝重复/异版/漏结果，截断无胜者、缺少类别不补零', async t => {
  // Short debug games are transformed only in memory to exercise validation;
  // these synthetic rows are never written into any formal evidence directory.
  const f = temporaryRun(t, { games: 1 });
  await runBatch(f.config, f);
  const store = openRun(f.config, { ...f, resume: true });
  const original = store.results(store.read('schedule.json'))[0];
  const config = newConfig('artifacts/gameplay-balance/fixture', 1, fingerprint);
  config.screeningRules.bootstrapDraws = 100; config.configHash = hashConfig(config);
  const schedule = reviewSchedule(config), spec = schedule[0];
  const r = { ...copy(original), ...Object.fromEntries(['configHash', 'policyVersion', 'analysisVersion', 'ruleVersion', 'source'].map(k => [k, config[k]])),
    ...Object.fromEntries(['sampleId', 'groupId', 'engineSeed', 'roster', 'policiesBySeat'].map(k => [k, spec[k]])) };
  const manifest = { source: 'formal', configHash: config.configHash, scheduleHash: hashCanonical(schedule), computeMs: 0,
    samples: Object.fromEntries(schedule.map(s => [s.sampleId, { status: s === spec ? 'terminated' : 'unstarted' }])) };
  validate(manifest, [r], config, schedule);
  assert.throws(() => validate(manifest, [r, r], config, schedule), /重复/);
  assert.throws(() => validate(manifest, [], config, schedule), /缺少结果/);
  assert.throws(() => validate(manifest, [{ ...r, source: 'calibration' }], config, schedule), /来源不同/);
  assert.throws(() => validate(manifest, [r], { ...config, seedPrefix: 'changed' }, schedule), /哈希/);
  const summary = await reviewAggregate(manifest, [r], config, { schedule });
  assert.equal(summary.coverage.censored, 1); assert.equal(summary.coverage.natural, 0);
  assert.equal(summary.comparisons.length, 51);
  assert.equal(summary.comparisons.every(c => c.classification.label === '证据不足'), true);
  assert.equal(summary.experiments[0].seats[0].conditionalWinRate, null);
  assert.equal(summary.abilities.length, 12); assert.equal(summary.stageOverview.length, 108);
  assert.equal(summary.personalProgress.natural.turns.mean, null);
  assert.ok(summary.personalProgress.censored.turns.mean > 0);
});
