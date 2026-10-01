'use strict';
const { createSession } = require('./session');
const { decide } = require('./policy');
const { observeTransition } = require('./observe');
const { semanticAction, semanticState, hashCanonical } = require('./canonical');

const copy = value => globalThis.structuredClone(value);
function initialize(spec) {
  const session = createSession(spec), state = session.auditSnapshot();
  const record = { kind: 'initial', gameId: state.gameId, initial: session.initial, observations: observeTransition(null, { source: spec.source, ok: true, step: 0, events: [] }, state) };
  return { session, memory: {}, observations: record.observations.slice(), record };
}
function advance(context, config) {
  const { session, memory } = context, before = session.auditSnapshot();
  let actorId, decision, outcome, observerError = null;
  try {
    actorId = session.nextActor();
    const seat = before.players.findIndex(p => p.id === actorId);
    decision = decide(session.view(actorId), config.policyConfigs[context.spec.policiesBySeat[seat]], copy(memory[actorId] || {}), session.policyRng(actorId));
  } catch (error) {
    session.markError(error, { actorId: actorId || null, phase: before.phase, kind: 'decision' });
    return { kind: 'failure', gameId: before.gameId, actorId: actorId || null, error: error.message, phase: before.phase, stateHash: hashCanonical(semanticState(before)), randomCounts: session.randomCounts(), memory: copy(memory) };
  }
  outcome = session.dispatch(actorId, decision);
  const after = session.auditSnapshot();
  let observations;
  try { observations = observeTransition(before, outcome, after, decision.reason); }
  catch (error) { observerError = error.message; session.markError(error, { kind: 'observation', actorId, step: session.steps }); observations = []; }
  if (outcome.ok && !observerError) memory[actorId] = copy(decision.nextMemory);
  context.observations.push(...observations);
  return { kind: 'action', gameId: before.gameId, actorId, decision, outcome, observerError, observations, memory: copy(memory), ...(observerError || !outcome.ok ? { failureState: after } : {}) };
}
function semanticRecord(record) {
  const normalized = semanticAction(record, record.gameId);
  // Full diagnostic snapshots contain inert connection/time metadata, unlike decisions.
  if (record.failureState) normalized.failureState = semanticState(record.failureState);
  return normalized;
}
function firstDifference(a, b, prefix = '$') {
  if (a === undefined || b === undefined) return a === b ? null : { path: prefix, expected: a ?? null, actual: b ?? null, expectedMissing: a === undefined, actualMissing: b === undefined };
  if (hashCanonical(a) === hashCanonical(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const diff = firstDifference(a[key], b[key], `${prefix}.${key}`); if (diff) return diff;
    }
  }
  return { path: prefix, expected: a ?? null, actual: b ?? null };
}
function checkpointFor(context, spec, position) {
  const { session, memory } = context, state = session.auditSnapshot();
  return { sampleId: spec.sampleId, configHash: spec.configHash, codeFingerprint: context.fingerprint || null, step: session.steps, position, stateHash: hashCanonical(semanticState(state)), randomCounts: session.randomCounts(), memory: copy(memory), gameId: state.gameId, phase: state.phase, completeRounds: state.roundFlow.index - 1 };
}
async function replayGame(spec, records, config, options = {}) {
  const initialWork = options.beginWork?.();
  let context;
  try { context = { ...initialize(spec), spec, fingerprint: config.codeFingerprint }; }
  finally { options.endWork?.(initialWork); }
  const mismatch = (index, expected, actual) => {
    const old = semanticRecord(expected), rebuilt = semanticRecord(actual);
    return { ok: false, sampleId: spec.sampleId, checkedRecords: index, difference: firstDifference(old, rebuilt), expectedHash: hashCanonical(old), actualHash: hashCanonical(rebuilt), expectedRandomCounts: expected.outcome?.randomCounts || expected.randomCounts || expected.initial?.randomCounts, actualRandomCounts: actual.outcome?.randomCounts || actual.randomCounts || actual.initial?.randomCounts };
  };
  try {
    for (let index = 0; index < records.length; index++) {
      if (options.shouldPause?.()) return { ok: false, paused: true, checkedRecords: index, context };
      const start = options.beginWork?.();
      let actual;
      try {
        actual = index === 0 ? context.record : advance(context, config);
        if (index > 0 && records[index].kind === 'initial') throw new Error('初始化记录重复');
        if (hashCanonical(semanticRecord(records[index])) !== hashCanonical(semanticRecord(actual))) { context.session.close(); return mismatch(index, records[index], actual); }
      } finally { options.endWork?.(start); }
      if (options.onRecord) await options.onRecord(index + 1);
    }
    return { ok: true, sampleId: spec.sampleId, checkedRecords: records.length, stateHash: checkpointFor(context, spec, null).stateHash, randomCounts: context.session.randomCounts(), context };
  } catch (error) { context.session.close(); return { ok: false, sampleId: spec.sampleId, checkedRecords: context.session.steps, error: error.message }; }
}
function verifyCheckpoint(checkpoint, context, spec, evidence) {
  if (!checkpoint) return { repaired: true, reason: 'missing_checkpoint' };
  if (checkpoint.configHash !== spec.configHash || checkpoint.sampleId !== spec.sampleId || checkpoint.position.records > evidence.records.length) throw new Error('检查点引用未知或异版本动作');
  // An older checkpoint is permitted only after all complete records have replayed.
  if (checkpoint.position.records < evidence.records.length) {
    const last = evidence.records[checkpoint.position.records - 1];
    if (checkpoint.position.lastHash !== evidence.recordHashes?.[checkpoint.position.records - 1]) throw new Error('旧检查点流水摘要不匹配');
    if (!last || checkpoint.step !== (last.outcome?.step || 0) || checkpoint.stateHash !== (last.outcome?.stateHash || last.stateHash || last.initial?.stateHash) || hashCanonical(checkpoint.randomCounts) !== hashCanonical(last.outcome?.randomCounts || last.randomCounts || last.initial?.randomCounts)) throw new Error('旧检查点与已验证动作不匹配');
    if (last.memory && firstDifference(semanticAction(checkpoint.memory, checkpoint.gameId), semanticAction(last.memory, last.gameId))) throw new Error('旧检查点记忆不匹配');
    return { repaired: true, reason: 'verified_prefix_ahead' };
  }
  const actual = checkpointFor(context, spec, checkpoint.position);
  const keys = ['step', 'stateHash', 'randomCounts', 'memory', 'phase', 'completeRounds'];
  const old = semanticAction(Object.fromEntries(keys.map(k => [k, checkpoint[k]])), checkpoint.gameId);
  const current = semanticAction(Object.fromEntries(keys.map(k => [k, actual[k]])), actual.gameId);
  const difference = firstDifference(old, current);
  if (difference || checkpoint.position.lastHash !== evidence.lastHash) throw new Error('检查点与核验前缀不匹配：' + (difference?.path || 'hash'));
  return { repaired: false };
}
function selectAuditSamples(results) {
  return [2, 3, 4].flatMap(n => ['natural', 'censored', 'error'].map(outcome => ({ playerCount: n, outcome, sampleId: results.filter(r => r.playerCount === n && r.outcome === outcome).sort((a, b) => a.sampleId.localeCompare(b.sampleId))[0]?.sampleId || null })));
}
module.exports = { initialize, advance, semanticRecord, firstDifference, checkpointFor, replayGame, verifyCheckpoint, selectAuditSamples };
