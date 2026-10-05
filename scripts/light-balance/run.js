'use strict';
const { performance } = require('node:perf_hooks');
const ENTRY = performance.now();
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, fingerprintSources, policyConfigs } = require('../balance/config');
const { OLD_HASH } = require('../review-balance');
const { CAPS, LIMIT, digest, write, BudgetStop, createMeter, lock } = require('./control');
const cases = require('./cases');
const branches = require('./branches');
const SOURCE_FILES = ['artifacts/gameplay-balance/formal-budget.json', 'docs/balance-review/stage-a-summary.json', 'docs/balance-review/stage-b-summary.json', 'docs/balance-review/stage-c-summary.json',
  'artifacts/gameplay-balance/review-a-20261002/summary.json', 'artifacts/gameplay-balance/review-c-20261002/summary.json'];
const TOOL_FILES = ['scripts/light-balance/control.js', 'scripts/light-balance/cases.js', 'scripts/light-balance/branches.js', 'scripts/light-balance/run.js'];
const hashes = files => Object.fromEntries(files.map(f => [f, digest(fs.readFileSync(path.join(ROOT, f), 'utf8'))]));
function finishStatus(result) {
  return result.missingCases.length || result.missingPairs.length || result.cases.some(c => !c.ok) || result.pairs.some(p => !p.complete) ? 'partial' : 'complete';
}
function compact(result) {
  const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
  return { ...result, cases: result.cases.map(c => ({ ...without(c, ['finalState', 'events', 'actions']), evidencePath: 'case-' + c.id + '.json' })),
    pairs: result.pairs.map(p => ({ ...without(p, ['initialState', 'branches']), evidencePath: 'pair-' + p.id + '.json',
      branches: p.branches.map(b => ({ ...without(b, ['trace', 'finalState']), evidencePath: result.repair?.replacedBranches?.some(r => r.pairId === p.id && r.choice === b.choice) ? 'repair.json' : 'pair-' + p.id + '.json' })) })) };
}
function report(result) {
  const rows = result.pairs.map(p => '| ' + [p.id, p.condition, p.complete ? '完整' : '不完整', ...p.branches.map(b => b.final.players[0].cash), ...p.branches.map(b => b.minCash), p.randomDiverged ? '有' : '无'].join(' | ') + ' |');
  return '# 有限预算平衡检验实际结果\n\n日期：2026-10-03。受控局面与短分支，不是总体胜率样本。\n\n' +
    '- 核心案例实际 ' + result.cases.length + '/48，通过 ' + result.cases.filter(c => c.ok).length + '，失败 ' + result.cases.filter(c => !c.ok).length + '。\n' +
    '- 成对实验实际 ' + result.pairs.length + '/12，完整 ' + result.pairs.filter(p => p.complete).length + '；短分支 ' + result.pairs.reduce((n, p) => n + p.branches.length, 0) + '。\n' +
    '- 新增完整对局0，边界补例0，真人体验未执行；旧统计门槛与证据不足结论保留。\n' +
    '- 程序活动累计 ' + (Object.values(result.budget.used).reduce((a, b) => a + b, 0) / 1000).toFixed(3) + '秒；登记上限1200秒。最终落盘的边界开销以台账为准。\n' +
    '- 原源码/旧预算及摘要保护 ' + (result.protection.ok ? '一致' : '失败') + '。\n\n' +
    '## 成对短分支\n\n首决定分别为投入/保留（航空为飞/不飞），后续统一neutral策略。每条最多10轮或160动作。\n\n' +
    '| 对照 | 条件 | 完整性 | 投入末现金 | 保留末现金 | 投入最低现金 | 保留最低现金 | 随机消费分歧 |\n|---|---|---|---:|---:|---:|---:|---|\n' + rows.join('\n') +
    '\n\n现金、资产、出局和基金在JSON中分别记录；末现金较高不能当作胜利。同种子在不同动作后可能产生不同后续轨迹，不能把路径差全归因于首个决定。\n\n' +
    '## 结论边界\n\n' +
    '本程序核对受控案例是否符合既定规则。检查失败需要独立分析是规则问题还是人工局面/预期/工具问题；通过表示这些检查点符合预期，不表示所有合法路径均无套利。长期座位公平、路线强弱、真人体验仍未验证。最终人工复核及改进排序见项目文档中的results.md。\n';
}
function run(output = 'artifacts/gameplay-balance/lightweight-20261003') {
  const dir = path.resolve(ROOT, output), allowed = path.resolve(ROOT, 'artifacts/gameplay-balance');
  if (!dir.startsWith(allowed + path.sep)) throw new Error('必须在独立验证目录');
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(path.join(dir, 'completed.json'))) throw new Error('已完成目录禁止覆盖');
  const unlock = lock(dir), meter = createMeter(dir), read = name => JSON.parse(fs.readFileSync(path.join(dir, name)));
  const core = cases.catalog(), pairs = branches.catalog();
  let result;
  try {
    const prepareStarted = performance.now();
    meter.ledger.used.A += prepareStarted - ENTRY; meter.save();
    meter.measure('A', guard => {
      guard();
      const fp = fingerprintSources(); if (fp.hash !== OLD_HASH) throw new Error('原规则指纹变化，不能混用既有证据');
      const registration = { source: 'controlled-lightweight', date: '2026-10-03', sourceHash: fp.hash, toolHashes: hashes(TOOL_FILES),
        proposalHash: digest(fs.readFileSync(path.join(ROOT, 'docs/balance-lightweight/proposal.md'), 'utf8')),
        cases: core.map(c => ({ id: c.id, category: c.category, name: c.name })),
        pairs: pairs.map(p => ({ id: p.id, condition: p.condition, seed: p.seed, policySeeds: p.policySeeds, inputHash: digest(p.state), actions: p.actions })),
        limits: { caps: CAPS, totalMs: LIMIT, cases: 48, extraCases: 0, pairs: 12, rounds: 10, actions: 160, fullGames: 0 } };
      if (fs.existsSync(path.join(dir, 'registration.json'))) { if (digest(read('registration.json')) !== digest(registration)) throw new Error('恢复版本/输入不同'); }
      else {
        write(dir, 'registration.json', registration); write(dir, 'protected-before.json', hashes(SOURCE_FILES));
        for (const file of TOOL_FILES) write(dir, 'executed-' + path.basename(file), fs.readFileSync(path.join(ROOT, file), 'utf8'));
      }
      const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/balance-review/stage-c-summary.json')));
      write(dir, 'existing-evidence.json', { source: 'read-only-existing', files: SOURCE_FILES, policies: policyConfigs(), oldC: { coverage: old.coverage, comparisons: old.comparisons?.length || 51 },
        note: '既有120局不重新运行，旧统计不足保留；策略储备/估值/机遇偏好不同，不能直接认定投资/航空规则强弱。' });
    });
    function phase(stage, items, prefix, execute) {
      try { meter.measure(stage, guard => { for (const item of items) { guard(); const file = prefix + item.id + '.json'; if (fs.existsSync(path.join(dir, file))) continue;
        const value = execute(item, guard, meter.checkpoint); write(dir, file, value); meter.checkpoint(); console.log(stage + ' ' + item.id + ' ' + (value.ok === false || value.complete === false ? '需要复核' : '完成'));
      } }); } catch (e) { if (!(e instanceof BudgetStop)) throw e; write(dir, 'pause-' + stage + '-' + meter.ledger.runs + '.json', { stage, message: e.message, ledger: meter.ledger }); }
    }
    phase('B', core, 'case-', c => cases.executeCase(c));
    phase('C', pairs, 'pair-', branches.runPair);
    meter.measure('D', guard => {
      guard();
      const previous = read('protected-before.json'), after = hashes(SOURCE_FILES), fp = fingerprintSources();
      const changed = Object.keys(previous).filter(f => previous[f] !== after[f]);
      const protection = { ok: !changed.length && fp.hash === OLD_HASH, changed, sourceHash: fp.hash, protectedFiles: SOURCE_FILES.length, sourceFiles: fp.files.length };
      if (!protection.ok) throw new Error('旧证据保护失败');
      const outputs = (items, prefix) => items.filter(i => fs.existsSync(path.join(dir, prefix + i.id + '.json'))).map(i => read(prefix + i.id + '.json'));
      result = { source: 'controlled-lightweight', output, cases: outputs(core, 'case-'), pairs: outputs(pairs, 'pair-'),
        missingCases: core.filter(i => !fs.existsSync(path.join(dir, 'case-' + i.id + '.json'))).map(i => i.id),
        missingPairs: pairs.filter(i => !fs.existsSync(path.join(dir, 'pair-' + i.id + '.json'))).map(i => i.id),
        fullGames: 0, extraCases: 0, humanTesting: '未执行', protection, budget: meter.ledger, registrationHash: digest(read('registration.json')) };
      write(dir, 'results.json', compact(result)); write(dir, 'results.md', report(result)); meter.checkpoint();
    });
    const status = finishStatus(result);
    write(dir, status === 'complete' ? 'completed.json' : 'paused.json', { status, budget: meter.ledger, output, counts: { cases: result.cases.length, passed: result.cases.filter(c => c.ok).length,
      pairs: result.pairs.length, completePairs: result.pairs.filter(p => p.complete).length }, errors: [...result.cases.filter(c => !c.ok).map(c => c.id), ...result.pairs.filter(p => !p.complete).map(p => p.id)] });
    console.log(JSON.stringify({ status, cases: result.cases.length, passed: result.cases.filter(c => c.ok).length, pairs: result.pairs.length, completePairs: result.pairs.filter(p => p.complete).length, usedMs: meter.total(), fullGames: 0 }));
    return result;
  } finally { meter.save(); unlock(); }
}
if (require.main === module) { try { const result = run(process.argv[2]); process.exitCode = result.cases.some(c => !c.ok) || result.pairs.some(p => !p.complete) ? 2 : result.missingCases.length || result.missingPairs.length ? 3 : 0; } catch (e) { console.error(e.stack); process.exitCode = 2; } }
module.exports = { run, report, compact, finishStatus };
