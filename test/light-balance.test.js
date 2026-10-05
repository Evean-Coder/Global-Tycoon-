'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMeter, BudgetStop, write } = require('../scripts/light-balance/control');
const { catalog } = require('../scripts/light-balance/cases');
const branches = require('../scripts/light-balance/branches');
const { compact, finishStatus } = require('../scripts/light-balance/run');
test('轻量固定范围：48核心、12成对、12机遇和七组合，不启动完整游戏', () => {
  const cases = catalog(), pairs = branches.catalog();
  assert.equal(cases.length, 48); assert.equal(new Set(cases.map(c => c.id)).size, 48);
  for (const category of ['stock', 'business', 'opportunity', 'combination']) assert.equal(cases.filter(c => c.category === category).length, 12);
  assert.equal(pairs.length, 12); assert.equal(new Set(pairs.map(p => p.seed)).size, 12);
  for (const pair of pairs) assert.equal(pair.reachableFromNormalStart, '未验证');
});
test('墙钟守卫、持久恢复与额度防重置', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'light-budget-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let clock = 0; const options = { now: () => clock, caps: { A: 100, B: 50 }, limit: 150 };
  const first = createMeter(dir, options);
  first.measure('A', guard => { clock += 20; guard(); }); assert.equal(first.ledger.used.A, 20);
  const second = createMeter(dir, options); assert.equal(second.total(), 20);
  assert.throws(() => second.measure('B', guard => { clock += 51; guard(); }), BudgetStop);
  assert.equal(second.ledger.used.B, 51);
  assert.throws(() => createMeter(dir, { ...options, limit: 300 }), /不能重置/);
  assert.throws(() => write(dir, '../bad.json', {}), /路径无效/);
});
test('短工具夹具经真实预检，成对初态一致、动作上限与无胜率声明', () => {
  const pair = branches.catalog().find(p => p.id === 'flight-2');
  const result = branches.runPair(pair, () => {}, () => {}, { rounds: 1, actions: 2 });
  assert.equal(result.complete, true);
  assert.equal(result.branches[0].initialHash, result.branches[1].initialHash);
  assert.notDeepEqual(result.branches[0].trace[0].action, result.branches[1].trace[0].action);
  for (const b of result.branches) { assert.ok(b.steps <= 2); assert.ok(b.rounds <= 1); assert.equal(b.winnerClaim, null); }
});
test('Windows临时占用有限重试，永久失败保留原完整文件', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'light-write-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  write(dir, 'result.json', { version: 1 }); let attempts = 0;
  write(dir, 'result.json', { version: 2 }, { rename: (from, to) => { if (attempts++ < 2) throw Object.assign(new Error('占用'), { code: 'EPERM' }); fs.renameSync(from, to); }, pause: () => {} });
  assert.equal(attempts, 3); assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'result.json'))).version, 2);
  attempts = 0;
  assert.throws(() => write(dir, 'result.json', { version: 3 }, { rename: () => { attempts++; throw Object.assign(new Error('永久占用'), { code: 'EPERM' }); }, pause: () => {} }), /永久占用/);
  assert.equal(attempts, 8); assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'result.json'))).version, 2);
});
test('摘要引用原流水，补验只引用替换的分支，不重复保存状态/日志', () => {
  const r = compact({ cases: [{ id: 'a', ok: true, finalState: { large: 'raw' }, events: [], actions: [], actual: { cash: 7 } }],
    pairs: [{ id: 'p', initialState: { large: 'raw' }, branches: [0, 1].map(choice => ({ choice, status: 'bounded', trace: ['raw'], finalState: { large: 'raw' }, finalHash: 'h' + choice })) }],
    repair: { replacedBranches: [{ pairId: 'p', choice: 1 }] } });
  assert.equal(r.cases[0].finalState, undefined); assert.equal(r.cases[0].evidencePath, 'case-a.json');
  assert.equal(r.pairs[0].branches[0].evidencePath, 'pair-p.json'); assert.equal(r.pairs[0].branches[1].evidencePath, 'repair.json');
  assert.equal(r.pairs[0].branches[0].trace, undefined); assert.equal(r.pairs[0].branches[1].finalHash, 'h1');
});
test('实际短分支额度停止保留已做动作，执行清单完毕不能冒称完整通过', () => {
  let calls = 0;
  const p = branches.runPair(branches.catalog()[0], () => { if (++calls >= 3) throw new BudgetStop('C'); }, () => {}, { rounds: 1, actions: 2 });
  assert.equal(p.complete, false); assert.equal(p.branches.length, 1);
  assert.equal(p.branches[0].steps, 1); assert.equal(p.branches[0].status, 'budget-stop');
  assert.equal(finishStatus({ missingCases: [], missingPairs: [], cases: [{ ok: true }], pairs: [p] }), 'partial');
});
