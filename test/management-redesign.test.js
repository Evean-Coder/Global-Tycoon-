'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGameState}=require('../src/state'),active=require('../src/activeManagement'),econ=require('../src/economy'),stocks=require('../src/stocks'),opp=require('../src/opportunities'),logic=require('../src/gameLogic'),{normalizeAction}=require('../src/actionValidation'),{snapshot}=require('../src/gameView'),{own,fakeClock}=require('./helpers/gameplayFixtures'),{createActionClock,decisionDescriptor}=require('../src/actionClock');
function game(){const s=createGameState('NEW',['甲','乙','丙'],2,{activeManagementRevision:active.REVISION,routeRevision:'opportunity-routes-v1'});s.phase='waiting_roll';s.pending=null;return s;}
function select(s,...ids){s.players[0].opportunities.selectedIds=ids;}
function perform(s,type,cityId='内罗毕',shares){const q=active.quote(s,'p0',type,cityId,shares);assert.ok(q.ok,q.reason);const a={type,cityId,shares,quoteVersion:q.quoteVersion,listingEpoch:q.listingEpoch},n=normalizeAction(s,a);assert.ok(n.ok,n.error);assert.ok(!logic.apply(s,n.action,()=>.5).rejected);return q;}
test('v2门禁、无项目放行、失败原子性、旧局可跳过',()=>{
 const s=game();assert.equal(active.required(s,'p0'),false);own(s,'p0','内罗毕');assert.ok(active.required(s,'p0'));
 const before=JSON.stringify(s);assert.equal(normalizeAction(s,{type:'roll_dice'}).ok,false);assert.ok(logic.apply(s,{type:'roll_dice'},()=>.5).rejected);assert.equal(JSON.stringify(s),before);
 perform(s,'active_build');assert.equal(normalizeAction(s,{type:'roll_dice'}).ok,true);assert.equal(active.quote(s,'p0','active_promote','内罗毕').ok,false);
 s.turnId++;s.players[0].cash=0;assert.equal(active.required(s,'p0'),false);assert.match(active.view(s,'p0').reason,/不可执行/);
 const old=createGameState('OLD',['甲','乙'],2,{activeManagementRevision:active.LEGACY_REVISION});old.phase='waiting_roll';old.pending=null;own(old,'p0','内罗毕');assert.equal(active.required(old,'p0'),false);assert.equal(active.quote(old,'p0','active_build','内罗毕').finalAmount,3132);
});
test('v2三类费用、促销不替换、没有圈额度但保留20/4股',()=>{
 const s=game();own(s,'p0','内罗毕');own(s,'p1','上海');
 const q=perform(s,'active_promote');assert.equal(q.finalAmount,108);assert.equal(q.reward,360);assert.equal(q.remainingRewards,3);
 s.turnId++;assert.equal(active.quote(s,'p0','active_promote','内罗毕').ok,false);
 for(let i=0;i<3;i++){perform(s,'active_stock_buy','上海',2);s.turnId++;}assert.equal(s.stocks['上海'].holders.p0,6);assert.equal(s.players[0].activeManagement.stockBoughtTotal,6);
 s.stocks['上海'].holders.p1=14;assert.equal(active.quote(s,'p0','active_stock_buy','上海',1).ok,false);
 s.stocks['内罗毕'].holders.p0=4;assert.equal(active.quote(s,'p0','active_stock_buy','内罗毕',1).ok,false);
 assert.equal(active.quote(s,'p0','active_build','内罗毕').finalAmount,2484);
 const b=perform(s,'active_build');assert.equal(b.rentBefore,1080);assert.equal(b.rentAfter,2160);
});
test('促销完整期限、3次上限、欠租清偿幂等和撤销',()=>{
 const s=game();own(s,'p0','内罗毕');perform(s,'active_promote');const owner=s.players[0],cash=owner.cash,tenant=s.players[1],receipt={cityId:'内罗毕',playerId:'p1',finalAmount:100};
 tenant.cash=-1;active.rentCompleted(s,receipt,'a',[]);assert.equal(owner.cash,cash);tenant.cash=1;active.resolveReceipts(s,[]);active.resolveReceipts(s,[]);assert.equal(owner.cash,cash+360);
 s.roundFlow.index+=3;active.clean(s);assert.equal(s.promotions.length,1);active.rentCompleted(s,receipt,'b',[]);active.rentCompleted(s,receipt,'b',[]);active.rentCompleted(s,receipt,'c',[]);assert.equal(owner.cash,cash+1080);assert.equal(s.promotions.length,0);
 s.turnId++;perform(s,'active_promote');s.roundFlow.index+=4;active.clean(s);assert.equal(s.promotions.length,0);
 s.turnId++;perform(s,'active_promote');s.cities['内罗毕'].mortgaged=true;active.clean(s);assert.equal(s.promotions.length,0);
});
test('可信超时选择最低支出后掷骰；重放一致，普通请求不得伪造',()=>{
 const s=game();own(s,'p0','内罗毕');assert.equal(normalizeAction(s,{type:'management_timeout'}).ok,false);
 const copy=globalThis.structuredClone(s),a=normalizeAction(s,{type:'management_timeout'},{source:'timeout'});assert.ok(a.ok);assert.equal(active.timeoutAction(s,'p0').type,'active_promote');
 const r=logic.apply(s,a.action,()=>.5,{source:'timeout'}),other=logic.apply(copy,a.action,()=>.5,{source:'timeout'});assert.ok(!r.rejected);assert.deepEqual(r,other);assert.equal(s.players[0].activeManagement.usedTurnId,1);assert.ok(r.events.some(e=>e.type==='promotion'));assert.ok(s.dice>0);
});
test('快速45秒/普通90秒，经营/查看不改变决定期限',()=>{
 const s=game();own(s,'p0','内罗毕');assert.equal(decisionDescriptor(s).seconds,90);s.gameMode='quick';s.quickRevision='quick-mode-v1';assert.equal(decisionDescriptor(s).seconds,45);
 const time=fakeClock(),clock=createActionClock(time);clock.sync(s,()=>{});time.advance(1000);const deadline=clock.deadlineMs;perform(s,'active_promote');clock.sync(s,()=>{});assert.equal(clock.deadlineMs,deadline);assert.equal(clock.remainingSeconds(),44);
});
test('H1 H2 H3：建设优惠30%总上限，前两次与连锁持续生效',()=>{
 const s=game();own(s,'p0','内罗毕','开普敦');s.cities['开普敦'].group=s.cities['内罗毕'].group;select(s,'H1','H2','H3');
 let q=perform(s,'active_build');assert.equal(q.finalAmount,1836);assert.equal(q.effects.reduce((n,e)=>n+e.amount,0),648);
 s.turnId++;q=perform(s,'active_build');assert.equal(q.finalAmount,2052);assert.equal(s.players[0].opportunities.usage.H2,2);
 s.turnId++;q=perform(s,'active_build');assert.equal(q.finalAmount,2268);assert.equal(s.players[0].opportunities.usage.H3,3);
});
test('H4 H5 H9 H10：真实股息、分散及航空/轻资产奖励',()=>{
 const s=game(),p=s.players[0];own(s,'p1','内罗毕','开普敦');s.stocks['内罗毕'].holders.p0=2;s.stocks['开普敦'].holders.p0=1;select(s,'H4','H5','H9','H10');
 s.stocks['内罗毕'].dividendFund=2000;const cash=p.cash;stocks.settleCityDividend(s,'内罗毕','go','a',[]);assert.equal(p.cash-cash,300);assert.equal(p.opportunities.usage.H4,100);
 const airport=Object.keys(s.airports)[0];s.airports[airport].ownerId=p.id;const before=p.cash;econ.goRewards(s,p,[]);assert.equal(p.cash-before,6000);
 p.opportunities.usage.H4=2999;s.stocks['内罗毕'].dividendFund=2000;const events=[];stocks.settleCityDividend(s,'内罗毕','go','b',events);assert.equal(events.find(e=>e.opportunityId==='H4').amount,1);
});
test('H6 H11：股东25%再减30%，防御前两次、各自上限',()=>{
 const s=game();own(s,'p1','上海');s.stocks['上海'].holders.p0=1;select(s,'H6','H11');
 const pay=()=>econ.rentAmounts(s,{playerId:'p0',cityId:'上海',baseAmount:10000});
 let q=pay();assert.equal(q.finalAmount,5600);econ.applySettlement(s,q,[]);q=pay();assert.equal(q.finalAmount,5600);econ.applySettlement(s,q,[]);q=pay();assert.equal(q.finalAmount,10000);assert.equal(s.players[0].opportunities.usage.H6,4000);
});
test('H7 H8：两次航班优惠、60%合计上限，机场首访和跨圈访问',()=>{
 const s=game(),p=s.players[0];select(s,'H7','H8');const [from,to]=Object.keys(s.airports);s.world.active={type:'aviation'};
 const flight=()=>econ.quoteFlight(s,{playerId:p.id,fromAirportId:from,target:to});let q=flight();assert.equal(q.finalAmount,q.baseAmount-econ.rounded(q.baseAmount,60));econ.applySettlement(s,q,[]);q=flight();econ.applySettlement(s,q,[]);q=flight();assert.equal(q.finalAmount,q.baseAmount-econ.rounded(q.baseAmount,30));
 const cash=p.cash;econ.airportReward(s,p,to,[]);econ.airportReward(s,p,to,[]);assert.equal(p.cash-cash,3000);opp.refresh(p);econ.airportReward(s,p,to,[]);assert.equal(p.cash-cash,4500);
});
test('H12新版金额、一次凭据、目录隐私与AI必做fallback',()=>{
 const s=game(),p=s.players[0];select(s,'H12');const intent=opp.emergencyIntent(s,p,'initial');assert.equal(intent.amount,10000);opp.recordEmergency(p,intent);assert.equal(opp.emergencyIntent(s,p,'later'),null);assert.throws(()=>opp.recordEmergency(p,intent));
 own(s,'p0','内罗毕');p.cash=110;const v=snapshot(s,p.id);assert.match(v.opportunityCatalog.H12.description,/10000/);assert.equal(v.players[1].activeManagement,undefined);assert.ok(v.self.activeManagement.required);
 const bot=require('../src/botPolicy');for(const a of [bot.fallback(v),bot.choose(v,{steps:99})]){assert.equal(a.type,'active_promote');assert.ok(normalizeAction(s,a).ok);}
});
test('有限真实收益对照：0/1/3次客流，三类经营不混淆回报',()=>{
 const rows=[],{netAssetSummary}=require('../src/assets');
 for(const type of ['active_promote','active_stock_buy','active_build'])for(const visits of [0,1,3]){
  const base=game();own(base,'p0','伦敦');own(base,'p1','上海');const s=globalThis.structuredClone(base),cityId=type==='active_stock_buy'?'上海':'伦敦',q=perform(s,type,cityId,type==='active_stock_buy'?2:undefined);
  for(let i=0;i<visits;i++)for(const state of [base,s]){econ.applySettlement(state,econ.quoteRent(state,{playerId:'p2',cityId}),[]);stocks.settleCityDividend(state,cityId,'go','sample:'+i,[]);state.roundFlow.index++;active.clean(state);}
  const delta=netAssetSummary(s,'p0').netAssets-netAssetSummary(base,'p0').netAssets;
  rows.push({type,visits,cost:q.finalAmount,relativeNetAssets:delta});assert.ok(Number.isSafeInteger(delta));
 }
 assert.equal(rows.find(r=>r.type==='active_promote'&&r.visits===0).relativeNetAssets,-420);
 assert.equal(rows.find(r=>r.type==='active_promote'&&r.visits===3).relativeNetAssets,3780);
 const fs=require('node:fs'),path=require('node:path'),dir=path.join(__dirname,'../docs/management-redesign/evidence');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'fixed-returns.json'),JSON.stringify({scope:'九个固定客流场景，非胜率实验；不含随机落点、强化或报价更新',rows},null,2));
});
