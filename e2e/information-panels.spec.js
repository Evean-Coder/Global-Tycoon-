'use strict';
/* global game, stockDraft, closeModal, closeManagement, finishRender */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures'),stocks=require('../src/stocks'),{createGameState}=require('../src/state'),routes=require('../src/opportunityRoutes');
const dir=path.join(__dirname,'../docs/information-panels/evidence');let h;
function fixture(options={}){const s=createGameState('READ',['玩家0','玩家1'],2,options);s.phase='waiting_roll';s.pending=null;s.firstRoundDone=true;f.own(s,'p0','巴黎','伦敦','上海');f.own(s,'p1','罗马');f.selected(s,'p0','H1','H4');s.world.status='running';s.world.active={id:1,type:'boom',name:'地区旺季',region:'欧洲',description:'欧洲标准租金增加15%，每笔最多3000。',remaining:2};s.world.preview={type:'aviation',name:'航空促销',region:null};return s;}
test.before(async()=>{fs.mkdirSync(dir,{recursive:true});h=await boot({mobile:true});await h.pages[0].click('#btnChoiceRules');assert.equal(await h.pages[0].locator('#rules-topic-opportunities').getAttribute('open'),'');await h.pages[0].click('#btnRulesClose');await h.choose();for(const p of h.pages)p.setDefaultTimeout(5000);});test.after(async()=>{if(h)await h.close();});
test.beforeEach(async()=>{await h.pages[0].evaluate(()=>{closeModal();closeManagement();document.getElementById('stockModal').classList.add('hidden');});});
test('news and ledger are equal separate panels inside the atlas on PC tablet and short landscape',{timeout:45000},async()=>{
 const p=h.pages[0];await h.fixture(fixture());
 for(const [width,height] of [[1440,900],[768,1024],[844,280],[568,320]]){
  await p.setViewportSize({width,height});await p.waitForFunction(()=>{const a=document.getElementById('atlasPanels').getBoundingClientRect(),m=document.getElementById('boardMap').getBoundingClientRect();return Math.abs(a.width/m.width-.86)<.01;});
  const r=await p.evaluate(()=>{const ids=['newsBar','ledger','boardMap','atlasPanels'];return Object.fromEntries(ids.map(id=>[id,document.getElementById(id).getBoundingClientRect().toJSON()]));});
  assert.ok(r.newsBar.right<r.ledger.left);assert.ok(Math.abs(r.newsBar.width-r.ledger.width)<1);assert.ok(Math.abs(r.newsBar.height-r.ledger.height)<1);assert.ok(r.atlasPanels.left>=r.boardMap.left&&r.atlasPanels.right<=r.boardMap.right+1);assert.ok(r.atlasPanels.top>=r.boardMap.top&&r.atlasPanels.bottom<=r.boardMap.bottom+1);
  assert.match(await p.textContent('#newsBar'),/本人的受影响城市：伦敦、巴黎/);assert.match(await p.textContent('#newsBar'),/下轮预告：航空促销/);assert.equal(await p.locator('#ledger #newsBar').count(),0);
  await p.locator('#boardWrap').evaluate(el=>{el.scrollTop=0;el.scrollLeft=0;});await p.locator('#toast').waitFor({state:'hidden'});await p.screenshot({path:path.join(dir,width+'x'+height+'.png')});
  if(width===844){await p.locator('#boardWrap').evaluate(el=>el.scrollTop=document.getElementById('atlasPanels').offsetTop-8);await p.screenshot({path:path.join(dir,'reading-'+width+'x'+height+'.png')});}
  await p.locator('[data-square-id="1"]').scrollIntoViewIfNeeded();await p.locator('[data-square-id="1"]').tap();await p.waitForSelector('#modalTitle:text-is("地产详情")');await p.getByRole('button',{name:'关闭',exact:true}).last().tap();
 }
 assert.deepEqual(h.errors,[]);
});
test('opponent broadcasts preserve news and asset reading while latest values and forced decisions update',async()=>{
 const p=h.pages[0];await p.setViewportSize({width:844,height:280});const s=fixture();s.turnIndex=1;s.diceBag=[10];await h.fixture(s);
 await p.locator('#news-impact summary').click();await p.locator('#newsBar').evaluate(el=>el.scrollTop=100);const scroll=await p.locator('#newsBar').evaluate(el=>el.scrollTop);
 await p.locator('#btnAssets').click();await p.locator('.net-details summary').click();await p.locator('#modalBody').evaluate(el=>el.scrollTop=120);const assetScroll=await p.locator('#modalBody').evaluate(el=>el.scrollTop),changed=globalThis.structuredClone(h.room.state);changed.players[0].cash+=1234;await h.fixture(changed);
 assert.equal(await p.locator('#modal').isVisible(),true);assert.equal(await p.locator('.net-details').getAttribute('open'),'');assert.ok(Math.abs(await p.locator('#modalBody').evaluate(el=>el.scrollTop)-assetScroll)<=1);assert.match(await p.textContent('#modalBody'),/151,234/);assert.equal(await p.locator('#news-impact').getAttribute('open'),'');assert.ok(Math.abs(await p.locator('#newsBar').evaluate(el=>el.scrollTop)-scroll)<=1);
 const turnBefore=h.room.state.turnId;await h.pages[1].locator('#btnRoll').click();await p.waitForFunction(before=>game.turnId>before,turnBefore);assert.equal(await p.locator('#modalTitle').textContent(),'资产总览');assert.equal(await p.locator('.net-details').getAttribute('open'),'');
 const forced=fixture();forced.turnId=100;forced.phase='buy';forced.pending={kind:'buy',playerId:'p0',cityId:'内罗毕'};await h.fixture(forced);assert.equal(await p.locator('#modalTitle').textContent(),'地产购买');
 const normal=fixture();normal.turnId=102;await h.fixture(normal);await p.locator('#btnAssets').click();await p.getByRole('button',{name:'关闭',exact:true}).last().click();h.api.emitGame(h.room);assert.equal(await p.locator('#modal').isHidden(),true);
 await p.evaluate(()=>{const fresh=window.structuredClone(game);fresh.gameId+=':new-reading-identity';finishRender(fresh);});assert.equal(await p.locator('#news-impact').getAttribute('open'),null);assert.equal(await p.locator('#newsBar').evaluate(el=>el.scrollTop),0);assert.deepEqual(h.errors,[]);
});
test('contextual rules open matching topics and subsections without changing stock draft or deadline',async()=>{
 const p=h.pages[0];await p.setViewportSize({width:1440,height:900});await h.fixture(fixture());
 async function check(button,topic,anchor){const deadline=h.room.actionClock.deadlineMs,before=JSON.stringify(h.room.state);await p.locator(button).click();assert.equal(await p.locator('#rules-topic-'+topic).getAttribute('open'),'');if(anchor)assert.equal(await p.evaluate(()=>document.activeElement.id),'rules-anchor-'+anchor);await p.click('#btnRulesClose');assert.equal(h.room.actionClock.deadlineMs,deadline);assert.equal(JSON.stringify(h.room.state),before);}
 await p.click('#btnBank');await check('#btnModalRules','bank');await p.getByRole('button',{name:'关闭',exact:true}).last().click();
 await p.click('#btnAssets');await check('#btnModalRules','bank');await p.getByRole('button',{name:'关闭',exact:true}).last().click();
 await p.locator('[data-square-id="6"]').click();await check('#btnModalRules','airport');await p.getByRole('button',{name:'关闭',exact:true}).last().click();
 await p.locator('[data-square-id="1"]').click();await check('#btnModalRules','property');await p.getByRole('button',{name:'关闭',exact:true}).last().click();
 await check('#newsBar .news-help','opportunities','news');
 const modern=fixture({activeManagementRevision:'active-management-v3'});await h.fixture(modern);await p.waitForSelector('#managementModal:not(.hidden)');await check('#btnManagementRules','property','management');await p.click('#btnCloseManagement');
 const stock=fixture();stock.phase='stock';stock.pending={playerId:'p0',kind:'go_stock',after:'end'};stocks.openStockWindow(stock,'p0');await h.fixture(stock);await p.locator('[data-city="罗马"][data-kind="buy"][data-delta="1"]').click();const draft=await p.evaluate(()=>JSON.stringify(stockDraft));await check('#btnStockRules','stocks');assert.equal(await p.evaluate(()=>JSON.stringify(stockDraft)),draft);
 const rescue=fixture();rescue.turnId=120;rescue.phase='self_rescue';rescue.players[0].cash=-1000;rescue.pending={playerId:'p0',kind:'self_rescue',due:1000,reason:'指定付款'};await h.fixture(rescue);await check('#btnModalRules','connection');
 const support=createGameState('SUPPORT',['甲','乙'],2,{propertySupportRevision:'property-support-v2'});support.turnId=122;support.firstRoundDone=true;support.players[0].propertySupport.eligible=true;await h.fixture(support);await p.waitForSelector('#propertySupportModal:not(.hidden)');await check('#btnSupportRules','property','support');await p.click('#btnSupportLater');
 const route=fixture({routeRevision:routes.REVISION});route.players[0].opportunities.selectedIds=['H1','H8','H10'];for(let ordinal=1;ordinal<=3;ordinal++){route.opportunityStage={ordinal,resolved:true};routes.markInitialResolved(route,ordinal);}route.players[0].opportunities.lapEpoch=3;routes.markLapProgress(route,'p0');routes.tryOpenRouteChoice(route,'p0',f.rng());await h.fixture(route);await p.waitForSelector('#routeModal:not(.hidden)');await check('#btnRouteRules','opportunities','routes');
 assert.deepEqual(h.errors,[]);
});
