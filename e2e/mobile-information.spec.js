/* global latestState, innerWidth, requestAnimationFrame, getComputedStyle */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),api=require('../server'),bots=require('../src/botScheduler');
let browser,url;const contexts=[],errors=[];
test.before(async()=>{await new Promise(r=>api.server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+api.server.address().port;browser=await chromium.launch({channel:process.env.CI?undefined:'msedge',headless:true});});
test.after(async()=>{for(const c of contexts)await c.close();for(const r of api.rooms.values()){bots.stop(r);r.actionClock.clear();api.stopQuickTimers(r);clearTimeout(r.hostTimer);}api.rooms.clear();await browser.close();await new Promise(r=>api.io.close(r));});
for(const opponent of ['human','bot'])test('手机横屏右侧信息真实可见且未被棋盘覆盖：'+opponent,{timeout:30000},async()=>{
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,reducedMotion:'reduce'});contexts.push(context);
 const p=await context.newPage();p.setDefaultTimeout(5000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url,{waitUntil:'networkidle'});await p.fill('#nickname','手机玩家');await p.click('#btnCreate');await p.waitForSelector('#view-room:not(.hidden)');
 const code=(await p.locator('#roomCode').textContent()).trim(),room=api.rooms.get(code);let guest;
 if(opponent==='bot'){await p.click('#btnAddBot');room.botDelayMs=200;}
 else{guest=await context.newPage();await guest.goto(url,{waitUntil:'networkidle'});await guest.fill('#nickname','真人对手');await guest.fill('#joinCode',code);await guest.click('#btnJoin');}
 await p.waitForFunction(()=>!document.getElementById('btnStart').disabled);await p.click('#btnStart');await p.waitForSelector('#choiceModal:not(.hidden)');await p.locator('#choiceCards button').first().click();
 if(guest)await guest.locator('#choiceCards button').first().click();await p.bringToFront();await p.waitForSelector('#choiceModal',{state:'hidden'});
 if(await p.locator('#btnCloseManagement').isVisible())await p.click('#btnCloseManagement');
 // Long owner names, houses and mortgage markers must fit even in the top row.
 room.state.players[0].name='十二字符昵称甲乙丙丁戊己';
 for(const cityId of ['内罗毕','上海','东京'])require('../src/stocks').transferCity(room.state,{cityId,newOwnerId:'p0'},[]);
 room.state.cities['内罗毕'].houseLevel=4;room.state.cities['上海'].houseLevel=4;room.state.cities['东京'].mortgaged=true;
 room.state.revision++;api.emitGame(room);await p.waitForFunction(v=>latestState.revision>=v,room.state.revision);
 // Acquiring the first executable city now correctly triggers the management prompt.
 await p.locator('#btnCloseManagement').waitFor({state:'visible'});await p.click('#btnCloseManagement');
 const initial=await p.evaluate(()=>({revision:latestState.revision,decision:latestState.decision?.decisionId}));
 const measurements=[];
 for(const width of [320,390,430,768]){
  await p.setViewportSize(width<=600?{width:844,height:width}:{width,height:1024});
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const layout=await p.evaluate(()=>{const board=document.getElementById('boardWrap').getBoundingClientRect(),side=document.getElementById('side').getBoundingClientRect();return {boardHeight:board.height,sideAfterBoard:side.top>=board.bottom,overflow:document.documentElement.scrollWidth>innerWidth+1};});
  if(width>600)assert.equal(layout.sideAfterBoard,true,width+'px 平板信息在棋盘后');assert.equal(layout.overflow,false);
  if(width<=600){
   const content=await p.evaluate(()=>({inside:[...document.querySelectorAll('#board .sq')].every(el=>{const box=el.getBoundingClientRect();return [...el.querySelectorAll('.nm,.own,.sq-amount,.subrow')].every(child=>{const r=child.getBoundingClientRect();return r.top>=box.top&&r.bottom<=box.bottom&&r.left>=box.left&&r.right<=box.right;});})}));
   assert.equal(content.inside,true,width+'px 长昵称、房屋及抵押标记均在格内');
  }
  const rows=[];
  for(const id of ['ledger','newsBar','sidePlayer','sideOthers','log']){
   const m=await p.evaluate(id=>{const e=document.getElementById(id);e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();let top=Math.max(0,r.top),bottom=Math.min(window.innerHeight,r.bottom);for(let parent=e.parentElement;parent;parent=parent.parentElement){if(/auto|scroll|hidden/.test(getComputedStyle(parent).overflowY)){const clip=parent.getBoundingClientRect();top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom);}}const hit=document.elementFromPoint(r.left+r.width/2,(top+bottom)/2);return {id,text:e.textContent,visible:r.height>0&&bottom>top,uncovered:!!hit&&e.contains(hit)};},id);
   assert.equal(m.visible,true,width+'px '+id+'可滚动到');assert.equal(m.uncovered,true,width+'px '+id+'不能只存在于DOM而被别的元素覆盖');assert.ok(m.text.trim());rows.push(m);
  }
  measurements.push({width,...layout,rows});
  if(width===390){const dir=path.join(__dirname,'../artifacts/mobile-playability');fs.mkdirSync(dir,{recursive:true});await p.screenshot({path:path.join(dir,'phone-information-'+opponent+'.png'),timeout:5000,animations:'disabled'});await p.evaluate(()=>document.getElementById('gameMain').scrollTop=0);await p.screenshot({path:path.join(dir,'phone-center-'+opponent+'.png'),timeout:5000,animations:'disabled'});}
 }
 assert.deepEqual(await p.evaluate(()=>({revision:latestState.revision,decision:latestState.decision?.decisionId})),initial,'查看/缩放不提交动作、不替换决定');
 fs.writeFileSync(path.join(__dirname,'../artifacts/mobile-playability/mobile-information-'+opponent+'.json'),JSON.stringify(measurements,null,2));
 bots.stop(room);room.actionClock.clear();await context.close();assert.deepEqual(errors,[]);
});
