'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),active=require('../src/activeManagement'),{createGameState}=require('../src/state'),{own,fakeClock}=require('./helpers/gameplayFixtures'),{normalizeAction}=require('../src/actionValidation'),logic=require('../src/gameLogic'),{snapshot}=require('../src/gameView'),{createActionClock}=require('../src/actionClock');
function fixture(){const s=createGameState('PROMPT',['甲','乙'],2,{activeManagementRevision:active.REVISION});s.phase='waiting_roll';s.pending=null;own(s,'p0','内罗毕');return s;}
test('v3 explicitly skipping spends no money or lap quota and cannot buy again until next turn',()=>{
 const s=fixture(),p=s.players[0],cash=p.cash,before={...p.activeManagement},a=normalizeAction(s,{type:'active_skip'});assert.ok(a.ok);const result=logic.apply(s,a.action,()=>.5);assert.equal(s.phase,'waiting_roll');assert.equal(p.cash,cash);assert.equal(p.activeManagement.stockBoughtTotal,before.stockBoughtTotal);assert.equal(p.activeManagement.promotionStartedLap,before.promotionStartedLap);assert.equal(active.required(s,p.id),false);assert.equal(active.quote(s,p.id,'active_build','内罗毕').ok,false);assert.equal(normalizeAction(s,{type:'active_skip'}).ok,false);assert.equal(result.events.filter(e=>e.kind==='management_skipped').length,1);
 const self=snapshot(s,p.id).self.activeManagement;assert.equal(self.skippedThisTurn,true);assert.equal(self.usedThisTurn,false);assert.equal(snapshot(s,'p1').players[0].activeManagement,undefined);s.turnId++;assert.ok(active.required(s,p.id));
});
test('skip is only legal for the current normal decision, and does not add time',()=>{
 for(const phase of ['stock','self_rescue','opportunity_choose','route_choose','jail_turn']){const s=fixture();s.phase=phase;assert.equal(normalizeAction(s,{type:'active_skip'}).ok,false);}
 const s=fixture(),time=fakeClock(),clock=createActionClock(time);clock.sync(s,()=>{});time.advance(1000);const end=clock.deadlineMs;active.skip(s,s.players[0],[]);clock.sync(s,()=>{});assert.equal(clock.deadlineMs,end);assert.equal(normalizeAction(s,{type:'roll_dice'}).ok,true);
});
test('v3 trusted timeout skips and rolls without investing, v2 retains its spending rule',()=>{
 for(const revision of [active.REVISION,active.REQUIRED_REVISION]){const s=createGameState('TIME',['甲','乙'],2,{activeManagementRevision:revision});s.phase='waiting_roll';s.pending=null;own(s,'p0','内罗毕');const cash=s.players[0].cash,a=normalizeAction(s,{type:'management_timeout'},{source:'timeout'});assert.ok(a.ok);const r=logic.apply(s,a.action,()=>.1,{source:'timeout'});assert.ok(!r.rejected);assert.ok(s.dice>0);assert.equal(s.players[0].cash,revision===active.REVISION?cash:cash-108);assert.equal(r.events.some(e=>e.kind==='management_skipped'),revision===active.REVISION);}
});
test('AI may skip when every investment breaks its cash reserve, and old versions reject skip',()=>{
 const s=fixture();s.players[0].cash=110;const view=snapshot(s,'p0'),bot=require('../src/botPolicy');for(const action of [bot.choose(view),bot.fallback(view),bot.choose(view,{steps:99})]){assert.equal(action.type,'active_skip');assert.ok(normalizeAction(s,action).ok);}
 for(const rev of [active.LEGACY_REVISION,active.REQUIRED_REVISION]){s.activeManagementRevision=rev;assert.equal(normalizeAction(s,{type:'active_skip'}).ok,false);}
});
