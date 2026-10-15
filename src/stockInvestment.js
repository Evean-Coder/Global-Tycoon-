'use strict';
// Each issued share retains its source ceiling through player transfers.
const econ=require('./economy');
const REVISION='stock-investment-v2';
const enabled=s=>s?.stockInvestmentRevision===REVISION;
const player=(s,id)=>s.players.find(p=>p.id===id);
function initialize(s){
 s.stockAcquisitionSeq=0;s.stockOffers=[];s.stockOfferSeq=0;
 for(const p of s.players){p.stockLedger={};p.stockTurnQuota=null;}
 for(const st of Object.values(s.stocks)){st.units=Array.from({length:10},(_,unitId)=>({unitId,holderId:null,bankBasis:0,paidCost:0,acquiredSeq:0}));st.rentHistoryV2=[];st.roundRentCount=0;st.listingRoundIndex=null;st.lastDividend={rentalPerShare:0,bankPerShare:0};}
 refreshAll(s);
}
function factor(st){if(st.rentHistoryV2.length<3)return 100;const n=st.rentHistoryV2.reduce((n,r)=>n+r.count,0);return n===0?90:n===1?100:n===2?110:115;}
function quoteBuy(s,id){const c=s.cities[id],st=s.stocks[id];return Math.max(1,econ.rounded(econ.cityTotalValue(c),12*factor(st)*(c.mortgaged?80:100),1000000));}
function refresh(s,id){
 const st=s.stocks[id],c=s.cities[id],price=quoteBuy(s,id),facts=JSON.stringify([price,c.houseLevel,c.mortgaged,c.ownerId,st.listingEpoch]);
 if(st.quoteFacts!==facts){st.quoteVersion++;st.quoteFacts=facts;}
 st.price=st.operatingPrice=price;st.dividendFund=0;
 st.priceChange={reason:'标准资产12% × 经营'+factor(st)+'% × 抵押'+(c.mortgaged?80:100)+'%',rentThreeRounds:st.rentHistoryV2.reduce((n,r)=>n+r.amount,0),rentCountThreeRounds:st.rentHistoryV2.reduce((n,r)=>n+r.count,0),activityFactor:factor(st)};
 const w=s.stockWindow;if(w){w.prices[id]=price;w.quoteVersions[id]=st.quoteVersion;w.listingEpochs[id]=st.listingEpoch;}
}
function refreshAll(s){if(!enabled(s))return;for(const id of Object.keys(s.stocks))refresh(s,id);}
function sync(s){for(const st of Object.values(s.stocks)){st.holders={};for(const u of st.units)if(u.holderId)st.holders[u.holderId]=(st.holders[u.holderId]||0)+1;}for(const p of s.players)p.stocks=Object.fromEntries(Object.entries(s.stocks).filter(([,st])=>st.holders[p.id]>0).map(([id,st])=>[id,st.holders[p.id]]));}
function held(s,pid,id){return s.stocks[id].units.filter(u=>u.holderId===pid).sort((a,b)=>a.acquiredSeq-b.acquiredSeq||a.unitId-b.unitId);}
function select(s,pid,id,n){if(!Number.isSafeInteger(n)||n<1||n>10)throw new Error('卖出股数无效');const units=held(s,pid,id).slice(0,n);if(units.length!==n)throw new Error('持股不足');return units;}
function exit(s,pid,id,n,mode='ordinary'){const price=quoteBuy(s,id),rate=mode==='clear'?50:90;return select(s,pid,id,n).reduce((v,u)=>econ.safe(v+Number(BigInt(Math.min(price,u.bankBasis))*BigInt(rate)/100n)),0);}
function ledger(s,pid,id,key,n){const p=player(s,pid);p.stockLedger[id]||={};p.stockLedger[id][key]=econ.safe((p.stockLedger[id][key]||0)+n);}
function cap(s,pid,id){return s.cities[id].ownerId===pid?2:4;}
function validateBuy(s,pid,id,n){const p=player(s,pid),c=s.cities[id],st=s.stocks[id];if(!p?.alive||!c?.ownerId||!st||st.clearing||!Number.isSafeInteger(n)||n<1||n>10)throw new Error('股票订单或城市资格无效');if(st.units.filter(u=>!u.holderId).length<n||(st.holders[pid]||0)+n>cap(s,pid,id))throw new Error('股票超过发行量或个人持股上限');return st;}
function context(s,pid){if(s.status!=='playing'||s.players[s.turnIndex]?.id!==pid)return null;if(s.phase==='waiting_roll'&&!s.pending&&!player(s,pid).jailed&&!player(s,pid).frozen)return {kind:'turn',id:s.turnId};if(s.phase==='stock'&&s.stockWindow?.playerId===pid)return {kind:'go',id:s.stockWindow.windowId};return null;}
function quota(s,pid){const p=player(s,pid);return p.stockTurnQuota?.turnId===s.turnId?p.stockTurnQuota:{turnId:s.turnId,boughtCityId:null,boughtTotal:0,invitationUsed:false};}
function planTrade(s,pid,ctx,orders){
 if(JSON.stringify(context(s,pid))!==JSON.stringify(ctx)||!ctx||!Array.isArray(orders)||!orders.length||orders.length>20)throw new Error('股票交易上下文已失效');
 const p=player(s,pid),q=quota(s,pid),w=s.stockWindow,by=ctx.kind==='go'?{...w.boughtByCity}:q.boughtCityId?{[q.boughtCityId]:q.boughtTotal}:{};
 let total=ctx.kind==='go'?w.boughtTotal:q.boughtTotal,cost=0,proceeds=0;const seen=new Set(),items=[];
 for(const o of orders){const st=s.stocks[o.cityId],c=s.cities[o.cityId];if(!st||!c.ownerId||st.clearing||seen.has(o.cityId)||!Number.isSafeInteger(o.shares)||o.shares<1||!['buy','sell'].includes(o.side))throw new Error('股票订单无效');seen.add(o.cityId);
  if(o.quoteVersion!==st.quoteVersion||o.listingEpoch!==st.listingEpoch)throw new Error('股价已更新，请重新确认');
  if(o.side==='buy'){validateBuy(s,pid,o.cityId,o.shares);by[o.cityId]=(by[o.cityId]||0)+o.shares;total+=o.shares;if(total>(ctx.kind==='go'?4:2)||Object.keys(by).length>(ctx.kind==='go'?3:1)||(ctx.kind==='go'&&by[o.cityId]>2))throw new Error('超过本次累计买入额度');cost=econ.safe(cost+st.price*o.shares);items.push({...o,unitIds:st.units.filter(u=>!u.holderId).slice(0,o.shares).map(u=>u.unitId),amount:st.price*o.shares});}
  else{const units=select(s,pid,o.cityId,o.shares);const amount=exit(s,pid,o.cityId,o.shares);proceeds=econ.safe(proceeds+amount);items.push({...o,unitIds:units.map(u=>u.unitId),amount});}
 }
 econ.safe(p.cash+proceeds-cost);if(p.cash+proceeds<cost)throw new Error('现金不足');
 return {pid,ctx,orders:items,by,total,cost,proceeds,revision:s.revision};
}
function applyTrade(s,q,events){
 if(q.revision!==s.revision)throw new Error('交易计划已失效');const p=player(s,q.pid);p.cash=econ.safe(p.cash+q.proceeds-q.cost);
 for(const o of q.orders){const st=s.stocks[o.cityId],seq=++s.stockAcquisitionSeq;for(const id of o.unitIds){const u=st.units[id];if(o.side==='buy')Object.assign(u,{holderId:p.id,bankBasis:st.price,paidCost:st.price,acquiredSeq:seq});else Object.assign(u,{holderId:null,bankBasis:0,paidCost:0,acquiredSeq:seq});}ledger(s,p.id,o.cityId,o.side==='buy'?'systemBuyCost':'bankSaleNet',o.amount);events.push({type:'stock',kind:'stock_trade',playerId:p.id,cityId:o.cityId,shares:o.shares,side:o.side,amount:o.amount,unitPrice:o.amount/o.shares,fee:0,text:p.name+' '+(o.side==='buy'?'买入':'银行回收')+o.cityId+' '+o.shares+'股，'+o.amount});}
 if(q.ctx.kind==='go'){s.stockWindow.boughtByCity=q.by;s.stockWindow.boughtTotal=q.total;}else{const t={...quota(s,p.id)};t.boughtTotal=q.total;t.boughtCityId=Object.keys(q.by)[0]||null;p.stockTurnQuota=t;}sync(s);
}
function bankSell(s,pid,id,n,events,mode='ordinary'){
 const units=select(s,pid,id,n),amount=exit(s,pid,id,n,mode),p=player(s,pid);econ.safe(p.cash+amount);p.cash+=amount;
 for(const u of units)Object.assign(u,{holderId:null,bankBasis:0,paidCost:0,acquiredSeq:++s.stockAcquisitionSeq});ledger(s,pid,id,'bankSaleNet',amount);sync(s);
 events.push({type:'stock',kind:mode==='clear'?'stock_liquidation':'stock_trade',side:'sell',playerId:pid,cityId:id,shares:n,amount,fee:0,text:p.name+' '+id+' '+(mode==='clear'?'清算':'银行回收')+' '+n+'股，到账 '+amount});return amount;
}
function listing(s,id){const st=s.stocks[id];st.units.forEach(u=>Object.assign(u,{holderId:null,bankBasis:0,paidCost:0,acquiredSeq:0}));Object.assign(st,{listingEpoch:st.listingEpoch+1,clearedEpoch:null,clearing:false,listingRoundIndex:s.roundFlow.index,roundRent:0,roundRentCount:0,rentHistory:[],rentHistoryV2:[],lastDividendPerShare:0,lastDividend:{rentalPerShare:0,bankPerShare:0}});sync(s);refresh(s,id);}
function round(s,roundId,events){if(s.lastQuotedRound===roundId)return;s.lastQuotedRound=roundId;for(const [id,st]of Object.entries(s.stocks)){if(!s.cities[id].ownerId||st.clearing)continue;if(roundId>st.listingRoundIndex)st.rentHistoryV2=[...st.rentHistoryV2,{roundId,amount:st.roundRent,count:st.roundRentCount}].slice(-3);st.roundRent=0;st.roundRentCount=0;st.rentHistory=st.rentHistoryV2.map(r=>r.amount);const previous=st.price;refresh(s,id);if(previous!==st.price)events.push({type:'stock',kind:'price_update',cityId:id,amount:st.price-previous,text:id+' 股票报价 '+st.price});}}
function rentPlan(s,q){
 const st=s.stocks[q.cityId],opp=require('./opportunities'),rentalPerShare=Math.floor(econ.rounded(q.income,20)/10),bankPerShare=Math.floor(econ.rounded(q.income,40)/10);let distributed=0;q.stockDividends=[];
 for(const p of s.players.filter(p=>p.alive)){const shares=st.holders[p.id]||0,rental=shares*rentalPerShare,bank=shares*bankPerShare;let extra=0;if(rental&&opp.has(p,'H4'))extra=Math.min(Math.max(0,3000-opp.used(p,'H4')),econ.rounded(rental,50));if(!shares)continue;distributed+=rental;q.cashDeltas[p.id]=econ.safe((q.cashDeltas[p.id]||0)+rental+bank+extra);q.stockDividends.push({playerId:p.id,shares,rental,bank,extra});}
 q.cashDeltas[s.cities[q.cityId].ownerId]=(q.cashDeltas[s.cities[q.cityId].ownerId]||0)+q.income-distributed;q.fundDeltas={};q.stockDividendFacts={rentalPerShare,bankPerShare};q.ownerRentalIncome=q.income-distributed;
}
function rentCommit(s,q,events,settlementId){const st=s.stocks[q.cityId];if(q.income>0)st.roundRentCount++;st.lastDividend=q.stockDividendFacts;st.lastDividendPerShare=q.stockDividendFacts.rentalPerShare+q.stockDividendFacts.bankPerShare;for(const d of q.stockDividends){const p=player(s,d.playerId);ledger(s,p.id,q.cityId,'rentalDividends',d.rental);ledger(s,p.id,q.cityId,'bankBonuses',d.bank);ledger(s,p.id,q.cityId,'opportunityBonuses',d.extra);if(d.extra)require('./opportunities').consume(p,'H4',d.extra);events.push({type:'dividend',kind:'instant_stock_dividend',settlementId:settlementId+':'+p.id,cityId:q.cityId,...d,amount:d.rental+d.bank+d.extra,text:p.name+' '+q.cityId+' 股息：租金 '+d.rental+'，银行 '+d.bank+'，机遇 '+d.extra});}}
function drop(s,pid){for(const st of Object.values(s.stocks))for(const u of st.units)if(u.holderId===pid)Object.assign(u,{holderId:null,bankBasis:0,paidCost:0,acquiredSeq:++s.stockAcquisitionSeq});sync(s);}
function viewFor(s,pid){const ctx=context(s,pid),t=quota(s,pid),w=s.stockWindow,cities={};for(const id of Object.keys(s.stocks)){const units=held(s,pid,id);cities[id]={held:units.length,paidCost:units.reduce((n,u)=>n+u.paidCost,0),bankExitByShares:[0,...units.map((_,i)=>exit(s,pid,id,i+1))],ledger:{...player(s,pid).stockLedger[id]},ownerCap:cap(s,pid,id)};}
 return {context:ctx,quota:ctx?.kind==='go'?{totalLimit:4,cityLimit:3,perCityLimit:2,boughtTotal:w.boughtTotal,boughtByCity:{...w.boughtByCity}}:{totalLimit:2,cityLimit:1,perCityLimit:2,boughtTotal:t.boughtTotal,boughtByCity:t.boughtCityId?{[t.boughtCityId]:t.boughtTotal}:{}},invitationUsed:t.invitationUsed,cities};}
function assert(s){if(!enabled(s))return;for(const [id,st]of Object.entries(s.stocks)){if(st.units.length!==10||new Set(st.units.map(u=>u.unitId)).size!==10)throw new Error('股票份额账本无效');const counts={};for(const u of st.units){for(const k of ['bankBasis','paidCost','acquiredSeq'])if(!Number.isSafeInteger(u[k])||u[k]<0)throw new Error('股票来源金额无效');if(u.holderId){if(!player(s,u.holderId)?.alive)throw new Error('股票持有人无效');counts[u.holderId]=(counts[u.holderId]||0)+1;}}for(const p of s.players)if((counts[p.id]||0)!==(st.holders[p.id]||0)||(p.stocks[id]||0)!==(counts[p.id]||0)||(counts[p.id]||0)>cap(s,p.id,id))throw new Error('股票聚合或上限不一致');}}
module.exports={REVISION,enabled,initialize,quoteBuy,refresh,refreshAll,sync,held,select,exit,cap,validateBuy,context,quota,planTrade,applyTrade,bankSell,listing,round,rentPlan,rentCommit,drop,viewFor,ledger,assert};
