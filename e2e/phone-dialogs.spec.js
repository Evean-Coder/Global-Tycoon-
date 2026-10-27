'use strict';
/* global game, stockDraft */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {bootPhone,fixture,setScreen}=require('./helpers/phoneFixtures'),f=require('../test/helpers/gameplayFixtures'),stocks=require('../src/stocks'),inv=require('../src/stockInvestment'),opp=require('../src/opportunities'),routes=require('../src/opportunityRoutes'),cc=require('../src/commercialCompetition');
const engine=process.env.PHONE_TEST_BROWSER||'chromium',dir=path.join(process.env.E2E_EVIDENCE_ROOT||'docs/phone-aspect-adaptation/evidence/verified',engine,'dialogs'),observations=[];
const screens=[[568,260],[844,280],[932,430],[1280,540],[1467,600],[480,220]];let h;
test.before(async()=>{fs.mkdirSync(dir,{recursive:true});h=await bootPhone();for(const p of h.pages)p.setDefaultTimeout(5000);});
test.after(async()=>{fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({engine,observations},null,2)+'\n');if(h)await h.close();});
async function measure(p,root,label){
 const m=await p.locator(root+' .modal').evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),width:window.innerWidth,height:window.innerHeight,overflow:document.documentElement.scrollWidth>window.innerWidth+1}));
 assert.ok(m.rect.top>=-1&&m.rect.bottom<=m.height+1,label+JSON.stringify(m));assert.ok(!m.overflow,label);observations.push({label,...m});
}
async function reachable(button,root){
 await button.scrollIntoViewIfNeeded();const m=await button.evaluate((el,selector)=>{const r=el.getBoundingClientRect(),clip=document.querySelector(selector).getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {rect:r.toJSON(),clip:clip.toJSON(),hit:hit===el||el.contains(hit)};},root);
 assert.ok(m.rect.height>=44&&m.rect.width>=44,JSON.stringify(m));assert.ok(m.rect.top>=m.clip.top-1&&m.rect.bottom<=m.clip.bottom+1,JSON.stringify(m));assert.ok(m.hit,JSON.stringify(m));
}
async function screenshot(p,label,width){if(width!==568&&width!==1280)return;await p.locator('#toast').evaluate(el=>el.classList.add('hidden'));await p.screenshot({path:path.join(dir,label+'-'+width+'.png')});}

test('phone dialog families retain natural rows and reachable final actions at short and wide sizes',{timeout:90000},async()=>{
 const p=h.pages[0];
 for(const [width,height]of screens){
  await setScreen(p,width,height);
  for(const phase of ['buy','buy_airport','build_decide','flight','jail_turn','frozen_turn','auction_bid','direct_sale_ask','self_rescue']){
   const s=fixture();s.turnIndex=0;s.phase=phase;s.pending={playerId:'p0',awaiting:'p0',cityId:'内罗毕',airportId:'开罗国际机场',fromAirportId:'开罗国际机场',free:false,due:20000,sellerId:'p1',reason:'支付租金'};
   if(phase==='self_rescue'){f.own(s,'p0',...Object.keys(s.cities));s.players[0].cash=-20000;}
   if(phase==='jail_turn')s.players[0].jailed=true;if(phase==='frozen_turn')s.players[0].frozen=true;
   await h.fixture(s);await p.waitForSelector('#modal:not(.hidden)');await measure(p,'#modal',phase+'-'+width);
   const body=await p.locator('#modalBody').evaluate(el=>({height:el.clientHeight,children:[...el.children].map(c=>({height:c.getBoundingClientRect().height,scroll:c.scrollHeight}))}));assert.ok(body.height>=60,phase+JSON.stringify(body));assert.ok(body.children.every(c=>c.height+2>=c.scroll),phase+JSON.stringify(body));
   const buttons=p.locator('#modalBody button');await reachable(buttons.first(),'#modalBody');await reachable(buttons.last(),'#modalBody');await screenshot(p,phase,width);
  }
  const s=fixture();f.own(s,'p0',...Object.keys(s.cities));for(const id of Object.keys(s.cities)){for(const unit of s.stocks[id].units.slice(0,2))Object.assign(unit,{holderId:'p0',bankBasis:s.stocks[id].price,paidCost:s.stocks[id].price});}inv.sync(s);await h.fixture(s);
  for(const id of ['btnBank','btnAssets']){await p.click('#'+id);await measure(p,'#modal',id+'-'+width);await reachable(p.locator('#modalBody button').last(),'#modalBody');await screenshot(p,id,width);await p.getByRole('button',{name:'关闭',exact:true}).last().click();}
  await p.click('#btnCompactInfo');await p.click('#btnCompactInfoRules');await measure(p,'#rulesModal','rules-'+width);await reachable(p.locator('#btnRulesClose'),'#rulesModal');await p.click('#btnRulesClose');await p.click('#btnCompactInfoClose');
 }
 assert.deepEqual(h.errors,[]);
});

