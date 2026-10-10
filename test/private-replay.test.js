'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGameState}=require('../src/state'),journal=require('../src/privateReplay'),support=require('../src/propertySupport'),active=require('../src/activeManagement'),logic=require('../src/gameLogic');
test('私人计数、产权与经营按有序状态变更重建，公开记录不泄漏',{timeout:5000},()=>{
 const state=createGameState('REPLAY',['甲','乙'],2,{propertySupportRevision:support.REVISION,activeManagementRevision:active.REVISION});state.phase='waiting_roll';state.pending=null;state.firstRoundDone=true;
 const room={state,events:[],code:'REPLAY'};journal.capture(room);
 for(let i=0;i<6;i++){state.turnId++;support.beginRoll(state,state.players[0]);support.finish(state,state.players[0]);journal.capture(room,{source:'turn_completed',turnId:state.turnId});}
 const cid=support.candidates(state)[0],q=support.quote(state,'p0',cid),action={type:'support_buy',cityId:cid,quoteVersion:q.quoteVersion};logic.apply(state,action,()=>.5);journal.capture(room,{action,source:'player'});
 const quote=active.quote(state,'p0','active_promote',cid),promotion={type:'active_promote',cityId:cid,quoteVersion:quote.quoteVersion};logic.apply(state,promotion,()=>.5);journal.capture(room,{action:promotion,source:'player'});
 active.rentCompleted(state,{cityId:cid,playerId:'p1',finalAmount:100},'rent-fixed',[]);journal.capture(room,{source:'rent_completed'});
 const exported=journal.exportJournal(room);assert.deepEqual(journal.replay(exported),JSON.parse(JSON.stringify(state)));assert.equal(exported.frames[6].metadata.action.type,'support_buy');
 const record=require('../src/record').buildGameRecord(room,'normal');assert.equal(record.privateReplay,undefined);assert.equal(JSON.stringify(record).includes('missedPurchaseTurns'),false);
 exported.frames[0].hash='wrong';assert.throws(()=>journal.replay(exported),/校验失败/);
 const old={state:createGameState('OLD',['甲','乙'])};journal.capture(old);assert.equal(journal.exportJournal(old),null);
});
