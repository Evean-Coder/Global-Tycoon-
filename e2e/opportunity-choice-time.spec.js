'use strict';
/* global latestState */
const test=require('node:test'),assert=require('node:assert/strict'),{boot}=require('./helpers/browserHarness'),{createGameState}=require('../src/state'),f=require('../test/helpers/gameplayFixtures'),opp=require('../src/opportunities'),routes=require('../src/opportunityRoutes');
let h,elapsed=0;const time=f.fakeClock();test.before(async()=>{h=await boot({mobile:true,gameMode:'quick',quickClockOptions:time});await h.choose();h.api.stopQuickTimers(h.room);const read=()=>({mode:'quick',gameId:h.room.state.gameId,elapsedMs:elapsed,totalRemainingMs:1800000-elapsed,closed:false});h.room.quickClock={read,stop:()=>{}};h.room.quickTimeProvider={read,close:()=>{throw new Error('fixture must stay before total deadline');}};});test.after(async()=>{if(h)await h.close();});
async function chooseInitial(){
 for(const page of h.pages){await page.bringToFront();await page.waitForFunction(v=>latestState.revision>=v&&latestState.phase==='opportunity_choose',h.room.state.revision);await page.waitForSelector('#choiceModal:not(.hidden)');await page.locator('#choiceCards button:not(:disabled)').first().click();}
 await h.pages[0].bringToFront();await h.pages[0].waitForSelector('#choiceModal',{state:'hidden'});
}
test('two modes and three screens show 60 seconds for initial and later opportunities',{timeout:60000},async(t)=>{
 const p=h.pages[0];p.setDefaultTimeout(5000);
 for(const mode of ['normal','quick'])for(const [width,height]of [[390,844],[768,1024],[1440,900]]){
  t.diagnostic(`${mode} ${width}x${height}: initial choice`);
  elapsed=0;
  await p.bringToFront();await p.setViewportSize({width,height});const s=createGameState('CHOICE',['甲','乙'],2,{routeRevision:routes.REVISION,gameMode:mode,...(mode==='quick'?{quickRevision:'quick-mode-v1'}:{})});s.routeFlow.initialDueOrdinal=1;opp.beginOpportunityStage(s,1,{kind:'start'},f.rng());await h.fixture(s);assert.match(await p.locator('#choiceTimer').textContent(),/60 秒/);const deadline=h.room.actionClock.deadlineMs;time.advance(10000);h.api.emitGame(h.room);await p.waitForFunction(()=>document.getElementById('choiceTimer').textContent.includes('50 秒'));assert.equal(h.room.actionClock.deadlineMs,deadline);await chooseInitial();assert.equal(h.room.state.phase,'waiting_roll');
  const later=globalThis.structuredClone(h.room.state);for(const player of later.players)player.opportunities.selectedIds=['H1','H8','H10'];for(let ordinal=1;ordinal<=3;ordinal++){later.opportunityStage={ordinal,resolved:true};routes.markInitialResolved(later,ordinal);}
  if(mode==='normal'){for(let n=0;n<3;n++)opp.refresh(later.players[0]);routes.markLapProgress(later,'p0');routes.tryOpenRouteChoice(later,'p0',f.rng());}else{const clock={mode:'quick',elapsedMs:900000,totalRemainingMs:900000,closed:false};routes.markQuickDue(later,clock);routes.tryOpenRouteChoice(later,'p0',f.rng(),clock);}
  t.diagnostic(`${mode} ${width}x${height}: later choice`);
  if(mode==='quick')elapsed=900000;
  await h.fixture(later);assert.match(await p.locator('#routeTimer').textContent(),/60 秒/);const routeDeadline=h.room.actionClock.deadlineMs;await p.locator('#routeCandidates button').first().tap();await p.locator('#btnRouteBack').tap();assert.equal(h.room.actionClock.deadlineMs,routeDeadline);const held=h.room.state.players[0].opportunities.selectedIds.slice();await p.locator('#btnRouteSkip').tap();await p.waitForFunction(()=>!latestState.self.routeChoice);assert.deepEqual(h.room.state.players[0].opportunities.selectedIds,held);
 }
 assert.deepEqual(h.errors,[]);
});
