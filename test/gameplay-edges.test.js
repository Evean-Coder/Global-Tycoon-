'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const f=require('./helpers/gameplayFixtures'),e=require('../src/economy'),st=require('../src/stocks'),o=require('../src/opportunities'),logic=require('../src/gameLogic');
const {normalizeAction}=require('../src/actionValidation'),{snapshot}=require('../src/state'),{buildGameRecord}=require('../src/record');
const {AIRPORTS}=require('../src/board');
test('V6–V10 二至四人、出局、监狱冰冻及原收费边界',()=>{
 for(const n of [2,3,4]){const s=f.game(n);for(let i=0;i<n;i++){logic.endTurn(s,[],f.rng());assert.equal(s.roundFlow.index,i===n-1?2:1);}assert.deepEqual(s.roundFlow.completedIds,[]);}
 const s=f.game(4);logic.endTurn(s,[],f.rng());s.players[0].alive=false;s.players[3].alive=false;logic.endTurn(s,[],f.rng());logic.endTurn(s,[],f.rng());assert.equal(s.roundFlow.index,2);assert.deepEqual(s.roundFlow.requiredIds,['p1','p2']);
 for(const version of [1,2]){const t=f.game(3,version);f.own(t,'p0','上海');t.cities['上海'].mortgaged=true;t.turnIndex=2;logic.endTurn(t,[],f.rng());assert.equal(t.cities['上海'].mortgageInterest,500);t.players[1].jailed=true;t.players[1].position=21;t.players[1].jailTurns=3;t.rounds=80;logic.endTurn(t,[],f.rng());assert.equal(t.rounds,81);assert.equal(t.players[1].cash,145500);assert.equal(t.phase,'waiting_roll');}
 const t=f.game();t.players[0].frozen=true;t.phase='frozen_turn';logic.apply(t,{type:'respond_frozen',decision:'pass'},f.rng());assert.deepEqual(t.roundFlow.completedIds,['p0']);t.players[1].jailed=true;t.players[1].position=21;t.phase='jail_turn';t.diceBag=[2];logic.apply(t,{type:'respond_jail',decision:'roll'},f.rng());assert.deepEqual(t.roundFlow.completedIds,['p0','p1']);
});
test('V15–V18 地区上限、真实地区与建设独立额度',()=>{
 const s=f.game();f.own(s,'p1','罗马','悉尼');
 for(const [type,amount]of [['boom',33000],['slowdown',27000]]){s.world.active={type,region:'欧洲',name:'地区资讯'};assert.equal(e.rentAmounts(s,{playerId:'p0',cityId:'罗马',baseAmount:30000}).finalAmount,amount);assert.equal(e.rentAmounts(s,{playerId:'p0',cityId:'悉尼',baseAmount:30000}).finalAmount,30000);}
 s.cities['罗马'].mortgaged=true;assert.equal(e.quoteRent(s,{playerId:'p0',cityId:'罗马'}).finalAmount,0);
 const t=f.game();f.own(t,'p0','上海');f.own(t,'p1','东京');t.world.status='running';t.world.active={type:'construction',remaining:3};t.players[0].position=36;t.players[1].position=37;
 const apply=id=>e.applySettlement(t,e.quoteBuild(t,{playerId:id,cityId:id==='p0'?'上海':'东京'}),[]);
 apply('p0');assert.equal(e.quoteBuild(t,{playerId:'p0',cityId:'上海'}).effects.length,0);apply('p1');assert.deepEqual(t.world.constructionUsedIds,['p0','p1']);
 for(let i=0;i<3;i++)logic.endTurn(t,[],f.rng());assert.equal(e.quoteBuild(t,{playerId:'p0',cityId:'上海'}).effects[0].amount,1800);
 f.selected(t,'p0','H2');t.world.active={type:'stable',remaining:3};assert.equal(e.quoteBuild(t,{playerId:'p0',cityId:'上海'}).effects[0].amount,1200);
});
test('V26–V28 远程资格、失败额度和同色链条共享',()=>{
 const s=f.game();f.own(s,'p0','上海','东京','罗马','悉尼');f.selected(s,'p0','H1','H2','H3');
 for(const change of [()=>s.phase='stock',()=>s.cities['上海'].mortgaged=true,()=>s.cities['上海'].houseLevel=4,()=>s.players[0].cash=0]){
  const t=globalThis.structuredClone(s);change();const before=JSON.stringify(s);assert.equal(e.quoteBuild(s,{playerId:'p0',cityId:'上海',mode:'remote'}).ok,false);assert.equal(JSON.stringify(s),before);Object.assign(s,t);
 }
 assert.equal(e.quoteBuild(s,{playerId:'p1',cityId:'上海',mode:'remote'}).ok,false);
 const q=e.quoteBuild(s,{playerId:'p0',cityId:'上海',mode:'remote'});e.applySettlement(s,q,[]);s.players[0].position=12;
 assert.equal(e.quoteBuild(s,{playerId:'p0',cityId:'罗马'}).effects.length,0,'另一色组共享本圈 H2/H3 用量');
 o.refresh(s.players[0]);s.cities['悉尼'].mortgaged=true;assert.equal(e.quoteBuild(s,{playerId:'p0',cityId:'罗马'}).effects.some(x=>x.id==='H3'),false);
});
test('V29–V36 十二项机遇金额、次数和适用边界',()=>{
 const s=f.game();f.own(s,'p1','上海');f.selected(s,'p0','H4','H6','H11');s.stocks['上海'].holders.p0=2;
 o.consume(s.players[0],'H4',990);s.stocks['上海'].dividendFund=2000;st.settleCityDividend(s,'上海','go','cap',[]);assert.equal(o.used(s.players[0],'H4'),1000);assert.equal(s.players[0].cash,150210);
 o.refresh(s.players[0]);for(let i=0;i<3;i++){const q=e.rentAmounts(s,{playerId:'p0',cityId:'上海',baseAmount:30000});e.applySettlement(s,q,[]);assert.equal(q.effects.find(x=>x.id==='H6')?.amount||0,i<2?1000:0);assert.equal(q.effects.find(x=>x.id==='H11')?.amount||0,i===0?2000:0);}
 const plain=f.game();f.own(plain,'p1','上海');plain.stocks['上海'].holders.p0=12;assert.equal(e.rentAmounts(plain,{playerId:'p0',cityId:'上海',baseAmount:10000}).finalAmount,10000);
 for(const count of [0,2,3]){const t=f.game();f.selected(t,'p0','H10');f.own(t,'p0',...Object.keys(t.cities).slice(0,count));if(count)t.cities[t.players[0].cities[0]].mortgaged=true;e.goRewards(t,t.players[0],[]);assert.equal(t.players[0].cash,count<=2?152000:150000);}
 for(const pairs of [1,2,3]){const t=f.game();f.selected(t,'p0','H9');for(const [id,a]of Object.entries(AIRPORTS).slice(0,pairs)){t.airports[id].ownerId='p0';f.own(t,'p0',a.adjacentCity);}e.goRewards(t,t.players[0],[]);assert.equal(t.players[0].cash,150000+Math.min(3000,pairs*1500));}
 const t=f.game();f.selected(t,'p0','H5');for(const id of ['上海','东京','悉尼']){f.own(t,'p1',id);t.stocks[id].holders.p0=1;}t.cities['悉尼'].mortgaged=true;e.goRewards(t,t.players[0],[]);assert.equal(t.players[0].cash,150000);t.cities['悉尼'].mortgaged=false;e.goRewards(t,t.players[0],[]);assert.equal(t.players[0].cash,152000);
 f.selected(t,'p0','H7');const flight=e.quoteFlight(t,{playerId:'p0',fromAirportId:'伦敦希思罗国际机场',target:'上海浦东国际机场'});assert.equal(flight.effects[0].amount,1500);e.applySettlement(t,flight,[]);assert.equal(e.quoteFlight(t,{playerId:'p0',fromAirportId:'伦敦希思罗国际机场',target:'上海浦东国际机场'}).effects.length,0);
});
test('V41–V42 标准及旧房费用、末级优先与过期费用',()=>{
 const s=f.game();f.own(s,'p0','上海');s.players[0].position=36;
 e.applySettlement(s,e.quoteBuild(s,{playerId:'p0',cityId:'上海'}),[]);assert.equal(e.refundFor(s.cities['上海']),7200);
 s.cities['上海'].houseLevel=2;s.cities['上海'].buildCosts=[12000,8400];assert.equal(e.refundFor(s.cities['上海']),5040);e.applySettlement(s,e.quoteDemolition(s,{playerId:'p0',cityId:'上海'}),[]);assert.equal(e.refundFor(s.cities['上海']),7200);
 s.cities['上海'].buildCosts=[];assert.equal(e.refundFor(s.cities['上海']),7200);
 const q=e.quoteBuild(s,{playerId:'p0',cityId:'上海'}),before=JSON.stringify(s);assert.equal(normalizeAction(s,{type:'build_house',cityId:'上海',quoteVersion:'old'}).ok,false);assert.equal(JSON.stringify(s),before);s.revision++;assert.throws(()=>e.applySettlement(s,q,[]));
});
test('V45–V49 交易全单原子性、卖出净筹资、抵押交易和冻结边界',()=>{
 const s=f.game();f.own(s,'p1','上海','东京');s.stocks['东京'].holders.p0=2;st.syncHolders(s);s.players[0].cash=0;st.openStockWindow(s,'p0');const w=s.stockWindow;
 const before=JSON.stringify(s);assert.throws(()=>st.planStockTrade(s,'p0',w.windowId,[f.order(s,'东京','sell',2),f.order(s,'上海','buy',3)]));assert.equal(JSON.stringify(s),before);
 st.applyStockTrade(s,st.planStockTrade(s,'p0',w.windowId,[f.order(s,'东京','sell',2),f.order(s,'上海','buy',1)]),[]);assert.equal(s.players[0].cash,2800);assert.equal(s.players[1].cash,150000);
 s.cities['上海'].mortgaged=true;st.applyStockTrade(s,st.planStockTrade(s,'p0',w.windowId,[f.order(s,'上海','sell',1)]),[]);assert.equal(s.players[0].cash,6800);
 s.stocks['上海'].clearing=true;assert.throws(()=>st.planStockTrade(s,'p0',w.windowId,[f.order(s,'上海','buy',1)]));assert.throws(()=>st.planTransfer(s,'p0','p2',[{cityId:'上海',shares:1}],0));
 s.stocks['上海'].clearing=false;s.stocks['上海'].holders.p0=1;s.stocks['上海'].holders.p1=4;assert.throws(()=>st.planTransfer(s,'p0','p1',[{cityId:'上海',shares:1}],0));assert.throws(()=>st.planTransfer(s,'p0','p2',[{cityId:'上海',shares:1}],150001));
 s.phase='self_rescue';s.pending={playerId:'p0',kind:'self_rescue'};s.players[0].cash=-10;logic.apply(s,{type:'rescue_sell_stock',cityId:'上海',shares:1},f.rng());assert.equal(s.players[0].cash,3990);assert.equal(s.stocks['上海'].dividendFund,0);
});
test('V50–V56 派息舍入、除息现金、经营历史及上下界',()=>{
 const s=f.game();f.own(s,'p0','上海');const q=s.stocks['上海'];q.holders.p1=2;q.holders.p2=4;q.dividendFund=2017;st.refreshPrice(s,'上海','待分红增加');st.settleCityDividend(s,'上海','go','one',[]);assert.equal(s.players[1].cash,150200);assert.equal(s.players[2].cash,150400);assert.equal(s.players[0].cash,151417);assert.equal(q.price,4000);
 const cash=s.players[0].cash;st.settleCityDividend(s,'上海','go','two',[]);assert.equal(s.players[0].cash,cash);st.openStockWindow(s,'p1');st.applyStockTrade(s,st.planStockTrade(s,'p1',s.stockWindow.windowId,[f.order(s,'上海','sell',2)]),[]);assert.equal(s.players[1].cash,158200);
 q.roundRent=18000;for(let round=1;round<=4;round++)st.updateOperatingQuotes(s,round,[]);assert.deepEqual(q.rentHistory,[0,0,0]);assert.equal(q.priceChange.target,3800);
 for(let round=5;round<105;round++){s.cities['上海'].houseLevel=round%2?4:0;s.cities['上海'].mortgaged=round%2===0;const previous=q.operatingPrice;st.updateOperatingQuotes(s,round,[]);assert.ok(q.operatingPrice>=2000&&q.operatingPrice<=8000);assert.ok(Math.abs(q.operatingPrice-previous)<=e.rounded(previous,10));}
 q.dividendFund=200000;st.refreshPrice(s,'上海','待分红增加');assert.equal(q.price,q.operatingPrice+10000);
});
test('V58–V60 成功拍卖保留成本历史、失败购买不提前派息、死者股份作废',()=>{
 const s=f.game();f.own(s,'p0','上海');const q=s.stocks['上海'];q.holders.p1=6;q.holders.p2=2;q.dividendFund=2000;q.rentHistory=[10000];s.cities['上海'].houseLevel=1;s.cities['上海'].buildCosts=[8400];
 s.phase='auction_bid';s.pending={cityId:'上海',sellerId:'p0',awaiting:'p1',currentBidder:'p1',currentBid:50000,order:['p1','p2'],index:0};logic.apply(s,{type:'auction_respond',decision:'end'},f.rng());assert.equal(q.holders.p1,4);assert.equal(s.players[1].cash,108600);assert.equal(s.players[0].cash,201200);assert.deepEqual(s.players[0].cities,[]);assert.deepEqual(q.rentHistory,[10000]);assert.deepEqual(s.cities['上海'].buildCosts,[8400]);
 q.dividendFund=2000;s.players[2].cash=31900;s.phase='direct_sale_ask';s.pending={cityId:'上海',sellerId:'p1',awaiting:'p2'};const before=JSON.stringify(s);assert.equal(normalizeAction(s,{type:'direct_sale_respond',decision:'buy'}).ok,false);assert.equal(JSON.stringify(s),before);
 const t=f.game();f.own(t,'p0','上海');t.stocks['上海'].holders.p0=2;t.stocks['上海'].holders.p1=2;st.syncHolders(t);t.stocks['上海'].dividendFund=2000;t.phase='self_rescue';t.pending={playerId:'p0',kind:'self_rescue'};t.players[0].cash=-1;logic.apply(t,{type:'rescue_done'},f.rng());assert.equal(t.players[0].alive,false);assert.equal(t.stocks['上海'].holders.p0,0);assert.equal(t.stocks['上海'].clearing,true);
 while(t.phase==='auction_bid')logic.apply(t,{type:'auction_respond',decision:'pass'},f.rng());assert.equal(t.stocks['上海'].holders.p1||0,0);assert.equal(t.players[0].cash,0);
});
test('V25、V63–V65 终局优先、资产守恒、结构化记录与旧数据兼容',()=>{
 const s=f.game();f.own(s,'p0','上海');const q=s.stocks['上海'];q.holders.p0=2;q.holders.p1=2;q.dividendFund=2017;st.refreshPrice(s,'上海','待分红增加');st.syncHolders(s);const before=snapshot(s,'p0').players.map(p=>p.assetSummary.total),ev=[];
 st.settleFinalEconomy(s,'disband',ev);assert.deepEqual(snapshot(s,'p0').players.map(p=>p.assetSummary.total),before);const record=buildGameRecord({state:s,events:ev,code:s.roomCode},'disband');assert.equal(record.stats.economy.baseDividends,400);assert.equal(record.stats.economy.retainedIncome,1617);assert.equal(record.players[0].totalAssets,before[0]);assert.equal(JSON.stringify(record).includes('candidateIds'),false);
 const t=f.game(2);o.beginOpportunityStage(t,1,{kind:'start'},f.rng());t.players[1].alive=false;logic.resolveChoices(t,[],f.rng(),'timeout');assert.equal(t.status,'over');assert.equal(t.players[0].opportunities.selectedIds.length,0);assert.equal(t.players[0].cash,150000);
 const legacy=f.game(2,1);delete legacy.ruleVersion;delete legacy.world;delete legacy.roundFlow;delete legacy.actorRevision;delete legacy.gameId;for(const p of legacy.players)delete p.opportunities;const view=snapshot(legacy,'p0');assert.equal(view.world,undefined);assert.equal(view.self,undefined);assert.equal(buildGameRecord({state:legacy,events:[],code:'OLD'},'normal').schema,'global-tycoon.game-record.v1');legacy.diceBag=[2];assert.doesNotThrow(()=>logic.apply(legacy,{type:'roll_dice'},f.rng()));
});
test('V33、V39、V41、V44 取整零贡献、三种拆房与债务续接不重复收租',()=>{
 // 极小金额仅验证金额取整边界；正式棋盘的地价不变。
 const tiny=f.game();f.own(tiny,'p0','上海','东京');f.selected(tiny,'p0','H2','H3');tiny.cities['上海'].price=1;tiny.players[0].position=36;tiny.world.active={type:'construction'};const q=e.quoteBuild(tiny,{playerId:'p0',cityId:'上海'});assert.equal(q.finalAmount,1);assert.ok(q.effects.every(x=>x.amount===0));assert.deepEqual(q.quotaChanges,[]);e.applySettlement(tiny,q,[]);assert.deepEqual(tiny.players[0].opportunities.usage,{});assert.deepEqual(tiny.world.constructionUsedIds,[]);
 for(const phase of ['waiting_roll','self_rescue','buy_fundraise']){const s=f.game();f.own(s,'p0','上海');s.cities['上海'].houseLevel=1;s.cities['上海'].buildCosts=[8400];s.phase=phase;s.players[0].position=36;s.players[0].cash=phase==='self_rescue'?-10000:0;s.stocks['上海'].dividendFund=600;st.refreshPrice(s,'上海','待分红增加');if(phase==='self_rescue')s.pending={playerId:'p0',kind:'self_rescue'};if(phase==='buy_fundraise')s.pending={playerId:'p0',target:{kind:'city',cityId:'悉尼'}};const before=s.players[0].cash;logic.apply(s,{type:phase==='waiting_roll'?'demolish_house':'rescue_demolish',cityId:'上海'},f.rng());assert.equal(s.players[0].cash-before,5040);assert.equal(s.stocks['上海'].dividendFund,600);assert.equal(s.cities['上海'].houseLevel,0);}
 const jail=f.game();f.selected(jail,'p0','H8');jail.players[0].position=21;jail.players[0].jailed=true;jail.players[0].jailTurns=1;jail.phase='jail_turn';jail.diceBag=[10];logic.apply(jail,{type:'respond_jail',decision:'roll'},f.rng());assert.equal(jail.movement.source,'dice');assert.equal(jail.movement.playerId,'p0');assert.equal(jail.movement.target,31);
});
test('V46、V57、V64 窗口总额度、受影响报价与终局剩余奖金',()=>{
 const s=f.game();f.own(s,'p1','上海','东京','悉尼','奥克兰');st.openStockWindow(s,'p0');const w=s.stockWindow;st.applyStockTrade(s,st.planStockTrade(s,'p0',w.windowId,['上海','东京','悉尼'].map(id=>f.order(s,id,'buy',2))),[]);assert.equal(w.boughtTotal,6);const full=JSON.stringify(s);assert.throws(()=>st.planStockTrade(s,'p0',w.windowId,[f.order(s,'奥克兰','buy',1)]));assert.equal(JSON.stringify(s),full);
 const t=f.game();f.own(t,'p1','上海','东京');t.stocks['上海'].dividendFund=2000;st.refreshPrice(t,'上海','待分红增加');st.openStockWindow(t,'p0');const old=f.order(t,'上海','buy',1),unaffected=t.stockWindow.quoteVersions['东京'];st.settleCityDividend(t,'上海','transfer','s1',[]);assert.equal(t.stockWindow.quoteVersions['东京'],unaffected);const before=JSON.stringify(t);assert.throws(()=>st.planStockTrade(t,'p0',t.stockWindow.windowId,[f.order(t,'东京','buy',1),old]));assert.equal(JSON.stringify(t),before);st.applyStockTrade(t,st.planStockTrade(t,'p0',t.stockWindow.windowId,[f.order(t,'上海','buy',1)]),[]);assert.equal(t.players[0].cash,146000);
 f.selected(t,'p0','H4');o.consume(t.players[0],'H4',990);t.stocks['上海'].dividendFund=4000;const epoch=t.players[0].opportunities.lapEpoch;st.settleFinalEconomy(t,'disband',[]);assert.equal(t.players[0].cash,146210);assert.equal(o.used(t.players[0],'H4'),1000);assert.equal(t.players[0].opportunities.lapEpoch,epoch);
});
