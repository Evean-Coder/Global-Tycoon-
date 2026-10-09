'use strict';
/* global latestState, game, socket, routeDraft */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{chromium}=require('playwright');
const {boot}=require('./helpers/browserHarness'),{createGameState}=require('../src/state'),routes=require('../src/opportunityRoutes'),f=require('../test/helpers/gameplayFixtures');
let h;const evidence=path.join(__dirname,'../docs/opportunity-routes/browser-evidence'),measures=[];
function state(threshold=1){
 const s=createGameState(h.room.code,['浏览器甲','浏览器乙'],2,{routeRevision:routes.REVISION});
 s.gameId=h.room.state.gameId;
 for(const p of s.players)p.opportunities.selectedIds=['H1','H8','H10'];
 for(let ordinal=1;ordinal<=3;ordinal++){s.opportunityStage={ordinal,resolved:true};routes.markInitialResolved(s,ordinal);}
 s.players[0].opportunities.lapEpoch=threshold*3;s.players[0].opportunities.usage.H1=1;s.players[0].opportunities.visitedAirportIds=['开罗国际机场'];
 routes.markLapProgress(s,'p0');routes.tryOpenRouteChoice(s,'p0',f.rng());
 return s;
}
async function fixture(n=1){await h.fixture(state(n));await h.pages[0].waitForSelector('#routeModal:not(.hidden)');}
async function select(page){await page.locator('#routeCandidates button').first().click();await page.locator('#routeHeld button').first().click();}
test.before(async()=>{fs.mkdirSync(evidence,{recursive:true});h=await boot();for(const p of h.pages)await p.evaluate(()=>setInterval(()=>{window.__fixtureRevision=latestState.revision;},10));});
test.after(async()=>{if(h)await h.close();fs.writeFileSync(path.join(evidence,'measurements.json'),JSON.stringify({browser:'Microsoft Edge Chromium',physicalDevices:'未测；模拟视口和实际浏览器缩放另列',measures},null,2));});
test('B01 本人候选完整历史与初始界面分开',async()=>{
 const [a,b]=h.pages;assert.equal(await a.locator('#choiceModal').isVisible(),true);await h.choose();await fixture();
 assert.equal(await a.locator('#routeCandidates button').count(),3);assert.equal(await b.locator('#routeModal').isVisible(),false);assert.equal(await a.locator('#choiceModal').isVisible(),false);
 const text=await a.textContent('#routeModal');assert.ok(text.includes('本圈已用'));assert.ok(text.includes('开罗国际机场'));assert.ok(text.includes('后续选择不提供换组'));
 const before=JSON.stringify(h.room.state),deadline=h.room.actionClock.deadlineMs;await a.locator('#routeCandidates button').first().click();assert.equal(JSON.stringify(h.room.state),before);assert.equal(h.room.actionClock.deadlineMs,deadline);
});
test('B02 比较返回确认及主动跳过',async()=>{
 const a=h.pages[0];await fixture();const held=h.room.state.players[0].opportunities.selectedIds.slice();
 await a.locator('#routeCandidates button').first().click();assert.equal(await a.locator('#btnRouteConfirm').isDisabled(),true);
 await a.locator('#routeHeld button').first().click();assert.ok((await a.textContent('#routeComparison')).includes('失去'));
 await a.click('#btnRouteBack');assert.equal(await a.locator('#btnRouteConfirm').isDisabled(),true);assert.deepEqual(h.room.state.players[0].opportunities.selectedIds,held);
 await select(a);await a.click('#btnRouteConfirm');await a.waitForSelector('#routeModal',{state:'hidden'});assert.equal(h.room.state.phase,'waiting_roll');assert.equal(h.room.state.players[0].opportunities.selectedIds.length,3);
 await fixture(2);const before=JSON.stringify(h.room.state.players[0]);await a.click('#btnRouteSkip');await a.waitForSelector('#routeModal',{state:'hidden'});assert.equal(JSON.stringify(h.room.state.players[0]),before);assert.equal(h.room.state.routeFlow.players.p0.lastResult.outcome,'skipped');
});
test('B03 同窗口重绘及重连保留草稿，新窗口清理',async()=>{
 const a=h.pages[0];await fixture();await select(a);const draft=await a.evaluate(()=>({newId:routeDraft.newId,replaceId:routeDraft.replaceId,key:routeDraft.key}));
 h.room.state.revision++;h.api.emitGame(h.room);await a.waitForFunction(r=>game.revision===r,h.room.state.revision);assert.deepEqual(await a.evaluate(()=>({newId:routeDraft.newId,replaceId:routeDraft.replaceId,key:routeDraft.key})),draft);
 await a.evaluate(()=>socket.disconnect());await a.waitForFunction(()=>!socket.connected);await a.evaluate(()=>socket.connect());await a.waitForFunction(()=>socket.connected&&game.decision&&!game.decision.paused);
 assert.deepEqual(await a.evaluate(()=>({newId:routeDraft.newId,replaceId:routeDraft.replaceId,key:routeDraft.key})),draft);
 await fixture(2);assert.equal(await a.evaluate(()=>routeDraft.newId),null);assert.equal(await a.evaluate(()=>routeDraft.replaceId),null);
});
test('B04 失败草稿保留及迟到回执不覆盖新窗口',async()=>{
 const a=h.pages[0];await fixture();await select(a);
 await a.evaluate(()=>{window.__realRouteTimeout=socket.timeout.bind(socket);socket.timeout=()=>({emit:(event,payload,callback)=>{window.__lateRouteCallback=callback;window.__lateRoutePayload=payload;}});});
 await a.click('#btnRouteConfirm');assert.equal(await a.locator('#btnRouteConfirm').isDisabled(),true);const cash=h.room.state.players[0].cash;
 await a.evaluate(()=>window.__lateRouteCallback(null,{ok:false,error:'候选校验失败'}));assert.ok((await a.textContent('#routeError')).includes('候选校验失败'));assert.equal(await a.locator('#btnRouteConfirm').isEnabled(),true);assert.equal(h.room.state.players[0].cash,cash);
 await a.click('#btnRouteConfirm');await fixture(2);await select(a);const selected=await a.evaluate(()=>routeDraft.newId);await a.evaluate(()=>{window.__lateRouteCallback(null,{ok:true});socket.timeout=window.__realRouteTimeout;});
 assert.equal(await a.locator('#routeModal').isVisible(),true);assert.equal(await a.evaluate(()=>routeDraft.newId),selected);assert.equal(await a.locator('#btnRouteConfirm').isEnabled(),true);
});
test('B05 查看规则返回和超时不复活窗口',async()=>{
 const a=h.pages[0];await fixture();await select(a);const before=JSON.stringify(h.room.state),deadline=h.room.actionClock.deadlineMs;
 await a.click('#btnRouteRules');assert.ok((await a.textContent('#rulesBody')).includes('每完成3圈'));await a.click('#btnRulesClose');assert.equal(await a.locator('#routeModal').isVisible(),true);assert.equal(h.room.actionClock.deadlineMs,deadline);assert.equal(JSON.stringify(h.room.state),before);
 await a.click('#btnRouteRules');const c=h.room.state.routeFlow.activeChoice;h.api.runAction(h.room,null,{type:'route_expire',opportunityId:c.opportunityId},'timeout');await a.waitForFunction(()=>game.phase==='waiting_roll');await a.click('#btnRulesClose');assert.equal(await a.locator('#routeModal').isVisible(),false);
});
test('B04b 未确认只查询原操作身份，重复点击不新增请求',async()=>{
 const a=h.pages[0];await fixture();await select(a);
 await a.evaluate(()=>{window.__realRouteTimeout=socket.timeout.bind(socket);window.__routePayloads=[];socket.timeout=()=>({emit:(event,payload,callback)=>{window.__routePayloads.push(payload);queueMicrotask(()=>callback(new Error('模拟网络未确认')));}});});
 await a.click('#btnRouteConfirm');await a.waitForSelector('#btnRouteRetry:not(.hidden)');assert.equal(await a.locator('#btnRouteConfirm').isDisabled(),true);
 const ids=await a.evaluate(()=>window.__routePayloads.map(p=>p.actionId));assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
 await a.evaluate(()=>{socket.timeout=window.__realRouteTimeout;});await a.click('#btnRouteRetry');await a.waitForSelector('#routeModal',{state:'hidden'});assert.equal(h.room.state.routeFlow.players.p0.lastResult.outcome,'replaced');
});
test('B06 PC平板及手机短横屏滚动与触控',{timeout:60000},async()=>{
 const a=h.pages[0];await fixture();
 for(const [width,height]of [[1440,900],[768,1024],[1024,768],[568,320],[812,375]]){
  await a.setViewportSize({width,height});await a.waitForFunction(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
  for(const selector of ['#routeCandidates button','#routeHeld button'])for(const b of await a.locator(selector).all()){await b.scrollIntoViewIfNeeded();const r=await b.boundingBox();assert.ok(r.width>=44&&r.height>=44,JSON.stringify(r));}
  await select(a);for(const id of ['btnRouteConfirm','btnRouteSkip','btnRouteRules']){const b=a.locator('#'+id);await b.scrollIntoViewIfNeeded();const r=await b.boundingBox();assert.ok(r.height>=44&&r.width>=44);assert.ok(r.y>=0&&r.y+r.height<=height+1);}
  assert.equal(await a.locator('#routeTimer').isVisible(),true);const measurement=await a.evaluate(()=>({width:window.innerWidth,height:window.innerHeight,scrollWidth:document.documentElement.scrollWidth,dialog:document.querySelector('.route-dialog').getBoundingClientRect().toJSON(),timer:document.getElementById('routeTimer').getBoundingClientRect().toJSON()}));measures.push({label:width+'x'+height,...measurement});
  await a.screenshot({path:path.join(evidence,'route-'+width+'x'+height+'.png')});
 }
 await a.setViewportSize({width:1440,height:900});
});
test('B07 键盘与减少动画及200%内容缩放可操作',async()=>{
 const a=h.pages[0];await fixture();await a.locator('#routeCandidates button').first().focus();await a.keyboard.press('Enter');await a.locator('#routeHeld button').first().focus();await a.keyboard.press('Enter');await a.locator('#btnRouteConfirm').focus();await a.keyboard.press('Tab');assert.equal(await a.evaluate(()=>document.activeElement.closest('#routeModal')!==null),true);
 await a.evaluate(()=>{document.documentElement.style.zoom='2';});await a.waitForFunction(()=>document.documentElement.scrollWidth<=window.innerWidth+1);await a.locator('#btnRouteSkip').scrollIntoViewIfNeeded();await a.locator('#btnRouteSkip').focus();await a.keyboard.press('Enter');await a.waitForSelector('#routeModal',{state:'hidden'});assert.equal(h.room.state.routeFlow.players.p0.lastResult.outcome,'skipped');await a.evaluate(()=>{document.documentElement.style.zoom='';});measures.push({label:'200%-content-zoom',method:'CSS zoom=2; actual browser default zoom verified separately',reducedMotion:await a.evaluate(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches)});
});
test('B08 进度与版本规则不混入旧局',async()=>{
 const a=h.pages[0];await fixture();await a.click('#btnRouteSkip');await a.waitForSelector('#routeModal',{state:'hidden'});await a.click('#btnAssets');assert.ok((await a.textContent('#modalBody')).includes('距下一次路线调整还需 3 圈'));await a.getByRole('button',{name:'关闭',exact:true}).last().click();
 const old=createGameState(h.room.code,['浏览器甲','浏览器乙'],2);await h.fixture(old);await a.click('#btnRules');assert.equal((await a.textContent('#rulesBody')).includes('每完成3圈'),false);await a.click('#btnRulesClose');assert.equal(await a.locator('.route-progress:visible').count(),0);
});
test('B09 页面能力过旧提示刷新且候选保持',async()=>{
 const a=h.pages[0];await fixture();const before=JSON.stringify(h.room.state),c=h.room.state.routeFlow.activeChoice,old=h.api.io.sockets.sockets.get(h.room.players[0].socketId);old.handshake.auth.clientRouteRevision='old';
 await select(a);await a.click('#btnRouteConfirm');await a.waitForFunction(()=>document.getElementById('routeError').textContent.includes('刷新'));assert.equal(JSON.stringify(h.room.state),before);assert.deepEqual(h.room.state.routeFlow.activeChoice.candidateIds,c.candidateIds);old.handshake.auth.clientRouteRevision=routes.REVISION;assert.deepEqual(h.errors,[]);
});
test('B07b 实际浏览器默认200%缩放，键盘确认',{timeout:60000},async()=>{
 await fixture();const profile=fs.mkdtempSync(path.join(os.tmpdir(),'game-route-zoom-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:1440,height:900},reducedMotion:'reduce'});
 try{
  const settings=await context.newPage();await settings.goto('chrome://settings/appearance');assert.equal(await settings.evaluate(()=>new Promise(r=>globalThis.chrome.settingsPrivate.setDefaultZoom(2,r))),true);
  assert.equal(await settings.evaluate(()=>new Promise(r=>globalThis.chrome.settingsPrivate.getDefaultZoom(r))),2);
  const page=await context.newPage();await page.goto(h.url,{waitUntil:'networkidle'});const rp=h.room.players[0];await page.evaluate(data=>new Promise(r=>socket.emit('reconnect',data,r)),{roomCode:h.room.code,name:rp.name,token:rp.token});await page.waitForSelector('#routeModal:not(.hidden)');
  const m=await page.evaluate(()=>({width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,pixelRatio:window.devicePixelRatio,scale:window.visualViewport.scale}));assert.equal(m.width,720);assert.equal(m.pixelRatio,2);assert.ok(m.scrollWidth<=m.width+1);
  await page.locator('#routeCandidates button').first().focus();await page.keyboard.press('Enter');await page.locator('#routeHeld button').first().focus();await page.keyboard.press('Enter');await page.locator('#btnRouteConfirm').focus();await page.screenshot({path:path.join(evidence,'route-actual-zoom-200.png')});await page.keyboard.press('Enter');await page.waitForSelector('#routeModal',{state:'hidden'});assert.equal(h.room.state.routeFlow.players.p0.lastResult.outcome,'replaced');measures.push({label:'actual-browser-default-zoom-200',setting:2,...m});
 }finally{await context.close();const target=path.resolve(profile),root=path.resolve(os.tmpdir());if(path.dirname(target)===root&&path.basename(target).startsWith('game-route-zoom-'))fs.rmSync(target,{recursive:true,force:true});}
});

