'use strict';
const econ=require('./economy');
const opp=require('./opportunities');
const {modern}=require('./managementRules');
function syncHolders(s){for(const p of s.players)p.stocks=Object.fromEntries(Object.entries(s.stocks).filter(([,st])=>(st.holders[p.id]||0)>0).map(([id,st])=>[id,st.holders[p.id]]));}
function refreshPrice(s,id,reason){
 if(require('./stockInvestment').enabled(s)){require('./stockInvestment').refresh(s,id);return;}
 const st=s.stocks[id],before=st.price;
 st.price=econ.safe(st.operatingPrice+Math.floor(st.dividendFund/20));st.quoteVersion=(st.quoteVersion||0)+1;
 st.priceChange={delta:st.price-before,reason,operatingPrice:st.operatingPrice,dividendPerShare:Math.floor(st.dividendFund/20)};
 refreshWindowCityQuote(s,id);
}
function refreshWindowCityQuote(s,id){
 const w=s.stockWindow,st=s.stocks[id];if(!w)return;
 w.prices[id]=st.price;w.quoteVersions[id]=st.quoteVersion;w.listingEpochs[id]=st.listingEpoch;
}
function initializeListing(s,id){
 if(require('./stockInvestment').enabled(s)){require('./stockInvestment').listing(s,id);return;}
 require('./activeInvestment').clearListing(s,id);
 const st=s.stocks[id];
 st.operatingPrice=econ.rounded(s.cities[id].price,20);st.dividendFund=0;st.roundRent=0;st.rentHistory=[];st.lastDividendPerShare=0;st.clearing=false;st.listingEpoch=(st.listingEpoch||0)+1;st.clearedEpoch=null;
 st.holders={};refreshPrice(s,id,'开始经营');syncHolders(s);
}
function updateOperatingQuotes(s,completedRoundId,events){
 if(require('./stockInvestment').enabled(s)){require('./stockInvestment').round(s,completedRoundId,events);return;}
 if(s.lastQuotedRound===completedRoundId)return;s.lastQuotedRound=completedRoundId;
 for(const [id,st]of Object.entries(s.stocks)){
  const c=s.cities[id];if(!c.ownerId||st.clearing)continue;
  st.rentHistory=[...(st.rentHistory||[]),st.roundRent||0].slice(-3);st.roundRent=0;
  const p0=econ.rounded(c.price,20),b=econ.rounded(c.price,30),r=st.rentHistory.reduce((a,v)=>econ.safe(a+v),0);
  const revenue=r>0?Math.min(econ.rounded(p0,15),econ.rounded(p0,r,60*b)):-econ.rounded(p0,5);
  const target=Math.max(econ.rounded(p0,50),Math.min(p0*2,p0+econ.rounded(p0,15*c.houseLevel)+revenue-(c.mortgaged?econ.rounded(p0,15):0)));
  const previous=st.operatingPrice,step=econ.rounded(previous,10);
  st.operatingPrice=Math.max(econ.rounded(p0,50),Math.min(p0*2,previous+Math.max(-step,Math.min(step,target-previous))));
  refreshPrice(s,id,c.mortgaged?'抵押影响':r>0?'建设与租金活跃':'经营转弱');
  Object.assign(st.priceChange,{target,rentThreeRounds:r,houseLevel:c.houseLevel,mortgaged:c.mortgaged});
  if(previous!==st.operatingPrice)events.push({type:'stock',kind:'price_update',cityId:id,amount:st.operatingPrice-previous,text:id+' 经营报价 '+st.operatingPrice+'（'+st.priceChange.reason+'）',basis:{...st.priceChange}});
 }
}
function settleCityDividend(s,id,reason,settlementId,events){
 if(require('./stockInvestment').enabled(s))return;
 const st=s.stocks[id],c=s.cities[id];
 if(!st.dividendFund)return;
 const fund=st.dividendFund,per=Math.floor(fund/20);let distributed=0;
 for(const p of s.players.filter(p=>p.alive)){
  const shares=st.holders[p.id]||0,amount=per*shares;
  if(!amount)continue;p.cash=econ.safe(p.cash+amount);distributed+=amount;
  events.push({type:'dividend',kind:'dividend',settlementId:settlementId+':'+p.id,playerId:p.id,cityId:id,amount,perShare:per,shares,text:p.name+' 获得 '+id+' 基础股息 '+amount});
  if(opp.has(p,'H4')){
   const bonus=Math.min(Math.max(0,(modern(s)?3000:1000)-opp.used(p,'H4')),econ.rounded(amount,modern(s)?50:20));
   if(bonus){opp.consume(p,'H4',bonus);econ.reward(s,p,bonus,'H4',events,'稳健股息');}
  }
  require('./activeInvestment').reward(s,p,id,per,reason,settlementId+':'+p.id,events);
 }
 const remainder=fund-distributed,owner=s.players.find(p=>p.id===c.ownerId&&p.alive);
 if(owner&&reason!=='bank_clear')owner.cash=econ.safe(owner.cash+remainder);
 if(remainder)events.push({type:'dividend',kind:'retained_income',settlementId:settlementId+':retained',playerId:owner&&reason!=='bank_clear'?owner.id:null,cityId:id,amount:remainder,text:id+' 保留经营收益 '+remainder+' 归'+(owner&&reason!=='bank_clear'?owner.name:'银行')});
 st.dividendFund=0;st.lastDividendPerShare=per;refreshPrice(s,id,'发放分红');
}
function openStockWindow(s,playerId){
 const seq=(s.windowSeq||0)+1;s.windowSeq=seq;
 s.stockWindow={windowId:s.gameId+':stock:'+seq,playerId,prices:{},quoteVersions:{},listingEpochs:{},boughtByCity:{},boughtTotal:0};
 for(const id of Object.keys(s.stocks))refreshWindowCityQuote(s,id);
}
function closeStockWindow(s){s.stockWindow=null;}
function validateBuy(s,playerId,cityId,shares){
 if(require('./stockInvestment').enabled(s))return require('./stockInvestment').validateBuy(s,playerId,cityId,shares);
 const p=s.players.find(x=>x.id===playerId),c=s.cities[cityId],st=s.stocks[cityId];
 if(!p?.alive||!c?.ownerId||!st||st.clearing||!Number.isSafeInteger(shares)||shares<1)throw new Error('股票订单或城市资格无效');
 const total=Object.values(st.holders).reduce((a,n)=>a+n,0);
 if(total+shares>20||(c.ownerId===playerId&&(st.holders[playerId]||0)+shares>4))throw new Error('股票买入超过持股上限');
 return st;
}
function applyBuy(s,playerId,cityId,shares,amount,events){
 const st=validateBuy(s,playerId,cityId,shares),p=s.players.find(x=>x.id===playerId);
 if(!Number.isSafeInteger(amount)||amount<0||p.cash<amount)throw new Error('现金不足');
 econ.safe(p.cash-amount);p.cash-=amount;st.holders[playerId]=(st.holders[playerId]||0)+shares;syncHolders(s);
 const fee=amount-shares*st.price;events.push({type:'stock',kind:'stock_trade',active:true,playerId,cityId,shares,side:'buy',unitPrice:st.price,amount,fee,text:p.name+' 主动买入 '+cityId+' '+shares+'股，总额 '+amount+'，手续费 '+fee});
}
function planStockTrade(s,playerId,windowId,orders){
 if(require('./stockInvestment').enabled(s))return require('./stockInvestment').planTrade(s,playerId,typeof windowId==='object'?windowId:{kind:'go',id:windowId},orders);
 const w=s.stockWindow,p=s.players.find(p=>p.id===playerId);
 if(!w||w.playerId!==playerId||w.windowId!==windowId||!p?.alive||!Array.isArray(orders)||!orders.length||orders.length>20)throw new Error('股票窗口或订单无效');
 const seen=new Set(),next={...w.boughtByCity};let cost=0,proceeds=0,buyTotal=w.boughtTotal;
 for(const o of orders){
  const c=s.cities[o.cityId],st=s.stocks[o.cityId];
  if(!c?.ownerId||!st||st.clearing||!Number.isSafeInteger(o.shares)||o.shares<=0||!['buy','sell'].includes(o.side)||seen.has(o.cityId))throw new Error('股票订单或城市资格无效');
  seen.add(o.cityId);
  if(o.quoteVersion!==st.quoteVersion||o.listingEpoch!==st.listingEpoch||w.quoteVersions[o.cityId]!==st.quoteVersion)throw new Error('股价已更新，请查看最新报价后重新确认');
  const held=st.holders[playerId]||0;
  if(o.side==='buy'){
   next[o.cityId]=(next[o.cityId]||0)+o.shares;buyTotal+=o.shares;
   validateBuy(s,playerId,o.cityId,o.shares);
   if(next[o.cityId]>2||buyTotal>6||Object.keys(next).length>3)throw new Error('股票买入超过窗口或持股上限');
   cost=econ.safe(cost+o.shares*w.prices[o.cityId]);
  }else{if(o.shares>held)throw new Error('卖出数量超过持股');proceeds=econ.safe(proceeds+o.shares*w.prices[o.cityId]);}
 }
 if(cost>p.cash+proceeds)throw new Error('现金不足');
 return {playerId,orders,boughtByCity:next,boughtTotal:buyTotal,cost,proceeds};
}
function applyStockTrade(s,q,events){
 if(require('./stockInvestment').enabled(s)){require('./stockInvestment').applyTrade(s,q,events);return;}
 const p=s.players.find(p=>p.id===q.playerId);p.cash=econ.safe(p.cash+q.proceeds-q.cost);
 for(const o of q.orders){const st=s.stocks[o.cityId];if(o.side==='sell')require('./activeInvestment').reduce(s,p.id,o.cityId,o.shares);st.holders[p.id]=(st.holders[p.id]||0)+(o.side==='buy'?o.shares:-o.shares);
 events.push({type:'stock',kind:'stock_trade',playerId:p.id,cityId:o.cityId,shares:o.shares,side:o.side,unitPrice:s.stockWindow.prices[o.cityId],amount:o.shares*s.stockWindow.prices[o.cityId],text:p.name+' '+(o.side==='buy'?'买入':'卖出')+o.cityId+' '+o.shares+'股，总额 '+o.shares*s.stockWindow.prices[o.cityId]});}
 s.stockWindow.boughtByCity=q.boughtByCity;s.stockWindow.boughtTotal=q.boughtTotal;syncHolders(s);
}
function planTransfer(s, fromId, targetId, items, cash) {
 const from=s.players.find(p=>p.id===fromId),target=s.players.find(p=>p.id===targetId);
 if(!from?.alive||!target?.alive||from===target||!Array.isArray(items)||items.length<1||items.length>3||!Number.isSafeInteger(cash)||cash<0||target.cash<cash)throw new Error('转让内容或接收方现金无效');
 const seen=new Set();
 for(const item of items){
  const c=s.cities[item.cityId],st=s.stocks[item.cityId];
  if(!c?.ownerId||!st||st.clearing||item.shares!==1||seen.has(item.cityId)||(st.holders[fromId]||0)<1||(c.ownerId===targetId&&(st.holders[targetId]||0)>=4))throw new Error('转让股份或城市资格已失效');
  seen.add(item.cityId);
 }
 econ.safe(from.cash+cash);econ.safe(target.cash-cash);
 return {fromId,targetId,items:items.map(i=>({...i})),cash};
}
function applyTransfer(s,q,events){
 const from=s.players.find(p=>p.id===q.fromId),target=s.players.find(p=>p.id===q.targetId);
 // 所有股份与现金均在计划阶段校验后统一提交。
 for(const i of q.items){const st=s.stocks[i.cityId];require('./activeInvestment').reduce(s,from.id,i.cityId,1);st.holders[from.id]--;st.holders[target.id]=(st.holders[target.id]||0)+1;}
 from.cash+=q.cash;target.cash-=q.cash;from.transferDone=true;syncHolders(s);
 events.push({type:'stock',kind:'stock_transfer',playerId:from.id,targetId:target.id,items:q.items,cash:q.cash,text:from.name+' 向 '+target.name+' 转让股份，协商金额 '+q.cash});
}
function enforceOwnerStockCap(s,p,id,events){
 if(require('./stockInvestment').enabled(s)){const held=s.stocks[id].holders[p.id]||0;if(held>2)require('./stockInvestment').bankSell(s,p.id,id,held-2,events,'forcedOwner');return;}
 const st=s.stocks[id],held=st.holders[p.id]||0;if(held<=4)return;
 const extra=held-4;require('./activeInvestment').reduce(s,p.id,id,extra);st.holders[p.id]=4;p.cash=econ.safe(p.cash+extra*st.price);syncHolders(s);
 events.push({type:'stock',kind:'stock_trade',playerId:p.id,cityId:id,shares:extra,unitPrice:st.price,amount:extra*st.price,text:p.name+' 超过本城四股，按派息后报价卖出 '+extra+' 股'});
}
function transferCity(s,{cityId,newOwnerId},events){
 const c=s.cities[cityId],st=s.stocks[cityId],p=s.players.find(p=>p.id===newOwnerId);
 const previous=s.players.find(p=>p.id===c.ownerId);
 if(!p?.alive)throw new Error('买方已离开对局');
 require('./propertySupport').markOwned(s,newOwnerId);
 if(!c.ownerId&&(!st.listingEpoch||st.clearedEpoch===st.listingEpoch))initializeListing(s,cityId);
 else settleCityDividend(s,cityId,'transfer',s.gameId+':transfer:'+s.turnId+':'+cityId,events);
 if(previous&&previous.id!==newOwnerId)previous.cities=previous.cities.filter(id=>id!==cityId);
 if(!p.cities.includes(cityId))p.cities.push(cityId);
 if(require('./managementEconomyRules').enabled(s)&&c.ownerId!==newOwnerId)c.ownershipEpoch++;
 c.ownerId=newOwnerId;st.clearing=false;enforceOwnerStockCap(s,p,cityId,events);if(require('./stockInvestment').enabled(s))require('./stockInvestment').refresh(s,cityId);refreshWindowCityQuote(s,cityId);
 require('./activeManagement').clean(s);require('./commercialCompetition').clean(s,events);
}
function clearCityToBank(s,{cityId},events){
 const c=s.cities[cityId],st=s.stocks[cityId];
 if(st.clearedEpoch===st.listingEpoch&&!c.ownerId)return;
 settleCityDividend(s,cityId,'bank_clear',s.gameId+':clear:'+st.listingEpoch+':'+cityId,events);
 if(require('./stockInvestment').enabled(s))for(const p of s.players.filter(p=>p.alive)){const n=st.holders[p.id]||0;if(n)require('./stockInvestment').bankSell(s,p.id,cityId,n,events,'clear');}
 const unit=econ.rounded(st.operatingPrice,50);
 for(const p of s.players.filter(p=>p.alive)){
  const shares=st.holders[p.id]||0;if(!shares)continue;
  const amount=shares*unit;p.cash=econ.safe(p.cash+amount);
  events.push({type:'stock',kind:'stock_liquidation',cityId,playerId:p.id,amount,shares,unitPrice:unit,text:p.name+' '+cityId+' 股票清算 '+amount});
 }
 st.holders={};st.dividendFund=0;st.rentHistory=[];st.roundRent=0;st.clearing=false;st.clearedEpoch=st.listingEpoch;
 require('./activeInvestment').clearListing(s,cityId);
 const previous=s.players.find(p=>p.id===c.ownerId);if(previous)previous.cities=previous.cities.filter(id=>id!==cityId);
 if(require('./managementEconomyRules').enabled(s)&&c.ownerId)c.ownershipEpoch++;
 Object.assign(c,{ownerId:null,houseLevel:0,buildCosts:[],mortgaged:false,mortgageInterest:0});
 require('./activeManagement').clean(s);require('./commercialCompetition').clean(s,events);
 refreshPrice(s,cityId,'停止经营');syncHolders(s);
}
function settleFinalEconomy(s,endReason,events){
 if(s.finalSettlementDone)return;
 require('./commercialCompetition').cancelAll(s,'对局结束',events);
 for(const p of s.players)require('./businessMissions').clear(s,p);
 if(require('./activeManagement').enabled(s)){s.promotions=[];s.promotionReceipts=[];}
 if(require('./managementRules').balanced(s)){for(const order of s.operatingOrders)if(order.paymentsRemaining>0){order.paymentsRemaining=0;order.cancelledReason='对局封盘';}for(const p of s.players)require('./activeInvestment').expireAtGo(s,p);}
 s.world.status='stopped';s.opportunityStage=null;s.stockWindow=null;
 for(const id of Object.keys(s.stocks))settleCityDividend(s,id,'final',s.gameId+':final:'+id,events);
 s.finalSettlementDone=true;s.endReason=endReason;
 if(require('./stockInvestment').enabled(s))require('./stockOffers').cancelAll(s,'对局已结束',events);
}
module.exports={syncHolders,refreshPrice,refreshWindowCityQuote,initializeListing,updateOperatingQuotes,settleCityDividend,openStockWindow,closeStockWindow,planStockTrade,applyStockTrade,planTransfer,applyTransfer,enforceOwnerStockCap,transferCity,clearCityToBank,settleFinalEconomy};
module.exports.validateBuy=validateBuy;module.exports.applyBuy=applyBuy;
