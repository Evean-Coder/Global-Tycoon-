/* global latestState, innerWidth, requestAnimationFrame */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),api=require('../server'),bots=require('../src/botScheduler');
let browser,url;const contexts=[],errors=[];
test.before(async()=>{await new Promise(r=>api.server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+api.server.address().port;browser=await chromium.launch({channel:process.env.CI?undefined:'msedge',headless:true});});
test.after(async()=>{for(const c of contexts)await c.close();for(const r of api.rooms.values()){bots.stop(r);r.actionClock.clear();api.stopQuickTimers(r);clearTimeout(r.hostTimer);}api.rooms.clear();await browser.close();await new Promise(r=>api.io.close(r));});
for(const opponent of ['human','bot'])test('手机下方信息真实可见且未被棋盘覆盖：'+opponent,{timeout:30000},async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});contexts.push(context);
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url,{waitUntil:'networkidle'});await p.fill('#nickname','手机玩家');await p.click('#btnCreate');await p.waitForSelector('#view-room:not(.hidden)');
 const code=(await p.locator('#roomCode').textContent()).trim(),room=api.rooms.get(code);let guest;
 if(opponent==='bot'){await p.click('#btnAddBot');room.botDelayMs=200;}
 else{guest=await context.newPage();await guest.goto(url,{waitUntil:'networkidle'});await guest.fill('#nickname','真人对手');await guest.fill('#joinCode',code);await guest.click('#btnJoin');}
 await p.waitForFunction(()=>!document.getElementById('btnStart').disabled);await p.click('#btnStart');await p.waitForSelector('#choiceModal:not(.hidden)');await p.locator('#choiceCards button').first().click();
 if(guest)await guest.locator('#choiceCards button').first().click();await p.waitForSelector('#choiceModal',{state:'hidden'});
 const initial=await p.evaluate(()=>({revision:latestState.revision,decision:latestState.decision?.decisionId}));
 const measurements=[];
 for(const width of [320,390,430,768]){
  await p.setViewportSize({width,height:844});
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const layout=await p.evaluate(()=>{const board=document.getElementById('boardWrap').getBoundingClientRect(),side=document.getElementById('side').getBoundingClientRect();return {boardHeight:board.height,sideAfterBoard:side.top>=board.bottom,overflow:document.documentElement.scrollWidth>innerWidth+1};});
  assert.equal(layout.sideAfterBoard,true,width+'px 玩家/事件必须排在棋盘后，不能叠在棋盘背后');assert.equal(layout.overflow,false);
  const rows=[];
  for(const id of ['newsBar','turnSummary','sidePlayer','sideOthers','log']){
   const m=await p.evaluate(id=>{const e=document.getElementById(id);e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),clip=document.getElementById('gameMain').getBoundingClientRect(),x=r.left+r.width/2,y=(Math.max(r.top,clip.top)+Math.min(r.bottom,clip.bottom))/2;const hit=document.elementFromPoint(x,y);return {id,text:e.textContent,visible:r.height>0&&r.bottom>clip.top&&r.top<clip.bottom,uncovered:!!hit&&e.contains(hit)};},id);
   assert.equal(m.visible,true,width+'px '+id+'可滚动到');assert.equal(m.uncovered,true,width+'px '+id+'不能只存在于DOM而被别的元素覆盖');assert.ok(m.text.trim());rows.push(m);
  }
  measurements.push({width,...layout,rows});
  if(width===390){const dir=path.join(__dirname,'../docs/frontend-atlas/evidence');fs.mkdirSync(dir,{recursive:true});await p.screenshot({path:path.join(dir,'phone-information-'+opponent+'.png')});await p.evaluate(()=>document.getElementById('gameMain').scrollTop=0);await p.screenshot({path:path.join(dir,'phone-center-'+opponent+'.png')});}
 }
 assert.deepEqual(await p.evaluate(()=>({revision:latestState.revision,decision:latestState.decision?.decisionId})),initial,'查看/缩放不提交动作、不替换决定');
 fs.writeFileSync(path.join(__dirname,'../docs/frontend-atlas/evidence/mobile-information-'+opponent+'.json'),JSON.stringify(measurements,null,2));
 bots.stop(room);room.actionClock.clear();await context.close();assert.deepEqual(errors,[]);
});
