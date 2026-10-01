'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameState } = require('../src/state');
const { beginOpportunityStage } = require('../src/opportunities');
const { createRng } = require('../src/random');
const { hashCanonical, semanticState, semanticAction } = require('../scripts/balance/canonical');
const { initialize, advance, checkpointFor, replayGame, verifyCheckpoint, selectAuditSamples } = require('../scripts/balance/replay');
const { buildConfig } = require('../scripts/balance/config');
const { buildSchedule } = require('../scripts/balance/schedule');
function recordedPrefix(steps = 120) {
  const config = buildConfig({ mode: 'debug', games: 1, seed: 22, players: 3 }, { hash: 'fixture', files: [], commit: null, worktree: '' });
  const spec = buildSchedule(config)[0], context = { ...initialize(spec), spec, fingerprint: config.codeFingerprint };
  const records = [context.record];
  for (let i = 0; i < steps; i++) {
    const record = advance(context, config); records.push(record);
    assert.equal(record.outcome.ok, true, record.outcome.error);
    assert.equal(record.observerError, null);
  }
  return { config, spec, context, records };
}

test('语义摘要：仅记录标识/元数据差异可忽略，经济和随机进度不能忽略', () => {
  const a = createGameState('BALANCE', ['A', 'B']);
  beginOpportunityStage(a, 1, { kind: 'start' }, createRng(22));
  const b = globalThis.structuredClone(a);
  b.gameId = 'new-game';
  b.opportunityStage.stageId = 'new-game:choice:1';
  b.startedAt += 1000; b.rngSeed++; b.players[0].connected = false;
  b.players[0].socketId = 'other'; b.players[0].reconnectToken = 'hidden';
  const hash = s => hashCanonical(semanticState(s));
  assert.equal(hash(a), hash(b));
  for (const change of [s => s.players[0].cash++, s => s.stocks['上海'].quoteVersion++, s => s.revision++, s => s.diceBag.push(2), s => s.phase = 'buy']) {
    const c = globalThis.structuredClone(a); change(c); assert.notEqual(hash(a), hash(c));
  }
  assert.deepEqual(semanticAction({ stageId: a.gameId + ':choice:1', quoteVersion: 5 }, a.gameId), { quoteVersion: 5, stageId: '$GAME:choice:1' });
  assert.equal(hashCanonical({ a: 1, b: 2 }), hashCanonical({ b: 2, a: 1 }));
});
test('策略重放：重新消耗本人随机流与记忆，状态/动作/观察均一致后继续', async () => {
  const f = recordedPrefix();
  const check = await replayGame(f.spec, f.records, f.config);
  assert.equal(check.ok, true, JSON.stringify(check));
  assert.equal(check.checkedRecords, 121);
  assert.deepEqual(check.randomCounts, f.context.session.randomCounts());
  const original = advance(f.context, f.config), resumed = advance(check.context, f.config);
  assert.deepEqual(semanticAction(resumed, resumed.gameId), semanticAction(original, original.gameId));
  f.context.session.close(); check.context.session.close();
});
test('重放差异：动作、报价、金额、随机计数及记录删除均给出首个差异', async () => {
  const f = recordedPrefix(30);
  for (const alter of [r => r[2].decision.action.candidateVersion++, r => r[3].outcome.randomCounts.engine++, r => r[4].outcome.events.push({ amount: 999 }), r => r.splice(1, 1)]) {
    const changed = globalThis.structuredClone(f.records); alter(changed);
    const check = await replayGame(f.spec, changed, f.config);
    assert.equal(check.ok, false); assert.equal(typeof check.difference.path, 'string');
    assert.notEqual(check.expectedHash, check.actualHash);
    assert.ok(check.checkedRecords < 5);
  }
  f.context.session.close();
});
test('恢复审计：完整前缀超前可修复，未来检查点/伪造记忆拒绝，不覆盖结果', async () => {
  const f = recordedPrefix(10), evidence = { records: f.records, recordHashes: f.records.map(() => 'old-chain'), lastHash: 'chain' };
  const check = await replayGame(f.spec, f.records, f.config); assert.equal(check.ok, true);
  const position = { records: f.records.length, lastHash: 'chain' };
  const checkpoint = checkpointFor(f.context, f.spec, position);
  assert.deepEqual(verifyCheckpoint(checkpoint, check.context, f.spec, evidence), { repaired: false });
  const previous = await replayGame(f.spec, f.records.slice(0, -1), f.config); assert.equal(previous.ok, true);
  const old = checkpointFor(previous.context, f.spec, { records: f.records.length - 1, lastHash: 'old-chain' }); previous.context.session.close();
  assert.equal(verifyCheckpoint(old, check.context, f.spec, evidence).repaired, true);
  const future = globalThis.structuredClone(checkpoint); future.position.records++;
  assert.throws(() => verifyCheckpoint(future, check.context, f.spec, evidence), /未知/);
  const forged = globalThis.structuredClone(checkpoint); forged.memory.p0 = { forged: true };
  assert.throws(() => verifyCheckpoint(forged, check.context, f.spec, evidence), /不匹配/);
  assert.equal(evidence.records.length, 11);
  check.context.session.close(); f.context.session.close();
});
test('审计选取：人数和分类按稳定样本编号选择，缺类保持null', () => {
  const selected = selectAuditSamples([{ sampleId: 'z', playerCount: 2, outcome: 'natural' }, { sampleId: 'a', playerCount: 2, outcome: 'natural' }, { sampleId: 'b', playerCount: 4, outcome: 'censored' }]);
  assert.equal(selected.length, 9);
  assert.equal(selected[0].sampleId, 'a');
  assert.equal(selected[1].sampleId, null);
  assert.equal(selected.find(s => s.playerCount === 4 && s.outcome === 'censored').sampleId, 'b');
});
