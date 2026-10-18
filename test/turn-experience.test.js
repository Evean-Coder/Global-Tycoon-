'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const f=require('./helpers/managementEconomyFixtures'),experience=require('../src/turnExperience'),active=require('../src/activeManagement'),logic=require('../src/gameLogic'),{createGameState,snapshot}=require('../src/state');
const orders=require('../src/operatingOrders'),econ=require('../src/economy'),competition=require('../src/commercialCompetition'),view=require('../public/turn-experience-view');
function state(){const s=f.state();s.turnExperienceRevision=experience.REVISION;return s;}
function room(s,events=[]){return {state:s,events:events.map((e,id)=>({...e,id}))};}

test('new games validate the version combination and expose an optional private history context',()=>{
 assert.throws(()=>createGameState('T',['甲','乙'],2,{turnExperienceRevision:experience.REVISION}),/组合无效/);
 const s=createGameState('T',['甲','乙'],2,{...f.options,turnExperienceRevision:experience.REVISION});
 assert.equal(experience.enabled(s),true);const r=room(s);const cache=experience.update(r),before=JSON.stringify(s),v=snapshot(s,'p0',null,{experience:cache});
 assert.equal(v.turnExperienceRevision,experience.REVISION);assert.equal(v.self.turnExperience.historyAvailable,true);assert.equal(snapshot(s,'p0').self.turnExperience.historyAvailable,false);assert.equal(JSON.stringify(s),before);
 delete s.turnExperienceRevision;assert.equal(snapshot(s,'p0').self.turnExperience,undefined);
});
test('direct roll atomically skips unused management; legacy games still require a decision',()=>{
 const s=state();s.diceBag=[1];assert.ok(active.view(s,'p0').quotes.some(q=>q.ok));assert.equal(active.required(s,'p0'),false);
 const result=logic.apply(s,{type:'roll_dice'},f.rng());assert.ok(!result.rejected);assert.equal(result.events.filter(e=>e.kind==='management_skipped').length,1);assert.equal(result.events.find(e=>e.kind==='management_skipped').reason,'roll');assert.equal(s.players[0].position,1);
 const old=f.state(),before=JSON.stringify(old);assert.equal(logic.apply(old,{type:'roll_dice'},f.rng()).rejected,true);assert.equal(JSON.stringify(old),before);
});
test('order receipts separate principal, profit and news; duplicate facts and rebuild never double count',()=>{
 const s=state(),events=[],p=s.players[0];f.own(s,'p0','上海');const q=active.quote(s,'p0','active_order','上海',undefined,'city');active.apply(s,p,{type:'active_order',cityId:'上海',targetKind:'city',quoteVersion:q.quoteVersion},events);
 s.world.active={type:'stable'};s.turnId++;orders.settleAtTurnStart(s,p,events);s.turnId++;orders.settleAtTurnStart(s,p,events);
 const r=room(s,events),before=JSON.stringify(s),cache=experience.update(r),v=experience.view(s,'p0',cache);
 assert.deepEqual(v.totals.orders,{upfront:2000,principal:2000,profit:2000,newsBonus:200,cancelledPrincipal:0});
 assert.equal(v.recent.filter(e=>e.kind==='order_payment').length,2);assert.equal(JSON.stringify(s),before);
 const processed=cache.processedCount;experience.update(r);assert.equal(cache.processedCount,processed);
 const payment=events.find(e=>e.kind==='order_payment');r.events.push({...payment,id:r.events.length});experience.update(r);assert.deepEqual(experience.view(s,'p0',cache).totals,v.totals);
 r.experienceCache=null;assert.deepEqual(experience.view(s,'p0',experience.update(r)),experience.view(s,'p0',cache));
});
test('cancelled principal survives a replacement order and cache reconstruction',()=>{
 const s=state(),p=s.players[0],events=[];const q=active.quote(s,p.id,'active_order','内罗毕',undefined,'city');active.apply(s,p,{type:'active_order',cityId:'内罗毕',targetKind:'city',quoteVersion:q.quoteVersion},events);s.turnId++;orders.settleAtTurnStart(s,p,events);s.cities['内罗毕'].mortgaged=true;orders.clean(s,events);
 const v=experience.view(s,p.id,experience.update(room(s,events)));assert.equal(v.totals.orders.upfront,1000);assert.equal(v.totals.orders.profit,250);assert.equal(v.totals.orders.cancelledPrincipal,1000);assert.equal(v.recent[0].unpaidPrincipal,1000);
});
test('real ownership transfer and final settlement both retain the cancelled principal fact',()=>{
 const stocks=require('../src/stocks');
 for(const final of [false,true]){const s=state(),events=[],p=s.players[0],q=active.quote(s,p.id,'active_order','内罗毕',undefined,'city');active.apply(s,p,{type:'active_order',cityId:'内罗毕',targetKind:'city',quoteVersion:q.quoteVersion},events);
  if(final)stocks.settleFinalEconomy(s,'normal',events);else stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p1'},events);
  assert.equal(events.filter(e=>e.kind==='order_cancelled').length,1);const totals=experience.view(s,p.id,experience.update(room(s,events))).totals;assert.equal(totals.orders.cancelledPrincipal,1000);
 }
});
test('timeout remains conservative and invalid historical cash data cannot mutate the game',()=>{
 const s=state(),cash=s.players[0].cash;s.players[0].position=9;s.diceBag=[1];const result=logic.apply(s,{type:'management_timeout'},f.rng(),{source:'timeout'});assert.equal(s.players[0].cash,cash);assert.equal(result.events.filter(e=>e.kind==='management_skipped').length,1);assert.equal(result.events.some(e=>e.kind==='order_started'||e.kind==='build'),false);
 const before=JSON.stringify(s),r=room(s,[{kind:'competition_period_closed',winner:{playerId:'p0',amount:-1},bids:[{playerId:'p0',status:'won'}]}]);assert.equal(experience.update(r),null);assert.equal(experience.view(s,'p0',r.experienceCache).historyAvailable,false);assert.equal(JSON.stringify(s),before);
});
test('only remote construction is counted, with actual levels and cost; projection is read only',()=>{
 const s=state(),events=[];const q=active.quote(s,'p0','active_build','内罗毕');active.apply(s,s.players[0],{type:'active_build',cityId:'内罗毕',quoteVersion:q.quoteVersion},events);
 const before=JSON.stringify(s),v=experience.view(s,'p0',experience.update(room(s,events)));assert.equal(v.totals.remote.cost,q.finalAmount);assert.equal(v.totals.remote.count,1);assert.equal(v.recent[0].levelBefore,0);assert.equal(v.recent[0].levelAfter,1);assert.equal(JSON.stringify(s),before);
});
test('competition records a winning debit and nominal surcharge without double counting stock dividends',()=>{
 const s=state(),events=[];competition.publishAtRoundStart(s,1,events);const bid=f.bid(s,'p0','内罗毕',100);competition.acceptBid(s,'p0',{periodId:bid.periodId,region:bid.region,cityId:bid.cityId,amount:100,quoteVersion:bid.quoteVersion},events);const pre=experience.view(s,'p0',experience.update(room(s,events)));assert.equal(pre.totals.competition.cost,0);
 competition.commitClose(s,competition.planClose(s,1,f.rng()),events);s.roundFlow.index=2;
 const rent=econ.quoteRent(s,{playerId:'p1',cityId:'内罗毕'});econ.applySettlement(s,rent,events);
 const cache=experience.update(room(s,events)),owner=experience.view(s,'p0',cache),tenant=experience.view(s,'p1',cache);assert.equal(owner.totals.competition.cost,100);assert.equal(owner.totals.competition.hits,1);assert.equal(owner.totals.competition.nominalSurcharge,rent.competition.surcharge);assert.equal(tenant.totals.competition.cost,0);assert.equal(owner.recent[0].kind,'competition_rent');assert.match(view.receiptText(owner.recent[0],String),/不等于竞争新增利润/);
});
test('recent results are bounded, private and robust to incomplete or malformed historical facts',()=>{
 const s=state(),events=Array.from({length:60},(_,n)=>({kind:'instant_stock_dividend',playerId:'p0',cityId:'内罗毕',settlementId:s.gameId+':money:'+n+':p0',amount:6,rental:2,bank:4,extra:0}));const r=room(s,events),cache=experience.update(r);assert.equal(experience.view(s,'p0',cache).recent.length,24);assert.equal(experience.view(s,'p1',cache).recent.length,0);assert.ok(cache.players.p0.seen.length<=48);
 r.events.push({...events[0],id:60});experience.update(r);assert.equal(cache.players.p0.recent[0].eventId,59);
 r.events.push({id:61,kind:'order_payment',playerId:'p0',amount:100});experience.update(r);assert.match(experience.view(s,'p0',cache).incompleteReasons.join(''),/未区分/);
 assert.doesNotMatch(view.receiptText({kind:'order_payment'},String),/NaN|undefined/);
});
