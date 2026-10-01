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
  const f = temporaryRun(t, { games: 1, players: 4, limits: { rounds: 5, actions: 200 } });
  const manifest = await runBatch(f.config, f); assert.equal(manifest.status, 'complete');
  const { store, results } = saved(f), id = results[0].sampleId;
  const before = fs.readFileSync(path.join(store.dir, `samples/${id}/result.json`), 'utf8');
  const audit = await auditSample(f.config.output, id, f);
  assert.equal(audit.ok, true, JSON.stringify(audit)); assert.equal(audit.source, 'audit'); assert.equal(audit.originalOutcome, 'censored');
  assert.equal(fs.readFileSync(path.join(store.dir, `samples/${id}/result.json`), 'utf8'), before);
  assert.equal(saved(f).results.length, 1);
});
