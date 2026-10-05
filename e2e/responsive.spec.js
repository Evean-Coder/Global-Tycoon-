'use strict';
/* global latestState, socket, getComputedStyle, innerWidth, innerHeight, performance */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright'),{boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures'),st=require('../src/stocks');
const evidence=path.join(__dirname,'../docs/economy-remediation/browser-evidence');
let h;const measures=[];
const widths=[[1440,900],[1280,800],[1024,768],[768,1024],[320,640],[375,812],[430,932]];
async function measure(page,label){await page.waitForFunction(()=>document.documentElement.scrollWidth<=window.innerWidth+1,null,{timeout:3000});const m=await page.evaluate(()=>({width:window.innerWidth,height:window.innerHeight,scrollWidth:document.documentElement.scrollWidth,pixelRatio:window.devicePixelRatio,scale:window.visualViewport.scale,squares:document.querySelectorAll('#board .sq').length,board:document.getElementById('board').getBoundingClientRect().toJSON(),available:getComputedStyle(document.documentElement).getPropertyValue('--board-available'),actionBar:document.getElementById('actionBar').getBoundingClientRect().toJSON(),scrollY:window.scrollY,oversized:[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().width>window.innerWidth).slice(0,10).map(el=>({id:el.id,class:el.className,width:el.getBoundingClientRect().width}))}));assert.ok(m.scrollWidth<=m.width+1,label+' 页面横向溢出 '+JSON.stringify(m));assert.equal(m.squares,42);measures.push({label,...m});return m;}
test.before(async()=>{fs.mkdirSync(evidence,{recursive:true});h=await boot();for(const p of h.pages)await p.evaluate(()=>setInterval(()=>{window.__fixtureRevision=latestState.revision;},10));});
test.after(async()=>{if(h)await h.close();fs.writeFileSync(path.join(evidence,'measurements.json'),JSON.stringify({browser:'Chromium / Microsoft Edge and Google Chrome',node:process.version,physicalDevices:'未测；七类模拟视口，真实浏览器默认页面缩放单独验证',measures},null,2));});
test('PC宽屏布局 / 平板横竖布局 / 手机完整棋盘布局 / 长说明与按钮可达',async()=>{
 const page=h.pages[0];
 await page.screenshot({path:path.join(evidence,'choice-normal-1440.png'),fullPage:true});
 await page.setViewportSize({width:375,height:812});await page.screenshot({path:path.join(evidence,'choice-normal-375.png'),fullPage:true});
 for(const [width,height]of widths){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve))));
  await page.evaluate(()=>{for(const p of document.querySelectorAll('.opportunity-card p'))p.textContent+=' 条件说明：费用以实际报价为准，现金不足或条件失效时不能执行。'.repeat(5);});
  await measure(page,'choice-'+width);assert.equal(await page.locator('#choiceCards button').count(),3);
  for(const b of await page.locator('#choiceCards button').all()){await b.scrollIntoViewIfNeeded();const r=await b.boundingBox();assert.ok(r.width>=120&&r.height>=40);}
  await page.screenshot({path:path.join(evidence,'choice-'+width+'.png'),fullPage:true});
 }
 await h.choose();
 const state=f.game(2);state.economyRevision='travel-expense-v1';state.travelExpenseReceipts={};state.roundFlow.index=79;f.own(state,'p0','上海','东京');f.own(state,'p1','罗马');f.selected(state,'p0','H1','H2','H4');state.stocks['上海'].holders.p0=2;state.stocks['上海'].dividendFund=2000;st.refreshPrice(state,'上海','待分红增加');st.syncHolders(state);state.world.status='running';state.world.active={type:'construction',name:'建设优惠季',description:'每人每轮首次成功建设优惠15%，最多2000。',remaining:1};state.world.preview={type:'aviation',name:'航空促销',description:'机票优惠30%',remaining:3};await h.fixture(state);
 for(const [width,height]of widths){
  await page.setViewportSize({width,height});await page.waitForFunction(expected=>{const b=document.getElementById('board').getBoundingClientRect(),a=document.getElementById('actionBar').getBoundingClientRect(),available=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--board-available'));const signature=JSON.stringify([innerWidth,innerHeight,b.top,b.height,a.top,available]);if(window.__travelLayoutSignature!==signature){window.__travelLayoutSignature=signature;window.__travelLayoutSince=performance.now();}return performance.now()-window.__travelLayoutSince>150&&innerWidth===expected&&b.bottom<=a.top&&(expected<=720||b.height<=available+1);},width,{timeout:3000});const m=await measure(page,'board-'+width);assert.ok(m.board.width<=width);
  const bar=await page.locator('#actionBar').boundingBox();assert.ok(m.board.bottom<=bar.y,'默认总览的棋盘不得被固定操作栏遮挡：'+width);
  assert.equal(await page.locator('.travel-expense').isVisible(),true);assert.ok((await page.textContent('.travel-preview')).includes('第 81 轮'));
  await page.screenshot({path:path.join(evidence,'board-'+width+'.png'),fullPage:true});
  if(width<=430){for(const id of [0,1,3,6,11,14,10]){await page.locator('#board [data-square-id="'+id+'"]').click();assert.equal(await page.locator('#modal').isVisible(),true);await page.getByRole('button',{name:'关闭',exact:true}).last().click();}}
  await page.click('#btnAssets');assert.ok((await page.textContent('#modalBody')).includes('已选机遇'));await measure(page,'assets-'+width);await page.getByRole('button',{name:'关闭',exact:true}).last().click();
 }
 assert.deepEqual(h.errors,[]);
});
test('七类视口股票确认及费用明细可达',async()=>{
 const page=h.pages[0],s=f.game(2);f.own(s,'p1','上海');s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};st.openStockWindow(s,'p0');await h.fixture(s);
 for(const [width,height]of widths){await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve))));await measure(page,'stock-'+width);assert.ok((await page.textContent('#stockList')).includes('经营报价'));await page.locator('#btnStockConfirm').scrollIntoViewIfNeeded();const r=await page.locator('#btnStockConfirm').boundingBox();assert.ok(r.y>=0&&r.y+r.height<=height&&r.height>=40);}
 const flight=f.game(2);f.selected(flight,'p0','H7');flight.phase='flight';flight.pending={playerId:'p0',fromAirportId:'开罗国际机场',free:false};flight.world.active={type:'aviation',name:'航空促销',description:'付费机票优惠30%',remaining:3};await h.fixture(flight);
 for(const [width,height]of widths){await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve))));await measure(page,'flight-'+width);assert.ok((await page.textContent('#modalBody')).includes('2,500'));const target=page.getByRole('button',{name:'￥2,500 飞往伦敦希思罗国际机场',exact:true});await target.scrollIntoViewIfNeeded();const r=await target.boundingBox();assert.ok(r.y>=0&&r.y+r.height<=height);}
 const debt=f.game(2);debt.economyRevision='travel-expense-v1';debt.travelExpenseReceipts={};debt.roundFlow.index=81;f.own(debt,'p0','上海');debt.players[0].cash=-1500;debt.phase='self_rescue';debt.pending={playerId:'p0',kind:'self_rescue',due:1500,reason:'远航开支',resume:{kind:'travel_expense',continuation:'normal_end'}};await h.fixture(debt);
 for(const [width,height]of widths){await page.setViewportSize({width,height});await measure(page,'travel-rescue-'+width);assert.ok((await page.textContent('#modalBody')).includes('债务来源：远航开支'));const target=page.getByRole('button',{name:'抵押 +￥10,000',exact:true});await target.scrollIntoViewIfNeeded();const r=await target.boundingBox();assert.ok(r.y>=0&&r.y+r.height<=height);}
 assert.deepEqual(h.errors,[]);
});
test('键盘焦点与减少动画 / 真正200%页面缩放完成选择详情及交易',async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'game-zoom-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:1440,height:900},reducedMotion:'reduce'});
 try{
  const settings=await context.newPage();await settings.goto('chrome://settings/appearance');
  const success=await settings.evaluate(()=>new Promise(resolve=>globalThis.chrome.settingsPrivate.setDefaultZoom(2,resolve)));assert.equal(success,true);
  const zoom=await settings.evaluate(()=>new Promise(resolve=>globalThis.chrome.settingsPrivate.getDefaultZoom(resolve)));assert.equal(zoom,2);
  const page=await context.newPage();await page.goto(h.url,{waitUntil:'networkidle'});
  const metrics=await page.evaluate(()=>({width:window.innerWidth,pixelRatio:window.devicePixelRatio,scale:window.visualViewport.scale}));assert.equal(metrics.pixelRatio,2);assert.equal(metrics.width,720);assert.equal(metrics.scale,1);
  // 用真实认证重连接管测试玩家，缩放通过浏览器设置生效。
  const rp=h.room.players[0];
  await page.evaluate(data=>new Promise(resolve=>socket.emit('reconnect',data,resolve)),{roomCode:h.room.code,name:rp.name,token:rp.token});
  await page.waitForSelector('#board .sq');h.pages[0]=page;
  await page.evaluate(()=>setInterval(()=>{window.__fixtureRevision=latestState.revision;},10));
  await page.evaluate(()=>new Promise(resolve=>socket.emit('disbandRoom',{},resolve)));
  await page.evaluate(()=>new Promise(resolve=>socket.emit('startGame',{},resolve)));
  await page.waitForSelector('#choiceModal:not(.hidden)');await page.locator('#choiceCards button').first().focus();await page.keyboard.press('Enter');await h.pages[1].locator('#choiceCards button').last().click();await page.waitForSelector('#choiceModal',{state:'hidden'});
  await measure(page,'actual-default-page-zoom-200');
  await page.locator('#board [data-square-id="1"]').focus();await page.keyboard.press('Enter');await page.waitForSelector('#modal:not(.hidden)');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('#modal')!==null),true);await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('#modal')!==null),true);await page.getByRole('button',{name:'关闭',exact:true}).last().click();
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.squareId),'1');
  const s=f.game(2);f.own(s,'p1','上海');s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};st.openStockWindow(s,'p0');
  await h.fixture(s);
  await measure(page,'stock-actual-zoom-200');assert.equal(await page.locator('#stockModal').isVisible(),true);await page.locator('button[data-city="上海"][data-kind="buy"][data-delta="1"]').click();assert.ok((await page.textContent('#stockSummary')).includes('4,000'));
  await page.screenshot({path:path.join(evidence,'zoom-200-stock.png'),fullPage:true});
  await page.click('#btnStockConfirm');await page.waitForFunction(()=>latestState.phase!=='stock');assert.equal(h.room.state.players[0].cash,146000);
  measures.push({label:'actual-browser-zoom-confirmation',setting:zoom,source:'chrome.settingsPrivate in isolated chrome://settings/appearance',...metrics,reducedMotion:await page.evaluate(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches)});
 }finally{
  await context.close();
  const target=path.resolve(profile),root=path.resolve(os.tmpdir());if(path.dirname(target)===root&&path.basename(target).startsWith('game-zoom-'))fs.rmSync(target,{recursive:true,force:true});
 }
});
