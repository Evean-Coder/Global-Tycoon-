'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const f=require('./helpers/gameplayFixtures'),logic=require('../src/gameLogic');
const o=require('../src/opportunities'),st=require('../src/stocks'),e=require('../src/economy');
function roll(s,n){s.diceBag=[n];return logic.apply(s,{type:'roll_dice'},f.rng());}
function choose(s,id){const p=s.opportunityStage.participants[id];return logic.apply(s,{type:'opportunity_choose',stageId:s.opportunityStage.stageId,candidateVersion:p.candidateVersion,opportunityId:p.candidateIds[0]},f.rng(),{actorId:id});}
test('接入真实租金与自救：优惠顺序、银行补足和托管收入',()=>{
 const s=f.game();f.own(s,'p1','上海');f.selected(s,'p0','H6','H11');s.stocks['上海'].holders.p0=1;
 const q=e.rentAmounts(s,{playerId:'p0',cityId:'上海',baseAmount:10000});
 assert.equal(q.finalAmount,7200);assert.equal(q.bankSupplement,2800);assert.equal(q.fundDeltas['上海'],2000);
 s.players[0].cash=10;s.players[0].position=35;roll(s,1);
 assert.equal(s.phase,'self_rescue');assert.equal(s.stocks['上海'].dividendFund,1200);
 assert.equal(s.players[1].cash,154800);assert.equal(s.stocks['上海'].price,4060);
 assert.equal(s.roundFlow.completedIds.length,0);
});
test('接入普通建拆与募资拆房 / 主动远程施工：实付成本、失败原子性与保持回合',()=>{
 const s=f.game();f.own(s,'p0','上海','东京');f.selected(s,'p0','H1','H2','H3');s.world.active={type:'construction'};
 const r=logic.apply(s,{type:'remote_build',cityId:'上海'},f.rng());
 assert.equal(r.events[0].finalAmount,8400);assert.equal(s.phase,'waiting_roll');assert.equal(s.turnIndex,0);
 const before=JSON.stringify(s);assert.throws(()=>logic.apply(s,{type:'remote_build',cityId:'东京'},f.rng()));assert.equal(JSON.stringify(s),before);
 s.phase='buy_fundraise';s.pending={playerId:'p0',target:{kind:'city',cityId:'悉尼'}};
 logic.apply(s,{type:'rescue_demolish',cityId:'上海'},f.rng());assert.equal(s.players[0].cash,146640);
 assert.equal(s.phase,'buy_fundraise');assert.equal(s.cities['上海'].houseLevel,0);
});
test('接入机票优惠和原债务续接：付费优惠与免费额度',()=>{
 const s=f.game();f.selected(s,'p0','H7');s.world.active={type:'aviation'};
 s.phase='flight';s.pending={playerId:'p0',fromAirportId:'开罗国际机场',free:false};s.players[0].position=6;
 logic.apply(s,{type:'flight',target:'伦敦希思罗国际机场'},f.rng());assert.equal(s.players[0].cash,147500);assert.equal(s.players[0].position,16);
 assert.equal(o.used(s.players[0],'H7'),1);
 const t=f.game();f.selected(t,'p0','H7');t.phase='flight';t.pending={playerId:'p0',fromAirportId:'开罗国际机场',free:true};
 logic.apply(t,{type:'flight',target:'伦敦希思罗国际机场'},f.rng());assert.equal(o.used(t.players[0],'H7'),0);
});
test('接入起点额度与骰子来源：只刷新本人额度，不奖励机会卡位移',()=>{
 const s=f.game();f.own(s,'p0','上海');f.selected(s,'p0','H4','H8');f.selected(s,'p1','H4');o.consume(s.players[1],'H4',990);
 s.stocks['上海'].dividendFund=2000;s.stocks['上海'].holders.p1=2;s.players[0].position=41;
 roll(s,7);assert.equal(s.phase,'stock');assert.equal(s.players[0].opportunities.lapEpoch,1);assert.equal(o.used(s.players[1],'H4'),1000);
 logic.apply(s,{type:'stock_done'},f.rng());assert.equal(s.players[0].opportunities.visitedAirportIds.length,1);
 const t=f.game();f.selected(t,'p0','H8');t.chanceDeck=[{type:'move',delta:3,name:'移动'}];roll(t,3);
 assert.equal(t.players[0].cash,150000);assert.equal(t.players[0].opportunities.visitedAirportIds.length,0);
});
test('同时选择与阶段续接：所有人完成后才发应急资金，超时只应用一次',()=>{
 const s=f.game();o.beginOpportunityStage(s,1,{kind:'start'},f.rng());s.opportunityStage.participants.p0.candidateIds=['H12','H1','H4'];
 choose(s,'p0');assert.equal(s.players[0].cash,150000);assert.equal(s.players[0].opportunities.selectedIds.length,0);
 choose(s,'p1');choose(s,'p2');assert.equal(s.players[0].cash,156000);assert.equal(s.phase,'waiting_roll');
 const before=s.players[0].cash;logic.resolveChoices(s,[],f.rng(),'timeout');assert.equal(s.players[0].cash,before);
});
test('完整轮接入 / 连续自动跳过 / 资讯与第二第三次选择时点',()=>{
 const s=f.game();s.firstRoundDone=true;
 s.players[1].jailed=true;s.players[1].position=11;s.players[2].jailed=true;s.players[2].position=32;
 logic.endTurn(s,[],f.rng());assert.equal(s.phase,'opportunity_choose');assert.equal(s.opportunityStage.ordinal,2);assert.equal(s.roundFlow.index,2);
 for(const p of s.players)choose(s,p.id);
 for(let round=0;round<6;round++)for(let p=0;p<3;p++)logic.endTurn(s,[],f.rng());
 assert.equal(s.world.roundsCompleted,6);assert.equal(s.opportunityStage.ordinal,3);assert.equal(s.phase,'opportunity_choose');assert.equal(s.world.active.remaining,3);
});
test('产权前派息与新城主上限：保持实际建房成本、正常出售结束回合',()=>{
 const s=f.game();f.own(s,'p0','上海');s.cities['上海'].houseLevel=1;s.cities['上海'].buildCosts=[8400];
 const q=s.stocks['上海'];q.holders.p1=6;q.dividendFund=2000;st.refreshPrice(s,'上海','待分红增加');
 s.phase='direct_sale_ask';s.pending={cityId:'上海',sellerId:'p0',awaiting:'p1',buyers:['p1','p2'],buyerIndex:0};
 logic.apply(s,{type:'direct_sale_respond',decision:'buy'},f.rng());
 assert.equal(q.holders.p1,4);assert.equal(q.price,4000);assert.equal(s.players[1].cash,126600);assert.deepEqual(s.cities['上海'].buildCosts,[8400]);assert.equal(s.turnIndex,1);
});
test('协商股份转让：整单预检、拒绝不变及保留窗口买入额度',()=>{
 const s=f.game();f.own(s,'p2','上海','东京');s.stocks['上海'].holders.p0=2;s.stocks['东京'].holders.p0=1;st.syncHolders(s);st.openStockWindow(s,'p0');s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};
 const w=s.stockWindow;w.boughtTotal=2;w.boughtByCity['上海']=2;
 logic.apply(s,{type:'stock_transfer',windowId:w.windowId,targetId:'p1',items:[{cityId:'上海',shares:1},{cityId:'东京',shares:1}],cash:500},f.rng());
 logic.apply(s,{type:'stock_transfer',accept:true},f.rng());assert.equal(s.phase,'stock');assert.equal(s.stockWindow,w);assert.equal(w.boughtTotal,2);assert.equal(s.players[0].cash,150500);assert.equal(s.players[1].cash,149500);
 const before=JSON.stringify(s);assert.throws(()=>st.planTransfer(s,'p0','p1',[{cityId:'上海',shares:1},{cityId:'东京',shares:1}],0));assert.equal(JSON.stringify(s),before);
});
test('清算、重新经营与旧报价保护 / 最后存活者终局优先',()=>{
 const s=f.game();f.own(s,'p1','上海');s.stocks['上海'].holders.p0=2;s.stocks['上海'].dividendFund=2000;st.refreshPrice(s,'上海','待分红增加');st.openStockWindow(s,'p0');const old=f.order(s,'上海','buy',1);
 st.clearCityToBank(s,{cityId:'上海'},[]);st.transferCity(s,{cityId:'上海',newOwnerId:'p2'},[]);
 assert.throws(()=>st.planStockTrade(s,'p0',s.stockWindow.windowId,[old]));
 const t=f.game(2);f.own(t,'p1','上海');t.stocks['上海'].dividendFund=2000;t.stocks['上海'].holders.p1=2;
 logic.apply(t,{type:'surrender'},f.rng());assert.equal(t.status,'over');assert.equal(t.players[1].cash,152000);assert.equal(t.finalSettlementDone,true);assert.equal(t.opportunityStage,null);
});
