'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const f=require('./helpers/gameplayFixtures'),logic=require('../src/gameLogic'),{snapshot}=require('../src/state'),travel=require('../src/travelExpense');
function airport(s,id,owner){s.airports[id].ownerId=owner;s.players.find(p=>p.id===owner).airports.push(id);}
function arrive(s){s.firstRoundDone=true;s.players[0].position=5;s.diceBag=[1];logic.apply(s,{type:'roll_dice'},f.rng());assert.equal(s.phase,'flight');}
test('实际机场扣款事实与本人投影 / 目的自有仍付票 / 免费航班后期费',()=>{
 for(const [owner,index,expected]of [['p0',1,0],['p1',1,8000],['p0',81,1500]]){
  const s=f.game(2);s.economyRevision=travel.REVISION;s.travelExpenseReceipts={};s.roundFlow.index=index;
  airport(s,'开罗国际机场',owner);airport(s,'伦敦希思罗国际机场','p0');arrive(s);
  const v=snapshot(s,'p0'),other=snapshot(s,'p1');
  assert.equal(v.self.flightInfo.airportFeePaid.amount,owner==='p0'?0:3000);
  assert.equal(other.self.flightInfo,undefined);
  assert.equal(v.self.quotes.flight['伦敦希思罗国际机场'].finalAmount,owner==='p0'?0:5000);
  logic.apply(s,{type:'flight',target:'伦敦希思罗国际机场'},f.rng());
  assert.equal(s.players[0].cash,150000-expected);assert.equal(s.players[0].position,16);
 }
 const promotion=f.game(2);airport(promotion,'开罗国际机场','p1');airport(promotion,'伦敦希思罗国际机场','p0');f.selected(promotion,'p0','H7');promotion.world.active={type:'aviation',name:'航空促销',remaining:3};arrive(promotion);
 const quote=snapshot(promotion,'p0').self.quotes.flight['伦敦希思罗国际机场'];assert.equal(quote.baseAmount,5000);assert.equal(quote.finalAmount,2500);logic.apply(promotion,{type:'flight',target:'伦敦希思罗国际机场'},f.rng());assert.equal(promotion.players[0].cash,144500);assert.equal(promotion.players[0].opportunities.usage.H7,1);
});
test('缺旧资料不猜历史扣费 / 费用边界及原机场不足自救',()=>{
 const old=f.game(2);old.phase='flight';old.pending={playerId:'p0',fromAirportId:'开罗国际机场',free:false};
 assert.equal(snapshot(old,'p0').self.flightInfo.airportFeePaid,null);
 assert.equal(snapshot(old,'p0').travelExpense.enabled,false);
 for(const [index,amount]of [[80,0],[81,1500],[120,1500],[121,3000]]){
  const s=f.game(2);s.economyRevision=travel.REVISION;s.roundFlow.index=index;assert.equal(travel.stage(s).currentAmount,amount);
  airport(s,'开罗国际机场','p0');arrive(s);logic.apply(s,{type:'flight',target:null},f.rng());assert.equal(s.players[0].cash,150000-amount);assert.equal(s.turnIndex,1);
 }
 const historical=f.game(2);historical.roundFlow.index=121;airport(historical,'开罗国际机场','p0');arrive(historical);logic.apply(historical,{type:'flight',target:null},f.rng());assert.equal(historical.players[0].cash,150000);
 const preview=f.game(2);preview.economyRevision=travel.REVISION;preview.roundFlow.index=79;assert.equal(travel.stage(preview).preview.startsAtRound,81);
 const debt=f.game(2);airport(debt,'开罗国际机场','p1');debt.players[0].cash=2000;debt.firstRoundDone=true;debt.players[0].position=5;debt.diceBag=[1];logic.apply(debt,{type:'roll_dice'},f.rng());
 assert.equal(debt.players[0].cash,-1000);assert.equal(debt.phase,'self_rescue');assert.equal(debt.pending.reason,'机场费');
});
