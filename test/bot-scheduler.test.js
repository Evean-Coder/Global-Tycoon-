'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),bots=require('../src/botScheduler'),{createGameState}=require('../src/state');
const delay=()=>new Promise(r=>setTimeout(r,40));
function room(){const state=createGameState('B',['人','电脑'],2);state.phase='waiting_roll';state.pending=null;state.turnIndex=1;return {state,players:[{id:'p0',connected:true},{id:'p1',kind:'bot',connected:true}],actionClock:{paused:false,decisionId:1},botDelayMs:10};}
test('旧决定/换局回调取消，同一决定重复发布只调度一次',async()=>{
 const r=room();let count=0;const execute=()=>{count++;r.state.phase='game_over';};
 bots.sync(r,execute);const old=[...r.botJobs.values()][0];r.actionClock.decisionId++;bots.sync(r,execute);assert.notEqual([...r.botJobs.values()][0],old);bots.sync(r,execute);assert.equal(r.botJobs.size,1);await delay();assert.equal(count,1);assert.equal(r.botJobs.size,0);
 const s=room();bots.sync(s,()=>count++);s.state=createGameState('NEW',['人','电脑'],2);bots.sync(s,()=>count++);bots.stop(s);await delay();assert.equal(count,1);
});
test('无人在线、暂停、结束与阻断重复失败均不调度',async()=>{
 const r=room();let count=0;const execute=()=>count++;
 bots.sync(r,execute);r.players[0].connected=false;bots.sync(r,execute);await delay();assert.equal(count,0);
 r.players[0].connected=true;r.actionClock.paused=true;bots.sync(r,execute);assert.equal(r.botJobs.size,0);
 r.actionClock.paused=false;r.botMemory.set('p1',{blockedKey:r.state.gameId+'|1|p1|0'});bots.sync(r,execute);assert.equal(r.botJobs.size,0);
 r.state.phase='game_over';bots.sync(r,execute);assert.equal(r.botJobs.size,0);
});
