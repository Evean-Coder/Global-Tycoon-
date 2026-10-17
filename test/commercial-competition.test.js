'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),f=require('./helpers/managementEconomyFixtures'),cc=require('../src/commercialCompetition'),{normalizeAction}=require('../src/actionValidation'),logic=require('../src/gameLogic'),{snapshot}=require('../src/gameView');
test('publication waits first-lap unlock, needs two basic candidates and follows four-round cadence',()=>{
 const s=f.state();s.firstRoundDone=false;cc.publishAtRoundStart(s,1);assert.equal(s.commercialCompetition.currentPeriod,null);s.firstRoundDone=true;s.players[1].cash=0;s.turnIndex=0;cc.publishAtRoundStart(s,2);assert.deepEqual(s.commercialCompetition.currentPeriod.publishedRegions,['非洲']);assert.equal(s.commercialCompetition.nextPublicationRound,6);
 cc.publishAtRoundStart(s,3);assert.equal(s.commercialCompetition.currentPeriod.bidRound,2);s.players.forEach(p=>p.activeManagement.lastCompetitionBidLap=p.opportunities.lapEpoch);cc.publishAtRoundStart(s,6);assert.deepEqual(s.commercialCompetition.currentPeriod.publishedRegions,[]);assert.equal(s.commercialCompetition.nextPublicationRound,10);
});
test('new qualifying player can join fixed published region; natural single bid can win',()=>{
 const s=f.state(3);cc.publishAtRoundStart(s,1);f.own(s,'p2','开普敦');f.turn(s,'p2');const q=f.bid(s,'p2','开普敦');assert.equal(q.ok,true);cc.acceptBid(s,'p2',q);s.cities['开罗'].mortgaged=true;cc.commitClose(s,cc.planClose(s,1,()=>0));assert.equal(s.commercialCompetition.bids[0].status,'won');
});
test('bid range, ownership, special phases and readonly invalid failure',()=>{
 const s=f.state();cc.publishAtRoundStart(s,1);for(const amount of [0,99,105,3100,NaN]){const before=JSON.stringify(s);assert.equal(f.bid(s,'p0','内罗毕',amount).ok,false);assert.equal(JSON.stringify(s),before);}assert.equal(f.bid(s,'p0','内罗毕',3000).ok,true);assert.equal(f.bid(s,'p0','开罗').ok,false);s.players[0].jailed=true;assert.equal(f.bid(s).ok,false);s.players[0].jailed=false;s.pending={type:'test'};assert.equal(f.bid(s).ok,false);
});
test('accepted bid consumes turn and original lap but debits only on open, no mutable rebid',()=>{
 const s=f.state();cc.publishAtRoundStart(s,1);const q=f.bid(s),cash=s.players[0].cash,n=normalizeAction(s,{type:'active_competition_bid',...q},{actorId:'p0'});assert.equal(n.ok,true,n.error);assert.ok(!logic.apply(s,n.action,()=>0).rejected);assert.equal(s.players[0].cash,cash);assert.equal(s.pending,null);assert.equal(s.players[0].activeManagement.usedTurnId,s.turnId);s.players[0].opportunities.lapEpoch++;f.turn(s,'p0');assert.equal(f.bid(s).ok,false);cc.commitClose(s,cc.planClose(s,1,()=>0));assert.equal(s.players[0].cash,cash-100);cc.commitClose(s,cc.planClose(s,1,()=>0));assert.equal(s.players[0].cash,cash-100);
});
test('same price challenges previous winner, higher price wins and invalid top falls back',()=>{
 for(const [a,b,winner]of [[100,100,'p1'],[200,100,'p0'],[3000,200,'p1']]){const s=f.state();cc.publishAtRoundStart(s,1);s.commercialCompetition.lastWinnerByRegion['非洲']='p0';cc.acceptBid(s,'p0',f.bid(s,'p0','内罗毕',a));f.turn(s,'p1');cc.acceptBid(s,'p1',f.bid(s,'p1','开罗',b));if(a===3000)s.players[0].cash=0;cc.commitClose(s,cc.planClose(s,1,()=>.9));assert.equal(s.commercialCompetition.advantages[0].playerId,winner);assert.equal(s.commercialCompetition.lastWinnerByRegion['非洲'],winner);}
});
test('uniform tied challenger pool and persistent winner through failed period',()=>{
 for(const r of [0,.999999]){const s=f.state(3);f.own(s,'p2','开普敦');cc.publishAtRoundStart(s,1);s.commercialCompetition.lastWinnerByRegion['非洲']='p0';for(const [id,city]of [['p0','内罗毕'],['p1','开罗'],['p2','开普敦']]){f.turn(s,id);cc.acceptBid(s,id,f.bid(s,id,city,100));}cc.commitClose(s,cc.planClose(s,1,()=>r));assert.equal(s.commercialCompetition.advantages[0].playerId,r?'p2':'p1');}
 const s=f.state();s.commercialCompetition.lastWinnerByRegion['非洲']='p0';cc.publishAtRoundStart(s,1);cc.acceptBid(s,'p0',f.bid(s));s.players[0].cash=0;cc.commitClose(s,cc.planClose(s,1,()=>0));assert.equal(s.commercialCompetition.lastWinnerByRegion['非洲'],'p0');
});
test('public/private snapshots and accepted events never expose pending amount or flagship',()=>{
 const s=f.state(),events=[];cc.publishAtRoundStart(s,1);cc.acceptBid(s,'p0',f.bid(s,'p0','内罗毕',2300),events);const before=JSON.stringify(s),a=snapshot(s,'p0'),b=snapshot(s,'p1');assert.equal(JSON.stringify(s),before);assert.equal(a.self.competition.bid.amount,2300);assert.equal(b.self.competition.bid,null);assert.ok(!JSON.stringify(b.competition).includes('2300'));assert.ok(!JSON.stringify(events).includes('2300'));assert.ok(!JSON.stringify(events).includes('内罗毕'));assert.equal(b.competition.participants[0],'p0');
});
