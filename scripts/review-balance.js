'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { setImmediate } = require('node:timers');
const { ROOT, digest, fingerprintSources } = require('./balance/config');
const { loadRun, openRun, resolveRun, renameAtomic, sizeTree } = require('./balance/storage');
const { openBudget, selectAuditSamples } = require('./balance/batch');
const { replayGame } = require('./balance/replay');
const { aggregate } = require('./balance/stats');
const { renderReport } = require('./balance/report');

const OLD_RUN = 'artifacts/gameplay-balance/formal-corrected-20261001-1790865366064';
const OLD_HASH = '20010be375ec96c6ca77fcf1689b3f6dcd4b9a99e3f048b0c68941e2bbf1bcb4';
const OUTPUT_LIMIT = 2 * 1024 ** 3;
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function atomic(dir, name, data) {
  const file = path.resolve(dir, name);
  if (path.dirname(file) !== path.resolve(dir)) throw new Error('仅允许批次根目录文件');
  const buffer = typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n';
  if (sizeTree(path.join(ROOT, 'artifacts/gameplay-balance')) + Buffer.byteLength(buffer) > OUTPUT_LIMIT) throw new Error('验证证据容量上限');
  const temp = file + '.partial-' + crypto.randomUUID();
  const fd = fs.openSync(temp, 'wx');
  try { fs.writeFileSync(fd, buffer); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  renameAtomic(temp, file);
}

function prepare(output, stage, limitMs) {
  const dir = resolveRun(output);
  if (fs.existsSync(path.join(dir, 'completed.json'))) throw new Error('阶段已完成，禁止覆盖');
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, 'controller.lock');
  if (fs.existsSync(lock)) {
    const owner = JSON.parse(fs.readFileSync(lock));
    let alive = true;
    try { process.kill(owner.pid, 0); } catch (error) { if (error.code !== 'ESRCH') throw error; alive = false; }
    if (alive) throw new Error('同一阶段正在运行');
    fs.unlinkSync(lock);
  }
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' });
  const registration = { stage, output, runId: path.basename(dir), source: 'review', limits: { computeMs: limitMs }, version: 'review-20261002', controllerHash: sha(__filename) };
  registration.configHash = digest(registration);
  if (fs.existsSync(path.join(dir, 'registration.json'))) {
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'registration.json')));
    if (saved.configHash !== registration.configHash) { fs.unlinkSync(lock); throw new Error('阶段控制器或登记不同，禁止混合恢复'); }
  } else atomic(dir, 'registration.json', registration);
  const budget = openBudget(registration);
  return { dir, registration, budget, close() { budget.close(); if (fs.existsSync(lock)) fs.unlinkSync(lock); } };
}

// Charge library work normally, then charge only orchestration time not already
// accounted by that library. A continuous phase has an automatic wall-time guard.
function phaseBudget(base, capMs) {
  const token = base.beginWork(), initial = base.snapshot();
  const start = performance.now(), initialCompute = base.computeMs;
  let finished = false;
  const meter = {
    beginWork: base.beginWork, endWork: base.endWork, flush: base.flush,
    get computeMs() { return base.computeMs; }, get runComputeMs() { return base.runComputeMs; },
    exhausted: () => base.exhausted() || base.computeMs - initialCompute >= capMs || performance.now() - start >= capMs,
    snapshot: base.snapshot, close() { base.flush(); },
    finish() {
      if (finished) return; finished = true;
      const after = base.snapshot(), id = Object.keys(after.runs)[0];
      token.wall += base.computeMs - initialCompute;
      token.cpu += after.runs[id].cpuMs - (initial.runs[id]?.cpuMs || 0);
      base.endWork(token); base.flush();
      return { computeMs: base.computeMs - initialCompute, wallMs: performance.now() - start, capMs };
    },
  };
  return meter;
}

function protect(loaded) {
  const files = ['config.json', 'schedule.json', 'manifest.json', 'report.md', 'summary.json', 'evidence-index.json'].map(f => path.join(loaded.dir, f));
  files.push(path.join(ROOT, 'artifacts/gameplay-balance/formal-budget.json'));
  for (const spec of loaded.schedule) {
    const file = path.join(loaded.dir, 'samples', spec.sampleId, 'result.json');
    if (fs.existsSync(file)) files.push(file);
  }
  return Object.fromEntries(files.map(file => [path.relative(ROOT, file).replaceAll('\\', '/'), sha(file)]));
}

function verifyProtection(before) {
  const changed = Object.entries(before).filter(([file, hash]) => sha(path.join(ROOT, file)) !== hash).map(([file]) => file);
  if (changed.length) throw new Error('旧证据发生变化：' + changed.join(','));
  if (fingerprintSources().hash !== OLD_HASH) throw new Error('冻结原代码发生变化');
  return { filesChecked: Object.keys(before).length, changed: [], sourceMatch: true };
}

async function auditOne(store, spec, result, config, budget) {
  const evidence = store.loadEvidence(spec.sampleId);
  const check = await replayGame(spec, evidence.records, config, {
    beginWork: budget.beginWork, endWork: budget.endWork, shouldPause: budget.exhausted,
    onRecord: async i => { if (i % 32 === 0) { budget.flush(); await new Promise(resolve => setImmediate(resolve)); } },
  });
  const rebuilt = check.ok ? check.context.session.finishIfNeeded() : null;
  if (check.ok && (!rebuilt || rebuilt.stateHash !== result.stateHash || rebuilt.outcome !== result.outcome || rebuilt.winnerId !== result.winnerId)) {
    check.ok = false; check.error = '终态/胜者/分类不一致';
  }
  check.context?.session.close(); delete check.context;
  const examples = {}, types = new Set();
  for (const record of evidence.records) for (const observation of record.observations || []) {
    if (observation.kind) types.add(observation.kind);
    const kind = [observation.type, observation.kind || observation.opportunityId].filter(Boolean).join(':');
    if (kind && !examples[kind]) examples[kind] = { record: record.outcome?.step || 0, actorId: record.actorId || null, observation };
  }
  return { source: 'audit', ...check, originalOutcome: result.outcome, originalStateHash: result.stateHash, tails: evidence.tails, economics: result.observations?.economy || {}, observationKinds: [...types], examples };
}

