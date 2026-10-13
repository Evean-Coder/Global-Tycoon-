'use strict';
/* global latestState, stockDraft */
const test=require('node:test'),assert=require('node:assert/strict'),{boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures'),stocks=require('../src/stocks');
let h;const time=f.fakeClock();test.before(async()=>{h=await boot({mobile:true,viewport:{width:844,height:390},gameMode:'quick',quickClockOptions:time});await h.choose();});test.after(async()=>{if(h)await h.close();});
test('normal and quick touch stock lists retain nodes, details, scroll and draft',{timeout:60000},async()=>{
 const p=h.pages[0];p.setDefaultTimeout(6000);
 for(const mode of ['normal','quick'])for(const width of [320,390,430]){
  const s=require('../src/state').createGameState('STOCK',['甲','乙'],2,{routeRevision:'opportunity-routes-v1',gameMode:mode,...(mode==='quick'?{quickRevision:'quick-mode-v1'}:{})});s.routeFlow.initialCompletedOrdinal=1;s.routeFlow.initialDueOrdinal=1;
  for(const id of Object.keys(s.cities))f.own(s,'p1',id);
  s.stocks['上海'].holders.p0=2;stocks.syncHolders(s);
  stocks.openStockWindow(s,'p0');s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};await p.setViewportSize({width:844,height:width});await h.fixture(s);await p.waitForSelector('#stockModal:not(.hidden)');
  assert.equal(require('../src/quickMode').enabled(h.room.state),mode==='quick');
  const initialScroll=await p.locator('#stockList').evaluate(el=>el.scrollTop);assert.ok(initialScroll<=2,'每个新窗口从顶部开始 '+JSON.stringify({mode,width,initialScroll}));
  assert.match(await p.locator('#stockTimer').textContent(),/60s/);const deadline=h.room.actionClock.deadlineMs;
  const row=p.locator('[data-stock-city="上海"]'),plus=row.locator('[data-kind=buy][data-delta="1"]');await plus.scrollIntoViewIfNeeded();await row.locator('details').evaluate(el=>el.open=true);
  const before=await p.evaluate(()=>{const row=document.querySelector('[data-stock-city="上海"]');window.__stockNode=row;window.__stockButton=row.querySelector('[data-kind=buy][data-delta="1"]');return document.getElementById('stockList').scrollTop;});
  await plus.tap();await plus.tap();assert.equal(await plus.isDisabled(),true);
  const after=await p.evaluate(()=>({scroll:document.getElementById('stockList').scrollTop,same:window.__stockNode===document.querySelector('[data-stock-city="上海"]')&&window.__stockButton===document.querySelector('[data-stock-city="上海"] [data-kind=buy][data-delta="1"]'),open:window.__stockNode.querySelector('details').open,draft:stockDraft['上海'].buy}));assert.equal(after.same,true);assert.equal(after.open,true);assert.equal(after.draft,2);assert.ok(Math.abs(before-after.scroll)<=2,JSON.stringify({before,after}));
  await row.locator('[data-kind=buy][data-delta="-1"]').tap();assert.equal(await row.locator('[data-quantity=buy]').textContent(),'1');
  const sellPlus=row.locator('[data-kind=sell][data-delta="1"]');await sellPlus.scrollIntoViewIfNeeded();const sellScroll=await p.locator('#stockList').evaluate(el=>el.scrollTop);await sellPlus.tap();await sellPlus.tap();assert.equal(await row.locator('[data-quantity=sell]').textContent(),'2');assert.ok(Math.abs(await p.locator('#stockList').evaluate(el=>el.scrollTop)-sellScroll)<=2);await row.locator('[data-kind=sell][data-delta="-1"]').tap();await row.locator('[data-kind=sell][data-delta="-1"]').tap();assert.equal(await row.locator('[data-quantity=buy]').textContent(),'0');await plus.tap();assert.equal(await row.locator('[data-quantity=buy]').textContent(),'1');
  const anchorY=(await row.boundingBox()).y,updated=globalThis.structuredClone(h.room.state);updated.stocks['内罗毕'].priceChange={reason:'受控较长报价说明。'.repeat(20)};await h.fixture(updated);assert.ok(Math.abs((await row.boundingBox()).y-anchorY)<=2,'上方内容增高后保持当前城市参照');
  await p.click('#btnStockRules');await p.click('#btnRulesClose');assert.equal(await row.locator('details').evaluate(el=>el.open),true);
  const returnScroll=await p.locator('#stockList').evaluate(el=>el.scrollTop);
  await p.click('#btnStockAssets');await p.getByRole('button',{name:'继续买卖股票',exact:true}).click();assert.equal(await row.locator('[data-quantity=buy]').textContent(),'1');assert.ok(Math.abs(await p.locator('#stockList').evaluate(el=>el.scrollTop)-returnScroll)<=2);
  await p.click('#btnStockTransfer');await p.getByRole('button',{name:'返回',exact:true}).click();assert.equal(await row.locator('[data-quantity=buy]').textContent(),'1');assert.equal(h.room.actionClock.deadlineMs,deadline);assert.ok(Math.abs(await p.locator('#stockList').evaluate(el=>el.scrollTop)-returnScroll)<=2);
  await p.click('#btnStockConfirm');await p.waitForFunction(()=>latestState.phase!=='stock');assert.equal(h.room.state.stocks['上海'].holders.p0,3);
 }
 assert.deepEqual(h.errors,[]);
});

