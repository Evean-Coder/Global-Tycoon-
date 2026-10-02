'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildConfig, hashConfig, fingerprintSources, ROOT } = require('./balance/config');
const { hashCanonical } = require('./balance/canonical');
const { openRun, loadRun } = require('./balance/storage');
const { runBatch, coverage, reconcile, selectAuditSamples } = require('./balance/batch');
const { aggregate, describe } = require('./balance/stats');
const { renderReport } = require('./balance/report');
const { reviewSchedule, reviewAggregate } = require('./balance-review-stats');
const { atomic, prepare, phaseBudget, auditOne, OLD_HASH } = require('./review-balance');

const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(ROOT, file))).digest('hex');
const entries = () => Object.fromEntries(['scripts/review-balance.js', 'scripts/review-balance-sampling.js', 'scripts/balance-review-stats.js'].map(f => [f, hash(f)]));

function requireVersion() {
  const fingerprint = fingerprintSources();
  if (fingerprint.hash !== OLD_HASH) throw new Error('原规则/策略/工具模块变化，禁止混合');
  return fingerprint;
}

function capacity(calibration, availableMs = 90 * 60000) {
  if (!Number.isFinite(availableMs) || availableMs < 0 || calibration.length !== 12 || calibration.some(r => ![2, 3, 4].includes(r.n) || !Number.isFinite(r.computeMs) || r.computeMs <= 0)) throw new Error('校准成本或预算无效');
  const cost = {};
  for (const n of [2, 3, 4]) {
    const rows = calibration.filter(r => r.n === n);
    if (rows.length !== 4) throw new Error('校准局数不足');
    cost[n] = Math.max(...rows.map(r => r.computeMs));
  }
  const perOrdinal = 13 * cost[2] + cost[3] + cost[4];
  const seeds = Math.max(0, Math.min(20, Math.floor(Math.max(0, availableMs - 60000) / (perOrdinal * 1.25))));
  return { seeds, games: 15 * seeds, groups: 9 * seeds, cost, perOrdinal, safetyFactor: 1.25, startupReserveMs: 60000, availableMs,
    method: '每人数4局中最大实测计算时间；两人交叉按两人中性成本估计，乘1.25，预留60秒启动。只是预算预测，实际停止由程序守卫执行。' };
}

async function calibrate(output = 'artifacts/gameplay-balance/review-b-20261002') {
  const fingerprint = requireVersion(), state = prepare(output, 'B', 20 * 60000);
  const phase = phaseBudget(state.budget, Math.max(0, 20 * 60000 - state.budget.computeMs)), rows = [];
  try {
    for (const n of [2, 3, 4]) {
      if (phase.exhausted()) break;
      const data = output + '-n' + n;
      const resume = fs.existsSync(path.resolve(ROOT, data, 'config.json'));
      const config = resume ? loadRun(data, { fingerprint }).config : buildConfig({ mode: 'debug', games: 4, seed: 0x20261002 + n, players: n, output: data }, fingerprint);
      console.log('校准 ' + n + '人，4局');
      const manifest = await runBatch(config, { resume, fingerprint, budget: phase });
      const store = openRun(config, { resume: true, fingerprint }), schedule = store.read('schedule.json'), results = store.results(schedule);
      for (const r of results) rows.push({ n, sampleId: r.sampleId, outcome: r.outcome, actions: r.actions, rounds: r.completeRounds, computeMs: r.computeMs, configHash: r.configHash, output: data });
      const summary = await aggregate(manifest, results, config, { schedule, allowDebug: true, budget: phase });
      atomic(state.dir, 'calibration-n' + n + '.json', { source: 'calibration', configHash: config.configHash, rows: rows.filter(r => r.n === n), summary });
      if (manifest.status !== 'complete' || results.some(r => r.outcome === 'error')) {
        atomic(state.dir, 'paused.json', { status: 'paused', reason: manifest.stopReason, rows });
        return { status: 'paused', rows };
      }
    }
    const measured = phase.finish(), complete = rows.length === 12;
    const final = { status: complete ? 'complete' : 'partial', source: 'calibration', output, rows, measured, entries: entries(),
      byPlayers: [2, 3, 4].map(n => ({ n, count: rows.filter(r => r.n === n).length, natural: rows.filter(r => r.n === n && r.outcome === 'natural').length,
        censored: rows.filter(r => r.n === n && r.outcome === 'censored').length, compute: describe(rows.filter(r => r.n === n).map(r => r.computeMs)) })),
      capacity: complete ? capacity(rows) : null, budget: state.budget.snapshot() };
    atomic(state.dir, complete ? 'completed.json' : 'paused.json', final);
    console.log('B阶段 ' + final.status + '；12校准局 ' + rows.length + '；计算 ' + (state.budget.computeMs / 60000).toFixed(2) + '分钟');
    if (final.capacity) console.log('C预算预测：' + final.capacity.games + '局/' + final.capacity.groups + '独立组');
    return final;
  } finally { phase.finish(); state.close(); }
}

