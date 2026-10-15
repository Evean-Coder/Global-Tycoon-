(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StockInvestmentView=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const enabled=s=>s?.stockInvestmentRevision==='stock-investment-v2';
 const exit=(s,id,n)=>s.self?.stockInvestment?.cities[id]?.bankExitByShares[n]??0;
 function preview(s,pid,draft){
  const data=s.self.stockInvestment,q=data.quota,p=s.players.find(p=>p.id===pid),used=q.boughtByCity,buys=Object.keys(draft).filter(id=>draft[id].buy>0),selectedTotal=buys.reduce((n,id)=>n+draft[id].buy,0),cities=new Set([...Object.keys(used).filter(id=>used[id]>0),...buys]);let cost=0,proceeds=0,quoteChanged=false;const rows={},errors=[];
  for(const [id,d]of Object.entries(draft)){cost+=(d.buy||0)*s.stocks[id].price;proceeds+=exit(s,id,d.sell||0);}
  for(const [id,st]of Object.entries(s.stocks)){const c=s.cities[id],d=draft[id]||{buy:0,sell:0},held=st.holders[pid]||0,supply=10-Object.values(st.holders).reduce((n,v)=>n+v,0),cityRoom=Math.max(0,q.perCityLimit-(used[id]||0)),otherCities=new Set([...Object.keys(used).filter(id=>used[id]>0),...buys.filter(cid=>cid!==id)]),qualified=!!c.ownerId&&!st.clearing;
   const cap=c.ownerId===pid?2:4,room=Math.max(0,q.totalLimit-q.boughtTotal-selectedTotal+d.buy),cashRoom=Math.max(0,Math.floor((p.cash+proceeds-cost+d.buy*st.price)/st.price)),maxBuy=qualified&&(otherCities.has(id)||otherCities.size<q.cityLimit)?Math.max(0,Math.min(cityRoom,room,supply,cap-held,cashRoom)):0,reasons=[];
   if(!qualified)reasons.push('城市尚未上市或正在清算');if(held>=cap)reasons.push('本人持股上限'+cap+'股');if(cityRoom===0||room===0)reasons.push('本次累计买入额度已用完');if(!supply)reasons.push('市场份额已售完，可向玩家收购');if(cashRoom<=0)reasons.push('现金不足');if(!otherCities.has(id)&&otherCities.size>=q.cityLimit)reasons.push('本次可买城市数已满');
   const changed=!!(d.buy||d.sell)&&!!d.basis&&(d.basis.quoteVersion!==st.quoteVersion||d.basis.listingEpoch!==st.listingEpoch||d.basis.exit!==exit(s,id,d.sell||0));quoteChanged||=changed;
   if((d.buy||d.sell)&&(!qualified||d.buy>maxBuy||d.sell>held||d.buy&&d.sell))errors.push(id+'：额度、持股或资金条件不符');
   rows[id]={held,supply,cityRoom,maxBuy,qualified,changed,reasons,canIncrementBuy:!!data.context&&d.buy<maxBuy&&!d.sell,canIncrementSell:!!data.context&&qualified&&d.sell<held&&!d.buy};
  }
  if(cities.size>q.cityLimit||q.boughtTotal+selectedTotal>q.totalLimit)errors.push('超过本次累计买入额度');if(cost>p.cash+proceeds)errors.push('现金不足');
  return {rows,cost,proceeds,netCash:p.cash+proceeds-cost,errors,quoteChanged,usedTotal:q.boughtTotal,usedCities:Object.keys(used).filter(id=>used[id]>0).length,selectedTotal,remaining:Math.max(0,q.totalLimit-q.boughtTotal-selectedTotal),cityRemaining:Math.max(0,q.cityLimit-cities.size)};
 }
 function facts(s,id){const st=s.stocks[id],own=s.self.stockInvestment.cities[id],l=own.ledger;return {held:own.held,paidCost:own.paidCost,exit:exit(s,id,own.held),marketValue:st.price*own.held,rental:l.rentalDividends||0,bank:l.bankBonuses||0,extra:l.opportunityBonuses||0,buyCost:(l.systemBuyCost||0)+(l.playerBuyCost||0),sold:(l.bankSaleNet||0)+(l.playerSaleNet||0),systemBuyCost:l.systemBuyCost||0,playerBuyCost:l.playerBuyCost||0,bankSaleNet:l.bankSaleNet||0,playerSaleNet:l.playerSaleNet||0,cashNet:(l.bankSaleNet||0)+(l.playerSaleNet||0)+(l.rentalDividends||0)+(l.bankBonuses||0)+(l.opportunityBonuses||0)-(l.systemBuyCost||0)-(l.playerBuyCost||0),rentAmount:(st.rentHistoryV2||[]).reduce((n,r)=>n+r.amount,0),rentCount:(st.rentHistoryV2||[]).reduce((n,r)=>n+r.count,0)};}
 return {enabled,exit,preview,facts};
});