test('new stock windows start at the first city and same-window updates retain browsing',{timeout:30000},async()=>{
 const p=h.pages[0];
 for(const mode of ['normal','quick'])for(const [width,height]of [[568,320],[844,390],[932,430],[768,1024],[1440,900]]){
  const s=require('../src/state').createGameState('TOP',['甲','乙'],2,{routeRevision:'opportunity-routes-v1',gameMode:mode,...(mode==='quick'?{quickRevision:'quick-mode-v1'}:{})});s.routeFlow.initialCompletedOrdinal=1;s.routeFlow.initialDueOrdinal=1;for(const id of Object.keys(s.cities))f.own(s,'p1',id);
  await p.setViewportSize({width,height});stocks.openStockWindow(s,'p0');s.phase='stock';s.pending={kind:'go_stock',playerId:'p0',after:'end'};await h.fixture(s);
  const list=p.locator('#stockList');assert.ok(await list.evaluate(el=>el.scrollTop)<=2);
  const first=await list.locator('.stock-item').first().boundingBox(),container=await list.boundingBox();assert.ok(first.y>=container.y-2&&first.y<container.y+container.height,'首城在初开视口内');
  await list.evaluate(el=>el.scrollTop=el.scrollHeight);const bottom=await list.evaluate(el=>el.scrollTop);assert.ok(bottom>0);await h.fixture(globalThis.structuredClone(h.room.state));assert.ok(Math.abs(await list.evaluate(el=>el.scrollTop)-bottom)<=2,'同窗口广播不置顶');
  const next=globalThis.structuredClone(h.room.state);stocks.closeStockWindow(next);next.phase='waiting_roll';next.pending=null;await h.fixture(next);stocks.openStockWindow(next,'p0');next.phase='stock';next.pending={kind:'go_stock',playerId:'p0',after:'end'};await h.fixture(next);assert.ok(await list.evaluate(el=>el.scrollTop)<=2,'新起点窗口不带入前窗底部');
 }
 assert.deepEqual(h.errors,[]);
});

test('stock countdown uses the existing clock on phone, tablet and PC',async()=>{
 const p=h.pages[0],s=require('../src/state').createGameState('TIMER',['甲','乙'],2,{routeRevision:'opportunity-routes-v1',gameMode:'quick',quickRevision:'quick-mode-v1'});s.routeFlow.initialCompletedOrdinal=1;s.routeFlow.initialDueOrdinal=1;f.own(s,'p1','上海');stocks.openStockWindow(s,'p0');s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};await h.fixture(s);
 for(const [width,height]of [[844,390],[768,1024],[1440,900]]){await p.setViewportSize({width,height});await p.waitForFunction(()=>document.getElementById('stockTimer').textContent.includes('60s'));const r=await p.locator('#stockTimer').boundingBox();assert.ok(r.y>=0&&r.y+r.height<=height);}
 const deadline=h.room.actionClock.deadlineMs;time.advance(10000);h.api.emitGame(h.room);await p.waitForFunction(()=>document.getElementById('stockTimer').textContent.includes('50s'));assert.equal(h.room.actionClock.deadlineMs,deadline);
 const plus=p.locator('[data-stock-city="上海"] [data-kind=buy][data-delta="1"]');await plus.focus();await p.keyboard.press('Enter');assert.equal(await plus.evaluate(el=>el===document.activeElement),true);assert.equal(await p.locator('[data-stock-city="上海"] [data-quantity=buy]').textContent(),'1');
});
