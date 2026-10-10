'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGameState}=require('../src/state'),active=require('../src/activeManagement'),stocks=require('../src/stocks'),econ=require('../src/economy'),logic=require('../src/gameLogic'),{normalizeAction}=require('../src/actionValidation');
function fixture(){const s=createGameState('ACTIVE',['甲','乙'],2,{activeManagementRevision:active.REVISION});s.phase='waiting_roll';s.pending=null;stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p0'},[]);return s;}
function perform(s,type,cityId='内罗毕',shares){const q=active.quote(s,'p0',type,cityId,shares),a={type,cityId,shares,quoteVersion:q.quoteVersion,listingEpoch:q.listingEpoch};assert.equal(q.ok,true,q.reason);const checked=normalizeAction(s,a);assert.equal(checked.ok,true,checked.error);return logic.apply(s,checked.action,()=>.5);}
test('三类经营互斥，远程旧入口同额，失败无修改，旧局隔离',()=>{
 const s=fixture(),p=s.players[0],base=econ.buildFee(s.cities['内罗毕']);
 const before=JSON.stringify(s);assert.equal(normalizeAction(s,{type:'active_build',cityId:'内罗毕',quoteVersion:'stale'}).ok,false);assert.equal(JSON.stringify(s),before);
 const cash=p.cash;perform(s,'remote_build');assert.equal(p.cash,cash-econ.rounded(base,145));assert.equal(s.cities['内罗毕'].houseLevel,1);assert.equal(s.phase,'waiting_roll');
 assert.equal(active.quote(s,'p0','active_stock_buy','内罗毕',1).ok,false);assert.equal(active.quote(s,'p0','active_promote','内罗毕').ok,false);
 const old=createGameState('OLD',['甲','乙']);assert.equal(active.view(old,'p0'),null);assert.equal(old.players[0].activeManagement,undefined);
});
test('主动股票手续费与独立圈额度，报价和持股上限校验',()=>{
 const s=fixture(),p=s.players[0],cash=p.cash,price=s.stocks['内罗毕'].price;stocks.openStockWindow(s,p.id);perform(s,'active_stock_buy','内罗毕',2);
 assert.equal(p.cash,cash-price*2-econ.rounded(price*2,1));assert.equal(s.stockWindow.boughtTotal,0);
 s.turnId++;assert.equal(active.quote(s,p.id,'active_stock_buy','内罗毕',1).ok,false);
 p.opportunities.lapEpoch++;perform(s,'active_stock_buy','内罗毕',2);s.turnId++;p.opportunities.lapEpoch++;assert.equal(active.quote(s,p.id,'active_stock_buy','内罗毕',1).ok,false);
});
test('促销奖励不进入分红池，最多两次且重复结算无奖励',()=>{
 const s=fixture();perform(s,'active_promote');const a=s.promotions[0],owner=s.players[0],tenant=s.players[1],cash=owner.cash;
 const q={cityId:'内罗毕',playerId:tenant.id,finalAmount:100};active.rentCompleted(s,q,'rent1',[]);active.rentCompleted(s,q,'rent1',[]);assert.equal(owner.cash,cash+a.reward);assert.equal(s.stocks['内罗毕'].dividendFund,0);
 active.rentCompleted(s,q,'rent2',[]);assert.equal(owner.cash,cash+2*a.reward);assert.equal(s.promotions.length,0);
});
test('欠租只在偿清后奖励，破产不奖励，抵押和期限结束失效',()=>{
 const s=fixture();perform(s,'active_promote');const p=s.players[0],tenant=s.players[1],cash=p.cash,reward=s.promotions[0].reward,q={cityId:'内罗毕',playerId:tenant.id,finalAmount:100};tenant.cash=-100;
 active.rentCompleted(s,q,'debt',[]);active.resolveReceipts(s,[]);assert.equal(p.cash,cash);tenant.cash=0;active.resolveReceipts(s,[]);active.resolveReceipts(s,[]);assert.equal(p.cash,cash+reward);
 tenant.cash=-100;active.rentCompleted(s,q,'unpaid',[]);tenant.alive=false;active.resolveReceipts(s,[]);assert.equal(p.cash,cash+reward);assert.equal(s.promotionReceipts.length,0);
 s.cities['内罗毕'].mortgaged=true;active.clean(s);assert.equal(s.promotions.length,0);
 const later=fixture();perform(later,'active_promote');later.roundFlow.index+=2;active.clean(later);assert.equal(later.promotions.length,0);
});
test('H1主动建设优惠受10个百分点上限，普通建房保留原报价',()=>{
 const s=fixture(),p=s.players[0];p.opportunities.selectedIds=['H1','H2'];s.world.active={type:'construction'};const base=econ.buildFee(s.cities['内罗毕']);
 const q=active.quote(s,p.id,'active_build','内罗毕');assert.equal(q.finalAmount,econ.rounded(base,145)-econ.rounded(base,10));assert.deepEqual(q.quotaChanges,[{id:'H1',amount:1}]);perform(s,'active_build');assert.equal(p.opportunities.usage.H1,1);
});
test('私人额度隔离、确定性动作重放、产权变化与立即封盘',()=>{
 const s=fixture(),copy=globalThis.structuredClone(s);perform(s,'active_promote');perform(copy,'active_promote');assert.deepEqual(s,copy);
 const view=require('../src/gameView').snapshot(s,'p1');assert.equal(view.players[0].activeManagement,undefined);assert.equal(view.self.activeManagement.quota.usedTurnId,null);assert.equal(view.promotions.length,1);assert.equal(JSON.stringify(view.promotions).includes('processedIds'),false);
 stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p1'},[]);assert.equal(s.promotions.length,0);
 const quick=createGameState('QUICK',['甲','乙'],2,{activeManagementRevision:active.REVISION,routeRevision:'opportunity-routes-v1',gameMode:'quick',quickRevision:'quick-mode-v1',startedAt:1000});quick.phase='waiting_roll';quick.pending=null;stocks.transferCity(quick,{cityId:'内罗毕',newOwnerId:'p0'},[]);perform(quick,'active_promote');const cash=quick.players[0].cash;
 require('../src/quickMode').finalize(quick,{reason:'time_limit',elapsedMs:1800000,endedAt:1801000});assert.equal(quick.promotions.length,0);assert.equal(quick.players[0].cash,cash);assert.equal(active.quote(quick,'p0','active_build','内罗毕').ok,false);
});
test('特殊决定和非法订单零修改，满级抵押排除、费用上限与报价变更',()=>{
 const s=fixture(),p=s.players[0];
 for(const phase of ['self_rescue','auction_bid','trade_confirm','opportunity_choose','route_choose','jail_turn','frozen_turn','game_over']){s.phase=phase;const before=JSON.stringify(s);assert.equal(active.quote(s,p.id,'active_promote','内罗毕').ok,false);assert.equal(JSON.stringify(s),before);}
 s.phase='waiting_roll';for(const shares of [0,-1,3,'1',NaN]){const before=JSON.stringify(s);assert.equal(active.quote(s,p.id,'active_stock_buy','内罗毕',shares).ok,false);assert.equal(JSON.stringify(s),before);}
 stocks.transferCity(s,{cityId:'上海',newOwnerId:p.id},[]);const promo=active.quote(s,p.id,'active_promote','上海');assert.equal(promo.finalAmount,800);assert.equal(promo.reward,1200);
 s.cities['上海'].houseLevel=4;assert.equal(active.quote(s,p.id,'active_build','上海').ok,false);s.cities['上海'].houseLevel=0;s.cities['上海'].mortgaged=true;assert.equal(active.quote(s,p.id,'active_build','上海').ok,false);assert.equal(active.quote(s,p.id,'active_promote','上海').ok,false);
 const q=active.quote(s,p.id,'active_stock_buy','内罗毕',1);s.stocks['内罗毕'].quoteVersion++;const before=JSON.stringify(s);assert.equal(normalizeAction(s,{type:'active_stock_buy',cityId:'内罗毕',shares:1,listingEpoch:q.listingEpoch,quoteVersion:q.quoteVersion}).ok,false);assert.equal(JSON.stringify(s),before);
});

test('促销换圈替换不退款，主动股票圈总额不随出售恢复',()=>{
 const s=fixture(),p=s.players[0];stocks.transferCity(s,{cityId:'开普敦',newOwnerId:p.id},[]);perform(s,'active_promote');const first=s.promotions[0],cash=p.cash;
 s.turnId++;assert.equal(active.quote(s,p.id,'active_promote','开普敦').ok,false);p.opportunities.lapEpoch++;const q=active.quote(s,p.id,'active_promote','开普敦');perform(s,'active_promote','开普敦');assert.equal(s.promotions.length,1);assert.notEqual(s.promotions[0].promotionId,first.promotionId);assert.equal(p.cash,cash-q.finalAmount);
 const shares=fixture(),buyer=shares.players[0];for(const cityId of ['开普敦','开罗'])stocks.transferCity(shares,{cityId,newOwnerId:'p1'},[]);
 perform(shares,'active_stock_buy','内罗毕',2);shares.turnId++;perform(shares,'active_stock_buy','开普敦',2);shares.turnId++;assert.equal(active.quote(shares,buyer.id,'active_stock_buy','开罗',1).ok,false);
 shares.stocks['内罗毕'].holders.p0=0;stocks.syncHolders(shares);assert.equal(active.quote(shares,buyer.id,'active_stock_buy','开罗',1).ok,false);assert.equal(buyer.activeManagement.stockBoughtTotal,4);
 buyer.opportunities.lapEpoch++;assert.equal(active.quote(shares,buyer.id,'active_stock_buy','开罗',1).ok,true);
});
