'use strict';
// Documentation structure checks only; these do not validate game implementation.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const names = ['spec.md', 'plan.md', 'task.md', 'checklist.md'];
const docs = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(__dirname, name), 'utf8')]));
const checks = [];
function check(name, run) { run(); checks.push({ name, passed: true }); }
function uniqueSequence(values, size) {
  assert.equal(values.length, size);
  assert.deepEqual(values.map(Number).sort((a,b) => a-b), Array.from({length:size}, (_,i) => i+1));
}
check('15 functional requirements and 21 acceptance criteria are distinct', () => {
  uniqueSequence([...docs['spec.md'].matchAll(/^### F(\d+)：/gm)].map(m => m[1]), 15);
  uniqueSequence([...docs['spec.md'].matchAll(/^- AC(\d+)（/gm)].map(m => m[1]), 21);
  for (let i=1; i<=15; i++) assert.ok(new RegExp('^- AC\\d+（[^\\n]*\\bF'+i+'(?=[、）])', 'm').test(docs['spec.md']), 'F'+i+' missing AC');
});
check('32 tasks contain files, dependencies, steps and verification', () => {
  const tasks = [...docs['task.md'].matchAll(/^## T(\d+)：[\s\S]*?(?=^## |$(?![\s\S]))/gm)];
  uniqueSequence(tasks.map(m => m[1]), 32);
  for (const task of tasks) {
    for (const label of ['文件','依赖','步骤','验证']) assert.ok(task[0].includes('**'+label+'：**'), 'T'+task[1]+' '+label);
    const line = task[0].match(/\*\*依赖：\*\*([^\n]*)/)[1];
    for (const dep of line.matchAll(/T(\d+)/g)) assert.ok(Number(dep[1]) < Number(task[1]), 'dependency must precede task');
  }
});
check('54 observations cover all 21 acceptance criteria', () => {
  const items = [...docs['checklist.md'].matchAll(/^- \[[ x]\] C(\d+)（([^\n]+)$/gm)];
  uniqueSequence(items.map(m => m[1]), 54);
  assert.equal((docs['checklist.md'].match(/^- \[[xX]\]/gm)||[]).length, 53);
  for (let i=1; i<=21; i++) assert.ok(items.some(m => new RegExp('\\bAC'+i+'\\b').test(m[2])), 'AC'+i+' missing observation');
});
check('formal documents have no placeholders or broken local Markdown links', () => {
  for (const [name, content] of Object.entries(docs)) {
    assert.ok(!/\b(?:TODO|TBD|FIXME)\b/.test(content), name);
    for (const m of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|#)/.test(m[1])) continue;
      assert.ok(fs.existsSync(path.resolve(__dirname, m[1].split('#')[0])), name+' '+m[1]);
    }
  }
});
const result = {date:'2026-10-17', scope:'Documentation structure only; runtime evidence is recorded separately in acceptance.md', passed:checks.length, checks, requirements:15, acceptanceCriteria:21, tasks:32, checkedObservations:53, uncheckedObservations:1, fullGames:0};
fs.writeFileSync(path.join(__dirname, 'document-audit-results.json'), JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify(result,null,2)+'\n');
