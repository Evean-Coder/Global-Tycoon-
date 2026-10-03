'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { loadRun, openRun } = require('./balance/storage');
const { hashCanonical } = require('./balance/canonical');
const { hashConfig } = require('./balance/config');
const { openBudget } = require('./balance/batch');
const { reviewSchedule, classify } = require('./balance-review-stats');
const { verifyEntries } = require('./review-balance-sampling');
const { OLD_RUN, OLD_HASH, atomic, verifyProtection } = require('./review-balance');

function verify(output = 'artifacts/gameplay-balance/review-c-20261002') {
  const loaded = loadRun(output), { config, schedule, manifest, dir } = loaded;
  if (fs.existsSync(path.join(dir, 'controller.lock'))) throw new Error('阶段仍在运行');
  const registration = JSON.parse(fs.readFileSync(path.join(dir, 'registration.json')));
  const budget = openBudget(registration), token = budget.beginWork();
  try {
    if (budget.exhausted()) throw new Error('阶段预算已耗尽');
    verifyEntries(config); assert.equal(config.configHash, hashConfig(config));
    assert.equal(config.codeFingerprint.hash, OLD_HASH);
    assert.equal(hashCanonical(reviewSchedule(config)), hashCanonical(schedule));
    const store = openRun(config, { resume: true }), results = store.results(schedule);
    assert.equal(results.length, schedule.length); assert.equal(manifest.coverage.pending, 0); assert.equal(manifest.coverage.unstarted, 0);
    const old = loadRun(OLD_RUN), oldSeeds = new Set(old.schedule.map(s => s.engineSeed));
    assert.equal(schedule.some(s => oldSeeds.has(s.engineSeed)), false);
    const specs = new Map(schedule.map(s => [s.sampleId, s]));
    assert.equal(new Set(results.map(r => r.sampleId)).size, results.length);
    for (const r of results) {
      const spec = specs.get(r.sampleId);
      assert.equal(r.source, 'formal'); assert.notEqual(r.outcome, 'error');
      assert.equal(r.configHash, config.configHash);
      assert.equal(new Set(r.players.map(p => p.seat)).size, spec.players);
      for (const p of r.players) assert.equal(p.policy, spec.policiesBySeat[p.seat]);
      if (r.outcome === 'natural') assert.equal(r.players.filter(p => p.alive).length, 1);
      else { assert.equal(r.winnerId, null); assert.ok(r.completeRounds >= config.limits.rounds || r.actions >= config.limits.actions); }
    }
    const summary = store.read('summary.json'), index = store.read('evidence-index.json');
    assert.equal(summary.comparisons.length, 51); assert.equal(index.samples.length, results.length);
    for (const c of summary.comparisons) {
      assert.equal(c.interval.completedDraws, 50000);
      assert.equal(c.interval.familySize, { seat: 9, policy: 24, opportunity: 36 }[c.family]);
      assert.deepEqual(c.classification, classify(c.effect, c.interval, c.evidence, c.tolerance));
    }
    for (const e of summary.experiments) {
      assert.equal(e.seats.reduce((a, s) => a + s.wins, 0), e.coverage.natural);
      for (const seat of e.seats) assert.equal(seat.conditionalWinRate, e.coverage.natural ? seat.wins / e.coverage.natural : null);
    }
    const auditPaths = [];
    for (const item of index.audits) {
      assert.equal(item.ok, true);
      const names = fs.readdirSync(dir).filter(f => f.startsWith('audit-' + item.sampleId + '-') && f.endsWith('.json'));
      assert.ok(names.length > 0);
      for (const file of names) {
        const a = store.read(file); assert.equal(a.ok, true);
        assert.equal(a.originalStateHash, results.find(r => r.sampleId === item.sampleId).stateHash);
        auditPaths.push({ sampleId: item.sampleId, file, checkedRecords: a.checkedRecords });
      }
    }
    const aDir = path.resolve(dir, '../review-a-20261002');
    const protection = verifyProtection(JSON.parse(fs.readFileSync(path.join(aDir, 'protected-before.json'))));
    const outcome = Object.fromEntries(['natural', 'censored', 'error'].map(k => [k, results.filter(r => r.outcome === k).length]));
    const verified = { ok: true, configHash: config.configHash, scheduleHash: manifest.scheduleHash, outcome,
      actualMatrix: { games: results.length, groups: new Set(schedule.map(s => s.groupId)).size, neutral: schedule.filter(s => s.experiment === 'neutral').length, cross: schedule.filter(s => s.experiment === 'cross').length },
      independentFromOldSeeds: true, versionsAndPlayerSeatsMatch: true, uniqueResults: true, comparisons: 51, drawsEach: 50000,
      auditPaths, oldEvidence: protection, note: '实际数据对账通过，不代表统计证据门槛或真人平衡已满足。' };
    atomic(dir, 'verification.json', verified);
    console.log(JSON.stringify(verified)); return verified;
  } finally { budget.endWork(token); budget.close(); }
}
if (require.main === module) verify(process.argv[2]);
module.exports = { verify };
