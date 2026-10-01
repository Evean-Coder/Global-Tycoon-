'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, policyConfigs, buildConfig, fingerprintSources, hashConfig } = require('../scripts/balance/config');
const { createTrackedRng } = require('../scripts/balance/random');
const { createRng } = require('../src/random');
const { buildSchedule } = require('../scripts/balance/schedule');
const fingerprint = { hash: 'fixture', commit: 'fixture', worktree: '', files: [] };
test('帮助入口：准确说明模式/上限，npm别名不改变生产依赖', () => {
  const { HELP } = require('../scripts/simulate-balance');
  for (const text of ['--games', '--formal', '--resume', '--replay', '--report', '4200', '2240', '240', '2GiB']) assert.ok(HELP.includes(text));
  const pkg = require('../package.json'); assert.equal(pkg.scripts.balance, 'node scripts/simulate-balance.js');
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['express', 'socket.io']);
});

test('参数模式：五入口严格校验，不允许正式临时参数', () => {
  assert.deepEqual(parseArgs([]), { mode: 'debug', games: 20, seed: 22, players: 4 });
  assert.equal(parseArgs(['--formal', '--output', 'artifacts/gameplay-balance/run']).mode, 'formal');
  assert.equal(parseArgs(['--resume', 'run']).mode, 'resume');
  assert.equal(parseArgs(['--report', 'run']).mode, 'report');
  assert.equal(parseArgs(['--replay', 'run', '--sample', 'sample']).sampleId, 'sample');
  for (const args of [['--seed', '2.2'], ['--games', '2x'], ['--games', '0'], ['--players', '5'], ['--seed', '-1'], ['--seed', '4294967296'], ['--games'], ['--unknown'], ['--formal'], ['--formal', '--resume', 'r'], ['--report', 'r', '--games', '2'], ['--sample', 's'], ['--replay', 'r'], ['--report', 'r', '--output', 'r'], ['--seed', '2', '--seed', '3']]) assert.throws(() => parseArgs(args), args.join(' '));
});
test('偏好配置：批准的储备/估值/比例/评分不可变且无共享修改', () => {
  const configs = policyConfigs();
  assert.equal(Object.keys(configs).length, 5);
  assert.equal(configs.property.baseReserve, 12000);
  assert.equal(configs.property.cityWeight, 1.2);
  assert.equal(configs.investment.maxStockRatio, 0.4);
  assert.equal(configs.aviation.flightWeight, 1.4);
  assert.equal(configs.cautious.scores.H10, 85);
  assert.equal(configs.neutral.randomChoices, true);
  assert.equal(configs.neutral.rerollStage, null);
  assert.throws(() => { configs.property.scores.H1 = 0; }, TypeError);
  assert.equal(policyConfigs().property.scores.H1, 90);
});
test('运行阈值：固定样本、预算、比较族与来源', () => {
  const c = buildConfig({ mode: 'formal', output: 'artifacts/gameplay-balance/fixture' }, fingerprint);
  assert.deepEqual(c.sampleTargets, { neutralSeeds: 600, crossSeeds: 40, games: 4200, groups: 2240 });
  assert.deepEqual(c.limits, { rounds: 500, actions: 20000, sliceMs: 60000, computeMs: 14400000, outputBytes: 2147483648 });
  assert.deepEqual(c.screeningRules.familySizes, { seat: 9, policy: 24, opportunity: 36 });
  assert.equal(c.screeningRules.bootstrapDraws, 50000);
  assert.equal(c.reportSeed, 0x5b1a2026);
  assert.equal(buildConfig(parseArgs([]), fingerprint).source, 'debug');
});
test('指纹：源内容改变必须改变摘要，输出/时间不改变配置摘要', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'balance-fingerprint-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'rule.js'), 'rule1');
  const a = fingerprintSources(root, ['rule.js']);
  fs.writeFileSync(path.join(root, 'output.json'), 'ignored');
  assert.equal(fingerprintSources(root, ['rule.js']).hash, a.hash);
  fs.writeFileSync(path.join(root, 'rule.js'), 'rule2');
  assert.notEqual(fingerprintSources(root, ['rule.js']).hash, a.hash);
  const c = buildConfig(parseArgs([]), fingerprint);
  assert.equal(hashConfig({ ...c, output: 'elsewhere', createdAt: 'later', runId: 'different' }), c.configHash);
  assert.notEqual(hashConfig({ ...c, policyVersion: 'changed' }), c.configHash);
});
test('随机流：保留原算法，计数与游戏/策略独立', () => {
  const engine = createTrackedRng(22), player = createTrackedRng(23), reference = createRng(22);
  for (let i = 0; i < 100; i++) assert.equal(engine(), reference());
  assert.equal(engine.calls, 100);
  assert.equal(player.calls, 0);
  assert.equal(player(), createRng(23)());
  assert.equal(player.calls, 1);
  assert.throws(() => createTrackedRng(null));
});