test('choice, route, management and support keep selection flows and fixed footer reachable',{timeout:90000},async()=>{
 const p=h.pages[0];
 for(const [width,height]of screens){
  await setScreen(p,width,height);const s=fixture();opp.beginOpportunityStage(s,1,{kind:'start'},f.rng());await h.fixture(s);await p.waitForSelector('#choiceModal:not(.hidden)');await measure(p,'#choiceModal','choice-'+width);
  for(const button of await p.locator('#choiceCards button').all())await reachable(button,'#choiceCards');
  const paragraphs=await p.locator('#choiceCards p').evaluateAll(nodes=>nodes.map(el=>({text:el.textContent,height:el.clientHeight,scroll:el.scrollHeight})));assert.ok(paragraphs.every(d=>d.text.length&&d.height+1>=d.scroll),JSON.stringify(paragraphs));await screenshot(p,'choice',width);
  const r=fixture();r.turnIndex=0;for(const player of r.players)player.opportunities.selectedIds=['H1','H8','H10'];for(let ordinal=1;ordinal<=3;ordinal++){r.opportunityStage={ordinal,resolved:true};routes.markInitialResolved(r,ordinal);}for(let n=0;n<3;n++)opp.refresh(r.players[0]);routes.markLapProgress(r,'p0');routes.tryOpenRouteChoice(r,'p0',f.rng());await h.fixture(r);await p.waitForSelector('#routeModal:not(.hidden)');await measure(p,'#routeModal','route-'+width);await reachable(p.locator('#routeCandidates button').last(),'.route-body');const deadline=h.room.actionClock.deadlineMs;await p.locator('#routeCandidates button').first().click();await reachable(p.locator('#btnRouteBack'),'#routeModal');await p.click('#btnRouteBack');assert.equal(h.room.actionClock.deadlineMs,deadline);await p.click('#btnRouteSkip');
  const m=fixture();m.turnIndex=0;f.own(m,'p0','上海');cc.publishAtRoundStart(m,1);await h.fixture(m);await p.waitForSelector('#managementModal:not(.hidden)');await measure(p,'#managementModal','management-'+width);assert.deepEqual(await p.locator('#managementFooter button').allTextContents(),['放弃经营','关闭查看']);await reachable(p.locator('#btnAbandonManagement'),'#managementFooter');await reachable(p.locator('#btnCloseManagement'),'#managementFooter');
  await p.locator('[data-management-type=active_order]').click();await reachable(p.locator('#managementBody [data-management-confirm]').last(),'#managementBody');await p.locator('[data-management-back]').click();await p.locator('[data-management-type=active_competition_bid]').click();await p.locator('[data-competition-city="内罗毕"]').click();const input=p.locator('[aria-label="商业竞争出价"]');await input.selectOption('3000');await reachable(p.locator('#managementBody [data-management-confirm]'),'#managementBody');h.room.state.revision++;h.api.emitGame(h.room);await p.waitForFunction(r=>game.revision>=r,h.room.state.revision);assert.equal(await input.inputValue(),'3000');await screenshot(p,'competition',width);await p.click('#btnCloseManagement');
  const support=fixture();support.turnIndex=0;support.players[0].cities=[];support.cities['内罗毕'].ownerId=null;support.propertySupportRevision=require('../src/propertySupport').REVISION;for(const player of support.players)player.propertySupport={everOwnedCity:player.cities.length>0,missedPurchaseTurns:0,eligible:false,used:false};Object.assign(support.players[0].propertySupport,{missedPurchaseTurns:6,eligible:true});await h.fixture(support);await p.waitForSelector('#propertySupportModal:not(.hidden)');await measure(p,'#propertySupportModal','support-'+width);await reachable(p.locator('#btnSupportLater'),'#propertySupportModal');await reachable(p.locator('#btnSupportConfirm'),'#propertySupportModal');await p.click('#btnSupportLater');
 }
 assert.deepEqual(h.errors,[]);
});

