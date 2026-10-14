'use strict';
/* global lastPos, game, animBusy, animQueued, moveTimer */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures');
const dir=process.env.E2E_EVIDENCE_ROOT?path.join(process.env.E2E_EVIDENCE_ROOT,'piece-speed'):path.join(__dirname,'../docs/piece-speed/evidence');
let h;
test.before(async()=>{fs.mkdirSync(dir,{recursive:true});h=await boot();await h.choose();await h.fixture(f.game(2));});
test.after(async()=>{if(h)await h.close();});
test('half-speed movement preserves queued state, final position and reduced-motion behavior',{timeout:30000},async()=>{
 const p=h.pages[0];await p.emulateMedia({reducedMotion:'no-preference'});
 assert.equal(await p.locator('#pieces .piece').first().evaluate(el=>window.getComputedStyle(el).transitionDuration),'0.24s, 0.24s');
 await p.evaluate(()=>{
  window.__moveTrace=[];window.__moveStarted=window.performance.now();
  window.__moveObserver=new window.MutationObserver(()=>{const position=lastPos.p0,trace=window.__moveTrace;if(position>0&&trace.at(-1)?.position!==position)trace.push({position,at:window.performance.now()-window.__moveStarted});});
  window.__moveObserver.observe(document.getElementById('pieces'),{childList:true});
 });
 const first=f.game(2);first.players[0].position=6;await h.fixture(first);await p.waitForFunction(()=>lastPos.p0===1);
 const next=f.game(2);next.players[0].position=8;await h.fixture(next);const revision=h.room.state.revision;
 await p.waitForFunction(v=>game.revision===v&&!animBusy&&animQueued===null&&lastPos.p0===8,revision);
 const result=await p.evaluate(()=>{
  window.__moveObserver.disconnect();const piece=document.querySelector('#pieces .piece').getBoundingClientRect(),tile=document.querySelector('[data-square-id="8"]').getBoundingClientRect();
  return {trace:window.__moveTrace,total:window.performance.now()-window.__moveStarted,piece:piece.toJSON(),tile:tile.toJSON(),position:game.players[0].position};
 });
 assert.deepEqual(result.trace.map(step=>step.position),[1,2,3,4,5,6,7,8]);assert.ok(result.trace[0].at>=180,JSON.stringify(result));
 for(let i=1;i<result.trace.length;i++)assert.ok(result.trace[i].at-result.trace[i-1].at>=160,JSON.stringify(result));
 assert.ok(result.trace.at(-1).at>=1600,JSON.stringify(result));assert.equal(result.position,8);
 assert.ok(Math.abs(result.piece.x+result.piece.width/2-result.tile.x-result.tile.width/2)<1&&Math.abs(result.piece.y+result.piece.height/2-result.tile.y-result.tile.height/2)<1);
 await p.locator('#btnAssets').click();await p.waitForSelector('#modalTitle:text-is("资产总览")');await p.getByRole('button',{name:'关闭',exact:true}).last().click();
 await p.emulateMedia({reducedMotion:'reduce'});const reduced=f.game(2);reduced.players[0].position=18;await h.fixture(reduced);
 await p.waitForFunction(v=>game.revision===v&&!animBusy&&lastPos.p0===18,h.room.state.revision);
 const reducedResult=await p.evaluate(()=>({position:lastPos.p0,busy:animBusy,queued:animQueued,timerActive:moveTimer!==null}));assert.deepEqual(reducedResult,{position:18,busy:false,queued:null,timerActive:false});
 fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify({browser:'Microsoft Edge headless',previousStepMs:110,currentStepMs:220,result,reducedResult},null,2));assert.deepEqual(h.errors,[]);
});
