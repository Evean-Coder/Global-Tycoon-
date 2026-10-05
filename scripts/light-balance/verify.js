'use strict';
const { performance } = require('node:perf_hooks');
const ENTRY = performance.now();
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { ROOT, fingerprintSources } = require('../balance/config');
const { OLD_HASH } = require('../review-balance');
const { hashCanonical } = require('../balance/canonical');
const { createMeter, digest, write, lock, LIMIT } = require('./control');

function verify(output = 'artifacts/gameplay-balance/lightweight-20261003') {
  const dir = path.resolve(ROOT, output);
  assert.equal(path.dirname(dir), path.resolve(ROOT, 'artifacts/gameplay-balance'));
  assert.ok(fs.existsSync(path.join(dir, 'repair-completed.json')));
  const unlock = lock(dir), meter = createMeter(dir);
  let result;
  try {
    meter.ledger.used.D += performance.now() - ENTRY;
    meter.measure('D', guard => {
      guard();
      const read = name => JSON.parse(fs.readFileSync(path.join(dir, name)));
      const summary = read('final-results.json'), registration = read('registration.json'), repaired = read('repair.json');
      assert.equal(summary.source, 'controlled-lightweight'); assert.equal(summary.fullGames, 0);
      assert.equal(summary.cases.length, 48); assert.equal(summary.pairs.length, 12);
      assert.equal(new Set(summary.cases.map(c => c.id)).size, 48);
      let assertions = 0, actions = 0;
      for (const c of summary.cases) {
        guard(); const raw = read(c.evidencePath); assert.equal(raw.ok, true);
        assert.equal(raw.finalHash, hashCanonical(raw.finalState));
        assert.deepEqual(raw.actual, c.actual); assert.equal(raw.id, c.id);
        for (const a of raw.assertions) { assert.deepEqual(a.actual, a.expected, a.note); assertions++; }
      }
      for (const pair of summary.pairs) {
        guard(); assert.equal(pair.complete, true); assert.equal(pair.branches.length, 2);
        assert.deepEqual(pair.branches.map(b => b.choice), [0, 1]);
        assert.equal(pair.branches[0].initialHash, pair.branches[1].initialHash);
        for (const b of pair.branches) {
          const raw = b.evidencePath === 'repair.json' ? repaired.records.find(r => r.pairId === pair.id && r.choice === b.choice).actual : read(b.evidencePath).branches.find(r => r.choice === b.choice);
          assert.deepEqual(raw.final, b.final); assert.equal(raw.finalHash, hashCanonical(raw.finalState));
          assert.equal(raw.status, 'bounded'); assert.equal(raw.steps, raw.trace.length);
          assert.ok(raw.rounds <= 10 && raw.steps <= 160); assert.equal(raw.winnerClaim, null);
          assert.equal(raw.initialHash, b.initialHash);
          const delta = raw.final.cashTotal + raw.final.funds - raw.initial.cashTotal - raw.initial.funds;
          assert.equal(raw.flows.systemCashAndFundDelta, delta); actions += raw.steps;
        }
      }
      const before = read('protected-before.json');
      for (const [file, hash] of Object.entries(before)) assert.equal(digest(fs.readFileSync(path.join(ROOT, file), 'utf8')), hash, file);
      const fingerprint = fingerprintSources(); assert.equal(fingerprint.hash, OLD_HASH);
      for (const file of ['scripts/light-balance/cases.js', 'scripts/light-balance/branches.js']) assert.equal(digest(fs.readFileSync(path.join(ROOT, file), 'utf8')), registration.toolHashes[file]);
      for (const [file, hash] of Object.entries(registration.toolHashes)) assert.equal(digest(fs.readFileSync(path.join(dir, 'executed-' + path.basename(file)), 'utf8')), hash);
      assert.equal(meter.ledger.limit, LIMIT); assert.ok(meter.total() < LIMIT);
      for (const stage of Object.keys(meter.ledger.caps)) assert.ok(meter.ledger.used[stage] < meter.ledger.caps[stage]);
      const bytes = fs.readdirSync(dir).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
      assert.ok(bytes < 10 * 1024 * 1024);
      result = { ok: true, date: '2026-10-05', source: 'evidence-verification-only', cases: 48, pairs: 12, uniqueBranches: 24,
        branchExecutionAttempts: read('repair-completed.json').branchExecutionAttempts, assertions, finalSuccessfulActions: actions,
        fullGames: 0, oldProtectedFiles: Object.keys(before).length, sourceFiles: fingerprint.files.length, sourceHash: fingerprint.hash,
        rawStateHashesMatch: true, pairedInitialHashesMatch: true, originalToolCopiesMatch: true, finalEvidenceReferencesMatch: true,
        outputBytesBeforeVerification: bytes, note: '只核对已保存证据，无新增游戏动作；活动预算继续原D台账。总体胜率/真人未验证。' };
      write(dir, 'verification.json', result); meter.checkpoint();
    });
    console.log(JSON.stringify({ ...result, usedMs: meter.total() }));
    return result;
  } finally { meter.save(); unlock(); }
}
if (require.main === module) verify(process.argv[2]);
module.exports = { verify };
