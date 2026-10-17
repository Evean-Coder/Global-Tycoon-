'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),f=require('./helpers/managementEconomyFixtures'),orders=require('../src/operatingOrders'),active=require('../src/activeManagement'),econ=require('../src/economy');
test('all twenty cities and airport preserve principal, profit and quarter-first schedule',()=>{
 const s=f.state(),p=s.players[0];
 for(const c of Object.values(s.cities)){c.ownerId=p.id;const q=orders.quote(s,p,'city',c.id),up=Math.max(1000,Math.min(2000,Math.round(c.price*.1)));assert.equal(q.finalAmount,up);assert.equal(q.baseProfit,up);assert.deepEqual(q.scheduledPayments,[Math.round(up*.25),2*up-Math.round(up*.25)]);assert.ok(q.baseProfit>=1000&&q.baseProfit<=2000);}
 const a=Object.values(s.airports)[0];a.ownerId=p.id;const q=orders.quote(s,p,'airport',a.id);assert.deepEqual(q.scheduledPayments,[375,2625]);
});
test('new order pays actual two starts once, with principal only in tail and capped news bonus',()=>{
 const s=f.state(),p=s.players[0];f.own(s,p.id,'上海');s.world.active={type:'stable'};const cash=p.cash,q=active.quote(s,p.id,'active_order','上海',undefined,'city'),events=[];active.apply(s,p,{type:'active_order',cityId:'上海',targetKind:'city',quoteVersion:q.quoteVersion},events);
 orders.settleAtTurnStart(s,p,events);assert.equal(p.cash,cash-2000);
 f.turn(s,p.id);p.frozen=true;orders.settleAtTurnStart(s,p,events);orders.settleAtTurnStart(s,p,events);assert.equal(p.cash,cash-1450);assert.equal(s.operatingOrders[0].principalOutstanding,2000);
 f.turn(s,p.id);p.jailed=true;orders.settleAtTurnStart(s,p,events);assert.equal(p.cash,cash+2200);assert.equal(s.operatingOrders[0].principalOutstanding,0);assert.equal(events.filter(e=>e.kind==='order_payment').length,2);assert.deepEqual(events.filter(e=>e.kind==='order_payment').map(e=>[e.principal,e.profit]),[[0,500],[2000,1500]]);
});
test('cancel after first profit loses outstanding principal; source restoration never revives',()=>{
 for(const kind of ['city','airport']){const s=f.state(),p=s.players[0],id=kind==='city'?'内罗毕':Object.keys(s.airports)[0];if(kind==='airport')s.airports[id].ownerId=p.id;const q=orders.quote(s,p,kind,id),cash=p.cash;orders.start(s,p,q,[]);f.turn(s,p.id);orders.settleAtTurnStart(s,p,[]);assert.equal(p.cash,cash-q.finalAmount+q.scheduledPayments[0]);
 if(kind==='city')s.cities[id].mortgaged=true;else s.airports[id].ownershipEpoch++;orders.clean(s);if(kind==='city')s.cities[id].mortgaged=false;orders.clean(s);f.turn(s,p.id);orders.settleAtTurnStart(s,p,[]);assert.equal(s.operatingOrders[0].paymentsRemaining,0);assert.equal(p.cash,cash-q.finalAmount+q.scheduledPayments[0]);}
});
test('once per lap, one live order, invalid quote readonly and remote build restrictions retained',()=>{
 const s=f.state(),p=s.players[0],q=orders.quote(s,p,'city','内罗毕');orders.start(s,p,q,[]);f.turn(s,p.id);assert.equal(orders.quote(s,p,'city','内罗毕').ok,false);p.opportunities.lapEpoch++;assert.equal(orders.quote(s,p,'city','内罗毕').ok,false);
 for(let level=0;level<4;level++){s.cities['内罗毕'].houseLevel=level;const b=econ.quoteBuild(s,{playerId:p.id,cityId:'内罗毕',mode:'active'});assert.equal(b.finalAmount,econ.rounded(econ.buildFee(s.cities['内罗毕']),[150,200,300,350][level]));}p.activeManagement.lastRemoteBuildLap=p.opportunities.lapEpoch;assert.equal(econ.quoteBuild(s,{playerId:p.id,cityId:'内罗毕',mode:'active'}).ok,false);p.opportunities.lapEpoch+=3;p.activeManagement.lastRemoteBuildCityId='内罗毕';assert.equal(econ.quoteBuild(s,{playerId:p.id,cityId:'内罗毕',mode:'active'}).ok,false);
});
