'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { temporaryRun } = require('./helpers/balanceFixtures');
const { runBatch, auditSample } = require('../scripts/balance/batch');
const { openRun } = require('../scripts/balance/storage');
const { semanticAction } = require('../scripts/balance/canonical');
function saved(f) {
  const store = openRun(f.config, { ...f, resume: true });
  const schedule = store.read('schedule.json');
  return { store, schedule, results: store.results(schedule) };
}
function comparable(result) {
  return { outcome: result.outcome, winnerId: result.winnerId, stateHash: result.stateHash, randomCounts: result.randomCounts, actions: result.actions, completeRounds: result.completeRounds, observations: semanticAction(result.observations, null) };
}
test('自动对局：正常首次选择至批准逻辑上限，完整逐笔记录与结果对账', async t => {
  const f = temporaryRun(t);
  const manifest = await runBatch(f.config, f);
  assert.equal(manifest.status, 'complete', JSON.stringify(manifest));
  assert.equal(manifest.coverage.terminated, 2); assert.equal(manifest.coverage.pending, 0);
  const { store, schedule, results } = saved(f);
  assert.equal(results.length, 2);
  for (const r of results) {
    assert.equal(r.source, 'debug'); assert.equal(r.outcome, 'censored'); assert.equal(r.reason, 'round_limit'); assert.equal(r.winnerId, null);
    const evidence = store.loadEvidence(r.sampleId);
    assert.equal(evidence.records.length, r.actions + 1);
    assert.equal(evidence.records[0].kind, 'initial');
    assert.equal(evidence.records[1].decision.action.type, 'opportunity_choose');
    assert.equal(r.observations.abilities.H12.selected >= 0, true);
    assert.ok(r.observations.players.p0.turns > 0);
  }
  assert.equal(schedule.length, 2);
});
test('续跑场景：落盘后中断，再决策核验恢复，与连续运行结果一致且不重算已结束局', async t => {
  const original = temporaryRun(t), interrupted = temporaryRun(t);
  const continuous = await runBatch(original.config, original); assert.equal(continuous.status, 'complete');
  const paused = await runBatch(interrupted.config, { ...interrupted, stopAfterActions: 5 });
  assert.equal(paused.status, 'paused'); assert.equal(paused.stopReason, 'test_interrupt'); assert.equal(paused.coverage.pending, 1);
  const partial = saved(interrupted), firstId = partial.schedule[0].sampleId;
  assert.equal(partial.store.loadEvidence(firstId).records.length, 6);
  const resumed = await runBatch(interrupted.config, { ...interrupted, resume: true });
  assert.equal(resumed.status, 'complete', JSON.stringify(resumed));
  const completeResults = saved(original).results, resumedResults = saved(interrupted).results;
  for (let i = 0; i < completeResults.length; i++) {
    // Observation raw generated identifiers are compared against each run's own ID.
    const a = completeResults[i], b = resumedResults[i];
    assert.deepEqual(semanticAction(comparable(a), a.gameId), semanticAction(comparable(b), b.gameId));
  }
  const resultFile = path.join(partial.store.dir, `samples/${firstId}/result.json`), content = fs.readFileSync(resultFile, 'utf8');
  const rerun = await runBatch(interrupted.config, { ...interrupted, resume: true }); assert.equal(rerun.coverage.terminated, 2);
  assert.equal(fs.readFileSync(resultFile, 'utf8'), content);
});
test('完整场景：已保存正常开局结果独立审计，原结果保持唯一', async t => {
  const f = temporaryRun(t, { games: 1, players: 4, limits: { rounds: 500, actions: 20000 } });
  const manifest = await runBatch(f.config, f); assert.equal(manifest.status, 'complete');
  const { store, results } = saved(f), id = results[0].sampleId;
  const before = fs.readFileSync(path.join(store.dir, `samples/${id}/result.json`), 'utf8');
  const audit = await auditSample(f.config.output, id, f);
  assert.equal(audit.ok, true, JSON.stringify(audit)); assert.equal(audit.source, 'audit'); assert.ok(['natural', 'censored'].includes(audit.originalOutcome));
  assert.ok(store.loadEvidence(id).records.some(record => record.observations?.some(e => e.type === 'choice' && e.kind === 'submitted' && e.stage >= 2)));
  assert.equal(fs.readFileSync(path.join(store.dir, `samples/${id}/result.json`), 'utf8'), before);
  assert.equal(saved(f).results.length, 1);
  const report = await require('../scripts/balance/report').reportRun(f.config.output, f);
  assert.equal(report.data.coverage.censored + report.data.coverage.natural, 1);
});
test('续跑场景：动作已落盘但检查点原子提交失败，核验完整前缀后补齐并报告', async t => {
  const f = temporaryRun(t, { games: 1 }); let failed = false;
  const store = openRun(f.config, { ...f, beforeRename(temp, file) {
    if (!failed && file.endsWith('checkpoint.json') && JSON.parse(fs.readFileSync(temp, 'utf8')).step === 3) { failed = true; throw new Error('controlled checkpoint interruption'); }
  } });
  const paused = await runBatch(f.config, { ...f, store }); assert.equal(paused.stopReason, 'storage_failure');
  const id = store.read('schedule.json')[0].sampleId;
  assert.equal(store.checkpoint(id).step, 2); assert.equal(store.loadEvidence(id).records.length, 4);
  const resumed = await runBatch(f.config, { ...f, resume: true }); assert.equal(resumed.status, 'complete', JSON.stringify(resumed));
  const report = await require('../scripts/balance/report').reportRun(f.config.output, f);
  assert.equal(report.data.coverage.terminated, 1); assert.equal(report.data.coverage.error, 0);
});
test('命令入口：五种真实入口来源清楚，正式计划首动作前可登记，帮助/非法参数不运行', async t => {
  const f = temporaryRun(t), { main } = require('../scripts/simulate-balance');
  const messages = [], options = { ...f, write: line => messages.push(line) };
  assert.equal((await main(['--help'], options)).exitCode, 0);
  await assert.rejects(main(['--players', '1'], options));
  const debug = await main(['--games', '1', '--players', '2', '--output', 'artifacts/gameplay-balance/cli-debug'], { ...options, stopAfterActions: 5 });
  assert.equal(debug.manifest.source, 'debug'); assert.equal(debug.exitCode, 3);
  const debugStore = openRun(require('../scripts/balance/storage').loadRun('artifacts/gameplay-balance/cli-debug', f).config, { ...f, resume: true });
  const id = debugStore.read('schedule.json')[0].sampleId;
  const audit = await main(['--replay', 'artifacts/gameplay-balance/cli-debug', '--sample', id], options);
  assert.equal(audit.exitCode, 0); assert.equal(audit.audit.source, 'audit');
  const report = await main(['--report', 'artifacts/gameplay-balance/cli-debug'], options);
  assert.equal(report.report.data.coverage.pending, 1); assert.equal(report.report.data.coverage.natural, 0);
  const formal = await main(['--formal', '--output', 'artifacts/gameplay-balance/cli-formal'], { ...options, stopAfterActions: 0 });
  assert.equal(formal.manifest.source, 'formal'); assert.equal(formal.manifest.coverage.planned, 4200); assert.equal(formal.manifest.coverage.started, 0);
  const resumed = await main(['--resume', 'artifacts/gameplay-balance/cli-formal'], { ...options, stopAfterActions: 0 });
  assert.equal(resumed.manifest.coverage.started, 0); assert.equal(resumed.exitCode, 3);
  assert.ok(messages.length > 1);
});
