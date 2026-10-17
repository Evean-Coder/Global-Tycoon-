'use strict';
const econ=require('./economy'),stocks=require('./stocks');
const {REVISION,REQUIRED_REVISION,LEGACY_REVISION,modern,optional,balanced,enabled}=require('./managementRules');
function quota(p){const r=p.activeManagement,epoch=p.opportunities.lapEpoch;return r.lapEpoch===epoch?r:{...r,lapEpoch:epoch,promotionStartedLap:false,stockBoughtTotal:0,stockBoughtByCity:{}};}
function writable(p){const q=quota(p);p.activeManagement=q;return q;}
function eligible(s,p){return enabled(s)&&p?.alive&&s.phase==='waiting_roll'&&!s.pending&&!p.jailed&&!p.frozen&&s.players[s.turnIndex].id===p.id&&p.activeManagement.usedTurnId!==s.turnId&&(!optional(s)||p.activeManagement.skippedTurnId!==s.turnId);}
function quote(s,id,kind,cityId,shares,targetKind){
 const p=s.players.find(x=>x.id===id),c=s.cities[cityId],st=s.stocks[cityId];
 if(!eligible(s,p))return {ok:false,reason:'仅正常掷骰前可经营，每回合成功一项'};
 const r=quota(p);let q;
 if(kind==='active_order')q=require('./operatingOrders').quote(s,p,targetKind,cityId);
 else if(kind==='active_build'||kind==='remote_build')q=econ.quoteBuild(s,{playerId:id,cityId,mode:'active'});
 else if(kind==='active_promote'){
  if(balanced(s))return {ok:false,reason:'本局限时促销已替换为经营订单'};
  if(!c||c.ownerId!==id||c.mortgaged||(!modern(s)&&r.promotionStartedLap))return {ok:false,reason:modern(s)?'需自有非抵押城市':'需自有非抵押城市，且本圈尚未促销'};
  if(modern(s)&&s.promotions.some(a=>a.playerId===id&&a.remainingRewards>0&&s.roundFlow.index<=a.expiresAfterCompleteRound))return {ok:false,reason:'已有促销进行中，结束后可再次开展'};
  q={ok:true,baseAmount:c.price,finalAmount:Math.min(econ.rounded(c.price,modern(s)?3:4),modern(s)?600:800),reward:Math.min(econ.rounded(c.price,modern(s)?10:8),modern(s)?1500:1200),remainingRewards:modern(s)?3:2,expiresAfterCompleteRound:s.roundFlow.index+(modern(s)?3:1)};
 }else if(kind==='active_stock_buy'){
  if(require('./stockInvestment').enabled(s))return {ok:false,reason:'股票买卖请使用独立股票市场，不消耗主动经营机会'};
  try{stocks.validateBuy(s,id,cityId,shares);}catch(e){return {ok:false,reason:e.message};}
  if(!Number.isSafeInteger(shares)||shares<1||shares>(balanced(s)?4:2)||(!modern(s)&&(r.stockBoughtTotal+shares>4||(r.stockBoughtByCity[cityId]||0)+shares>2)))return {ok:false,reason:balanced(s)?'一次1–4股，市场20股，城主最多4股':modern(s)?'一次1–2股，市场20股，城主最多4股':'一次1–2股，每圈最多4股、同城2股'};
  const base=econ.safe(st.price*shares),fee=balanced(s)?0:econ.rounded(base,1);q={ok:true,baseAmount:base,fee,finalAmount:econ.safe(base+fee),shares,listingEpoch:st.listingEpoch,...(balanced(s)?{dividendBonusRate:30,dividendBonusRemaining:Math.max(0,1500-p.activeInvestment.bonusPaid)}:{})};
 }else return {ok:false,reason:'未知经营动作'};
 if(q.ok&&p.cash<q.finalAmount)q={...q,ok:false,reason:'现金不足'};
 if(!q.ok)return q;
 const token=[s.activeManagementRevision,s.turnId,id,kind==='remote_build'?'active_build':kind,cityId,shares,c?.ownerId,c?.houseLevel,c?.mortgaged,st?.quoteVersion,st?.listingEpoch,p.opportunities.usage,s.world.active,s.world.constructionUsedIds,r.usedTurnId,r.promotionStartedLap,r.stockBoughtTotal,r.stockBoughtByCity];
 if(balanced(s))token.push(targetKind,p.cash,p.opportunities.lapEpoch,r.lastRemoteBuildLap,r.lastRemoteBuildCityId,r.lastOrderLap,s.operatingOrders.filter(o=>o.playerId===p.id),s.airports[cityId]?.ownerId,p.activeInvestment);
 if(q.scheduleRevision)token.push(q.scheduleRevision,q.ownershipEpoch);
 return {...q,...(q.kind==='build'?{rentBefore:econ.rentFor(c),rentAfter:econ.rentFor({...c,houseLevel:c.houseLevel+1})}:{}),quoteVersion:JSON.stringify(token),cashAfter:p.cash-q.finalAmount};
}
function apply(s,p,a,events){
 if(a.type==='active_competition_bid'){require('./commercialCompetition').acceptBid(s,p.id,a,events);return;}
 const q=quote(s,p.id,a.type,a.cityId,a.shares,a.targetKind);
 if(!q.ok||q.quoteVersion!==a.quoteVersion)throw new Error(q.reason||'经营报价已更新，请重新确认');
 const r=writable(p);
 if(a.type==='active_build'||a.type==='remote_build'){
  econ.applySettlement(s,{...q,quoteVersion:econ.version(s,p,'build',a.cityId)},events);
  if(balanced(s)){r.lastRemoteBuildLap=p.opportunities.lapEpoch;r.lastRemoteBuildCityId=a.cityId;}
 }
 else if(a.type==='active_order')require('./operatingOrders').start(s,p,q,events);
 else if(a.type==='active_stock_buy'){
  stocks.applyBuy(s,p.id,a.cityId,a.shares,q.finalAmount,events);
  require('./activeInvestment').markPurchase(s,p,a.cityId,a.shares);
  r.stockBoughtTotal+=a.shares;r.stockBoughtByCity[a.cityId]=(r.stockBoughtByCity[a.cityId]||0)+a.shares;
 }else{
  p.cash=econ.safe(p.cash-q.finalAmount);r.promotionStartedLap=true;
  s.promotions=s.promotions.filter(x=>x.playerId!==p.id);
  s.promotions.push({promotionId:s.gameId+':promotion:'+s.turnId,playerId:p.id,cityId:a.cityId,reward:q.reward,expiresAfterCompleteRound:q.expiresAfterCompleteRound,remainingRewards:q.remainingRewards,processedIds:[]});
  events.push({type:'promotion',playerId:p.id,cityId:a.cityId,amount:q.finalAmount,text:p.name+' 启动 '+a.cityId+' 限时促销，支出 '+q.finalAmount});
 }
 r.usedTurnId=s.turnId;
}
function clean(s){if(!enabled(s))return;if(balanced(s))require('./operatingOrders').clean(s);s.promotions=s.promotions.filter(a=>{const p=s.players.find(x=>x.id===a.playerId),c=s.cities[a.cityId];return p?.alive&&c.ownerId===a.playerId&&!c.mortgaged&&a.remainingRewards>0&&s.roundFlow.index<=a.expiresAfterCompleteRound&&s.phase!=='game_over';});}
function reward(s,receipt,events){
 clean(s);const a=s.promotions.find(x=>x.promotionId===receipt.promotionId),p=s.players.find(x=>x.id===a?.playerId);
 if(!a||a.processedIds.includes(receipt.settlementId))return;
 p.cash=econ.safe(p.cash+a.reward);a.processedIds.push(receipt.settlementId);a.remainingRewards--;
 events.push({type:'promotion',kind:'promotion_reward',settlementId:receipt.settlementId,playerId:p.id,cityId:a.cityId,amount:a.reward,text:p.name+' 促销奖励 '+a.reward});
 clean(s);
}
function rentCompleted(s,q,settlementId,events){
 if(!enabled(s)||q.finalAmount<=0)return;clean(s);const a=s.promotions.find(x=>x.cityId===q.cityId&&x.playerId!==q.playerId);if(!a)return;
 const receipt={promotionId:a.promotionId,settlementId,tenantId:q.playerId};
 if(s.players.find(x=>x.id===q.playerId).cash<0)s.promotionReceipts.push(receipt);else reward(s,receipt,events);
}
function resolveReceipts(s,events){if(!enabled(s))return;clean(s);s.promotionReceipts=s.promotionReceipts.filter(r=>{const p=s.players.find(x=>x.id===r.tenantId);if(!p?.alive)return false;if(p.cash<0)return true;reward(s,r,events);return false;});}
function view(s,id){
 if(!enabled(s))return null;const p=s.players.find(x=>x.id===id);if(!p)return null;const quotes=[];
 for(const cid of Object.keys(s.cities)){
  if(s.cities[cid].ownerId===id)for(const type of [balanced(s)?'active_order':'active_promote','active_build'])quotes.push({type,cityId:cid,...(type==='active_order'?{targetKind:'city'}:{}),...quote(s,id,type,cid,undefined,type==='active_order'?'city':undefined)});
  if(!require('./stockInvestment').enabled(s)&&s.cities[cid].ownerId)for(const shares of balanced(s)?[1,2,3,4]:[1,2])quotes.push({type:'active_stock_buy',cityId:cid,shares,...quote(s,id,'active_stock_buy',cid,shares)});
 }
 if(balanced(s))for(const [aid,a]of Object.entries(s.airports))if(a.ownerId===id)quotes.push({type:'active_order',cityId:aid,targetKind:'airport',...quote(s,id,'active_order',aid,undefined,'airport')});
 if(require('./managementEconomyRules').enabled(s)){
  const competition=require('./commercialCompetition'),period=s.commercialCompetition.currentPeriod;
  for(const c of Object.values(s.cities).filter(c=>c.ownerId===id&&period?.publishedRegions.includes(c.continent)&&period.status==='open')){
   const input={periodId:period.periodId,region:c.continent,cityId:c.id},tokens={};let first=null;
   for(let amount=100;amount<=3000;amount+=100){const q=competition.quoteBid(s,id,{...input,amount});if(q.ok){tokens[amount]=q.quoteVersion;if(!first)first=q;}}
   quotes.push({type:'active_competition_bid',...input,...(first||{ok:false,reason:competition.quoteBid(s,id,{...input,amount:100}).reason}),bidTokensByAmount:tokens,...(first?{preview:require('./competitionPreview').previewOwnerCashflow(s,id,c.id)}:{})});
  }
 }
 const required=modern(s)&&quotes.some(q=>q.ok),last=p.activeManagement.lastRemoteBuildLap;
 return {optional:optional(s),skippedThisTurn:optional(s)&&p.activeManagement.skippedTurnId===s.turnId,mandatory:modern(s)&&!optional(s),required,available:eligible(s,p),usedThisTurn:p.activeManagement.usedTurnId===s.turnId,reason:optional(s)&&p.activeManagement.skippedTurnId===s.turnId?'本回合已放弃经营':p.activeManagement.usedTurnId===s.turnId?'本回合已完成一项经营':required?(optional(s)?'请执行一项经营，或放弃后掷骰':'请先完成一项经营再掷骰'):eligible(s,p)?'当前所有项目均不可执行，可直接掷骰；详情查看各城市原因':'仅本人正常掷骰前可经营',quota:quota(p),quotes,...(balanced(s)?{balanced:true,remoteBuildLapsRemaining:last===null?0:Math.max(0,last+3-p.opportunities.lapEpoch),lastRemoteBuildCityId:p.activeManagement.lastRemoteBuildCityId,order:s.operatingOrders.find(o=>o.playerId===id)||null,investment:p.activeInvestment}: {})};
}
function required(s,id){return modern(s)&&!!view(s,id)?.required;}
function timeoutAction(s,id){const q=view(s,id)?.quotes.filter(q=>q.ok).sort((a,b)=>a.finalAmount-b.finalAmount||a.type.localeCompare(b.type)||a.cityId.localeCompare(b.cityId)||(a.shares||0)-(b.shares||0))[0];return q?{type:q.type,cityId:q.cityId,shares:q.shares,listingEpoch:q.listingEpoch,quoteVersion:q.quoteVersion,...(q.targetKind?{targetKind:q.targetKind}:{})}:null;}
function skip(s,p,events,reason='player'){if(!optional(s)||!eligible(s,p))throw new Error('当前不能放弃经营');writable(p).skippedTurnId=s.turnId;events.push({type:'management',kind:'management_skipped',playerId:p.id,reason,text:p.name+' '+(reason==='timeout'?'经营超时，默认放弃':'放弃本回合经营')});}
module.exports={skip,REQUIRED_REVISION,LEGACY_REVISION,required,timeoutAction,REVISION,enabled,quote,apply,clean,rentCompleted,resolveReceipts,view};
