'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {game}=require('./helpers/gameplayFixtures');
test('初始化新规则状态及版本',()=>{for(const n of [2,3,4]){const s=game(n);assert.equal(s.ruleVersion,2);assert.equal(s.roundFlow.requiredIds.length,n);assert.equal(s.players[0].opportunities.rerollsLeft,1);assert.equal(s.stocks['上海'].operatingPrice,4000);}assert.equal(game(2,1).ruleVersion,1);});
