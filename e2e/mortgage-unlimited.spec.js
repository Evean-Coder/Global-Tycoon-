'use strict';
/* global latestState */
const test=require('node:test'),assert=require('node:assert/strict'),{boot}=require('./helpers/browserHarness'),{createGameState}=require('../src/state'),f=require('../test/helpers/gameplayFixtures'),routes=require('../src/opportunityRoutes');
let h;test.before(async()=>{h=await boot({mobile:true,gameMode:'quick',quickClockOptions:f.fakeClock()});await h.choose();await h.pages[0].bringToFront();});test.after(async()=>{if(h)await h.close();});
function fixture(mode='normal'){const s=createGameState('LOANS',['甲','乙'],2,{routeRevision:'opportunity-routes-v1',gameMode:mode,...(mode==='quick'?{quickRevision:'quick-mode-v1'}:{})});f.own(s,'p0','内罗毕','开罗','开普敦','东京');s.cities['开罗'].mortgaged=true;s.cities['开普敦'].mortgaged=true;s.routeFlow.initialDueOrdinal=mode==='quick'?1:3;for(let ordinal=1;ordinal<=s.routeFlow.initialDueOrdinal;ordinal++){s.opportunityStage={ordinal,resolved:true};routes.markInitialResolved(s,ordinal);}return s;}
async function openBank(p){if(!await p.locator('#btnBank').isVisible())await p.locator('#btnMore').tap();await p.locator('#btnBank').tap();}
test('normal and quick allow a third mortgage from bank, assets and details on all screens',{timeout:60000},async()=>{
 const p=h.pages[0];for(const mode of ['normal','quick'])for(const [width,height]of [[320,700],[844,280],[768,1024],[1440,900]])for(const entry of ['bank','assets','detail']){
  await p.setViewportSize({width,height});await h.fixture(fixture(mode));let button;if(entry==='bank'){await openBank(p);button=p.locator('[data-mortgage-city="内罗毕"] button');}else if(entry==='assets'){await p.locator('#btnAssets').tap();button=p.locator('#modalBody .lrow').filter({hasText:'内罗毕'}).getByRole('button',{name:'抵押',exact:true});}else{await p.locator('#board [data-square-id="1"]').tap();button=p.locator('#modalBody').getByRole('button',{name:'抵押',exact:true});}
  assert.equal(await button.isEnabled(),true);assert.doesNotMatch(await p.locator('#modalBody').textContent(),/最多同时抵押|已达抵押上限/);const deadline=h.room.actionClock.deadlineMs,cash=h.room.state.players[0].cash;await button.tap();await p.waitForFunction(()=>latestState.cities['内罗毕'].mortgaged);assert.equal(h.room.state.players[0].cash,cash+1800);assert.equal(h.room.actionClock.deadlineMs,deadline);if(await p.locator('#modal').isVisible())await p.getByRole('button',{name:'关闭',exact:true}).last().tap();
 }
 assert.deepEqual(h.errors,[]);
});
test('third mortgages work in rescue and city, airport and build fundraising on a phone',async()=>{
 const p=h.pages[0];await p.setViewportSize({width:390,height:844});for(const mode of ['normal','quick'])for(const kind of ['self','city','airport','build']){
  const s=fixture(mode);s.players[0].cash=kind==='self'?-10000:1000;
  if(kind==='self'){s.phase='self_rescue';s.pending={kind:'self_rescue',playerId:'p0',due:10000,reason:'测试',resume:false};}else if(kind==='build'){s.phase='build_decide';s.pending={playerId:'p0',cityId:'东京'};s.players[0].position=37;}else{s.phase='buy_fundraise';s.pending={kind:'buy_fundraise',playerId:'p0',target:kind==='city'?{kind,cityId:'罗马'}:{kind,airportId:'开罗国际机场'}};}
  await h.fixture(s);let button;if(kind==='build'){await p.getByRole('button',{name:'募集资金',exact:true}).tap();button=p.locator('[data-mortgage-city="内罗毕"] button');}else button=p.locator('#modalBody button[onclick*="rescue_mortgage"][onclick*="内罗毕"]');assert.equal(await button.isEnabled(),true);const deadline=h.room.actionClock.deadlineMs;await button.tap();await p.waitForFunction(()=>latestState.cities['内罗毕'].mortgaged);assert.equal(h.room.state.players[0].cash,kind==='self'?-8200:2800);assert.equal(h.room.state.phase,s.phase);assert.equal(h.room.actionClock.deadlineMs,deadline);
  if(kind==='build'){await p.getByRole('button',{name:'返回建房',exact:true}).tap();assert.equal(await p.locator('#modalTitle').textContent(),'建房 / 拆房');}
 }
 assert.deepEqual(h.errors,[]);
});