function formalSchedule() { return buildSchedule(buildConfig({ mode: 'formal', output: 'artifacts/gameplay-balance/fixture' }, fingerprint)); }
test('样本矩阵：4200局2240组，全部组合和排列完整', () => {
  const schedule = formalSchedule();
  assert.equal(schedule.length, 4200);
  const groups = new Map();
  const counts = {};
  for (const s of schedule) {
    counts[s.experiment + s.players] = (counts[s.experiment + s.players] || 0) + 1;
    if (!groups.has(s.groupId)) groups.set(s.groupId, []);
    groups.get(s.groupId).push(s);
  }
  assert.equal(groups.size, 2240);
  assert.deepEqual(counts, { neutral2: 600, neutral3: 600, neutral4: 600, cross2: 480, cross3: 960, cross4: 960 });
  for (const g of groups.values()) {
    const expected = g[0].experiment === 'neutral' ? 1 : ({ 2: 2, 3: 6, 4: 24 })[g[0].players];
    assert.equal(g.length, expected);
    assert.equal(new Set(g.map(s => s.policiesBySeat.join(','))).size, expected);
  }
});
test('种子标识：独立组无碰撞，轮换保留偏好随机种子', () => {
  const schedule = formalSchedule();
  assert.deepEqual(schedule, formalSchedule());
  const byGroup = new Map();
  for (const s of schedule) {
    const first = byGroup.get(s.groupId);
    if (!first) { byGroup.set(s.groupId, s); continue; }
    assert.equal(s.engineSeed, first.engineSeed);
    for (const policy of s.roster) {
      const seat = s.policiesBySeat.indexOf(policy), initial = first.policiesBySeat.indexOf(policy);
      assert.equal(s.policySeedsByPlayer[`p${seat}`], first.policySeedsByPlayer[`p${initial}`]);
    }
  }
  assert.equal(new Set([...byGroup.values()].map(s => s.engineSeed)).size, 2240);
  const debug = buildSchedule(buildConfig(parseArgs(['--games', '2', '--players', '2']), fingerprint));
  assert.equal(debug[0].engineSeed, 22); assert.equal(debug[1].engineSeed, 23);
  assert.equal(debug[0].source, 'debug');
});
test('交错顺序：前缀覆盖各实验，组内排列连续且稳定', () => {
  const schedule = formalSchedule();
  assert.deepEqual(schedule.slice(0, 3).map(s => s.players), [2, 3, 4]);
  assert.equal(schedule.slice(0, 63).filter(s => s.seedOrdinal === 0).length, 63);
  const finished = new Set(); let group = null;
  for (const s of schedule) {
    if (s.groupId !== group) { if (group) finished.add(group); assert.equal(finished.has(s.groupId), false); group = s.groupId; }
  }
  assert.equal(schedule.at(-1).seedOrdinal, 599);
});
