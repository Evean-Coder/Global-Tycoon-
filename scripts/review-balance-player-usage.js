'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./balance/config');
const { loadRun, openRun } = require('./balance/storage');
const { openBudget } = require('./balance/batch');
const { OPPORTUNITIES } = require('../src/gameplayCatalog');
const { atomic, OLD_RUN, OLD_HASH } = require('./review-balance');

function playerUsage(results) {
  const observed = results.filter(r => r.observationComplete && r.observations);
  const players = observed.flatMap(r => Object.entries(r.observations.players).map(([playerId, p]) => ({ ...p, playerId, sampleId: r.sampleId })));
  return OPPORTUNITIES.map(h => {
    const selected = players.filter(p => p.selectedIds.includes(h.id));
    const everUsed = selected.filter(p => (p.opportunityStatuses?.[h.id]?.used || 0) > 0);
    const benefit = selected.filter(p => { const b = p.opportunityBenefits?.[h.id]; return b && (b.permission > 0 || b.reward > 0 || b.saving > 0); });
    return { id: h.id, name: h.name, selectedPlayers: selected.length, everUsedPlayers: everUsed.length,
      everBenefitPlayers: benefit.length, everUsedRate: selected.length ? everUsed.length / selected.length : null,
      unknownPlayers: selected.filter(p => !p.opportunityStatuses?.[h.id] ? p.eligibilityCoverage !== 'complete-transition-observer' : p.opportunityStatuses[h.id].unknown > 0).length,
      evidence: benefit.slice(0, 3).map(p => ({ sampleId: p.sampleId, playerId: p.playerId, benefits: p.opportunityBenefits[h.id] })) };
  });
}

function annotate(output = 'artifacts/gameplay-balance/review-a-20261002', resultOutput = OLD_RUN) {
  const dir = path.resolve(ROOT, output);
  if (!fs.existsSync(path.join(dir, 'completed.json')) || fs.existsSync(path.join(dir, 'controller.lock'))) throw new Error('阶段未结束，不能并发写预算');
  const registration = JSON.parse(fs.readFileSync(path.join(dir, 'registration.json')));
  const budget = openBudget(registration), token = budget.beginWork();
  try {
    if (budget.exhausted()) throw new Error('阶段预算已耗尽');
    const loaded = loadRun(resultOutput);
    if (loaded.config.codeFingerprint.hash !== OLD_HASH) throw new Error('冻结来源不同');
    const store = openRun(loaded.config, { resume: true });
    const results = store.results(loaded.schedule), abilities = playerUsage(results);
    atomic(dir, 'player-level-usage.json', { source: 'player-usage-annotation', resultOutput, configHash: loaded.config.configHash,
      resultCount: results.length, abilities, note: '每位选择者至少一次使用/受益口径；不同人数、路线、阶段混合的描述观察，不是机遇因果强度或真人使用率。与重复资格状态的使用频率分开。' });
    console.log('玩家口径 ' + resultOutput + ' ' + JSON.stringify(abilities.find(h => h.id === 'H1')));
    return abilities;
  } finally { budget.endWork(token); budget.close(); }
}
if (require.main === module) annotate(process.argv[2], process.argv[3]);
module.exports = { playerUsage, annotate };
