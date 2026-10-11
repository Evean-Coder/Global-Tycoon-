'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createActionClock,OPPORTUNITY_CHOICE_SECONDS}=require('../src/actionClock'),{createGameState}=require('../src/state'),f=require('./helpers/gameplayFixtures');
test('两模式两类机遇60秒，同机会更新不补时，整局余8秒优先',()=>{
 assert.equal(OPPORTUNITY_CHOICE_SECONDS,60);
 for(const mode of ['normal','quick'])for(const phase of ['opportunity_choose','route_choose']){
  const s=createGameState('TIME',['甲','乙'],2,{routeRevision:'opportunity-routes-v1',gameMode:mode,...(mode==='quick'?{quickRevision:'quick-mode-v1'}:{})});s.phase=phase;s.opportunityStage={stageId:'one'};s.routeFlow.activeChoice={playerId:'p0',opportunityId:'one'};
  const time=f.fakeClock(),clock=createActionClock(time);let hits=0;clock.sync(s,()=>hits++);assert.equal(clock.remainingSeconds(),60);const deadline=clock.deadlineMs;
  time.advance(10000);clock.sync(s,()=>hits++);assert.equal(clock.remainingSeconds(),50);assert.equal(clock.deadlineMs,deadline);clock.pause();time.advance(120000);assert.equal(clock.remainingSeconds(),50);clock.resume(()=>hits++);time.advance(49999);assert.equal(hits,0);time.advance(1);assert.equal(hits,1);clock.clear();
  clock.sync(s,()=>hits++,true,8000);assert.equal(clock.remainingSeconds(),8);time.advance(8000);assert.equal(hits,2);clock.clear();
 }
});
