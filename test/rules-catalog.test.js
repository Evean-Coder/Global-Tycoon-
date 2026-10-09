'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs');
const { content, build } = require('../scripts/build-rules-catalog');
const source = require('../src/gameplayCatalog');
test('公开规则资料准确、确定性生成且检查不写入', () => {
  assert.equal(build(true), true);
  const file = require('node:path').join(__dirname, '../public/rules-catalog.js');
  const before = fs.readFileSync(file, 'utf8');
  assert.equal(before, content());
  const context = { window: {} }; vm.runInNewContext(before, context);
  const catalog = JSON.parse(JSON.stringify(context.window.RULES_CATALOG));
  assert.deepEqual(catalog.opportunities, source.OPPORTUNITIES);
  assert.deepEqual(catalog.news, source.NEWS);
  assert.equal(catalog.opportunities.length, 12);
  assert.deepEqual(Object.keys(catalog).sort(), ['news', 'opportunities', 'regions']);
  assert.equal(build(true), true);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  try {
    fs.writeFileSync(file, 'invalid catalogue');
    assert.equal(build(true), false);
    assert.equal(fs.readFileSync(file, 'utf8'), 'invalid catalogue');
  } finally { fs.writeFileSync(file, before); }
});
