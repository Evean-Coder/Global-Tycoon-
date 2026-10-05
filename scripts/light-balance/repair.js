'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { ROOT, fingerprintSources } = require('../balance/config');
const { OLD_HASH } = require('../review-balance');
const { createMeter, digest, write, lock } = require('./control');
const { catalog, runBranch } = require('./branches');
const { report, compact } = require('./run');

// Narrow correction of transient Windows budget-file replacement failures.
// Preserve all first-attempt files and reuse the same ledger/inputs/seeds.
function repair(output = 'artifacts/gameplay-balance/lightweight-20261003') {
  const dir = path.resolve(ROOT, output), allowed = path.resolve(ROOT, 'artifacts/gameplay-balance');
  if (!dir.startsWith(allowed + path.sep)) throw new Error('修复目录无效');
  const read = file => JSON.parse(fs.readFileSync(path.join(dir, file))), original = read('results.json');
  if (fs.existsSync(path.join(dir, 'repair-completed.json'))) throw new Error('限定修复已完成');
  const retained = fs.existsSync(path.join(dir, 'repair.json')) ? read('repair.json') : null;
  const registration = read('registration.json');
  assert.equal(fingerprintSources().hash, OLD_HASH);
  for (const file of ['scripts/light-balance/cases.js', 'scripts/light-balance/branches.js']) assert.equal(digest(fs.readFileSync(path.join(ROOT, file), 'utf8')), registration.toolHashes[file]);
  const targets = original.pairs.filter(p => !p.complete);
  assert.deepEqual(targets.map(p => p.id), ['build-3', 'flight-3']);
  for (const pair of targets) for (const b of pair.branches.filter(b => b.status === 'error')) assert.match(b.error.message, /EPERM.*rename.*budget\.json/);
  const unlock = lock(dir), meter = createMeter(dir), revised = globalThis.structuredClone(original), records = retained ? retained.records : [];
  try {
    meter.measure('C', guard => {
      for (const target of targets) {
        guard(); const spec = catalog().find(p => p.id === target.id), registered = registration.pairs.find(p => p.id === spec.id);
        assert.equal(digest(spec.state), registered.inputHash); assert.equal(spec.seed, registered.seed); assert.deepEqual(spec.actions, registered.actions);
        const finalPair = globalThis.structuredClone(target), restored = [];
        for (const choice of [0, 1]) {
          const prior = target.branches.find(b => b.choice === choice);
          if (prior && !['error', 'budget-stop'].includes(prior.status)) { restored.push(prior); continue; }
          guard(); const saved = retained?.records.find(r => r.pairId === target.id && r.choice === choice);
          if (retained && !saved) throw new Error('已保存补验不完整，不能偷偷重跑');
          const actual = saved ? saved.actual : runBranch(spec, choice, guard, meter.checkpoint);
          if (!saved) records.push({ pairId: target.id, choice, priorError: prior?.error || null, actual }); restored.push(actual);
          if (['error', 'budget-stop'].includes(actual.status)) break;
        }
        finalPair.branches = restored;
        finalPair.complete = restored.length === 2 && restored.every(b => !['error', 'budget-stop'].includes(b.status));
        finalPair.randomDiverged = restored.length === 2 ? JSON.stringify(restored[0].randomCounts) !== JSON.stringify(restored[1].randomCounts) : null;
        if (restored.length === 2) assert.equal(restored[0].initialHash, restored[1].initialHash);
        revised.pairs[revised.pairs.findIndex(p => p.id === target.id)] = finalPair;
        console.log((retained ? '复用已保存补验 ' : '限定补验 ') + target.id + ' ' + (finalPair.complete ? '完成' : '未完成'));
      }
    });
    meter.measure('D', guard => {
      guard();
      const before = read('protected-before.json');
      const changed = Object.keys(before).filter(f => digest(fs.readFileSync(path.join(ROOT, f), 'utf8')) !== before[f]);
      assert.equal(changed.length, 0); assert.equal(fingerprintSources().hash, OLD_HASH);
      revised.budget = meter.ledger; revised.repair = { scope: '只补Windows预算文件EPERM失败分支，未重跑48案例或其他完整分支；实际增加3条分支尝试，无新名义样本',
        firstCommandExit: 2, originalPairsComplete: 10, toolHashes: Object.fromEntries(['control.js', 'repair.js', 'run.js'].map(f => [f, digest(fs.readFileSync(path.join(__dirname, f), 'utf8'))])),
        attemptedBranches: records.length, originalAttemptedBranches: original.pairs.reduce((n, p) => n + p.branches.length, 0), correctedPairIds: targets.map(p => p.id),
        replacedBranches: records.map(r => ({ pairId: r.pairId, choice: r.choice })),
        reportOnlyRecovery: !!retained, reportFailure: retained ? '原补验成功，重复嵌入流水时触发10MiB上限；复用保存的三条补验，不重复动作，原失败文件保留' : null };
      if (!retained) {
        write(dir, 'repair.json', { ...revised.repair, records });
        write(dir, 'repair-executed.js', fs.readFileSync(__filename, 'utf8'));
        write(dir, 'repair-control-executed.js', fs.readFileSync(path.join(__dirname, 'control.js'), 'utf8'));
      } else write(dir, 'repair-finalizer-executed.js', fs.readFileSync(__filename, 'utf8'));
      write(dir, 'final-results.json', compact(revised)); write(dir, 'final-results.md', report(revised)); meter.checkpoint();
    });
    write(dir, 'repair-completed.json', { ok: revised.pairs.every(p => p.complete), usedMs: meter.total(), budget: meter.ledger,
      uniqueBranchCount: revised.pairs.reduce((n, p) => n + p.branches.length, 0), branchExecutionAttempts: revised.repair.originalAttemptedBranches + records.length, fullGames: 0 });
    console.log(JSON.stringify({ casesPassed: revised.cases.filter(c => c.ok).length, pairsComplete: revised.pairs.filter(p => p.complete).length, uniqueBranches: 24,
      extraAttempts: records.length, usedMs: meter.total(), fullGames: 0 }));
    return revised;
  } finally { meter.save(); unlock(); }
}
if (require.main === module) { try { const r = repair(process.argv[2]); process.exitCode = r.pairs.every(p => p.complete) ? 0 : 2; } catch (e) { console.error(e.stack); process.exitCode = 2; } }
module.exports = { repair };
