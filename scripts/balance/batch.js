'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildSchedule } = require('./schedule');
const { openRun, loadRun, resolveRun, StorageStop, sizeTree, renameAtomic } = require('./storage');
const { ROOT, hashConfig, fingerprintSources } = require('./config');
const { hashCanonical, semanticAction } = require('./canonical');
const { initialize, advance, checkpointFor, replayGame, verifyCheckpoint, selectAuditSamples } = require('./replay');
const { summarizeObservations } = require('./observe');

const copy = v => globalThis.structuredClone(v);
const yieldLoop = () => new Promise(resolve => require('node:timers').setImmediate(resolve));
// Measure active operations, including synchronous evidence I/O. Waiting between
// operations is excluded. A long low-CPU interruption is recorded separately;
// every production action is far shorter than this suspension detection window.
function openBudget(config, options = {}) {
  const root = options.root || ROOT;
  const cpuNow = options.cpuNow || (() => { const t = process.cpuUsage(); return (t.user + t.system) / 1000; });
  const workNow = options.workNow || (options.cpuNow ? options.cpuNow : performanceNow);
  const base = path.resolve(root, 'artifacts/gameplay-balance');
  resolveRun(path.join(base, 'budget-path-check'), root);
  fs.mkdirSync(base, { recursive: true });
  if (fs.lstatSync(base).isSymbolicLink() || !fs.realpathSync(base).startsWith(fs.realpathSync(root) + path.sep)) throw new Error('预算目录链接或越界');
  const budgetDir = config.source === 'formal' ? base : resolveRun(config.output, root);
  fs.mkdirSync(budgetDir, { recursive: true });
  const file = path.join(budgetDir, config.source === 'formal' ? 'formal-budget.json' : 'budget.json'), lock = path.join(base, 'formal-budget.lock');
  let ledger = { version: 2, limitMs: config.limits.computeMs, computeMs: 0, excludedInactiveGapMs: 0, runs: {}, accounting: 'active-operation-wall-with-cpu-suspension-check' }, lockFd;
  if (config.source === 'formal') {
    if (fs.existsSync(lock)) {
      if (fs.lstatSync(lock).isSymbolicLink()) throw new Error('预算锁不能是链接');
      const owner = JSON.parse(fs.readFileSync(lock, 'utf8'));
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('预算锁无效');
      let alive = true;
      try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
      if (alive) throw new Error('已有批次使用累计预算');
      fs.unlinkSync(lock);
    }
    lockFd = fs.openSync(lock, 'wx');
    fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
  }
    if (fs.existsSync(file)) {
      if (fs.lstatSync(file).isSymbolicLink()) { if (lockFd !== undefined) { fs.closeSync(lockFd); fs.unlinkSync(lock); } throw new Error('预算文件不能是链接'); }
      try { ledger = JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (error) { if (lockFd !== undefined) { fs.closeSync(lockFd); fs.unlinkSync(lock); } throw error; }
      if (ledger.version !== 2 || ledger.limitMs !== config.limits.computeMs || !Number.isFinite(ledger.computeMs) || ledger.computeMs < 0) { if (lockFd !== undefined) { fs.closeSync(lockFd); fs.unlinkSync(lock); } throw new Error('累计预算记录无效'); }
    }
  const runId = config.runId;
  ledger.runs[runId] ||= { computeMs: 0, wallWorkMs: 0, cpuMs: 0, excludedInactiveGapMs: 0, configHash: config.configHash };
  if (ledger.runs[runId].configHash !== config.configHash) { if (lockFd !== undefined) { fs.closeSync(lockFd); fs.unlinkSync(lock); } throw new Error('预算批次配置不匹配'); }
  let closed = false;
  function flush() {
    const temp = file + '.partial-' + crypto.randomUUID(), fd = fs.openSync(temp, 'wx');
    try { fs.writeFileSync(fd, JSON.stringify(ledger, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    renameAtomic(temp, file);
  }
  function beginWork() { return { cpu: cpuNow(), wall: workNow() }; }
  function endWork(start) {
    if (!start) return 0;
    const wall = Math.max(0, workNow() - start.wall), cpu = Math.max(0, cpuNow() - start.cpu);
    const inactive = wall >= 60000 && cpu < 1000 ? Math.max(0, wall - cpu) : 0;
    const delta = Math.max(cpu, wall - inactive);
    ledger.computeMs += delta; ledger.runs[runId].computeMs += delta; ledger.runs[runId].wallWorkMs += wall; ledger.runs[runId].cpuMs += cpu;
    ledger.excludedInactiveGapMs += inactive; ledger.runs[runId].excludedInactiveGapMs += inactive;
    return delta;
  }
  return { beginWork, endWork, flush, exhausted: () => ledger.computeMs >= ledger.limitMs, get computeMs() { return ledger.computeMs; }, get runComputeMs() { return ledger.runs[runId].computeMs; }, snapshot: () => copy(ledger), close() { if (closed) return; closed = true; try { flush(); } finally { if (lockFd !== undefined) { fs.closeSync(lockFd); fs.unlinkSync(lock); } } } };
}
const performanceNow = () => Number(process.hrtime.bigint()) / 1e6;
function coverage(manifest, schedule) {
  const statuses = Object.values(manifest.samples), terminated = statuses.filter(s => s.status === 'terminated').length;
  const pending = statuses.filter(s => s.status === 'pending').length;
  const groups = [...new Set(schedule.map(s => s.groupId))];
  return { planned: schedule.length, started: pending + terminated, terminated, pending, unstarted: statuses.filter(s => s.status === 'unstarted').length, plannedGroups: groups.length, completeGroups: groups.filter(g => schedule.filter(s => s.groupId === g).every(s => manifest.samples[s.sampleId].status === 'terminated')).length };
}
function reconcile(manifest, schedule, results) {
  const map = new Map(results.map(r => [r.sampleId, r]));
  for (const spec of schedule) {
    const entry = manifest.samples[spec.sampleId];
    if (!entry) throw new Error('清单缺少计划样本');
    if (entry.status === 'terminated' && !map.has(spec.sampleId)) throw new Error('已终止清单缺少有效结果');
    if (map.has(spec.sampleId)) { entry.status = 'terminated'; entry.outcome = map.get(spec.sampleId).outcome; entry.resultPath = `samples/${spec.sampleId}/result.json`; }
  }
  if (Object.keys(manifest.samples).length !== schedule.length) throw new Error('清单包含未知样本');
  manifest.coverage = coverage(manifest, schedule);
  return manifest;
}
async function runBatch(config, options = {}) {
  const root = options.root || ROOT, fingerprint = options.fingerprint || fingerprintSources(root);
  if (config.configHash !== hashConfig(config) || config.codeFingerprint.hash !== fingerprint.hash) throw new Error('批次配置或代码指纹不匹配');
  const baseBytes = sizeTree(path.resolve(root, 'artifacts/gameplay-balance'));
  const ownBytes = sizeTree(path.resolve(root, config.output));
  const store = options.store || openRun(config, { root, resume: options.resume, fingerprint, maxBytes: config.limits.outputBytes - baseBytes + ownBytes });
  const schedule = options.resume ? store.read('schedule.json') : buildSchedule(config);
  let manifest;
  if (options.resume) manifest = store.read('manifest.json');
  else {
    manifest = { schemaVersion: 1, source: config.source, configHash: config.configHash, scheduleHash: hashCanonical(schedule), status: 'running', stopReason: null, computeMs: 0, samples: Object.fromEntries(schedule.map(s => [s.sampleId, { status: 'unstarted', attempts: [] }])) };
    store.atomic('config.json', config); store.atomic('schedule.json', schedule); store.atomic('manifest.json', manifest);
  }
  if (manifest.configHash !== config.configHash || manifest.scheduleHash !== hashCanonical(schedule)) throw new Error('批次清单与计划不匹配');
  reconcile(manifest, schedule, store.results(schedule));
  const budget = options.budget || openBudget(config, { root });
  let interrupted = false, actionCount = 0, latestError = null, activeSpec = null, activeContext = null, activePosition = null;
  const interrupt = () => { interrupted = true; };
  process.once('SIGINT', interrupt);
  const groups = [...new Set(schedule.map(s => s.groupId))], queue = groups.slice();
  function stopReason() { return interrupted || options.signal?.aborted ? 'interrupted' : budget.exhausted() ? 'compute_budget' : actionCount >= (options.stopAfterActions ?? Infinity) ? 'test_interrupt' : null; }
  function update(reason = null) {
    manifest.computeMs = budget.runComputeMs; manifest.totalComputeMs = budget.computeMs; manifest.outputBytes = store.bytes;
    manifest.coverage = coverage(manifest, schedule); manifest.stopReason = reason;
    manifest.status = reason ? 'paused' : manifest.coverage.terminated === schedule.length ? 'complete' : 'running';
    store.atomic('manifest.json', manifest); budget.flush(); options.onProgress?.(copy(manifest));
  }
  function terminate(context, spec, position, terminalError = null) {
    const result = context.session.finishIfNeeded();
    if (!result) throw new Error('样本没有合法终止依据');
    if (terminalError) { result.outcome = 'error'; result.reason = terminalError; result.winnerId = null; }
    result.codeFingerprint = config.codeFingerprint; result.position = position;
    result.gameId = context.session.auditSnapshot().gameId;
    result.observationComplete = !terminalError && result.outcome !== 'error';
    try { result.observations = result.observationComplete ? summarizeObservations(context.observations) : null; }
    catch (error) { result.outcome = 'error'; result.reason = '观察汇总失败：' + error.message; result.winnerId = null; result.observationComplete = false; result.observations = null; result.error = { message: error.message, kind: 'observation_summary' }; }
    result.computeMs = manifest.samples[spec.sampleId].computeMs || 0;
    store.saveResult(result); // A completed result is durable before the manifest advertises it.
    const entry = manifest.samples[spec.sampleId]; entry.status = 'terminated'; entry.outcome = result.outcome; entry.resultPath = `samples/${spec.sampleId}/result.json`;
    return result;
  }
  try {
    if (store.results(schedule).some(r => r.outcome === 'error')) { update('previous_error'); return manifest; }
    while (queue.length && !stopReason()) {
      const group = queue.shift(); let rotate = false;
      for (const spec of schedule.filter(s => s.groupId === group)) {
        const entry = manifest.samples[spec.sampleId]; if (entry.status === 'terminated') continue;
        activeSpec = spec; activeContext = null; activePosition = null;
        let context, position, terminalError = null;
        const startCompute = budget.runComputeMs;
        const evidence = store.loadEvidence(spec.sampleId);
        if (entry.status === 'unstarted') { entry.status = 'pending'; entry.attempts.push({ attemptId: `${spec.sampleId}-a1`, startedAt: new Date().toISOString() }); update(); }
        if (evidence.records.length) {
          const check = await replayGame(spec, evidence.records, config, { beginWork: budget.beginWork, endWork: budget.endWork, shouldPause: () => !!stopReason(), onRecord: async index => { if (index % 32 === 0) { budget.flush(); await yieldLoop(); } } });
          if (check.paused) { check.context.session.close(); break; }
          if (!check.ok) {
            store.saveAudit(spec.sampleId, { source: 'audit', kind: 'resume_mismatch', ...check });
            context = { ...initialize(spec), spec, fingerprint }; context.session.markError('重放不一致', { replay: check }); terminalError = 'replay_mismatch';
            position = { records: evidence.records.length, lastHash: evidence.lastHash };
            terminate(context, spec, position, terminalError); context.session.close(); latestError = terminalError; break;
          }
          context = check.context; activeContext = context;
          verifyCheckpoint(store.checkpoint(spec.sampleId), context, spec, evidence);
          position = { records: evidence.records.length, lastHash: evidence.lastHash, segments: evidence.segments };
          store.saveCheckpoint(spec.sampleId, checkpointFor(context, spec, position));
          if (evidence.tails.length) store.saveAudit(spec.sampleId, { source: 'audit', kind: 'incomplete_tail_preserved', tails: evidence.tails });
        } else {
          const start = budget.beginWork();
          try { context = { ...initialize(spec), spec, fingerprint }; activeContext = context; position = store.appendAction(spec.sampleId, context.record); store.saveCheckpoint(spec.sampleId, checkpointFor(context, spec, position)); }
          finally { budget.endWork(start); }
        }
        const sliceStart = performanceNow();
        try {
          while (!context.session.finishIfNeeded() && !stopReason()) {
            const start = budget.beginWork();
            try {
              const record = advance(context, config);
              position = store.appendAction(spec.sampleId, record);
              activePosition = position;
              store.saveCheckpoint(spec.sampleId, checkpointFor(context, spec, position));
              actionCount++;
              terminalError = record.observerError || (record.kind === 'failure' ? record.error : null);
            } finally { budget.endWork(start); }
            if (terminalError) break;
            if (actionCount % 32 === 0) { budget.flush(); options.onProgress?.({ ...copy(manifest), activeSample: spec.sampleId, activeStep: context.session.steps, totalComputeMs: budget.computeMs }); await yieldLoop(); }
            if (performanceNow() - sliceStart >= config.limits.sliceMs) { rotate = true; break; }
          }
          entry.computeMs = (entry.computeMs || 0) + budget.runComputeMs - startCompute;
          const terminal = context.session.finishIfNeeded();
          if (terminal) {
            const start = budget.beginWork(); let result;
            try { result = terminate(context, spec, position, terminalError); store.seal(spec.sampleId); update(); }
            finally { budget.endWork(start); }
            if (result.outcome === 'error') latestError = result.reason;
          } else { store.seal(spec.sampleId); update(stopReason()); }
        } finally { context.session.close(); }
        if (latestError || stopReason() || rotate) break;
      }
      if (latestError) break;
      if (schedule.some(s => s.groupId === group && manifest.samples[s.sampleId].status !== 'terminated')) queue.push(group);
    }
    update(latestError ? 'first_error' : stopReason());
  } catch (error) {
    latestError = error.message;
    let reason = error instanceof StorageStop ? error.code : 'tool_failure';
    if (!(error instanceof StorageStop) && activeSpec && manifest.samples[activeSpec.sampleId].status === 'pending') {
      try {
        const checkpoint = store.checkpoint(activeSpec.sampleId);
        activeContext ||= { ...initialize(activeSpec), spec: activeSpec, fingerprint };
        activeContext.session.markError(error, { kind: 'recovery_or_tool', lastDurableCheckpoint: checkpoint, reconstructedPrefixVerified: activeContext.session.steps });
        terminate(activeContext, activeSpec, activePosition || checkpoint?.position || null, error.message);
        store.saveAudit(activeSpec.sampleId, { source: 'audit', kind: 'recovery_or_tool_error', error: error.message, checkpoint });
        activeContext.session.close(); reason = 'first_error';
      } catch { /* A storage failure must preserve the original pending evidence. */ }
    }
    manifest.status = 'paused'; manifest.stopReason = reason; manifest.error = latestError; manifest.computeMs = budget.runComputeMs; manifest.totalComputeMs = budget.computeMs;
    manifest.coverage = coverage(manifest, schedule);
    try { store.atomic('manifest.json', manifest); } catch { /* Last durable checkpoint/evidence remains authoritative. */ }
    options.onProgress?.(copy(manifest));
  } finally { process.removeListener('SIGINT', interrupt); budget.close(); }
  return manifest;
}
async function auditSample(runDir, sampleId, options = {}) {
  const loaded = loadRun(runDir, options), { config, schedule } = loaded;
  const spec = schedule.find(s => s.sampleId === sampleId); if (!spec) throw new Error('审计样本不在计划中');
  const store = openRun(config, { ...options, resume: true });
  const budget = options.budget || openBudget(config, options);
  try {
    const evidence = store.loadEvidence(sampleId);
    const check = await replayGame(spec, evidence.records, config, { beginWork: budget.beginWork, endWork: budget.endWork, shouldPause: budget.exhausted, onRecord: async i => { if (i % 32 === 0) { budget.flush(); await yieldLoop(); } } });
    const result = store.results(schedule).find(r => r.sampleId === sampleId);
    if (check.ok && result) {
      const rebuilt = check.context.session.finishIfNeeded();
      if (!rebuilt || rebuilt.stateHash !== result.stateHash || rebuilt.outcome !== result.outcome || rebuilt.winnerId !== result.winnerId) { check.ok = false; check.error = '终止结果不一致'; }
    }
    const state = check.context?.session.auditSnapshot();
    check.context?.session.close(); delete check.context;
    const saved = { source: 'audit', sampleId, ...check, originalOutcome: result?.outcome || null, tails: evidence.tails, ...(state ? { finalState: state } : {}) };
    store.saveAudit(sampleId, saved); return saved;
  } finally { budget.close(); }
}
module.exports = { openBudget, coverage, reconcile, runBatch, auditSample, selectAuditSamples, sizeTree, semanticAction };
