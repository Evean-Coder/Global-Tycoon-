'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const f=require('./helpers/gameplayFixtures');
test('建立固定输入与假时钟夹具',()=>{const a=f.game(),b=f.game();a.players[0].cash=0;assert.equal(b.players[0].cash,150000);assert.notEqual(a.gameId,b.gameId);assert.equal(f.game(2,1).ruleVersion,1);const c=f.fakeClock();let hit=0;c.setTimeout(()=>hit++,50);c.advance(49);assert.equal(hit,0);c.advance(1);assert.equal(hit,1);});
