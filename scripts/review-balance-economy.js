'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { loadRun, openRun } = require('./balance/storage');
const { openBudget } = require('./balance/batch');
const { safe } = require('../src/economy');
const { atomic, OLD_RUN, verifyProtection } = require('./review-balance');

// Annotate already replayed A evidence, charging its existing incremental
// ledger. This neither resamples nor changes any original result/report.
function annotate() {
  const loaded = loadRun(OLD_RUN), store = openRun(loaded.config, { resume: true });
  const dir = path.resolve('artifacts/gameplay-balance/review-a-20261002');
  const completed = JSON.parse(fs.readFileSync(path.join(dir, 'completed.json')));
  const registration = JSON.parse(fs.readFileSync(path.join(dir, 'registration.json')));
  const budget = openBudget(registration), start = budget.beginWork(), rows = [];
  try {
    if (budget.exhausted()) throw new Error('A增量预算已耗尽');
    for (const selected of completed.audits) {
      if (budget.exhausted()) throw new Error('A增量预算已耗尽');
      const evidence = store.loadEvidence(selected.sampleId), totals = {}, examples = {};
      for (const record of evidence.records) for (const observation of record.observations || []) {
        if (observation.type !== 'economy') continue;
        const kind = observation.kind;
        totals[kind] ||= { cashDelta: 0, cashIn: 0, cashOut: 0, bankFlow: 0, fundDelta: 0, count: 0, bankSupplement: 0 };
        const value = totals[kind];
        for (const k of ['cashDelta', 'bankFlow', 'fundDelta']) value[k] = safe(value[k] + observation[k]);
        value.cashIn = safe(value.cashIn + Math.max(0, observation.cashDelta));
        value.cashOut = safe(value.cashOut + Math.max(0, -observation.cashDelta));
        value.bankSupplement = safe(value.bankSupplement + (observation.bankSupplement || 0)); value.count++;
        examples[kind] ||= { step: observation.step, observationId: observation.id, observation,
          engineEvents: (record.outcome?.events || []).filter(e => e.kind === kind || e.settlementId === observation.settlementRef) };
      }
      const result = JSON.parse(fs.readFileSync(path.join(loaded.dir, 'samples', selected.sampleId, 'result.json')));
      assert.deepEqual(totals, result.observations.economy);
      rows.push({ ...selected, totalsMatch: true, kinds: Object.keys(totals), totals, examples });
    }
    const protection = verifyProtection(JSON.parse(fs.readFileSync(path.join(dir, 'protected-before.json'))));
    atomic(dir, 'economic-evidence.json', { source: 'audit-annotation', originalRun: OLD_RUN,
      annotatorHash: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'), rows, protection,
      note: '每类实际发生经济观察的首笔与结构化事件，逐类汇总完全匹配；未发生类型不伪造。完整流水已有A重放验证。' });
    console.log('六代表逐类账务汇总匹配；分类数 ' + rows.map(r => r.kinds.length).join(','));
  } finally { budget.endWork(start); budget.close(); }
}
if (require.main === module) annotate();
module.exports = { annotate };
