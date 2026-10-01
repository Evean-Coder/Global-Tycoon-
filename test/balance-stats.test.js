'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { temporaryRun } = require('./helpers/balanceFixtures');
const { runBatch } = require('../scripts/balance/batch');
const { openRun } = require('../scripts/balance/storage');
const { createTrackedRng } = require('../scripts/balance/random');
const { aggregate, describe, intervals, evidenceGate, classify, buildVectors, descriptors, bootstrap, usageWarnings } = require('../scripts/balance/stats');
const { buildConfig } = require('../scripts/balance/config');
const rules = buildConfig({ mode: 'formal', output: 'artifacts/gameplay-balance/fixture' }, { hash: 'fixture' }).screeningRules;
const fs = require('node:fs');
const path = require('node:path');
async function evidence(t) {
  const f = temporaryRun(t, { games: 2 });
  const manifest = await runBatch(f.config, f); assert.equal(manifest.status, 'complete');
  const store = openRun(f.config, { ...f, resume: true });
  const schedule = store.read('schedule.json'), results = store.results(schedule);
  return { ...f, manifest, store, schedule, results };
}
test('统计来源：指定来源、唯一结果、版本及计划清单均核对', async t => {
  const f = await evidence(t), options = { schedule: f.schedule, allowDebug: true };
  await assert.rejects(aggregate(f.manifest, f.results, f.config, { schedule: f.schedule }), /debug/);
  const summary = await aggregate(f.manifest, f.results, f.config, options); assert.equal(summary.source, 'debug');
  await assert.rejects(aggregate(f.manifest, [...f.results, f.results[0]], f.config, options), /重复/);
  for (const change of [r => r.source = 'controlled', r => r.policyVersion = 'other', r => r.configHash = 'other', r => r.codeFingerprint.hash = 'other', r => r.observationComplete = false]) {
    const changed = globalThis.structuredClone(f.results); change(changed[0]);
    await assert.rejects(aggregate(f.manifest, changed, f.config, options));
  }
  await assert.rejects(aggregate(f.manifest, f.results.slice(1), f.config, options), /缺少结果/);
});
test('胜率分母：开局、待恢复、自然、截断与异常分开，零自然为null', async t => {
  const f = await evidence(t), summary = await aggregate(f.manifest, f.results, f.config, { schedule: f.schedule, allowDebug: true });
  assert.equal(summary.coverage.started, 2); assert.equal(summary.coverage.censored, 2); assert.equal(summary.coverage.natural, 0);
  assert.equal(summary.experiments[0].seats[0].conditionalWinRate, null); assert.equal(summary.experiments[0].seats[0].allStartWinRate, 0);
  const mixed = globalThis.structuredClone(f.results), manifest = globalThis.structuredClone(f.manifest);
  mixed[0].outcome = 'natural'; mixed[0].winnerId = 'p1'; mixed[0].players[0].alive = false;
  manifest.samples[mixed[1].sampleId].status = 'pending';
  const result = await aggregate(manifest, mixed.slice(0, 1), f.config, { schedule: f.schedule, allowDebug: true });
  assert.equal(result.coverage.started, 2); assert.equal(result.coverage.terminated, 1); assert.equal(result.coverage.pending, 1);
  const seat = result.experiments[0].seats[1]; assert.equal(seat.allStartWinRate, .5); assert.equal(seat.conditionalWinRate, 1); assert.equal(seat.allStartUniformReference, .25);
});
test('描述统计：整数总额、插值分位数、未知与极端流水准确', () => {
  const d = describe([{ value: 10, sampleId: 'a' }, { value: 30, sampleId: 'b' }, { value: 20, sampleId: 'c' }, { value: null, sampleId: 'unknown' }]);
  assert.equal(d.sum, 60); assert.equal(d.mean, 20); assert.equal(d.median, 20); assert.equal(d.p10, 12); assert.equal(d.p90, 28); assert.equal(d.unknown, 1); assert.equal(d.minEvidence, 'a');
  assert.equal(describe([null]).mean, null); assert.throws(() => describe([Number.MAX_SAFE_INTEGER, 1]), /金额/);
});
test('分层比较：首阶段机遇按座位等权，必要分母为零不可计算', () => {
  // Synthetic analytical rows only; no fixture is saved or counted as formal evidence.
  const ds = descriptors('neutral', 2), h = ds.find(d => d.id === 'H1'), vector = new Float64Array(1 + 2 + 12 * 2 * 4);
  const index = require('../src/gameplayCatalog').OPPORTUNITIES.findIndex(o => o.id === 'H1'), off = 3 + index * 8;
  vector.set([10, 8, 100, 20, 100, 30, 10, 7], off);
  assert.ok(Math.abs(h.calculate(vector) - .1) < 1e-12); // ((.8-.2)+(.3-.7))/2
  vector[off + 6] = 0; assert.equal(h.calculate(vector), null);
  assert.equal(ds.filter(d => d.family === 'opportunity').length, 12);
  assert.equal(descriptors('cross', 4, ['property', 'investment', 'aviation', 'cautious']).length, 6);
});
test('整组重采样：同组全部排列和玩家保留依赖，同种子完全复现', async () => {
  const specs = [], results = [];
  for (let g = 0; g < 4; g++) for (let permutation = 0; permutation < 2; permutation++) {
    const sampleId = `s${g}-${permutation}`, policies = permutation ? ['investment', 'property'] : ['property', 'investment'];
    specs.push({ sampleId, groupId: 'g' + g, players: 2, roster: ['property', 'investment'] });
    const winnerPolicy = g < 2 ? 'property' : 'investment', winnerSeat = policies.indexOf(winnerPolicy);
    results.push({ sampleId, groupId: 'g' + g, outcome: 'natural', winnerId: `p${winnerSeat}`, players: policies.map((policy, seat) => ({ id: `p${seat}`, policy, seat })) });
  }
  const vectors = buildVectors(specs, results, 'cross', 2), ds = descriptors('cross', 2, ['property', 'investment']);
  assert.equal(vectors.groups.length, 4); assert.equal(vectors.groups.every(g => g.vector[0] === 2), true);
  assert.equal(ds[0].calculate(vectors.sum), 0);
  const options = { draws: 1000, familySizes: { policy: 24 }, validMin: .99 };
  const a = await bootstrap(vectors.groups, ds, { ...options, rng: createTrackedRng(22) });
  const b = await bootstrap(vectors.groups, ds, { ...options, rng: createTrackedRng(22) });
  assert.deepEqual(a, b); assert.equal(a[0].stable, true); assert.equal(a[0].familySize, 24); assert.ok(a[0].ordinary[0] < 0 && a[0].ordinary[1] > 0);
});
test('比较区间：预定9/24/36族不减少，低有效率和退化明确不稳定', () => {
  for (const family of [9, 24, 36]) {
    const interval = intervals(Array.from({ length: 1000 }, (_, i) => i / 1000), 1000, family);
    assert.equal(interval.adjustedTail, .05 / (2 * family)); assert.equal(interval.stable, true);
    assert.ok(interval.adjusted[0] < interval.ordinary[0]);
  }
  assert.equal(intervals([0, 1], 1000, 9).reason, 'insufficient_valid_draws');
  assert.equal(intervals([0, 0, 0], 3, 9).reason, 'degenerate_distribution');
  assert.equal(intervals([], 50000, 36).ordinary, null);
});
test('比较区间：实际50000次整组重采样保留全部固定族与有效次数', async () => {
  const groups = [0, 0, 1, 1].map((value, index) => ({ id: 'g' + index, vector: new Float64Array([1, value]) }));
  const comparisons = ['seat', 'policy', 'opportunity'].map(family => ({ family, id: family, calculate: v => v[1] / v[0] - .5 }));
  const values = await bootstrap(groups, comparisons, { draws: 50000, rng: createTrackedRng(0x5b1a2026), familySizes: { seat: 9, policy: 24, opportunity: 36 } });
  assert.equal(values.every(v => v.draws === 50000 && v.completedDraws === 50000 && v.validDraws === 50000 && v.stable), true);
  assert.deepEqual(values.map(v => v.familySize), [9, 24, 36]);
});
test('证据门槛：完整计划、自然数量、每座位两侧与独立组均必须满足', () => {
  const c = { planned: 600, terminated: 600, natural: 480, completionRate: .8, error: 0, completeGroups: 600 };
  assert.equal(evidenceGate('seat', c, rules).adequate, true);
  assert.equal(evidenceGate('seat', { ...c, terminated: 599 }, rules).adequate, false);
  assert.equal(evidenceGate('policy', { ...c, completeGroups: 29 }, rules).adequate, false);
  const detail = { selected: 100, nonselected: 100, selectedGroups: 80, nonselectedGroups: 80, seats: [{ selected: 10, nonselected: 10 }, { selected: 10, nonselected: 10 }] };
  assert.equal(evidenceGate('opportunity', c, rules, detail).adequate, true);
  assert.equal(evidenceGate('opportunity', c, rules, { ...detail, selectedGroups: 79 }).adequate, false);
  assert.equal(evidenceGate('opportunity', c, rules, { ...detail, seats: [{ selected: 9, nonselected: 10 }] }).adequate, false);
});
test('风险分类：幅度和两种区间共同筛查，不足/趋势/未发现不称等强', () => {
  const gate = { adequate: true, reasons: [] }, interval = { stable: true, ordinary: [.01, .1], adjusted: [.001, .11] };
  assert.equal(classify(.05, interval, gate, .05).label, '明显风险');
  assert.equal(classify(.05, { ...interval, adjusted: [-.01, .11] }, gate, .05).label, '观察到趋势');
  assert.equal(classify(.04, interval, gate, .05).label, '本次未发现明显风险');
  assert.match(classify(.1, { ...interval, ordinary: [-.01, .11], adjusted: [-.1, .2] }, gate, .1).explanation, /方向仍不确定/);
  assert.equal(classify(.9, interval, { adequate: false, reasons: ['不足'] }, .05).label, '证据不足');
});
test('风险分类：主动低使用和整局无资格分开，未知不填为零资格', () => {
  const ability = { id: 'H4', selected: 100, statuses: { used: 2, declined: 28, available_unused: 0 } };
  const players = Array.from({ length: 100 }, () => ({ selectedIds: ['H4'], eligibilityCoverage: 'complete-transition-observer', opportunityStatuses: {} }));
  assert.equal(usageWarnings(ability, players, rules).lowUsage, true);
  assert.equal(usageWarnings(ability, players, rules).rarelyEligible, true);
  delete players[0].eligibilityCoverage;
  const unknown = usageWarnings(ability, players, rules); assert.equal(unknown.unknownPlayers, 1); assert.equal(unknown.rarelyEligible, false);
});
test('中文报告：真实保存结果重新汇总，零自然明确不可计算，12项三阶段零样本保留', async t => {
  const f = await evidence(t), { reportRun } = require('../scripts/balance/report');
  const output = await reportRun(f.config.output, f);
  const report = fs.readFileSync(output.report, 'utf8'), summary = JSON.parse(fs.readFileSync(output.summary, 'utf8'));
  assert.match(report, /debug 开发调试/); assert.match(report, /不可计算/); assert.match(report, /没有证明.*等强/);
  assert.equal(summary.coverage.censored, 2); assert.equal(summary.abilities.length, 12); assert.equal(summary.stageOverview.length, 108); assert.equal(summary.combinations.length, 9);
  assert.equal(summary.stageOverview.find(r => r.n === 3 && r.stage === 3 && r.id === 'H12').conditionalWinRate, null);
  assert.equal(f.store.results(f.schedule).length, 2);
});
test('报告证据：已完成审计另存索引，精确流水入口有效，代表类别缺失不制造', async t => {
  const f = await evidence(t), { auditSample } = require('../scripts/balance/batch'), { reportRun } = require('../scripts/balance/report');
  const audit = await auditSample(f.config.output, f.results[0].sampleId, f); assert.equal(audit.ok, true);
  const output = await reportRun(f.config.output, f), index = JSON.parse(fs.readFileSync(output.evidenceIndex, 'utf8'));
  assert.equal(index.samples.length, 2); assert.equal(index.audits.length, 1); assert.equal(index.audits[0].ok, true);
  assert.equal(index.auditSelection.find(r => r.playerCount === 2 && r.outcome === 'natural').sampleId, null);
  for (const item of index.samples) assert.equal(fs.existsSync(path.join(f.store.dir, item.result)), true);
  assert.equal(fs.existsSync(path.join(f.store.dir, index.audits[0].path)), true);
  assert.match(fs.readFileSync(output.report, 'utf8'), /组合证据不足/);
});