async function auditExisting(output = 'artifacts/gameplay-balance/review-a-20261002') {
  const fingerprint = fingerprintSources();
  if (fingerprint.hash !== OLD_HASH) throw new Error('原冻结代码不匹配');
  const loaded = loadRun(OLD_RUN, { fingerprint });
  const store = openRun(loaded.config, { resume: true, fingerprint });
  const before = protect(loaded), results = store.results(loaded.schedule);
  const selection = selectAuditSamples(results);
  const state = prepare(output, 'A', 60 * 60000);
  const audits = [], phases = {};
  atomic(state.dir, 'protected-before.json', before);
  let phase = phaseBudget(state.budget, Math.max(0, 45 * 60000 - state.budget.computeMs));
  try {
    for (const chosen of selection.filter(s => s.sampleId)) {
      if (phase.exhausted()) break;
      console.log('审计开始 ' + chosen.playerCount + '人/' + chosen.outcome + ' ' + chosen.sampleId);
      const file = path.join(state.dir, 'audit-' + chosen.sampleId + '.json');
      let audit;
      if (fs.existsSync(file)) {
        audit = JSON.parse(fs.readFileSync(file));
        if (audit.sampleId !== chosen.sampleId || !audit.ok) throw new Error('已有审计不一致，禁止覆盖');
      } else {
        const spec = loaded.schedule.find(s => s.sampleId === chosen.sampleId);
        audit = await auditOne(store, spec, results.find(r => r.sampleId === chosen.sampleId), loaded.config, phase);
        atomic(state.dir, path.basename(file), audit);
      }
      audits.push({ ...chosen, ok: audit.ok, checkedRecords: audit.checkedRecords, paused: audit.paused || false, path: path.basename(file) });
      console.log('审计' + (audit.ok ? '一致 ' : '未完成 ') + audit.sampleId + ' ' + audit.checkedRecords + '条');
      atomic(state.dir, 'audit-index.json', { selection, audits });
      if (!audit.ok) break;
    }
    phases.audit = phase.finish();
    if (audits.length !== 6 || audits.some(a => !a.ok)) {
      atomic(state.dir, 'paused.json', { reason: audits.some(a => !a.ok && !a.paused) ? 'audit_mismatch' : 'audit_budget', audits, phases });
      return { status: 'paused', audits };
    }
    phase = phaseBudget(state.budget, 15 * 60000);
    let last = 0;
    const summary = await aggregate(loaded.manifest, results, loaded.config, {
      schedule: loaded.schedule, budget: phase,
      onProgress: p => { if (Date.now() - last > 10000) { console.log('重采样当前分层 ' + p.drawsCompleted + '/' + p.drawsPlanned); last = Date.now(); } },
    });
    summary.reviewBudget = { output, limitMs: 60 * 60000, note: '增量审查预算；原正式预算与历史结果保持原样' };
    summary.totalComputeMs = loaded.manifest.totalComputeMs;
    const index = { source: 'formal', analysisSource: 'review', configHash: loaded.config.configHash, auditSelection: selection, audits,
      samples: results.map(r => ({ sampleId: r.sampleId, groupId: r.groupId, outcome: r.outcome, result: path.relative(state.dir, path.join(loaded.dir, 'samples', r.sampleId, 'result.json')).replaceAll('\\', '/') })),
      pending: loaded.schedule.filter(s => loaded.manifest.samples[s.sampleId].status === 'pending').map(s => s.sampleId),
      plannedUnexecuted: loaded.schedule.filter(s => loaded.manifest.samples[s.sampleId].status === 'unstarted').map(s => s.sampleId) };
    // Rendered links point at old read-only evidence; keep both reports intact.
    const report = renderReport(summary, index).replaceAll('(samples/', '(' + path.relative(state.dir, loaded.dir).replaceAll('\\', '/') + '/samples/');
    atomic(state.dir, 'summary.json', summary); atomic(state.dir, 'evidence-index.json', index); atomic(state.dir, 'report.md', report);
    phases.analysis = phase.finish();
    const protection = verifyProtection(before);
    const draws = [...new Set(summary.comparisons.map(c => c.interval.completedDraws))];
    const complete = draws.every(n => n === 50000);
    const final = { status: complete ? 'complete' : 'partial', output, coverage: summary.coverage, audits, phases, draws, protection,
      budget: state.budget.snapshot(), completedAt: new Date().toISOString(), limitations: '旧计划覆盖及样本门槛未变，重采样不增加真实样本。' };
    atomic(state.dir, complete ? 'completed.json' : 'paused.json', final);
    console.log('A阶段 ' + final.status + '；六代表通过；实际次数 ' + draws.join(',') + '；耗时 ' + (state.budget.computeMs / 60000).toFixed(2) + '分钟');
    return final;
  } finally { phase.finish(); state.close(); }
}

if (require.main === module) auditExisting(process.argv[2]).then(result => { process.exitCode = result.status === 'complete' ? 0 : 3; }).catch(error => { console.error(error.stack); process.exitCode = 2; });
module.exports = { auditExisting, auditOne, atomic, prepare, phaseBudget, protect, verifyProtection, OLD_RUN, OLD_HASH, OUTPUT_LIMIT };
