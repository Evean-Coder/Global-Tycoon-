'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGameState}=require('../src/state'),routes=require('../src/opportunityRoutes'),opp=require('../src/opportunities');
const {normalizeAction}=require('../src/actionValidation'),{createActionClock}=require('../src/actionClock');
const f=require('./helpers/gameplayFixtures');
function ready(){
 const s=createGameState('SERVER',['甲','乙'],2,{routeRevision:routes.REVISION});
 for(const p of s.players)p.opportunities.selectedIds=['H1','H8','H10'];
 for(let ordinal=1;ordinal<=3;ordinal++){s.opportunityStage={ordinal,resolved:true};routes.markInitialResolved(s,ordinal);}
 for(let i=0;i<3;i++)opp.refresh(s.players[0]);routes.markLapProgress(s,'p0');routes.tryOpenRouteChoice(s,'p0',f.rng());return s;
}
function choice(s){const c=s.routeFlow.activeChoice;return {type:'route_confirm',opportunityId:c.opportunityId,candidateVersion:1,newId:c.candidateIds[0],replaceId:'H1'};}
test('S01 动作契约非法载荷越权与旧窗口',()=>{
 const s=ready(),a=choice(s),before=JSON.stringify(s);
 for(const raw of [null,{...a,newId:'bad'},{...a,replaceId:'H2'},{...a,candidateVersion:2},{...a,opportunityId:'old'}])assert.equal(normalizeAction(s,raw,{actorId:'p0',source:'player'}).ok,false);
 assert.equal(normalizeAction(s,a,{actorId:'p1',source:'player'}).ok,false);assert.equal(JSON.stringify(s),before);
 assert.equal(normalizeAction(s,a,{actorId:'p0',source:'player'}).ok,true);
});
test('S02 个人阶段只允许合法选择或服务端超时',()=>{
 const s=ready(),c=s.routeFlow.activeChoice;
 for(const type of ['roll_dice','mortgage','opportunity_reroll','surrender'])assert.equal(normalizeAction(s,{type},{actorId:'p0',source:'player'}).ok,false);
 assert.equal(normalizeAction(s,{type:'route_expire',opportunityId:c.opportunityId},{actorId:'p0',source:'player'}).ok,false);
 assert.equal(normalizeAction(s,{type:'route_expire',opportunityId:c.opportunityId},{source:'timeout'}).ok,true);
});
test('S03 决定身份时间与暂停恢复',()=>{
 const s=ready(),fake=f.fakeClock(),clock=createActionClock(fake);let expired=0;
 clock.sync(s,()=>expired++);assert.equal(clock.remainingMs,30000);fake.advance(8000);const deadline=clock.deadlineMs,id=clock.decisionId;
 clock.sync(s,()=>expired++);assert.equal(clock.deadlineMs,deadline);assert.equal(clock.decisionId,id);clock.pause();fake.advance(100000);assert.equal(expired,0);assert.equal(clock.remainingSeconds(),22);
 clock.resume(()=>expired++);fake.advance(22000);assert.equal(expired,1);clock.clear();
 const quick=ready();quick.gameMode='quick';clock.sync(quick,()=>expired++);assert.equal(clock.remainingMs,20000);quick.routeFlow.activeChoice.opportunityId+='new';clock.sync(quick,()=>expired++);assert.ok(clock.decisionId>id);clock.clear();
});
