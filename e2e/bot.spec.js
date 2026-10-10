/* global latestState, innerWidth */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright'),api=require('../server'),bots=require('../src/botScheduler');
let browser,url;const contexts=[],errors=[];
test.before(async()=>{await new Promise(r=>api.server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+api.server.address().port;browser=await chromium.launch({channel:process.env.CI?undefined:'msedge',headless:true});});
test.after(async()=>{for(const c of contexts)await c.close();for(const room of api.rooms.values()){bots.stop(room);room.actionClock.clear();api.stopQuickTimers(room);clearTimeout(room.hostTimer);}api.rooms.clear();await browser.close();await new Promise(r=>api.io.close(r));});
test('三端一个真人添加/移除电脑、真实开局和思考提示',{timeout:45000},async()=>{
 for(const [width,height]of [[1440,900],[768,1024],[390,844]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600,reducedMotion:'reduce'});contexts.push(context);const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url,{waitUntil:'networkidle'});await p.fill('#nickname','单人'+width);await p.click('#btnCreate');await p.waitForSelector('#view-room:not(.hidden)');
  assert.equal(await p.locator('#btnStart').isDisabled(),true);assert.equal(await p.locator('.orientation-hint').count(),0);
  await p.click('#btnAddBot');await p.waitForFunction(()=>!document.getElementById('btnStart').disabled);assert.match(await p.locator('#playerList').textContent(),/电脑.*标准/);
  await p.locator('[data-remove-bot]').click();await p.waitForFunction(()=>document.getElementById('btnStart').disabled&&!document.getElementById('btnAddBot').disabled);await p.click('#btnAddBot');await p.waitForFunction(()=>!document.getElementById('btnStart').disabled);
  const code=(await p.locator('#roomCode').textContent()).trim(),room=api.rooms.get(code);room.botDelayMs=400;
  await p.click('#btnStart');await p.waitForSelector('#choiceModal:not(.hidden)');await p.waitForFunction(()=>latestState?.botThinking?.length>0);
  await p.locator('#choiceCards button').first().click();await p.waitForSelector('#choiceModal',{state:'hidden'});assert.equal(room.state.players[1].opportunities.selectedIds.length,1);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await p.locator('#btnRoll').click();await p.waitForFunction(()=>latestState?.revision>2);
  bots.stop(room);room.actionClock.clear();await context.close();
 }
 assert.deepEqual(errors,[]);
});
