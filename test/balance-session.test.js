'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { controlledFixture, ownCity, grant } = require('./helpers/balanceFixtures');

test('场景来源：受控分支显式标记且正式模块不引用测试夹具', () => {
  const fixture = controlledFixture({ setup(s) { ownCity(s, 'p0', '上海', 1); grant(s, 'p0', ['H2']); } });
  assert.equal(fixture.source, 'controlled');
  assert.equal(fixture.state.cities['上海'].ownerId, 'p0');
  assert.deepEqual(fixture.state.players[0].opportunities.selectedIds, ['H2']);
  const root = path.join(__dirname, '../scripts/balance');
  for (const file of fs.readdirSync(root).filter(f => f.endsWith('.js'))) assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /require\([^)]*(?:balanceFixtures|test\/)/);
});