test('normal stock purchase and quick fundraising use real requests without losing quantity or extending deadlines',{timeout:45000},async()=>{
 const p=h.pages[0];await setScreen(p,568,260);const s=fixture();s.turnIndex=0;s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};stocks.openStockWindow(s,'p0');await h.fixture(s);await p.waitForSelector('#stockModal:not(.hidden)');
 const plus=p.locator('[data-stock-city="开罗"] [data-kind=buy][data-delta="1"]');await reachable(plus,'#stockList');await plus.tap();assert.equal(await p.evaluate(()=>stockDraft['开罗'].buy),1);const deadline=h.room.actionClock.deadlineMs;await reachable(p.locator('#btnStockTransfer'),'.stock-sidebar');await p.click('#btnStockTransfer');await p.click('#offerClose');assert.equal(await p.evaluate(()=>stockDraft['开罗'].buy),1);assert.equal(h.room.actionClock.deadlineMs,deadline);await reachable(p.locator('#btnStockConfirm'),'.stock-sidebar');await p.click('#btnStockConfirm');await p.waitForFunction(()=>game.players[0].stocks['开罗']===1);const buyCash=h.room.state.players[0].cash;await p.click('#btnStockTransfer');await p.selectOption('#offerSide','sell');await p.selectOption('#offerCity','开罗');await p.fill('#offerCash','500');await p.click('#offerSend');await p.waitForSelector('#offerInbox .bank-stock-card');const other=h.pages[1];await other.click('#btnCompactInfo');await other.locator('#btnStock').scrollIntoViewIfNeeded();await other.click('#btnStock');await other.click('#btnStockTransfer');await other.getByRole('button',{name:'接受报价',exact:true}).click();await p.waitForFunction(()=>game.players[1].stocks['开罗']===1);assert.equal(h.room.state.players[0].cash,buyCash+490);assert.equal(h.room.actionClock.deadlineMs,deadline);await other.click('#offerClose');await other.click('#btnStockClose');await p.click('#offerClose');await p.click('#btnStockSkip');observations.push({flow:'normal two human sockets: purchase and accepted share transfer',shares:1,transferCash:500,sellerFee:10,deadlinePreserved:true});
 await setScreen(p,844,280);const q=fixture('quick');q.turnIndex=0;q.players[0].cash=1000;for(const unit of q.stocks['开罗'].units.slice(0,4))Object.assign(unit,{holderId:'p0',bankBasis:q.stocks['开罗'].price,paidCost:q.stocks['开罗'].price});inv.sync(q);q.phase='buy_airport';q.pending={playerId:'p0',airportId:'开罗国际机场'};await h.fixture(q);await p.getByRole('button',{name:'募集资金',exact:true}).click();await p.waitForFunction(()=>game.phase==='buy_fundraise');const fundDeadline=h.room.actionClock.deadlineMs,input=p.getByRole('spinbutton',{name:'开罗卖出股数'});await input.fill('2');await reachable(p.locator('[data-liquidation-city="开罗"]'),'#modalBody');await p.locator('[data-liquidation-city="开罗"]').tap();await p.waitForFunction(()=>game.players[0].cash===2296);assert.equal(h.room.state.players[0].stocks['开罗'],2);assert.equal(h.room.actionClock.deadlineMs,fundDeadline);await p.getByRole('button',{name:'取消购买',exact:true}).click();await p.waitForFunction(()=>game.phase!=='buy_fundraise');observations.push({flow:'quick human/bot room funding request',sharesSold:2,cash:2296,deadlinePreserved:true});assert.deepEqual(h.errors,[]);
});
