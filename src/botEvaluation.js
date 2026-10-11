'use strict';

// These estimates use public rules and the seat's snapshot, never the hidden dice bag.
const econ = require('./economy');
const {AIRPORTS} = require('./board');
const CONFIG = Object.freeze({steps:8, discount:.92, baseReserve:6000, rentBuffer:.6, stockRatio:.25, cityStockRatio:.1});
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const sum = xs => xs.reduce((a,b)=>a+b,0);
const sorted = values => values.slice().sort((a,b)=>a.id.localeCompare(b.id));

function forecast(view, steps=CONFIG.steps) {
  const result={};
  for(const p of view.players.filter(p=>p.alive)) {
    let mass=Array(42).fill(0);mass[p.position]=1;
    result[p.id]=[];
    for(let t=0;t<Math.min(CONFIG.steps,Math.ceil(steps));t++) {
      const next=Array(42).fill(0),landing=Array(42).fill(0);let go=0;
      for(let i=0;i<42;i++)if(mass[i]) {
        if(t===0&&p.frozen){next[i]+=mass[i];continue;}
        for(let d=1;d<=10;d++) {
          const prob=mass[i]/10;
          if(t===0&&p.jailed&&d!==1&&d!==10){next[i]+=prob;continue;}
          const target=(i+d)%42;next[target]+=prob;landing[target]+=prob;
          if(i+d>=42)go+=prob;
        }
      }
      result[p.id].push({mass:next,landing,go});mass=next;
    }
  }
  return result;
}
function horizon(view) {
  if(view.gameMode!=='quick')return CONFIG.steps;
  const q=view.quickTime;
  if(!q||!Number.isFinite(q.totalRemainingMs)||!Number.isFinite(q.elapsedMs))return 1;
  const completed=Math.max(0,(view.completeRounds||1)-1);
  const roundMs=completed>=3?clamp(q.elapsedMs/completed,15000,180000):60000;
  return clamp(q.totalRemainingMs/roundMs,0,CONFIG.steps);
}
function worldRent(c, view, t=0, level=c.houseLevel) {
  if(c.mortgaged)return 0;
  let n=econ.rentFor({...c,houseLevel:level});
  const w=view.world||{},active=w.active;
  const news=t<(active?.remaining||0)?active:t<(active?.remaining||0)+(w.preview?.remaining||0)?w.preview:null;
  if(news?.region===c.continent&&['boom','slowdown'].includes(news.type))n+=Math.min(3000,Math.round(n*.15))*(news.type==='boom'?1:-1);
  return n;
}
function airportFee(view, id, ownerId=view.airports[id]?.ownerId, count) {
  if(!ownerId)return 0;
  const owner=view.players.find(p=>p.id===ownerId);
  return 3000*(count??owner?.airports.length??0);
}
function squareCost(view, self, sq, t=0) {
  if(sq.cityId) {
    const c=view.cities[sq.cityId];
    if(!c.ownerId||c.ownerId===self.id)return 0;
    return t===0?(view.self.quotes.rent[sq.cityId]?.finalAmount??worldRent(c,view,t)):worldRent(c,view,t);
  }
  if(sq.airportId&&view.airports[sq.airportId]?.ownerId!==self.id)return airportFee(view,sq.airportId);
  return 0;
}
function context(view) {
  const self=view.players.find(p=>p.id===view.self.playerId);
  if(!self)throw new Error('电脑本人状态缺失');
  const h=horizon(view),pred=forecast(view,Math.max(2,h));
  const reachable=pred[self.id]?.[0].landing||[];
  const risk=Math.max(0,...view.board.filter(s=>reachable[s.id]>0).map(s=>squareCost(view,self,s)));
  const expense=view.travelExpense||{};
  const nextExpense=Math.max(expense.currentAmount||0,expense.preview?.roundsUntil<=2?expense.preview.amount:0);
  return {view,self,horizon:h,forecast:pred,reserve:Math.ceil(CONFIG.baseReserve+CONFIG.rentBuffer*risk+2*nextExpense),rentCache:new Map()};
}
function weight(ctx,t,limit=ctx.horizon) {return clamp(limit-t,0,1)*CONFIG.discount**t;}
function goCount(ctx) {return sum(ctx.forecast[ctx.self.id].map((r,t)=>r.go*weight(ctx,t)));}
function expectedHits(ctx, cityId, t) {
  const c=ctx.view.cities[cityId],sq=ctx.view.board.find(s=>s.cityId===cityId);
  return sum(ctx.view.players.filter(p=>p.alive&&p.id!==c.ownerId).map(p=>ctx.forecast[p.id]?.[t]?.landing[sq.id]||0));
}
function rents(ctx, cityId, level) {
  const key=cityId+':'+level;
  if(!ctx.rentCache.has(key))ctx.rentCache.set(key,Array.from({length:Math.ceil(ctx.horizon)},(_,t)=>expectedHits(ctx,cityId,t)*worldRent(ctx.view.cities[cityId],ctx.view,t,level)));
  return ctx.rentCache.get(key);
}
function ownerFactor(ctx,id) {
  return 1-sum(Object.entries(ctx.view.stocks[id]?.holders||{}).filter(([pid])=>pid!==ctx.self.id&&ctx.view.players.some(p=>p.id===pid&&p.alive)).map(([,n])=>n))*.01;
}
function cityIncome(ctx,id,level=ctx.view.cities[id].houseLevel,newOwner=false) {
  const c=ctx.view.cities[id],sq=ctx.view.board.find(s=>s.cityId===id);
  // Transfers settle the existing fund but retain outstanding shares.
  // Future tenants exclude the new owner, not the seller.
  return sum(Array.from({length:Math.ceil(ctx.horizon)},(_,t)=>{
    const hits=newOwner?sum(ctx.view.players.filter(p=>p.alive&&p.id!==ctx.self.id).map(p=>ctx.forecast[p.id]?.[t]?.landing[sq.id]||0)):expectedHits(ctx,id,t);
    return hits*worldRent(c,ctx.view,t,level)*weight(ctx,t)*ownerFactor(ctx,id);
  }));
}
function affordable(ctx,cost) {
  return Number.isSafeInteger(cost)&&cost>=0&&ctx.horizon>0&&ctx.self.cash-cost>=ctx.reserve;
}
function stockAllowed(ctx,id,shares,window=null,memory={}) {
  const {view,self}=ctx,c=view.cities[id],s=view.stocks[id];
  if(!c?.ownerId||c.mortgaged||s?.clearing||!Number.isSafeInteger(shares)||shares<1||shares>2)return false;
  const held=s.holders[self.id]||0,total=sum(Object.values(s.holders));
  if(total+shares>20||(c.ownerId===self.id&&held+shares>4))return false;
  const assets=self.assetSummary?.total||0,value=self.assetSummary?.stockValue||0;
  if(assets<=0||value+shares*s.price>assets*CONFIG.stockRatio||(held+shares)*s.price>assets*CONFIG.cityStockRatio)return false;
  if(window){
    if(memory.windowId===window.windowId&&memory.soldCityIds?.includes(id))return false;
    if(window.boughtTotal+shares>6||(window.boughtByCity[id]||0)+shares>2||(!Object.hasOwn(window.boughtByCity,id)&&Object.keys(window.boughtByCity).length>=3))return false;
  }
  return true;
}
function stockBenefit(ctx,id,shares=1,fee=0) {
  const {view,self}=ctx,c=view.cities[id],s=view.stocks[id];
  const p0=econ.rounded(c.price,20),base=econ.rounded(c.price,30);
  let price=s.operatingPrice,history=s.rentHistory.slice(-3),dividends=0;
  if(!Number.isFinite(price))price=s.price-Math.floor(s.dividendFund/20);
  const selected=view.self.opportunities.selectedIds;
  let bonusLeft=Math.max(0,1000-(view.self.opportunities.usage.H4||0))+goCount(ctx)*1000;
  for(let t=0;t<Math.ceil(ctx.horizon);t++) {
    const projected=rents(ctx,id,c.houseLevel)[t]||0;
    const historic=c.mortgaged?0:clamp(history.length?sum(history)/history.length:projected,0,worldRent(c,view,t)*Math.max(1,view.players.filter(p=>p.alive).length-1)*2);
    const rent=c.mortgaged?0:projected*.7+historic*.3;
    history=[...history,rent].slice(-3);
    const r=sum(history),revenue=r>0?Math.min(Math.round(p0*.15),Math.round(p0*r/(60*base))):-Math.round(p0*.05);
    const target=clamp(p0+Math.round(p0*.15*c.houseLevel)+revenue-(c.mortgaged?Math.round(p0*.15):0),p0*.5,p0*2);
    price+=clamp(target-price,-Math.round(price*.1),Math.round(price*.1))*clamp(ctx.horizon-t,0,1);
    const cash=rent*.01*shares*weight(ctx,t);
    if(c.ownerId!==self.id)dividends+=cash;
    if(selected.includes('H4')){const bonus=Math.min(bonusLeft,cash*.2);dividends+=bonus;bonusLeft-=bonus;}
  }
  let synergy=0;
  if(selected.includes('H5')&&!(s.holders[self.id]>0)){
    const owned=Object.keys(view.stocks).filter(cid=>view.stocks[cid].holders[self.id]>0&&view.cities[cid].ownerId&&!view.cities[cid].mortgaged);
    if(owned.length===2)synergy+=2000*goCount(ctx);
  }
  if(selected.includes('H6')&&c.ownerId!==self.id&&!(s.holders[self.id]>0)) {
    const sq=view.board.find(sq=>sq.cityId===id);
    const cut=sum(ctx.forecast[self.id].map((row,t)=>row.landing[sq.id]*Math.min(1000,worldRent(c,view,t)*.1)*weight(ctx,t)));
    synergy+=Math.min(cut,Math.max(0,2000-(view.self.opportunities.usage.H6||0))+goCount(ctx)*2000);
  }
  const initial=s.operatingPrice??s.price-Math.floor(s.dividendFund/20);
  return {assetDelta:(price-initial)*shares-fee,expectedIncome:dividends+synergy,riskPenalty:0};
}
function promotionValue(ctx,id,reward,remainingRewards=2,limit=2) {
  return Math.min(remainingRewards,sum(Array.from({length:Math.ceil(Math.min(limit,ctx.horizon))},(_,t)=>expectedHits(ctx,id,t)*weight(ctx,t,Math.min(limit,ctx.horizon)))))*reward;
}
function evaluate(ctx,candidate) {
  const {view,self}=ctx,c=view.cities[candidate.cityId],cost=candidate.cashCost||0;
  let assetDelta=0,expectedIncome=0,riskPenalty=0;
  switch(candidate.kind) {
    case 'city': {
      assetDelta=econ.cityTotalValue(c)-cost;expectedIncome=cityIncome(ctx,c.id,c.houseLevel,true);
      if(view.self.opportunities.selectedIds.includes('H10')&&self.cities.length===2)expectedIncome-=2000*goCount(ctx);
      if(view.self.opportunities.selectedIds.includes('H9'))for(const [aid,a]of Object.entries(AIRPORTS))if(a.adjacentCity===c.id&&view.airports[aid].ownerId===self.id){
        const pairs=Object.entries(AIRPORTS).filter(([k,v])=>view.airports[k].ownerId===self.id&&view.cities[v.adjacentCity].ownerId===self.id&&!view.cities[v.adjacentCity].mortgaged).length;
        if(pairs<2)expectedIncome+=1500*goCount(ctx);
      }
      break;
    }
    case 'build':assetDelta=econ.buildFee(c)-cost;expectedIncome=cityIncome(ctx,c.id,c.houseLevel+1)-cityIncome(ctx,c.id);break;
    case 'promote': {
      assetDelta=-cost;expectedIncome=promotionValue(ctx,c.id,candidate.quote.reward);
      const old=(view.promotions||[]).find(p=>p.playerId===self.id);
      if(old)expectedIncome-=promotionValue(ctx,old.cityId,old.reward,old.remainingRewards,Math.max(0,old.expiresAfterCompleteRound-view.completeRounds+1));
      break;
    }
    case 'stock':({assetDelta,expectedIncome,riskPenalty}=stockBenefit(ctx,c.id,candidate.shares,candidate.quote?.fee||0));break;
    case 'airport': {
      assetDelta=15000-cost;
      const sq=view.board.find(s=>s.airportId===candidate.target),count=self.airports.length+1;
      expectedIncome=sum(view.players.filter(p=>p.alive&&p.id!==self.id).flatMap(p=>ctx.forecast[p.id].map((row,t)=>row.landing[sq.id]*airportFee(view,candidate.target,self.id,count)*weight(ctx,t))));
      // Owning one more airport also increases receipts at airports already owned.
      for(const aid of self.airports){const oldSq=view.board.find(s=>s.airportId===aid);expectedIncome+=sum(view.players.filter(p=>p.alive&&p.id!==self.id).flatMap(p=>ctx.forecast[p.id].map((row,t)=>row.landing[oldSq.id]*3000*weight(ctx,t))));}
      if(view.self.opportunities.selectedIds.includes('H9')){
        const adj=AIRPORTS[candidate.target].adjacentCity;
        const pairs=Object.entries(AIRPORTS).filter(([aid,a])=>view.airports[aid].ownerId===self.id&&view.cities[a.adjacentCity].ownerId===self.id&&!view.cities[a.adjacentCity].mortgaged).length;
        if(pairs<2&&view.cities[adj].ownerId===self.id&&!view.cities[adj].mortgaged)expectedIncome+=1500*goCount(ctx);
      }
      break;
    }
    default:throw new Error('未知经营评估类型');
  }
  const score=assetDelta+expectedIncome-riskPenalty;
  return {...candidate,assetDelta,expectedIncome,riskPenalty,score:Number.isFinite(score)?score:-Infinity};
}
function pathValue(ctx,position,steps=2, released=true) {
  const p={...ctx.self,position,...(released?{frozen:false,jailed:false}:{})};
  const rows=forecast({...ctx.view,players:[p]},steps)[p.id];
  const limit=Math.min(steps,ctx.horizon);
  return sum(rows.map((row,t)=>(row.go*10000-sum(ctx.view.board.map(sq=>row.landing[sq.id]*squareCost(ctx.view,p,sq,t))))*weight(ctx,t,limit)));
}
function releasedBusiness(ctx,cost) {
  const active=ctx.view.self.activeManagement;
  if(!active||active.usedThisTurn!==false)return 0;
  const view={...ctx.view,players:ctx.view.players.map(p=>p.id===ctx.self.id?{...p,cash:p.cash-cost,jailed:false,frozen:false}:p)};
  const next=context(view),o=view.self.opportunities,options=[];
  for(const c of Object.values(view.cities)){
    if(c.ownerId===next.self.id&&!c.mortgaged){
      if(c.houseLevel<4){
        const base=econ.buildFee(c),cap=econ.rounded(base,10);
        const h1=o.selectedIds.includes('H1')&&!o.usage.H1?cap:0,h2=o.selectedIds.includes('H2')&&!o.usage.H2?Math.min(1500,cap):0;
        const chain=Object.values(view.cities).filter(x=>x.ownerId===next.self.id&&!x.mortgaged&&x.group===c.group).length>=2;
        const h3=chain&&o.selectedIds.includes('H3')&&!o.usage.H3?Math.min(1500,cap):0;
        // Construction-news quota is not present outside a usable quote: do not assume it.
        options.push({kind:'build',cityId:c.id,cashCost:econ.rounded(base,145)-Math.min(cap,h1+h2+h3)});
      }
      if(!active.quota.promotionStartedLap)options.push({kind:'promote',cityId:c.id,cashCost:Math.min(econ.rounded(c.price,4),800),quote:{reward:Math.min(econ.rounded(c.price,8),1200)}});
    }
    for(const shares of [1,2])if(stockAllowed(next,c.id,shares)&&active.quota.stockBoughtTotal+shares<=4&&(active.quota.stockBoughtByCity[c.id]||0)+shares<=2){
      const base=view.stocks[c.id].price*shares,fee=econ.rounded(base,1);options.push({kind:'stock',cityId:c.id,shares,cashCost:base+fee,quote:{fee}});
    }
  }
  return Math.max(0,...options.filter(c=>affordable(next,c.cashCost)).map(c=>evaluate(next,c).score));
}
function opportunityValue(ctx,id) {
  const {view,self}=ctx,own=sorted(Object.values(view.cities).filter(c=>c.ownerId===self.id&&!c.mortgaged)),o=view.self.opportunities,g=goCount(ctx);
  const count=Object.keys(view.stocks).filter(cid=>view.stocks[cid].holders[self.id]>0&&view.cities[cid].ownerId&&!view.cities[cid].mortgaged).length;
  const remaining=(cap,key)=>Math.max(0,cap-(o.usage[key]||0))+g*cap;
  const buildable=own.filter(c=>c.houseLevel<4&&self.cash-econ.buildFee(c)*1.45>=ctx.reserve);
  switch(id) {
    case 'H1':case 'H2':case 'H3': {
      const eligible=buildable.filter(c=>id!=='H3'||own.filter(x=>x.group===c.group).length>=2);
      const cuts=eligible.map(c=>id==='H1'&&view.activeManagementRevision?econ.buildFee(c)*.1:Math.min(id==='H1'?Infinity:1500,econ.buildFee(c)*.1));
      return Math.max(0,...cuts)*Math.min(eligible.length,remaining(1,id));
    }
    case 'H4':return Math.min(remaining(1000,'H4'),sum(Object.keys(view.stocks).map(cid=>sum(rents(ctx,cid,view.cities[cid].houseLevel).map((r,t)=>r*.002*(view.stocks[cid].holders[self.id]||0)*weight(ctx,t))))));
    case 'H5': {
      if(count>=3)return 2000*g;
      const missing=3-count,choices=Object.keys(view.stocks).filter(cid=>!(view.stocks[cid].holders[self.id]>0)&&stockAllowed(ctx,cid,1)).map(cid=>{
        const cost=view.stocks[cid].price,fee=econ.rounded(cost,1),b=stockBenefit({...ctx,view:{...view,self:{...view.self,opportunities:{...o,selectedIds:o.selectedIds.filter(id=>id!=='H5')}}}},cid,1,fee);
        return {cost:cost+fee,loss:Math.max(0,-b.assetDelta-b.expectedIncome)};
      }).sort((a,b)=>a.cost-b.cost).slice(0,missing);
      if(choices.length!==missing||sum(choices.map(c=>c.cost))>self.cash-ctx.reserve||ctx.horizon<missing)return 0;
      // Diversification needs future actions; discount the reward for the time to complete them.
      return Math.max(0,2000*g*CONFIG.discount**missing-sum(choices.map(c=>c.loss)));
    }
    case 'H6': {
      const cuts=sum(Object.keys(view.stocks).filter(cid=>view.stocks[cid].holders[self.id]>0&&view.cities[cid].ownerId!==self.id).map(cid=>{
        const sq=view.board.find(s=>s.cityId===cid);return sum(ctx.forecast[self.id].map((row,t)=>row.landing[sq.id]*Math.min(1000,worldRent(view.cities[cid],view,t)*.1)*weight(ctx,t)));
      }));return Math.min(remaining(2000,'H6'),cuts);
    }
    case 'H7':return Math.max(0,...Object.values(view.self.quotes.flight).filter(q=>q.ok&&q.baseAmount>0&&pathValue(ctx,view.board.find(s=>s.airportId===q.target).id)-pathValue(ctx,self.position)>q.finalAmount).map(q=>Math.min(1500,q.baseAmount*.2)))*Math.min(1,remaining(1,'H7'));
    case 'H8':return sum(view.board.filter(s=>s.airportId&&!o.visitedAirportIds.includes(s.airportId)).map(sq=>Math.min(1,sum(ctx.forecast[self.id].map((r,t)=>r.landing[sq.id]*weight(ctx,t))))*2000));
    case 'H9':return Math.min(3000,Object.entries(AIRPORTS).filter(([aid,a])=>view.airports[aid].ownerId===self.id&&view.cities[a.adjacentCity].ownerId===self.id&&!view.cities[a.adjacentCity].mortgaged).length*1500)*g;
    case 'H10':return self.cities.length<=2?2000*g:0;
    case 'H11':return Math.min(remaining(1,'H11')*2000,sum(ctx.forecast[self.id].map((r,t)=>sum(view.board.filter(s=>s.cityId&&view.cities[s.cityId].ownerId&&view.cities[s.cityId].ownerId!==self.id).map(sq=>r.landing[sq.id]*Math.min(2000,worldRent(view.cities[sq.cityId],view,t)*.2)))*weight(ctx,t))));
    case 'H12':return o.oneTimeRewards?.H12?0:6000;
    default:return 0;
  }
}
function routeValue(ctx,ids) {
  let value=sum(ids.map(id=>opportunityValue(ctx,id)));
  // The active construction discount cap is shared: H1/H2/H3 are not additive.
  if(ctx.view.activeManagementRevision){const build=ids.filter(id=>['H1','H2','H3'].includes(id)).map(id=>opportunityValue(ctx,id));value-=sum(build)-Math.max(0,...build);}
  return value;
}
function changedBonusLoss(ctx,view,ids) {
  const next={...ctx,view,rentCache:new Map()};
  return sum(ids.filter(id=>ctx.view.self.opportunities.selectedIds.includes(id)).map(id=>Math.max(0,opportunityValue(ctx,id)-opportunityValue(next,id))));
}
function liquidation(ctx,deficit,includeStocks=true) {
  const {view,self}=ctx,options=[];
  if(includeStocks)for(const id of Object.keys(view.stocks).sort()){
    const st=view.stocks[id],held=st.holders[self.id]||0;
    if(view.cities[id].ownerId&&!st.clearing&&held>0&&st.price>0){
      const shares=Math.min(held,Math.ceil(deficit/st.price)),benefit=stockBenefit(ctx,id,shares);
      const after={...view,stocks:{...view.stocks,[id]:{...st,holders:{...st.holders,[self.id]:held-shares}}}};
      const bonusLoss=changedBonusLoss(ctx,after,['H5','H6']);
      options.push({action:{type:'rescue_sell_stock',cityId:id,shares,quoteVersion:st.quoteVersion},amount:shares*st.price,loss:benefit.assetDelta+benefit.expectedIncome+bonusLoss});
    }
  }
  const own=sorted(Object.values(view.cities).filter(c=>c.ownerId===self.id));
  for(const c of own.filter(c=>!c.mortgaged)){
    if(own.filter(x=>x.mortgaged).length<2){
      const amount=econ.mortgageValue(c),after={...view,cities:{...view.cities,[c.id]:{...c,mortgaged:true}}};
      const next={...ctx,view:after,rentCache:new Map()},held=view.stocks[c.id].holders[self.id]||0;
      const stockLoss=held?stockBenefit(ctx,c.id,held).assetDelta-stockBenefit(next,c.id,held).assetDelta:0;
      options.push({action:{type:'rescue_mortgage',cityId:c.id},amount,loss:cityIncome(ctx,c.id)+amount*.05*ctx.horizon+stockLoss+changedBonusLoss(ctx,after,['H3','H4','H5','H9'])});
    }
    const q=view.self.quotes.demolish[c.id];
    if(q?.ok&&q.finalAmount<0){
      const after={...view,cities:{...view.cities,[c.id]:{...c,houseLevel:c.houseLevel-1}}},next={...ctx,view:after,rentCache:new Map()},held=view.stocks[c.id].holders[self.id]||0;
      const stockLoss=held?stockBenefit(ctx,c.id,held).assetDelta-stockBenefit(next,c.id,held).assetDelta:0;
      options.push({action:{type:'rescue_demolish',cityId:c.id,quoteVersion:q.quoteVersion},amount:-q.finalAmount,loss:econ.buildFee(c)+q.finalAmount+cityIncome(ctx,c.id)-cityIncome(ctx,c.id,c.houseLevel-1)+stockLoss+changedBonusLoss(ctx,after,['H4'])});
    }
  }
  return options.sort((a,b)=>a.loss/a.amount-b.loss/b.amount||a.action.cityId.localeCompare(b.action.cityId)||a.action.type.localeCompare(b.action.type));
}
module.exports={CONFIG,context,forecast,evaluate,opportunityValue,routeValue,goCount,cityIncome,stockBenefit,stockAllowed,affordable,pathValue,releasedBusiness,liquidation};
