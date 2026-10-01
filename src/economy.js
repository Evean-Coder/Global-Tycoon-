'use strict';
const opp=require('./opportunities');
const {AIRPORTS}=require('./board');
function safe(value){if(!Number.isSafeInteger(value))throw new Error('金额超出有效范围');return value;}
function rounded(value,numerator,denominator=100){
 if(!Number.isSafeInteger(value)||value<0||!Number.isSafeInteger(numerator)||numerator<0||!Number.isSafeInteger(denominator)||denominator<=0)throw new Error('金额参数无效');
 const product=BigInt(value)*BigInt(numerator), divisor=BigInt(denominator);
 return safe(Number((product*2n+divisor)/(divisor*2n)));
}
function floorRatio(value,denominator){return safe(Number(BigInt(value)/BigInt(denominator)));}
function cityTotalValue(c){return safe(c.price+rounded(c.price,60)*c.houseLevel);}
function rentFor(c){return rounded(rounded(c.price,30+30*c.houseLevel),c.houseLevel>=4&&c.price>=15000?110:100);}
function mortgageValue(c){return rounded(cityTotalValue(c),50);}
function buildFee(c){return rounded(c.price,60);}
function costs(c){const out=(c.buildCosts||[]).slice();while(out.length<c.houseLevel)out.push(buildFee(c));return out;}
function refundFor(c){return rounded(costs(c).at(-1)||buildFee(c),60);}
function getPlayer(s,id){return s.players.find(p=>p.id===id);}
function version(s,p,kind,id){return [s.gameId,s.revision,p.id,kind,id].join(':');}
function denied(reason){return {ok:false,reason};}
function plan(s,p,kind,id,base,amount,effects=[],quotaChanges=[]){
 return {ok:true,kind,playerId:p.id,cityId:kind==='flight'?null:id,baseAmount:base,finalAmount:amount,effects,quotaChanges,quoteVersion:version(s,p,kind,id),cashDeltas:{[p.id]:-amount},fundDeltas:{},guards:{revision:s.revision}};
}
function discount(id,name,amount,requested){return {id,name,amount,requested};}
function quoteBuild(s,{playerId,cityId,mode='normal'}){
 const p=getPlayer(s,playerId),c=s.cities[cityId];
 if(!p||!p.alive||!c||c.ownerId!==p.id||c.mortgaged||c.houseLevel>=4)return denied('城市须为自有、非抵押且未满四级');
 if(mode==='remote'){
  if(s.phase!=='waiting_roll'||s.players[s.turnIndex].id!==p.id||!opp.has(p,'H1')||opp.used(p,'H1'))return denied('远程施工仅本人等待掷骰且本圈仍有次数时可用');
 }else if(p.position!==s.board.find(q=>q.cityId===cityId)?.id||c.buildReady===false)return denied('需再次到达自己的城市后建房');
 const base=buildFee(c),limit=rounded(base,30),effects=[],quotaChanges=[];
 let reduction=0;
 function offer(id,name,requested){
  const amount=Math.max(0,Math.min(requested,limit-reduction));effects.push(discount(id,name,amount,requested));reduction+=amount;
  if(amount>0)quotaChanges.push({id,amount:1});
 }
 if(s.world?.active?.type==='construction'&&!s.world.constructionUsedIds.includes(p.id))offer('construction','建设优惠',Math.min(2000,rounded(base,15)));
 if(opp.has(p,'H2')&&!opp.used(p,'H2'))offer('H2','标准化施工',Math.min(1500,rounded(base,10)));
 const chain=Object.values(s.cities).filter(x=>x.ownerId===p.id&&!x.mortgaged&&x.group===c.group).length>=2;
 if(opp.has(p,'H3')&&!opp.used(p,'H3')&&chain)offer('H3','连锁经营',Math.min(1500,rounded(base,10)));
 if(mode==='remote')quotaChanges.push({id:'H1',amount:1});
 const q=plan(s,p,'build',cityId,base,base-reduction,effects,quotaChanges);
 if(p.cash<q.finalAmount)return {...q,ok:false,reason:'现金不足以支付实际建房费用'};
 q.buildCostChanges={cityId,add:q.finalAmount};return q;
}
function quoteDemolition(s,{playerId,cityId}){
 const p=getPlayer(s,playerId),c=s.cities[cityId];
 if(!p||!c||c.ownerId!==p.id||c.mortgaged||c.houseLevel<1)return denied('该城市当前不能拆房');
 const amount=refundFor(c),q=plan(s,p,'demolish',cityId,amount,-amount);
 q.buildCostChanges={cityId,remove:true};return q;
}
function rentAmounts(s,{playerId,cityId,baseAmount}){
 const p=getPlayer(s,playerId),c=s.cities[cityId];
 if(!p||!c||!c.ownerId)return denied('城市没有经营者');
 const base=safe(baseAmount),active=s.world?.active,effects=[],quotaChanges=[];
 let income=base;
 if(base&&active?.region===c.continent&&(active.type==='boom'||active.type==='slowdown')){
  const delta=Math.min(3000,rounded(base,15))*(active.type==='boom'?1:-1);income+=delta;effects.push({id:active.type,name:active.name,amount:delta});
 }
 let amount=income;
 if(amount>0&&c.ownerId!==p.id&&opp.has(p,'H6')&&(s.stocks[cityId].holders[p.id]||0)>0){
  const cut=Math.min(1000,Math.max(0,2000-opp.used(p,'H6')),rounded(amount,10));
  if(cut){amount-=cut;effects.push(discount('H6','股东礼遇',cut,cut));quotaChanges.push({id:'H6',amount:cut});}
 }
 if(amount>0&&c.ownerId!==p.id&&opp.has(p,'H11')&&!opp.used(p,'H11')){
  const cut=Math.min(2000,rounded(amount,20));
  if(cut){amount-=cut;effects.push(discount('H11','风险准备金',cut,cut));quotaChanges.push({id:'H11',amount:1});}
 }
 const q=plan(s,p,'city_rent',cityId,base,amount,effects,quotaChanges);
 const fund=rounded(income,20);q.income=income;q.bankSupplement=income-amount;q.cashDeltas[c.ownerId]=(q.cashDeltas[c.ownerId]||0)+income-fund;q.fundDeltas[cityId]=fund;q.roundRent=income;
 return q;
}
function quoteRent(s,{playerId,cityId}){
 const c=s.cities[cityId];
 if(!c)return denied('城市不存在');
 return rentAmounts(s,{playerId,cityId,baseAmount:c.mortgaged?0:rentFor(c)});
}
function quoteFlight(s,{playerId,target,fromAirportId,free=false}){
 const p=getPlayer(s,playerId),from=s.board.find(x=>x.airportId===fromAirportId),to=s.board.find(x=>x.airportId===target);
 if(!p||!from||!to||from===to)return denied('航班目标无效');
 const distance=Math.min(Math.abs(to.id-from.id),42-Math.abs(to.id-from.id)),base=free?0:distance*500;
 const effects=[],quotaChanges=[];let reduction=0;
 if(base&&s.world?.active?.type==='aviation'){const cut=rounded(base,30);reduction+=cut;effects.push(discount('aviation','航空促销',cut,cut));}
 if(base&&opp.has(p,'H7')&&!opp.used(p,'H7')){
  const cut=Math.min(1500,rounded(base,20),rounded(base,50)-reduction);
  if(cut){reduction+=cut;effects.push(discount('H7','飞行常客',cut,cut));quotaChanges.push({id:'H7',amount:1});}
 }
 const q=plan(s,p,'flight',target,base,base-reduction,effects,quotaChanges);q.target=target;return q;
}
function applySettlement(s,q,events){
 if(!q.ok||q.guards.revision!==s.revision)throw new Error(q.reason||'报价已失效，请重新确认');
 for(const [id,delta]of Object.entries(q.cashDeltas))safe(getPlayer(s,id).cash+delta);
 for(const [id,delta]of Object.entries(q.fundDeltas))safe(s.stocks[id].dividendFund+delta);
 for(const [id,delta]of Object.entries(q.cashDeltas))getPlayer(s,id).cash+=delta;
 for(const [id,delta]of Object.entries(q.fundDeltas))s.stocks[id].dividendFund+=delta;
 const p=getPlayer(s,q.playerId);
 for(const item of q.quotaChanges){if(item.id==='construction')s.world.constructionUsedIds.push(p.id);else opp.consume(p,item.id,item.amount);}
 if(q.buildCostChanges){
  const c=s.cities[q.buildCostChanges.cityId];c.buildCosts=costs(c);
  if(q.buildCostChanges.remove){c.buildCosts.pop();c.houseLevel--;}else{c.buildCosts.push(q.buildCostChanges.add);c.houseLevel++;}
 }
 if(q.roundRent!==undefined)s.stocks[q.cityId].roundRent+=q.roundRent;
 s.settlementSeq=(s.settlementSeq||0)+1;
 const label={build:'建房',demolish:'拆房返还',city_rent:'城市租金',flight:'机票'};
 let text=p.name+' '+label[q.kind]+' '+Math.abs(q.finalAmount)+(q.effects.length?'（'+q.effects.map(e=>e.name+' '+e.amount).join('，')+'）':'');
 if(q.kind==='city_rent'){const owner=getPlayer(s,s.cities[q.cityId].ownerId);text=p.name+' 向 '+owner.name+' 支付 '+q.cityId+' 租金：标准 '+q.baseAmount+'，资讯后 '+q.income+'，实际支付 '+q.finalAmount+'，银行补足 '+q.bankSupplement+'，城主现金 '+(q.income-q.fundDeltas[q.cityId])+'，待分红 '+q.fundDeltas[q.cityId]+(q.effects.length?'（'+q.effects.map(e=>e.name+' '+e.amount).join('，')+'）':'');}
 events.push({type:q.kind==='city_rent'?'rent':q.kind,kind:q.kind,settlementId:s.gameId+':money:'+s.settlementSeq,playerId:p.id,cityId:q.cityId,baseAmount:q.baseAmount,finalAmount:q.finalAmount,effects:q.effects,bankSupplement:q.bankSupplement||0,cashDeltas:{...q.cashDeltas},fundDeltas:{...q.fundDeltas},text});
}
function reward(s,p,amount,id,events,reason){
 if(!p.alive||!amount)return;
 p.cash=safe(p.cash+amount);s.settlementSeq=(s.settlementSeq||0)+1;
 events.push({type:'reward',kind:'opportunity_reward',settlementId:s.gameId+':reward:'+s.settlementSeq,playerId:p.id,opportunityId:id,amount,text:p.name+' '+reason+'，奖励 '+amount});
}
function goRewards(s,p,events){
 if(opp.has(p,'H5')&&Object.entries(s.stocks).filter(([id,st])=>(st.holders[p.id]||0)>0&&s.cities[id].ownerId&&!s.cities[id].mortgaged).length>=3)reward(s,p,2000,'H5',events,'分散投资');
 if(opp.has(p,'H9')){const pairs=Object.entries(AIRPORTS).filter(([id,a])=>s.airports[id].ownerId===p.id&&s.cities[a.adjacentCity].ownerId===p.id&&!s.cities[a.adjacentCity].mortgaged).length;reward(s,p,Math.min(3000,pairs*1500),'H9',events,'航空联营');}
 if(opp.has(p,'H10')&&Object.values(s.cities).filter(c=>c.ownerId===p.id).length<=2)reward(s,p,2000,'H10',events,'轻资产经营');
}
function airportReward(s,p,id,events){
 if(opp.has(p,'H8')&&!p.opportunities.visitedAirportIds.includes(id)){p.opportunities.visitedAirportIds.push(id);reward(s,p,2000,'H8',events,'环球旅人 · '+id);}
}
module.exports={safe,rounded,floorRatio,cityTotalValue,rentFor,mortgageValue,buildFee,refundFor,version,quoteBuild,quoteRent,rentAmounts,quoteFlight,quoteDemolition,applySettlement,reward,goRewards,airportReward};
