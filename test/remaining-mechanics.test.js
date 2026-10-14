'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const f=require('./helpers/gameplayFixtures'),{createGameState}=require('../src/state'),econ=require('../src/economy'),missions=require('../src/businessMissions'),news=require('../src/worldEvents'),orders=require('../src/operatingOrders'),active=require('../src/activeManagement'),opp=require('../src/opportunities'),logic=require('../src/gameLogic'),{snapshot}=require('../src/gameView'),{normalizeAction}=require('../src/actionValidation'),stocks=require('../src/stocks'),policy=require('../src/disconnectPolicy'),{createActionClock}=require('../src/actionClock');
function state(){return createGameState('NEW',['甲','乙'],2,{activeManagementRevision:active.REVISION,businessMissionRevision:missions.REVISION,worldRevision:news.REVISION,disconnectRevision:policy.REVISION});}
function accept(s,type){const q=missions.quote(s,'p0',type);assert.equal(q.ok,true,q.reason);missions.apply(s,'p0',{missionType:type,quoteVersion:q.quoteVersion},[]);}
function normal(s){f.own(s,'p0','内罗毕');s.players[0].position=1;return s;}
test('tasks use real post-accept normal building, cash threshold, and one coupon; remote does not count',()=>{
 const s=normal(state()),p=s.players[0];accept(s,'build');
 const remote=econ.quoteBuild(s,{playerId:'p0',cityId:'内罗毕',mode:'active'});econ.applySettlement(s,remote,[]);assert.ok(p.businessMission.active);assert.equal(p.businessMission.coupon,null);
 const q=econ.quoteBuild(s,{playerId:'p0',cityId:'内罗毕'});p.cash=q.finalAmount+5999;econ.applySettlement(s,q,[]);assert.ok(p.businessMission.active);
 p.cash=15000;econ.applySettlement(s,econ.quoteBuild(s,{playerId:'p0',cityId:'内罗毕'}),[]);assert.equal(p.businessMission.active,null);assert.equal(p.businessMission.coupon.type,'build');assert.equal(missions.quote(s,'p0','build').ok,false);
});
test('paid flights complete, free flights and low remaining cash do not',()=>{
 for(const free of [true,false]){const s=state(),p=s.players[0];accept(s,'flight');const q=econ.quoteFlight(s,{playerId:'p0',fromAirportId:'开罗国际机场',target:'纽约肯尼迪国际机场',free});econ.applySettlement(s,q,[]);assert.equal(!!p.businessMission.coupon,!free);}
 const s=state();accept(s,'flight');const q=econ.quoteFlight(s,{playerId:'p0',fromAirportId:'开罗国际机场',target:'纽约肯尼迪国际机场'});s.players[0].cash=q.finalAmount+5999;econ.applySettlement(s,q,[]);assert.ok(s.players[0].businessMission.active);
});
test('coupon cuts share caps and remote floor; zero saving preserves coupon; old games have no missions',()=>{
 const s=normal(state()),p=s.players[0];p.businessMission.coupon={id:'c',type:'build',expiresAtLap:2};
 const q=econ.quoteBuild(s,{playerId:'p0',cityId:'内罗毕',mode:'active'});assert.equal(q.finalAmount,3240);assert.equal(q.missionCoupon,undefined);econ.applySettlement(s,q,[]);assert.ok(p.businessMission.coupon);
 s.world.active={type:'construction'};const n=econ.quoteBuild(s,{playerId:'p0',cityId:'内罗毕'});assert.equal(n.finalAmount,1512);assert.equal(n.missionCoupon.amount,108);econ.applySettlement(s,n,[]);assert.equal(p.businessMission.coupon,null);
 assert.equal(missions.view(f.game(2),'p0'),null);
});
test('flight coupons share 60 percent cap, no cashback on free ticket, once only',()=>{
 const s=state(),p=s.players[0];p.businessMission.coupon={id:'c',type:'flight',expiresAtLap:2};f.selected(s,'p0','H7');s.world.active={type:'aviation'};
 const args={playerId:'p0',fromAirportId:'开罗国际机场',target:'纽约肯尼迪国际机场'};
 const q=econ.quoteFlight(s,args);assert.equal(q.finalAmount,econ.rounded(q.baseAmount,40));assert.equal(q.missionCoupon,undefined);econ.applySettlement(s,q,[]);assert.ok(p.businessMission.coupon);
 s.world.active=null;p.opportunities.selectedIds=[];const n=econ.quoteFlight(s,args);assert.ok(n.missionCoupon.amount>0);econ.applySettlement(s,n,[]);assert.equal(p.businessMission.coupon,null);
 p.businessMission.coupon={id:'d',type:'flight',expiresAtLap:2};econ.applySettlement(s,econ.quoteFlight(s,{...args,free:true}),[]);assert.ok(p.businessMission.coupon);
});
test('task abandonment, two-go expiry, seal and out clear; no private progress or coupon asset value',()=>{
 const s=normal(state()),p=s.players[0];accept(s,'build');assert.equal(missions.quote(s,'p0','abandon').ok,true);const q=missions.quote(s,'p0','abandon');missions.apply(s,'p0',{missionType:'abandon',quoteVersion:q.quoteVersion},[]);assert.equal(missions.quote(s,'p0','build').ok,false);
 opp.refresh(p);accept(s,'build');opp.refresh(p);missions.onGo(s,p,[]);assert.ok(p.businessMission.active);opp.refresh(p);missions.onGo(s,p,[]);assert.equal(p.businessMission.active,null);
 assert.equal(snapshot(s,'p1').players[0].businessMission,undefined);assert.equal(snapshot(s,'p1').self.businessMission.active,null);
 const total=require('../src/assets').assetSummary(s,'p0').total;p.businessMission.coupon={id:'c',type:'build',expiresAtLap:99};assert.equal(require('../src/assets').assetSummary(s,'p0').total,total);stocks.settleFinalEconomy(s,'disband',[]);assert.equal(p.businessMission.coupon,null);
});
test('invalid, stale and foreign mission requests do not modify state; original action flow handles real acceptance',()=>{
 const s=normal(state()),q=missions.quote(s,'p0','build'),a={type:'mission_manage',missionType:'build',quoteVersion:q.quoteVersion};
 for(const raw of [{...a,missionType:'bad'},{...a,quoteVersion:'stale'}])assert.equal(normalizeAction(s,raw,{actorId:'p0'}).ok,false);
 const n=normalizeAction(s,a,{actorId:'p0'});assert.equal(n.ok,true);logic.apply(s,n.action,f.rng(),{actorId:n.actorId});assert.ok(s.players[0].businessMission.active);assert.equal(normalizeAction(s,a,{actorId:'p0'}).ok,false);
 s.phase='stock';assert.equal(normalizeAction(s,a,{actorId:'p0'}).ok,false);
});
test('all city rents and builds use new news caps, while historical games retain original effects',()=>{
 for(const s of [state(),f.game(2)])for(const id of Object.keys(s.cities)){
  f.own(s,'p1',id);const c=s.cities[id];for(let level=0;level<5;level++){c.houseLevel=level;const base=econ.rentFor(c);for(const type of ['boom','slowdown']){s.world.active={type,region:c.continent,name:type};const q=econ.quoteRent(s,{playerId:'p0',cityId:id}),r=news.effectRules(s);assert.equal(q.income,base+Math.min(r.rentCap,econ.rounded(base,r.rentPercent))*(type==='boom'?1:-1));assert.equal(q.finalAmount,q.income);}}
 }
 const s=normal(state());s.world.active={type:'construction'};const q=econ.quoteBuild(s,{playerId:'p0',cityId:'内罗毕'});assert.equal(q.finalAmount,1620);econ.applySettlement(s,q,[]);assert.equal(econ.quoteBuild(s,{playerId:'p0',cityId:'内罗毕'}).finalAmount,2160);
});
test('stable news only rewards paid orders once, no cancellation payout or future asset inflation',()=>{
 for(const revision of [news.REVISION,undefined]){const s=normal(state());s.worldRevision=revision;const p=s.players[0],q=orders.quote(s,p,'city','内罗毕'),ev=[];orders.start(s,p,q,ev);s.world.active={type:'stable'};const cash=p.cash;s.turnId++;orders.settleAtTurnStart(s,p,ev);orders.settleAtTurnStart(s,p,ev);assert.equal(p.cash,cash+q.paymentEach+(revision?43:0));assert.equal(ev.filter(e=>e.kind==='world_order_reward').length,revision?1:0);s.cities['内罗毕'].mortgaged=true;s.turnId++;orders.settleAtTurnStart(s,p,ev);assert.equal(p.cash,cash+q.paymentEach+(revision?43:0));}
});
function room(){const fake=f.fakeClock(),s=state(),r={state:s,players:[{id:'p0',connected:false},{id:'p1',connected:true}],actionClock:createActionClock(fake),disconnectOptions:fake};r.actionClock.sync(s,()=>{});return {r,fake};}
test('offline grace is at most20s, is not replenished by reconnect, continuous disconnect has zero next wait',()=>{
 const {r,fake}=room(),calls=[];const run=(...args)=>calls.push(args),fallback=()=>({type:'buy',decision:'pass'});
 policy.sync(r,run,fallback);fake.advance(9000);r.players[0].connected=true;policy.sync(r,run,fallback);fake.advance(4000);r.players[0].connected=false;policy.sync(r,run,fallback);fake.advance(6999);assert.equal(calls.length,0);fake.advance(1);assert.equal(calls.length,1);
 r.state.turnId++;r.actionClock.sync(r.state,()=>{});policy.sync(r,run,fallback);fake.advance(0);assert.equal(calls.length,2);
});
test('nonactor disconnect does not pause, self rescue waits untimed, all offline stops defaults, old games pause',()=>{
 const {r,fake}=room();r.players[0].connected=true;r.players[1].connected=false;assert.equal(policy.blocked(r),false);
 r.players[0].connected=false;assert.equal(policy.blocked(r),true);let count=0;policy.sync(r,()=>count++,()=>({type:'roll_dice'}));fake.advance(30000);assert.equal(count,0);r.players[1].connected=true;policy.sync(r,()=>count++,()=>({type:'roll_dice'}));fake.advance(0);assert.equal(count,1);
 r.state.phase='self_rescue';r.state.pending={playerId:'p0'};r.actionClock.sync(r.state,()=>{});assert.equal(r.actionClock.remainingMilliseconds(),null);policy.sync(r,()=>count++,()=>null);fake.advance(1000000);assert.equal(count,1);assert.equal(policy.blocked(r),true);
 r.players[0].connected=true;r.state.disconnectRevision=undefined;assert.equal(policy.blocked(r),false);r.players[1].connected=false;assert.equal(policy.blocked(r),true);
});
test('synchronous defaults choose only offline left option; online choices keep full clock',()=>{
 const {r,fake}=room();opp.beginOpportunityStage(r.state,1,{kind:'start'},f.rng());r.actionClock.sync(r.state,()=>{});policy.sync(r,(_r,_sock,a,_source,id)=>opp.submit(r.state,id,a),()=>null);fake.advance(20000);assert.equal(r.state.opportunityStage.participants.p0.submitted,true);assert.equal(r.state.opportunityStage.participants.p1.submitted,false);assert.equal(r.actionClock.remainingSeconds(),40);assert.equal(policy.defaultAction(r,'p0',()=>null),null);
});
test('offline frozen never pays, jailed rolls, short original deadline caps grace and stale callback is harmless',()=>{
 const {r,fake}=room(),fallback=require('../server').defaultAction;
 for(const [phase,expected] of Object.entries({waiting_roll:{type:'management_timeout'},buy:{type:'buy',decision:'pass'},buy_airport:{type:'buy_airport',decision:'pass'},build_decide:{type:'respond_build',decision:'pass'},buy_fundraise:{type:'buy_fundraise',decision:'cancel'},flight:{type:'flight',target:null},stock:{type:'stock_done'},trade_confirm:{type:'stock_transfer',accept:false},auction_bid:{type:'auction_respond',decision:'pass'},direct_sale_ask:{type:'direct_sale_respond',decision:'pass'},self_rescue:null})){r.state.phase=phase;assert.deepEqual(policy.defaultAction(r,'p0',fallback),expected);}
 r.state.phase='frozen_turn';assert.deepEqual(policy.defaultAction(r,'p0',()=>null),{type:'respond_frozen',decision:'pass'});r.state.phase='jail_turn';assert.deepEqual(policy.defaultAction(r,'p0',()=>null),{type:'respond_jail',decision:'roll'});
 r.state.phase='buy';r.actionClock.sync(r.state,()=>{});fake.advance(55000);let count=0;policy.sync(r,()=>count++,()=>({type:'buy',decision:'pass'}));fake.advance(4999);assert.equal(count,0);fake.advance(1);assert.equal(count,1);r.state.phase='stock';policy.sync(r,()=>count++,()=>null);r.state.turnId++;fake.advance(20000);assert.equal(count,1);
});
test('two to four seats and bots keep online decisions available; all humans offline stops bots',()=>{
 for(const n of [2,3,4]){const {r}=room();while(r.players.length<n){const id='p'+r.players.length;r.players.push({id,connected:false});r.state.players.push({...r.state.players[0],id});}r.players[0].connected=true;r.players[1].connected=false;assert.equal(policy.blocked(r),false);}
 const {r}=room();r.players[0].kind='bot';r.players[0].connected=true;r.players[1].connected=false;assert.equal(policy.blocked(r),true);r.players[1].connected=true;assert.equal(policy.blocked(r),false);
});
test('mission success and new version rules round-trip through private replay without leaking progress',()=>{
 const s=normal(state()),room={state:s,events:[]},journal=require('../src/privateReplay');journal.capture(room);accept(s,'build');journal.capture(room);econ.applySettlement(s,econ.quoteBuild(s,{playerId:'p0',cityId:'内罗毕'}),[]);journal.capture(room);const exported=journal.exportJournal(room);assert.ok(exported);assert.deepEqual(journal.replay(exported),JSON.parse(JSON.stringify(s)));assert.ok(JSON.stringify(exported).includes('businessMission'));assert.equal(JSON.stringify(snapshot(s,'p1').players).includes('businessMission'),false);
});
