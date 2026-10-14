'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGameState}=require('../src/state'),active=require('../src/activeManagement'),econ=require('../src/economy'),stocks=require('../src/stocks'),logic=require('../src/gameLogic'),orders=require('../src/operatingOrders'),investment=require('../src/activeInvestment'),opp=require('../src/opportunities'),f=require('./helpers/gameplayFixtures'),{normalizeAction}=require('../src/actionValidation'),{snapshot}=require('../src/gameView'),journal=require('../src/privateReplay');
function state(revision=active.REVISION){const s=createGameState('V4',['甲','乙'],2,{activeManagementRevision:revision});s.firstRoundDone=true;s.phase='waiting_roll';s.pending=null;return s;}
function action(s,type,cityId,shares,targetKind){const q=active.quote(s,'p0',type,cityId,shares,targetKind);assert.equal(q.ok,true,q.reason);return {type,cityId,shares,targetKind,listingEpoch:q.listingEpoch,quoteVersion:q.quoteVersion};}
function execute(s,a){const n=normalizeAction(s,a,'p0');assert.equal(n.ok,true,n.error);const r=logic.apply(s,n.action,f.rng());assert.ok(!r.rejected);return r.events;}
function next(s){s.turnId++;s.phase='waiting_roll';s.pending=null;s.turnIndex=0;}

