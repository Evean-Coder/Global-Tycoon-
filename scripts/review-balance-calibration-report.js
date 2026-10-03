'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ROOT, fingerprintSources } = require('./balance/config');
const { openBudget } = require('./balance/batch');
const { loadRun, openRun } = require('./balance/storage');
const { capacity, calibrationSummary } = require('./review-balance-sampling');
const { atomic, OLD_HASH } = require('./review-balance');

// Explicit report-only repair: reuse the twelve completed calibration results
// and original B ledger. No sampling or ledger/config rewrite takes place.
function finalize(output = 'artifacts/gameplay-balance/review-b-20261002') {
  const dir = path.resolve(ROOT, output);
  if (fs.existsSync(path.join(dir, 'completed.json'))) throw new Error('报告已完成');
  if (fs.existsSync(path.join(dir, 'controller.lock'))) throw new Error('B控制器仍在运行');
  const fingerprint = fingerprintSources();
  if (fingerprint.hash !== OLD_HASH) throw new Error('冻结版本不同');
  const registration = JSON.parse(fs.readFileSync(path.join(dir, 'registration.json')));
  const budget = openBudget(registration), token = budget.beginWork();
  let rows;
  try {
    if (budget.exhausted()) throw new Error('原B预算已耗尽');
    rows = [2, 3, 4].flatMap(n => {
      const loaded = loadRun(output + '-n' + n, { fingerprint });
      const store = openRun(loaded.config, { resume: true, fingerprint });
      const results = store.results(loaded.schedule);
      if (loaded.manifest.status !== 'complete' || results.length !== 4 || results.some(r => r.outcome === 'error')) throw new Error('校准未完成');
      return results.map(r => ({ n, sampleId: r.sampleId, outcome: r.outcome, actions: r.actions, rounds: r.completeRounds, computeMs: r.computeMs, configHash: r.configHash, output: output + '-n' + n }));
    });
    const repaired = { status: 'complete', source: 'calibration', output, rows,
      byPlayers: calibrationSummary(rows),
      capacity: capacity(rows), repair: { scope: '仅汇总耗时报表，原始小数耗时保留，描述统计向上取整毫秒；原十二结果不变，不重新采样，继续原B预算',
        originalExit: 2, originalError: '金额超出有效范围', executedControllerHash: registration.controllerHash,
        reportRepairHash: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex') } };
    budget.endWork(token); budget.flush(); repaired.budget = budget.snapshot();
    atomic(dir, 'completed.json', repaired);
    console.log('B报表修复完成；原12局保留；累计计算 ' + (budget.computeMs / 60000).toFixed(2) + '分钟；C冻结容量 ' + repaired.capacity.games + '局/' + repaired.capacity.groups + '组');
    return repaired;
  } finally { budget.close(); }
}
if (require.main === module) finalize(process.argv[2]);
module.exports = { finalize };