function newConfig(output, seeds, fingerprint) {
  const config = globalThis.structuredClone(buildConfig({ mode: 'formal', output }, fingerprint));
  config.reviewScope = 'neutral-and-two-player-cross';
  config.seedPrefix = 'balance-review-c-20261002';
  config.analysisVersion = 'balance-review-20261002';
  config.limits.computeMs = 120 * 60000;
  config.sampleTargets = { neutralSeeds: seeds, crossSeeds: seeds, games: seeds * 15, groups: seeds * 9 };
  config.entryHashes = entries();
  config.configHash = hashConfig(config);
  return config;
}

function verifyEntries(config) {
  if (hashCanonical(config.entryHashes) !== hashCanonical(entries())) throw new Error('控制器/统计适配版本改变，禁止混合恢复');
}

async function screen(output = 'artifacts/gameplay-balance/review-c-20261002', calibrationOutput = 'artifacts/gameplay-balance/review-b-20261002') {
  const calibration = JSON.parse(fs.readFileSync(path.resolve(ROOT, calibrationOutput, 'completed.json')));
  const sizing = capacity(calibration.rows);
  if (!sizing.seeds) throw new Error('预算内没有完整实验组容量');
  const fingerprint = requireVersion(), state = prepare(output, 'C', 120 * 60000);
  let phase = phaseBudget(state.budget, Math.max(0, 90 * 60000 - state.budget.computeMs));
  try {
    let config, store, schedule, manifest;
    if (fs.existsSync(path.join(state.dir, 'config.json'))) {
      ({ config, schedule, manifest } = loadRun(output, { fingerprint }));
      verifyEntries(config); store = openRun(config, { resume: true, fingerprint });
    } else {
      config = newConfig(output, sizing.seeds, fingerprint);
      schedule = reviewSchedule(config);
      if (schedule.length !== sizing.games || new Set(schedule.map(s => s.groupId)).size !== sizing.groups) throw new Error('冻结矩阵数量不一致');
      manifest = { schemaVersion: 1, source: 'formal', configHash: config.configHash, scheduleHash: hashCanonical(schedule), status: 'running', stopReason: null, computeMs: 0,
        samples: Object.fromEntries(schedule.map(s => [s.sampleId, { status: 'unstarted', attempts: [] }])) };
      manifest.coverage = coverage(manifest, schedule);
      atomic(state.dir, 'scope-registration.json', { sizing, scope: config.reviewScope, configHash: config.configHash, scheduleHash: manifest.scheduleHash, entries: entries(), firstActionNotStarted: true });
      atomic(state.dir, 'config.json', config); atomic(state.dir, 'schedule.json', schedule); atomic(state.dir, 'manifest.json', manifest);
      store = openRun(config, { resume: true, fingerprint });
    }
    let last = 0;
    const samplePhase = { ...phase, get computeMs() { return state.budget.computeMs; }, get runComputeMs() { return state.budget.runComputeMs; },
      exhausted: () => phase.exhausted() || state.budget.computeMs >= 90 * 60000 };
    console.log('C冻结计划 ' + schedule.length + '局/' + sizing.groups + '组；采样额度90分钟，审计分析最多30分钟');
    if (manifest.coverage.terminated !== schedule.length) manifest = await runBatch(config, { fingerprint, budget: samplePhase, store, resume: true,
      onProgress: m => { if (Date.now() - last >= 10000 || m.status === 'paused' || m.status === 'complete') {
        last = Date.now(); console.log('C进度 ' + m.coverage.terminated + '/' + schedule.length + '；待恢复 ' + m.coverage.pending + '；完整组 ' + m.coverage.completeGroups + '；采样计算 ' + (state.budget.computeMs / 60000).toFixed(2) + '分钟');
      } } });
    const sampled = phase.finish();
    const results = store.results(schedule); reconcile(manifest, schedule, results);
    atomic(state.dir, 'sampling-completed.json', { status: manifest.status, stopReason: manifest.stopReason, coverage: manifest.coverage, measured: sampled });
    phase = phaseBudget(state.budget, Math.min(30 * 60000, Math.max(0, 120 * 60000 - state.budget.computeMs)));
    const selection = selectAuditSamples(results), audits = [];
    for (const chosen of selection.filter(s => s.sampleId)) {
      if (phase.exhausted()) break;
      const spec = schedule.find(s => s.sampleId === chosen.sampleId);
      console.log('C代表审计 ' + chosen.playerCount + '/' + chosen.outcome);
      const audit = await auditOne(store, spec, results.find(r => r.sampleId === chosen.sampleId), config, phase);
      atomic(state.dir, 'audit-' + chosen.sampleId + '-' + crypto.randomUUID() + '.json', audit);
      audits.push({ ...chosen, ok: audit.ok, paused: audit.paused || false, checkedRecords: audit.checkedRecords });
      if (!audit.ok) break;
    }
    const summary = await reviewAggregate(manifest, results, config, { schedule, budget: phase,
      onProgress: p => { if (Date.now() - last > 10000) { console.log('C重采样 ' + p.drawsCompleted + '/' + p.drawsPlanned); last = Date.now(); } } });
    summary.reviewBudget = { samplingMs: sampled.computeMs, totalMs: state.budget.computeMs, limitMs: 120 * 60000 };
    summary.totalComputeMs = state.budget.computeMs;
    const index = { source: 'formal', configHash: config.configHash, auditSelection: selection, audits,
      samples: results.map(r => ({ sampleId: r.sampleId, groupId: r.groupId, outcome: r.outcome, result: `samples/${r.sampleId}/result.json`, position: r.position })),
      pending: schedule.filter(s => manifest.samples[s.sampleId].status === 'pending').map(s => s.sampleId),
      plannedUnexecuted: schedule.filter(s => manifest.samples[s.sampleId].status === 'unstarted').map(s => s.sampleId) };
    atomic(state.dir, 'summary.json', summary); atomic(state.dir, 'evidence-index.json', index);
    atomic(state.dir, 'report.md', renderReport(summary, index));
    const analysed = phase.finish(), draws = [...new Set(summary.comparisons.map(c => c.interval.completedDraws))];
    const complete = results.length === schedule.length && !results.some(r => r.outcome === 'error') && audits.length === selection.filter(s => s.sampleId).length && audits.every(a => a.ok) && draws.every(n => n === 50000);
    const final = { status: complete ? 'complete' : 'partial', coverage: summary.coverage, output, sizing, sampled, analysed, audits, draws, entries: entries(), budget: state.budget.snapshot(),
      classification: Object.fromEntries([...new Set(summary.comparisons.map(c => c.classification.label))].map(k => [k, summary.comparisons.filter(c => c.classification.label === k).length])),
      next: '没有登记D确认实验或真人结果；先查看实际线索和局长再设计单项玩法改进。' };
    atomic(state.dir, complete ? 'completed.json' : 'paused.json', final);
    console.log('C阶段 ' + final.status + '；终止 ' + summary.coverage.terminated + '；分析实际次数 ' + draws.join(',') + '；累计 ' + (state.budget.computeMs / 60000).toFixed(2) + '分钟');
    return final;
  } finally { phase.finish(); state.close(); }
}

if (require.main === module) {
  const stage = process.argv[2];
  const promise = stage === 'B' ? calibrate(process.argv[3]) : stage === 'C' ? screen(process.argv[3], process.argv[4]) : Promise.reject(new Error('指定B或C'));
  promise.then(r => { process.exitCode = r.status === 'complete' ? 0 : 3; }).catch(e => { console.error(e.stack); process.exitCode = 2; });
}
module.exports = { calibrate, screen, capacity, newConfig, verifyEntries };