test('new v4 and historical v1/v2/v3 remain separate, failed quotes are readonly',()=>{
 for(const rev of ['active-management-v1','active-management-v2','active-management-v3',active.REVISION]){
  const s=state(rev);f.own(s,'p0','内罗毕');const before=JSON.stringify(s),v=active.view(s,'p0');assert.equal(JSON.stringify(s),before);assert.equal(v.optional,rev==='active-management-v3'||rev===active.REVISION);
  assert.equal(v.quotes.some(q=>q.type==='active_order'),rev===active.REVISION);assert.equal(active.quote(s,'p0','active_promote','内罗毕').ok,rev!==active.REVISION);
  assert.equal(active.quote(s,'p0','active_stock_buy','内罗毕',4).ok,rev===active.REVISION);
  assert.equal(active.quote(s,'p0','active_build','内罗毕').finalAmount,econ.rounded(2160,rev===active.REVISION?150:rev==='active-management-v1'?145:115));
 }
});
test('all cities and target levels use exact tiers, capped discounts, 150 percent floor and real quota consumption',()=>{
 let cases=0;
 for(const id of Object.keys(require('../src/board').CITIES))for(let level=0;level<4;level++)for(const perks of [false,true])for(const news of [false,true]){
  const s=state();f.own(s,'p0',id);const peer=Object.keys(s.cities).find(cid=>cid!==id&&s.cities[cid].group===s.cities[id].group);f.own(s,'p0',peer);s.players[0].cash=1000000;s.cities[id].houseLevel=level;
  if(perks)f.selected(s,'p0','H1','H2','H3');if(news){s.world.active={type:'construction'};s.world.constructionUsedIds=[];}
  const q=active.quote(s,'p0','active_build',id),base=econ.buildFee(s.cities[id]);assert.equal(q.nominalAmount,econ.rounded(base,[150,200,300,350][level]));assert.ok(q.finalAmount>=econ.rounded(base,150));assert.ok(q.nominalAmount-q.finalAmount<=econ.rounded(base,30));
  if(!perks&&!news)assert.equal(q.finalAmount,q.nominalAmount);if(!level)assert.equal(q.quotaChanges.length,0);
  const cash=s.players[0].cash;execute(s,action(s,'active_build',id));assert.equal(s.players[0].cash,cash-q.finalAmount);assert.equal(s.cities[id].houseLevel,level+1);
  if(!level){assert.deepEqual(s.players[0].opportunities.usage,{});assert.deepEqual(s.world.constructionUsedIds,[]);}cases++;
 }
 assert.equal(cases,320);
});
test('remote build shares three-lap cooldown and persistent alternating target, normal construction does not reset it',()=>{
 const s=state(),p=s.players[0];f.own(s,'p0','内罗毕','罗马');execute(s,action(s,'remote_build','内罗毕'));next(s);
 for(let i=0;i<3;i++){assert.equal(active.quote(s,'p0','active_build','罗马').ok,false);opp.refresh(p);}
 assert.equal(active.quote(s,'p0','active_build','内罗毕').ok,false);assert.equal(active.quote(s,'p0','active_build','罗马').ok,true);
 p.position=1;s.cities['内罗毕'].buildReady=true;const q=econ.quoteBuild(s,{playerId:'p0',cityId:'内罗毕'});execute(s,{type:'build_house',cityId:'内罗毕',quoteVersion:q.quoteVersion});assert.equal(p.activeManagement.lastRemoteBuildCityId,'内罗毕');
 p.opportunities.selectedIds=['H1'];p.opportunities.lapEpoch+=99;assert.equal(active.quote(s,'p0','remote_build','内罗毕').ok,false);
 stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p1'},[]);stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p0'},[]);assert.equal(active.quote(s,'p0','active_build','内罗毕').ok,false);
 execute(s,action(s,'active_build','罗马'));next(s);for(let i=0;i<3;i++)opp.refresh(p);assert.equal(active.quote(s,'p0','active_build','内罗毕').ok,true);
});
test('stale requests, low cash, cooldown and old promotion alias cannot spend or change remote history',()=>{
 const s=state();f.own(s,'p0','内罗毕');const old=action(s,'active_build','内罗毕');s.players[0].cash--;const before=JSON.stringify(s);assert.equal(normalizeAction(s,old).ok,false);assert.equal(JSON.stringify(s),before);
 for(const raw of [{type:'active_promote',cityId:'内罗毕'}, {...old,quoteVersion:'stale'}]){assert.equal(normalizeAction(s,raw).ok,false);assert.equal(JSON.stringify(s),before);}
 s.players[0].cash=0;assert.equal(active.quote(s,'p0','active_build','内罗毕').ok,false);assert.equal(s.players[0].activeManagement.lastRemoteBuildCityId,null);
});
test('orders pay exactly twice at later own turn starts including frozen and one-turn jail, remain once per personal lap',()=>{
 for(const targetKind of ['city','airport']){
  const s=state(),p=s.players[0],id=targetKind==='city'?'内罗毕':'开罗国际机场';if(targetKind==='city')f.own(s,'p0',id);else{s.airports[id].ownerId='p0';p.airports.push(id);}
  const q=active.quote(s,'p0','active_order',id,undefined,targetKind),cash=p.cash;execute(s,action(s,'active_order',id,undefined,targetKind));logic.prepareTurn(s,[],f.rng());assert.equal(p.cash,cash-q.finalAmount);
  next(s);p.frozen=true;logic.prepareTurn(s,[],f.rng());logic.prepareTurn(s,[],f.rng());assert.equal(p.cash,cash-q.finalAmount+q.paymentEach);assert.equal(s.operatingOrders[0].paymentsRemaining,1);
  next(s);p.frozen=false;p.jailed=true;p.position=11;p.jailTurns=0;logic.prepareTurn(s,[],f.rng());assert.equal(p.cash,cash-q.finalAmount+2*q.paymentEach);assert.equal(s.operatingOrders[0].paymentsRemaining,0);
  next(s);p.jailed=false;assert.equal(active.quote(s,'p0','active_order',id,undefined,targetKind).ok,false);opp.refresh(p);assert.equal(active.quote(s,'p0','active_order',id,undefined,targetKind).ok,true);
 }
});
test('orders cancel unpaid income on mortgage, transfer, airport loss and seal; no unpaid amount enters assets',()=>{
 for(const reason of ['mortgage','transfer','airport','final']){
  const s=state(),p=s.players[0],kind=reason==='airport'?'airport':'city',id=kind==='city'?'内罗毕':'开罗国际机场';
  if(kind==='city')f.own(s,'p0',id);else{s.airports[id].ownerId=p.id;p.airports.push(id);}
  execute(s,action(s,'active_order',id,undefined,kind));const cash=p.cash;
  if(reason==='mortgage')s.cities[id].mortgaged=true;else if(reason==='transfer')stocks.transferCity(s,{cityId:id,newOwnerId:'p1'},[]);else if(reason==='airport')s.airports[id].ownerId=null;else stocks.settleFinalEconomy(s,'total_deadline',[]);
  orders.clean(s);assert.equal(s.operatingOrders[0].paymentsRemaining,0);next(s);logic.prepareTurn(s,[],f.rng());assert.equal(p.cash,cash);
  if(reason==='mortgage'){s.cities[id].mortgaged=false;orders.clean(s);assert.equal(s.operatingOrders[0].paymentsRemaining,0);}
 }
 const s=state();f.own(s,'p0','内罗毕');const before=require('../src/assets').assetSummary(s,'p0').total;execute(s,action(s,'active_order','内罗毕',undefined,'city'));assert.equal(require('../src/assets').assetSummary(s,'p0').total,before-360);
});
test('active purchase 1-4 is fee-free with no new lap cap, owner 4 and market 20 still apply',()=>{
 const s=state();f.own(s,'p1','罗马');const p=s.players[0],price=s.stocks['罗马'].price,cash=p.cash;
 for(const n of [0,5,1.5]){const before=JSON.stringify(s);assert.equal(active.quote(s,'p0','active_stock_buy','罗马',n).ok,false);assert.equal(JSON.stringify(s),before);}
 execute(s,action(s,'active_stock_buy','罗马',4));next(s);execute(s,action(s,'active_stock_buy','罗马',4));assert.equal(p.cash,cash-price*8);assert.equal(p.stocks['罗马'],8);assert.equal(p.activeInvestment.sharesByCity['罗马'].shares,8);
 next(s);s.stocks['罗马'].holders.p1=12;assert.equal(active.quote(s,'p0','active_stock_buy','罗马',1).ok,false);
 const owner=state();f.own(owner,'p0','内罗毕');execute(owner,action(owner,'active_stock_buy','内罗毕',4));next(owner);assert.equal(active.quote(owner,'p0','active_stock_buy','内罗毕',1).ok,false);
});
test('investment reward is based on marked live shares and basic go dividend, stacks without compounding and deduplicates',()=>{
 const s=state();f.own(s,'p1','罗马');f.selected(s,'p0','H4');execute(s,action(s,'active_stock_buy','罗马',4));const p=s.players[0],cash=p.cash;s.stocks['罗马'].dividendFund=20000;const events=[];stocks.settleCityDividend(s,'罗马','go','GO1',events);
 assert.equal(p.cash,cash+4000+2000+1200);assert.equal(p.activeInvestment.bonusPaid,1200);investment.reward(s,p,'罗马',1000,'go','GO1:p0',events);assert.equal(p.activeInvestment.bonusPaid,1200);
 s.stocks['罗马'].dividendFund=20000;stocks.settleCityDividend(s,'罗马','go','GO2',events);assert.equal(p.activeInvestment.bonusPaid,1500);
 assert.equal(events.filter(e=>e.kind==='active_investment_reward').reduce((n,e)=>n+e.amount,0),1500);
 for(const reason of ['transfer','bank_clear','final']){const a=state();f.own(a,'p1','罗马');execute(a,action(a,'active_stock_buy','罗马',4));a.stocks['罗马'].dividendFund=20000;const ev=[];stocks.settleCityDividend(a,'罗马',reason,'OTHER',ev);assert.equal(ev.some(e=>e.kind==='active_investment_reward'),false);}
});
test('own actual go pays the old purchase pool before expiration, later dividends cannot revive the reward',()=>{
 const s=state();f.own(s,'p0','巴黎');f.selected(s,'p0','H4');execute(s,action(s,'active_stock_buy','巴黎',4));next(s);s.players[0].position=41;s.diceBag=[1];s.stocks['巴黎'].dividendFund=6000;execute(s,{type:'active_skip'});const cash=s.players[0].cash,events=execute(s,{type:'roll_dice'});
 assert.equal(s.players[0].cash,cash+10000+6000+600+360);assert.equal(events.some(e=>e.kind==='active_investment_reward'&&e.amount===360),true);assert.deepEqual(s.players[0].activeInvestment.sharesByCity,{});
 const after=[];s.stocks['巴黎'].dividendFund=6000;stocks.settleCityDividend(s,'巴黎','go','LATER',after);assert.equal(after.some(e=>e.kind==='active_investment_reward'),false);
});
test('sale, transfer, forced cap, bank clearing and new listing remove reward shares first, transferred shares do not inherit',()=>{
 const s=state();f.own(s,'p1','罗马');s.stocks['罗马'].holders.p0=2;stocks.syncHolders(s);execute(s,action(s,'active_stock_buy','罗马',4));
 stocks.openStockWindow(s,'p0');const q=stocks.planStockTrade(s,'p0',s.stockWindow.windowId,[{cityId:'罗马',side:'sell',shares:1,quoteVersion:s.stocks['罗马'].quoteVersion,listingEpoch:s.stocks['罗马'].listingEpoch}]);stocks.applyStockTrade(s,q,[]);assert.equal(s.players[0].activeInvestment.sharesByCity['罗马'].shares,3);
 stocks.applyTransfer(s,stocks.planTransfer(s,'p0','p1',[{cityId:'罗马',shares:1}],0),[]);assert.equal(s.players[0].activeInvestment.sharesByCity['罗马'].shares,2);assert.equal(s.players[1].activeInvestment.sharesByCity['罗马'],undefined);
 next(s);s.phase='self_rescue';s.pending={playerId:'p0',kind:'self_rescue',due:100000};s.players[0].cash=-100000;execute(s,{type:'rescue_sell_stock',cityId:'罗马',shares:1,quoteVersion:s.stocks['罗马'].quoteVersion});assert.equal(s.players[0].activeInvestment.sharesByCity['罗马'].shares,1);
 s.stocks['罗马'].holders.p0=8;stocks.enforceOwnerStockCap(s,s.players[0],'罗马',[]);assert.equal(s.players[0].activeInvestment.sharesByCity['罗马'],undefined);
 stocks.clearCityToBank(s,{cityId:'罗马'},[]);stocks.transferCity(s,{cityId:'罗马',newOwnerId:'p1'},[]);assert.equal(s.players[0].activeInvestment.sharesByCity['罗马'],undefined);
});
test('v4 private state, chosen bot actions, late quick investments and journal replay remain consistent',()=>{
 const s=state();f.own(s,'p0','内罗毕');const room={state:s};journal.capture(room);execute(s,action(s,'active_order','内罗毕',undefined,'city'));journal.capture(room,{source:'player'});next(s);logic.prepareTurn(s,[],f.rng());journal.capture(room,{source:'turn'});assert.deepEqual(journal.replay(journal.exportJournal(room)),JSON.parse(JSON.stringify(s)));
 const publicView=snapshot(s,'p1');assert.equal(publicView.players[0].activeInvestment,undefined);assert.equal(publicView.operatingOrders,undefined);assert.equal(publicView.self.activeManagement.order,null);
 const hiddenOrderId=s.operatingOrders[0].orderId;s.turnIndex=1;f.own(s,'p1','罗马');assert.equal(JSON.stringify(snapshot(s,'p1')).includes(hiddenOrderId),false);s.turnIndex=0;
 const view=snapshot(s,'p0'),bot=require('../src/botPolicy'),a=bot.choose(view);assert.equal(normalizeAction(s,a).ok,true);
 const late=state();f.own(late,'p0','内罗毕');const v=snapshot(late,'p0');v.gameMode='quick';v.quickTime={totalRemainingMs:100,elapsedMs:1799900};v.completeRounds=100;assert.equal(bot.choose(v).type,'active_skip');
});
