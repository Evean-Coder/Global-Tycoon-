'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { SCHEDULE, evaluate, coreHash, moneyRows, LIMIT } = require('../scripts/remediation/travel-pilot');
const { createMeter, BudgetStop } = require('../scripts/light-balance/control');
const { fixture, own } = require('../scripts/light-balance/cases');
const logic = require('../src/gameLogic'), { createRng } = require('../src/random');
function outcomes() { return SCHEDULE.flatMap(p => ['baseline', 'candidate'].map(variant => ({ id: p.id, variant, outcome: 'censored', completeRounds: 250, initialCoreHash: 'same', prefixHash: 'same', prefixSteps: 10, investmentElimination: null }))); }
test('真实终局门槛拒绝低现金、缺组、丢失自然终局和不同前缀', () => {
  const rows = outcomes(); assert.equal(evaluate(rows).effectPass, false); assert.equal(evaluate(rows.slice(1)).effectPass, false);
  rows[1].outcome = rows[3].outcome = 'natural'; rows[1].completeRounds = 150; rows[3].completeRounds = 180;
  assert.equal(evaluate(rows).effectPass, true);
  rows[4].outcome = 'natural'; assert.equal(evaluate(rows).effectPass, false); rows[4].outcome = 'censored';
  rows[1].prefixHash = 'different'; assert.equal(evaluate(rows).effectPass, false);
  assert.throws(() => evaluate(rows.concat(rows[0])), /重复或超额/);
});
test('投资更早出局必须单列，2/3/4人配置及预算固定', () => {
  const rows = outcomes(); rows[1].investmentElimination = { round: 150 };
  assert.equal(evaluate(rows).investmentReviewRequired, true); assert.deepEqual(SCHEDULE.map(p => p.policies.length), [2, 3, 4]); assert.equal(LIMIT, 180000);
});
test('已有累计预算不能重置，恢复累计到上限即停止', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-budget-')); let now = 0;
  try { const a = createMeter(dir, { now: () => now, caps: { pilot: 10 }, limit: 10 }); a.begin('pilot'); now = 6; a.end();
    const b = createMeter(dir, { now: () => now, caps: { pilot: 10 }, limit: 10 }); assert.equal(b.total(), 6); b.begin('pilot'); now = 10; assert.throws(() => b.guard(), BudgetStop); b.end();
    assert.throws(() => createMeter(dir, { now: () => now, caps: { pilot: 20 }, limit: 20 }), /不能重置/);
  } finally { for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f)); fs.rmdirSync(dir); }
});
test('前期只忽略声明元数据，真实收费与恢复银行流水对账', () => {
  const s = fixture(); s.economyRevision = 'travel-expense-v1'; s.travelExpenseReceipts = {}; const old = fixture(); assert.equal(coreHash(s), coreHash(old));
  s.roundFlow.index = 81; s.players[0].cash = 0; s.phase='frozen_turn';s.players[0].frozen=true;own(s, 'p0', '上海'); const before = globalThis.structuredClone(s);
  const first=logic.apply(s,{type:'respond_frozen',decision:'pass'},createRng(22));
  const rows = moneyRows(before, { ok:true, source: 'controlled', step: 1, actorId: 'p0', action: { type: 'respond_frozen',decision:'pass' }, events:first.events }, s);
  assert.equal(rows.reduce((n, r) => n + r.bankFlow, 0), -1500);
  const debt = globalThis.structuredClone(s), r = logic.apply(s, { type: 'rescue_mortgage', cityId: '上海' }, createRng(22));
  const rescued = moneyRows(debt, { ...r, ok:true, source: 'controlled', step: 2, actorId: 'p0', action: { type: 'rescue_mortgage', cityId: '上海' } }, s);
  assert.equal(rescued.reduce((n, e) => n + e.bankFlow, 0), 10000);
});
