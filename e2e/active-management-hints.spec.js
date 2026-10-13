'use strict';
/* global latestState */
const test=require('node:test'),assert=require('node:assert/strict'),{boot}=require('./helpers/browserHarness'),stocks=require('../src/stocks');
let h;test.before(async()=>{h=await boot({mobile:true,viewport:{width:844,height:390},gameMode:'quick'});await h.choose();});test.after(async()=>{if(h)await h.close();});
test('per-turn hint is visible, cancel retains opportunity, successful promotion consumes it',async()=>{
 let fixtureTurn=100;
 for(const mode of ['normal','quick'])for(const [width,height]of [[844,390],[768,1024],[1440,900]]){
 const s=require('../src/state').createGameState('HINT',['甲','乙'],2,{routeRevision:'opportunity-routes-v1',activeManagementRevision:'active-management-v1',gameMode:mode,...(mode==='quick'?{quickRevision:'quick-mode-v1'}:{})});s.turnId=fixtureTurn+=10;s.phase='waiting_roll';s.pending=null;s.routeFlow.initialCompletedOrdinal=1;s.routeFlow.initialDueOrdinal=1;stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p0'},[]);const p=h.pages[0];await p.setViewportSize({width,height});await h.fixture(s);await p.waitForFunction(()=>latestState.self.activeManagement.quotes.some(q=>q.ok));
 assert.match(await p.locator('#managementStatus').textContent(),/本回合可经营1项/);const deadline=h.room.actionClock.deadlineMs;await p.click('#btnManagement');assert.match(await p.locator('#managementBody').textContent(),/每回合成功一项.*每圈额度/);await p.getByRole('button',{name:'关闭查看',exact:true}).click();assert.equal(await p.locator('#btnManagement').isDisabled(),false);assert.equal(h.room.actionClock.deadlineMs,deadline);
 await p.click('#btnManagement');await p.locator('[data-management-type=active_promote]').click();await p.getByRole('button',{name:'确认限时促销',exact:true}).first().click();await p.waitForFunction(()=>latestState.self.activeManagement.usedThisTurn);assert.match(await p.locator('#managementStatus').textContent(),/本回合已经营/);assert.equal(await p.locator('#btnManagement').isDisabled(),true);assert.equal(await p.locator('#btnRoll').isDisabled(),false);assert.deepEqual(h.errors,[]);
 const next=globalThis.structuredClone(h.room.state);next.turnId+=2;await h.fixture(next);assert.equal(await p.locator('#btnManagement').isDisabled(),false);assert.match(await p.locator('#managementStatus').textContent(),/本回合可经营1项/);
 }
});
