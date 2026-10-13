'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createGameState}=require('../src/state'),support=require('../src/propertySupport'),logic=require('../src/gameLogic'),{normalizeAction}=require('../src/actionValidation'),stocks=require('../src/stocks'),f=require('./helpers/gameplayFixtures');
function state(){const s=createGameState('BUDGET',['甲','乙'],2,{propertySupportRevision:support.REVISION});s.firstRoundDone=true;s.phase='waiting_roll';s.pending=null;s.players[0].propertySupport.eligible=true;s.players[0].propertySupport.missedPurchaseTurns=6;return s;}
function payload(s,cityIds){return {type:'support_buy',cityIds,quoteVersion:support.selectionVersion(s,'p0')};}
test('ordinary pool includes every unsold ordinary city and premium release depends only on ownership',()=>{
 const s=state();assert.equal(support.candidates(s).length,18);assert.equal(support.candidates(s).includes('纽约'),false);assert.equal(support.candidates(s).includes('上海'),false);
 s.players[0].cash=0;s.phase='auction_bid';s.pending={cityId:'内罗毕'};assert.equal(support.view(s,'p0').premiumOpen,false);s.phase='waiting_roll';s.pending=null;
 for(const [id,c]of Object.entries(s.cities))if(!['纽约','上海'].includes(id))c.ownerId='p1';assert.deepEqual(support.candidates(s),['纽约','上海']);assert.equal(support.view(s,'p0').premiumOpen,true);
 s.cities['纽约'].ownerId='p1';assert.deepEqual(support.candidates(s),['上海']);s.cities['内罗毕'].ownerId=null;assert.deepEqual(support.candidates(s),['内罗毕']);assert.equal(support.quoteSelection(s,'p0',['上海']).ok,false);
});
test('a multi-city budget purchase validates before acquiring any city and completes once',()=>{
 const s=state(),ids=['内罗毕','卡萨布兰卡','开罗'],cash=s.players[0].cash,q=support.quoteSelection(s,'p0',ids);assert.equal(q.finalAmount,14400);const n=normalizeAction(s,payload(s,ids),'p0');assert.equal(n.ok,true);logic.apply(s,n.action,f.rng());
 assert.equal(s.players[0].cash,cash-14400);assert.equal(s.players[0].lapBuys,3);assert.equal(s.players[0].propertySupport.used,true);assert.equal(s.players[0].propertySupport.everOwnedCity,true);assert.equal(s.phase,'waiting_roll');
 for(const id of ids){assert.equal(s.cities[id].ownerId,'p0');assert.equal(s.cities[id].buildReady,false);assert.ok(s.stocks[id].listingEpoch>0);}
 assert.equal(normalizeAction(s,payload(s,ids),'p0').ok,false);
});
test('one expensive city and mixed baskets fit budget; excessive, duplicate and invalid baskets fail without mutation',()=>{
 for(const ids of [['东京'],['柏林','内罗毕']]){const s=state();assert.equal(normalizeAction(s,payload(s,ids),'p0').ok,true);}
 for(const ids of [[],['内罗毕','内罗毕'],['内罗毕','卡萨布兰卡','开罗','开普敦'],['不存在'],['纽约']]){const s=state(),before=JSON.stringify(s);assert.equal(normalizeAction(s,payload(s,ids),'p0').ok,false);assert.equal(JSON.stringify(s),before);}
 for(const change of [s=>s.players[0].cash=1000,s=>s.players[0].lapBuys=3,s=>s.phase='self_rescue']){const s=state();change(s);const before=JSON.stringify(s);assert.equal(normalizeAction(s,payload(s,['内罗毕','卡萨布兰卡']),'p0').ok,false);assert.equal(JSON.stringify(s),before);assert.equal(s.players[0].propertySupport.eligible,true);}
});
test('changing cash or any selected inventory invalidates prior basket, and premium baskets stay within budget',()=>{
 const s=state(),old=payload(s,['内罗毕','卡萨布兰卡']);s.players[0].cash-=1;let before=JSON.stringify(s);assert.equal(normalizeAction(s,old,'p0').ok,false);assert.equal(JSON.stringify(s),before);
 const fresh=payload(s,['内罗毕','卡萨布兰卡']);stocks.transferCity(s,{cityId:'卡萨布兰卡',newOwnerId:'p1'},[]);before=JSON.stringify(s);assert.equal(normalizeAction(s,fresh,'p0').ok,false);assert.equal(JSON.stringify(s),before);
 const premium=state();for(const [id,c]of Object.entries(premium.cities))if(!['纽约','上海'].includes(id))c.ownerId='p1';assert.equal(normalizeAction(premium,payload(premium,['上海']),'p0').ok,true);assert.equal(normalizeAction(premium,payload(premium,['纽约','上海']),'p0').ok,false);
});
test('private view and historical single-city format remain distinct and AI uses budget action shape',()=>{
 const s=state(),view=require('../src/gameView').snapshot(s,'p1');assert.equal(view.players[0].propertySupport,undefined);assert.equal(view.self.propertySupport.eligible,false);
 const legacy=createGameState('OLD',['甲','乙'],2,{propertySupportRevision:support.LEGACY_REVISION});legacy.firstRoundDone=true;legacy.phase='waiting_roll';legacy.players[0].propertySupport.eligible=true;const cid=support.candidates(legacy)[0],q=support.quote(legacy,'p0',cid);assert.equal(support.candidates(legacy).length,3);assert.equal(normalizeAction(legacy,{type:'support_buy',cityId:cid,quoteVersion:q.quoteVersion},'p0').ok,true);
 const bot=require('../src/botPolicy').choose(require('../src/gameView').snapshot(s,'p0'),{});assert.equal(bot.type,'support_buy');assert.ok(Array.isArray(bot.cityIds));assert.equal(normalizeAction(s,bot,'p0').ok,true);
 const compatible=state(),single={type:'support_buy',cityId:'内罗毕',quoteVersion:support.selectionVersion(compatible,'p0')};const normalized=normalizeAction(compatible,single,'p0');assert.equal(normalized.ok,true);logic.apply(compatible,normalized.action,f.rng());assert.equal(compatible.cities['内罗毕'].ownerId,'p0');assert.equal(compatible.players[0].lapBuys,1);
});
