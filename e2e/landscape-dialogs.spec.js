'use strict';
/* global latestState, stockDraft, getComputedStyle, innerWidth, innerHeight, requestAnimationFrame */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures'),stocks=require('../src/stocks');
const dir=process.env.E2E_EVIDENCE_ROOT?path.join(process.env.E2E_EVIDENCE_ROOT,'landscape-dialogs'):path.join(__dirname,'../docs/landscape-dialogs/evidence');
const screens=[[844,280],[568,320],[932,430],[980,400]],measurements=[];
let h;
test.before(async()=>{fs.mkdirSync(dir,{recursive:true});h=await boot({mobile:true,viewport:{width:844,height:280}});for(const p of h.pages)p.setDefaultTimeout(5000);});
test.after(async()=>{if(h)await h.close();fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify(measurements,null,2));});
async function setScreen(p,width,height){await p.setViewportSize({width,height});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function measure(p,id,label){
 const m=await p.locator(id+' .modal').evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1}));
 assert.ok(m.rect.top>=-1&&m.rect.bottom<=m.height+1,label+JSON.stringify(m));assert.ok(!m.overflow,label);measurements.push({label,...m});
}
async function reachable(button,root){
 await button.scrollIntoViewIfNeeded();const m=await button.evaluate((el,selector)=>{const r=el.getBoundingClientRect(),clip=document.querySelector(selector).getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {rect:r.toJSON(),clip:clip.toJSON(),hit:hit===el||el.contains(hit)};},root);
 assert.ok(m.rect.height>=44&&m.rect.width>=44,JSON.stringify(m));assert.ok(m.rect.top>=m.clip.top-1&&m.rect.bottom<=m.clip.bottom+1,JSON.stringify(m));assert.ok(m.hit,JSON.stringify(m));
}
async function screenshot(p,name){await p.waitForSelector('#toast',{state:'hidden'});await p.screenshot({path:path.join(dir,name)});}
test('short landscape initial opportunities keep all three selections visible and complete long descriptions',{timeout:30000},async()=>{
 const p=h.pages[0];
 for(const [width,height]of screens){
  await setScreen(p,width,height);await measure(p,'#choiceModal','choice-'+width);
  for(const button of await p.locator('#choiceCards button').all())await reachable(button,'#choiceCards');
  const descriptions=await p.locator('#choiceCards p').evaluateAll(nodes=>nodes.map(el=>({text:el.textContent,height:el.clientHeight,scroll:el.scrollHeight,canRead:getComputedStyle(el).overflowY==='auto'})));assert.ok(descriptions.every(d=>d.height>=20&&d.canRead&&d.text.length>0),JSON.stringify(descriptions));
  await p.locator('#choiceCards p').first().focus();await p.keyboard.press('End');await screenshot(p,'choice-'+width+'x'+height+'.png');
 }
 await p.click('#btnReroll');await p.waitForFunction(()=>latestState.self.choice.candidateVersion===2);await h.choose();assert.equal(h.room.state.phase,'waiting_roll');assert.deepEqual(h.errors,[]);
});
test('short landscape stock workspace preserves list space, quantity, browsing and real transaction',{timeout:30000},async()=>{
 const p=h.pages[0];
 for(const [width,height]of screens){
  await setScreen(p,width,height);const s=f.game(2);s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};f.own(s,'p1',...Object.keys(s.cities));stocks.openStockWindow(s,'p0');await h.fixture(s);await p.waitForSelector('#stockModal:not(.hidden)');await measure(p,'#stockModal','stock-'+width);
  const list=await p.locator('#stockList').boundingBox(),dialog=await p.locator('#stockModal .modal').boundingBox(),sidebar=await p.locator('.stock-sidebar').boundingBox();assert.ok(list.height/dialog.height>=.6,JSON.stringify({list,dialog}));assert.ok(list.x<sidebar.x&&list.width>sidebar.width,JSON.stringify({list,sidebar}));assert.equal(await p.locator('#stockList').evaluate(el=>el.scrollTop),0);
  const plus=p.locator('[data-stock-city="内罗毕"] [data-kind=buy][data-delta="1"]');await reachable(plus,'#stockList');await plus.tap();assert.equal(await p.evaluate(()=>stockDraft['内罗毕'].buy),1);
  for(const id of ['btnStockTransfer','btnStockAssets','btnStockSkip','btnStockConfirm'])await reachable(p.locator('#'+id),'#stockModal .stock-sidebar');
  await screenshot(p,'stock-'+width+'x'+height+'.png');
  const last=p.locator('[data-stock-city="迪拜"] [data-kind=buy][data-delta="1"]');await reachable(last,'#stockList');await last.tap();const scroll=await p.locator('#stockList').evaluate(el=>el.scrollTop),deadline=h.room.actionClock.deadlineMs;
  await p.click('#btnStockAssets');await p.getByRole('button',{name:'继续买卖股票',exact:true}).click();assert.ok(Math.abs(await p.locator('#stockList').evaluate(el=>el.scrollTop)-scroll)<=2);assert.equal(h.room.actionClock.deadlineMs,deadline);
  await p.click('#btnStockConfirm');await p.waitForFunction(()=>latestState.phase!=='stock');assert.equal(h.room.state.players[0].stocks['内罗毕'],1);assert.equal(h.room.state.players[0].stocks['迪拜'],1);
 }
 assert.deepEqual(h.errors,[]);
});
test('landscape management main and city pages keep fixed footer separate from long content',{timeout:30000},async()=>{
 const p=h.pages[0];
 for(const [width,height]of screens){
  await setScreen(p,width,height);const s=require('../src/state').createGameState('MODAL',['甲','乙'],2,{activeManagementRevision:require('../src/activeManagement').REVISION});s.turnId=1000+width;s.phase='waiting_roll';f.own(s,'p0',...Object.keys(s.cities));await h.fixture(s);await p.waitForSelector('#managementModal:not(.hidden)');await measure(p,'#managementModal','management-'+width);
  assert.deepEqual(await p.locator('#managementFooter button').allTextContents(),['放弃经营','关闭查看']);await reachable(p.locator('#btnAbandonManagement'),'#managementFooter');await reachable(p.locator('#btnCloseManagement'),'#managementFooter');if(width===844)await screenshot(p,'management-main.png');
  await p.locator('[data-management-type=active_build]').click();const first=await p.locator('#managementBody [data-management-confirm]').first().boundingBox(),body=await p.locator('#managementBody').boundingBox();assert.ok(first.y+first.height<=body.y+body.height+1,JSON.stringify({first,body}));await reachable(p.locator('#managementBody [data-management-confirm]').last(),'#managementBody');await reachable(p.locator('[data-management-back]'),'#managementFooter');await p.locator('#managementBody').evaluate(el=>el.scrollTop=0);if(width===844)await screenshot(p,'management-cities.png');await p.click('#btnCloseManagement');
 }
});
test('all generic landscape dialog families retain natural rows, reachable actions and long bank rescue content',{timeout:60000},async()=>{
 const p=h.pages[0];
 for(const [width,height]of screens){
  await setScreen(p,width,height);
  for(const phase of ['buy','buy_airport','build_decide','flight','jail_turn','frozen_turn','auction_bid','direct_sale_ask','self_rescue']){
   const s=f.game(2);s.firstRoundDone=true;s.phase=phase;s.pending={playerId:'p0',awaiting:'p0',cityId:'内罗毕',airportId:'开罗国际机场',fromAirportId:'开罗国际机场',free:false,due:20000,sellerId:'p1'};
   if(phase==='build_decide')f.own(s,'p0','内罗毕');if(phase==='direct_sale_ask')f.own(s,'p1','内罗毕');if(phase==='self_rescue'){f.own(s,'p0',...Object.keys(s.cities));s.players[0].cash=-20000;}
   if(phase==='jail_turn')s.players[0].jailed=true;if(phase==='frozen_turn')s.players[0].frozen=true;
   await h.fixture(s);await p.waitForSelector('#modal:not(.hidden)');await measure(p,'#modal',phase+'-'+width);
   const body=await p.locator('#modalBody').evaluate(el=>({height:el.clientHeight,children:[...el.children].map(c=>({height:c.getBoundingClientRect().height,scroll:c.scrollHeight}))}));assert.ok(body.height>=100,phase+JSON.stringify(body));assert.ok(body.children.every(c=>c.height+2>=c.scroll),phase+JSON.stringify(body));
   const buttons=p.locator('#modalBody button');await reachable(buttons.first(),'#modalBody');await reachable(buttons.last(),'#modalBody');
   if(width===844){await p.locator('#modalBody').evaluate(el=>el.scrollTop=0);await screenshot(p,phase+'-'+width+'x'+height+'.png');}
   if(phase==='self_rescue'){const deadline=h.room.actionClock.deadlineMs;await p.getByRole('button',{name:'抵押 +￥1,800',exact:true}).tap();await p.waitForFunction(()=>latestState.cities['内罗毕'].mortgaged);assert.equal(h.room.state.players[0].cash,-18200);assert.equal(h.room.actionClock.deadlineMs,deadline);}
  }
  const s=f.game(2);s.phase='waiting_roll';f.own(s,'p0',...Object.keys(s.cities));for(const id of Object.keys(s.cities)){s.stocks[id].holders.p0=4;s.players[0].stocks[id]=4;}await h.fixture(s);
  for(const id of ['btnBank','btnAssets']){await p.click('#'+id);await measure(p,'#modal',id+'-'+width);await reachable(p.locator('#modalBody button').last(),'#modalBody');await p.locator('#modalBody').evaluate(el=>el.scrollTop=0);if(width===844)await screenshot(p,id+'-'+width+'x'+height+'.png');await p.getByRole('button',{name:'关闭',exact:true}).last().click();}
  await p.click('#btnRules');await measure(p,'#rulesModal','rules-'+width);await reachable(p.locator('#btnRulesClose'),'#rulesModal');await p.click('#btnRulesClose');
 }
 const end=f.game(2);end.status='over';end.phase='game_over';end.winner='p0';end.rank=['p0','p1'];await h.fixture(end);await measure(p,'#modal','settlement');await reachable(p.locator('#modalBody button').last(),'#modalBody');assert.deepEqual(h.errors,[]);
});
