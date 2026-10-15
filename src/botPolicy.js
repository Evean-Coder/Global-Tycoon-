'use strict';

const econ=require('./economy'),ev=require('./botEvaluation');
function requiredAction(v){const a=v.self.activeManagement;if(a?.optional&&a.available)return {type:'active_skip'};if(!a?.required)return null;const q=a.quotes.filter(q=>q.ok).sort((a,b)=>a.finalAmount-b.finalAmount||a.type.localeCompare(b.type)||a.cityId.localeCompare(b.cityId)||(a.shares||0)-(b.shares||0))[0];return q?{type:q.type,cityId:q.cityId,shares:q.shares,listingEpoch:q.listingEpoch,quoteVersion:q.quoteVersion}:null;}
const actionKey=a=>[a.type,a.cityId||a.target||'',a.shares||0,a.orders?.[0]?.cityId||''].join('|');
function best(ctx,options){return options.filter(c=>ev.affordable(ctx,c.cashCost)).map(c=>ev.evaluate(ctx,c)).filter(c=>c.score>1e-6).sort((a,b)=>b.score-a.score||actionKey(a.action||{}).localeCompare(actionKey(b.action||{})))[0];}
function cityCandidate(id,cost,action){return {kind:'city',cityId:id,cashCost:cost,action};}
function stockCandidate(id,shares,quote,action){return {kind:'stock',cityId:id,shares,quote,cashCost:quote.finalAmount,action};}

function fundraising(ctx,target) {
  const c=ctx.view.cities[target.cityId],cost=target.kind==='city'?c?.price:15000;
  if(!Number.isSafeInteger(cost)||(target.kind==='city'&&(!c||c.ownerId||ctx.self.lapBuys>=4)))return null;
  const candidate=target.kind==='city'?cityCandidate(c.id,cost,null):{kind:'airport',target:target.airportId,cashCost:cost};
  const value=ev.evaluate(ctx,candidate).score;
  if(value<=0||ctx.horizon<=0)return null;
  if(ctx.self.cash-cost>=ctx.reserve)return {type:'buy_fundraise',decision:'confirm'};
  const copy=JSON.parse(JSON.stringify(ctx.view));let loss=0,first=null;
  // Bounded by the finite city inventory and existing house levels.
  const stepLimit=1+Object.values(copy.cities).filter(c=>c.ownerId===ctx.self.id&&!c.mortgaged).reduce((n,c)=>n+1+(c.houseLevel||0),0);
  for(let step=0;step<stepLimit;step++){
    const current=ev.context(copy),needed=cost+current.reserve-current.self.cash;
    if(needed<=0)return loss<value?first:null;
    const tool=ev.liquidation(current,needed,false)[0];
    if(!tool)return null;
    first ||= tool.action;loss+=tool.loss;
    if(loss>=value)return null;
    current.self.cash+=tool.amount;
    const city=copy.cities[tool.action.cityId];
    if(tool.action.type==='rescue_mortgage')city.mortgaged=true;
    else {city.houseLevel--;city.buildCosts?.pop();}
    for(const owned of Object.values(copy.cities).filter(x=>x.ownerId===current.self.id))copy.self.quotes.demolish[owned.id]=owned.houseLevel&&!owned.mortgaged?{ok:true,finalAmount:-econ.refundFor(owned)}:{ok:false};
  }
  return null;
}
function rescue(v,memory={},simple=false) {
  const p=v.players.find(p=>p.id===v.self.playerId);
  if(p.cash>=0)return {type:'rescue_done'};
  if(simple){
    for(const id of Object.keys(v.stocks).sort()){
      const s=v.stocks[id],held=s.holders[p.id]||0;
      if(v.cities[id].ownerId&&!s.clearing&&held>0&&s.price>0)return {type:'rescue_sell_stock',cityId:id,shares:Math.min(held,Math.ceil(-p.cash/s.price)),quoteVersion:s.quoteVersion};
    }
    const own=Object.values(v.cities).filter(c=>c.ownerId===p.id).sort((a,b)=>a.price-b.price||a.id.localeCompare(b.id));
    {const c=own.find(c=>!c.mortgaged);if(c)return {type:'rescue_mortgage',cityId:c.id};}
    const c=own.find(c=>v.self.quotes.demolish[c.id]?.ok);
    if(c)return {type:'rescue_demolish',cityId:c.id,quoteVersion:v.self.quotes.demolish[c.id].quoteVersion};
  }else{
    const tools=ev.liquidation(ev.context(v),-p.cash);
    if(tools.length)return tools[0].action;
  }
  const cities=Object.values(v.cities).filter(c=>c.ownerId===p.id&&!c.mortgaged&&!(memory.saleAttempts||[]).includes(c.id));
  const ctx=simple?null:ev.context(v);
  cities.sort((a,b)=>ctx?(econ.cityTotalValue(a)*.4+ev.cityIncome(ctx,a.id))-(econ.cityTotalValue(b)*.4+ev.cityIncome(ctx,b.id))||a.id.localeCompare(b.id):a.price-b.price||a.id.localeCompare(b.id));
  return cities.length?{type:'sell_city',cityId:cities[0].id,mode:'auction'}:{type:'rescue_done'};
}
function choose(v,memory={}) {
  const ctx=ev.context(v),p=ctx.self,q=v.self.quotes;
  if(v.stockInvestmentRevision==='stock-investment-v2'){
    const incoming=(v.self.stockOffers||[]).find(o=>o.status==='pending'&&o.makerId!==p.id);
    if(incoming){const protectedActor=v.pending?.awaiting||v.pending?.targetId||v.pending?.playerId||v.players[v.turnIndex]?.id,protectedSelf=protectedActor===p.id&&!['waiting_roll','stock','opportunity_choose','route_choose'].includes(v.phase),b=ev.stockBenefit(ctx,incoming.cityId,incoming.shares),ownExit=v.self.stockInvestment.cities[incoming.cityId].bankExitByShares[incoming.shares]||0,value=incoming.buyerId===p.id?incoming.recipientExit+b.expectedIncome-incoming.cash:incoming.cash-incoming.fee-ownExit-b.expectedIncome;return {type:'stock_offer_reply',offerId:incoming.offerId,offerVersion:incoming.version,accept:!protectedSelf&&value>0&&(incoming.buyerId!==p.id||ev.affordable(ctx,incoming.cash))};}
    const own=(v.self.stockOffers||[]).find(o=>o.status==='pending'&&o.makerId===p.id);if(own)return null;
  }
  switch(v.phase) {
    case 'opportunity_choose': {
      const c=v.self.choice;
      const id=c.candidateIds.slice().sort((a,b)=>ev.routeValue(ctx,[...v.self.opportunities.selectedIds,b])-ev.routeValue(ctx,[...v.self.opportunities.selectedIds,a])||a.localeCompare(b))[0];
      return {type:'opportunity_choose',stageId:c.stageId,candidateVersion:c.candidateVersion,opportunityId:id};
    }
    case 'route_choose': {
      const c=v.self.routeChoice,held=v.self.opportunities.selectedIds,options=[];
      for(const newId of c.candidateIds.filter(id=>!held.includes(id)&&!(id==='H12'&&v.self.opportunities.oneTimeRewards?.H12)))for(const replaceId of held.length===3?held:[null]){
        const score=ev.routeValue(ctx,[...held.filter(id=>id!==replaceId),newId])-ev.routeValue(ctx,held);
        options.push({newId,replaceId,score});
      }
      const best=options.filter(o=>o.score>1e-6).sort((a,b)=>b.score-a.score||a.newId.localeCompare(b.newId)||String(a.replaceId).localeCompare(String(b.replaceId)))[0];
      const envelope={opportunityId:c.opportunityId,candidateVersion:c.candidateVersion};
      return best?{type:'route_confirm',...envelope,newId:best.newId,replaceId:best.replaceId}:{type:'route_skip',...envelope};
    }
    case 'waiting_roll': {
      if(v.self.activeManagement?.balanced&&v.gameMode==='quick'&&ctx.horizon<1)return requiredAction(v)||{type:'roll_dice'};
      if((memory.steps||0)>=6)return requiredAction(v)||{type:'roll_dice'};
      const missions=v.self.businessMission;
      if(missions&&!missions.active&&!missions.coupon&&ctx.horizon>=2&&p.cash>=ctx.reserve+6500){
        const city=v.board.filter(sq=>sq.cityId&&((sq.id-p.position+42)%42)>0&&((sq.id-p.position+42)%42)<=10).map(sq=>v.cities[sq.cityId]).find(c=>c.ownerId===p.id&&!c.mortgaged&&c.houseLevel<4&&p.cash-econ.buildFee(c)>=ctx.reserve+6000&&ev.evaluate(ctx,{kind:'build',cityId:c.id,cashCost:econ.buildFee(c)}).score>0);
        const paidAirport=v.board.some(sq=>sq.airportId&&((sq.id-p.position+42)%42)>0&&((sq.id-p.position+42)%42)<=10&&v.airports[sq.airportId].ownerId&&v.airports[sq.airportId].ownerId!==p.id);
        const type=city?'build':paidAirport?'flight':null;
        if(type&&missions.quotes[type]?.ok)return {type:'mission_manage',missionType:type,quoteVersion:missions.quotes[type].quoteVersion};
      }
      const support=best(ctx,(v.self.propertySupport?.candidates||[]).filter(c=>c.ok&&p.lapBuys<4).map(c=>cityCandidate(c.cityId,c.finalAmount,{type:'support_buy',cityId:c.cityId,quoteVersion:c.quoteVersion})));
      if(support)return v.self.propertySupport?.budgetPurchase?{type:'support_buy',cityIds:[support.action.cityId],quoteVersion:v.self.propertySupport.selectionVersion}:support.action;
      const active=v.self.activeManagement,options=[];
      if(v.stockInvestmentRevision==='stock-investment-v2'){
        for(const id of Object.keys(v.stocks))for(const shares of [1,2])if(ev.stockAllowed(ctx,id,shares))options.push(stockCandidate(id,shares,{finalAmount:v.stocks[id].price*shares},{type:'stock_trade',stockContext:v.self.stockInvestment.context,orders:[{cityId:id,side:'buy',shares,quoteVersion:v.stocks[id].quoteVersion,listingEpoch:v.stocks[id].listingEpoch}]}));
        if(!v.self.stockInvestment.invitationUsed&&ctx.horizon>=2){for(const id of Object.keys(v.stocks).sort()){const st=v.stocks[id],held=st.holders[p.id]||0,cap=v.cities[id].ownerId===p.id?2:4;if(!v.cities[id].ownerId||Object.values(st.holders).reduce((n,v)=>n+v,0)<10||held>=cap)continue;const target=v.players.find(x=>x.id!==p.id&&x.alive&&x.connected!==false&&st.holders[x.id]>0);if(!target)continue;const b=ev.stockBenefit(ctx,id,1);if(b.expectedIncome>st.price*.15&&ev.affordable(ctx,st.price))return {type:'stock_offer_create',side:'buy',targetId:target.id,cityId:id,shares:1,cash:st.price,stockContext:v.self.stockInvestment.context,quoteVersion:st.quoteVersion,listingEpoch:st.listingEpoch};}}
      }
      for(const c of active?.available?active.quotes:[])if(c.ok){
        const action={type:c.type,cityId:c.cityId,quoteVersion:c.quoteVersion,...(c.targetKind?{targetKind:c.targetKind}:{}),...(c.shares?{shares:c.shares,listingEpoch:c.listingEpoch}:{})};
        if(c.type==='active_stock_buy'){if(ev.stockAllowed(ctx,c.cityId,c.shares))options.push(stockCandidate(c.cityId,c.shares,c,action));}
        else options.push({kind:c.type==='active_build'?'build':c.type==='active_order'?'order':'promote',cityId:c.cityId,cashCost:c.finalAmount,quote:c,action});
      }
      return best(ctx,options)?.action||requiredAction(v)||{type:'roll_dice'};
    }
    case 'buy':case 'buy_airport': {
      const airport=v.phase==='buy_airport',id=airport?v.pending.airportId:v.pending.cityId,cost=airport?15000:v.cities[id].price;
      const candidate=airport?{kind:'airport',target:id,cashCost:cost}:cityCandidate(id,cost,null);
      if((airport||p.lapBuys<4)&&best(ctx,[candidate]))return {type:v.phase,decision:'buy'};
      if(p.cash<cost&&fundraising(ctx,airport?{kind:'airport',airportId:id}:{kind:'city',cityId:id}))return {type:'buy_fundraise',decision:'start'};
      return {type:v.phase,decision:'pass'};
    }
    case 'build_decide': {
      const c=q.build[v.pending.cityId],candidate={kind:'build',cityId:v.pending.cityId,cashCost:c?.finalAmount};
      return c?.ok&&best(ctx,[candidate])?{type:'respond_build',decision:'build',quoteVersion:c.quoteVersion}:{type:'respond_build',decision:'pass'};
    }
    case 'buy_fundraise':return fundraising(ctx,v.pending.target)||{type:'buy_fundraise',decision:'cancel'};
    case 'self_rescue':return rescue(v,memory);
    case 'frozen_turn':case 'jail_turn': {
      const jail=v.phase==='jail_turn',cost=jail?15000:5000;
      const improvement=ev.pathValue(ctx,p.position,1)-ev.pathValue(ctx,p.position,1,false);
      return {type:jail?'respond_jail':'respond_frozen',decision:ev.affordable(ctx,cost)&&improvement+ev.releasedBusiness(ctx,cost)>cost?'pay':jail?'roll':'pass'};
    }
    case 'flight': {
      const stay=ev.pathValue(ctx,p.position),options=[];
      for(const [target,c]of Object.entries(q.flight))if(c.ok&&ev.affordable(ctx,c.finalAmount)){
        const position=v.board.find(s=>s.airportId===target)?.id;
        if(position!==undefined)options.push({target,quoteVersion:c.quoteVersion,score:ev.pathValue(ctx,position)-stay-c.finalAmount});
      }
      const option=options.filter(o=>o.score>1e-6).sort((a,b)=>b.score-a.score||a.target.localeCompare(b.target))[0];
      return option?{type:'flight',target:option.target,quoteVersion:option.quoteVersion}:{type:'flight',target:null};
    }
    case 'trade_confirm': {
      const offer=v.pending;let value=0,valid=offer.targetId===p.id&&Number.isSafeInteger(offer.cash)&&offer.cash>=0&&ev.affordable(ctx,offer.cash)&&offer.items?.length>=1&&offer.items.length<=3;
      const seen=new Set();
      for(const item of offer.items||[]){
        const c=v.cities[item.cityId],s=v.stocks[item.cityId];
        if(!c?.ownerId||!s||s.clearing||item.shares!==1||seen.has(item.cityId)||(s.holders[offer.fromId]||0)<1||(c.ownerId===p.id&&(s.holders[p.id]||0)>=4))valid=false;
        else{const benefit=ev.stockBenefit(ctx,item.cityId);value+=s.price+benefit.assetDelta+benefit.expectedIncome;}
        seen.add(item.cityId);
      }
      return {type:'stock_transfer',accept:!!valid&&value-offer.cash>1e-6};
    }
    case 'direct_sale_ask':return {type:'direct_sale_respond',decision:p.lapBuys<4&&best(ctx,[cityCandidate(v.pending.cityId,econ.cityTotalValue(v.cities[v.pending.cityId]),null)])?'buy':'pass'};
    case 'auction_bid': {
      const a=v.pending,c=v.cities[a.cityId],amount=a.currentBid>0?a.currentBid+1000:Math.round(econ.cityTotalValue(c)*.75);
      if(a.currentBidder===p.id)return {type:'auction_respond',decision:'end'};
      return p.lapBuys<4&&best(ctx,[cityCandidate(c.id,amount,null)])?{type:'auction_respond',decision:'bid',amount}:{type:'auction_respond',decision:'pass'};
    }
    case 'stock': {
      const w=v.self.stockWindow;
      if(!w||(memory.steps||0)>=8)return {type:'stock_done'};
      if(p.cash<ctx.reserve){const tool=ev.liquidation(ctx,ctx.reserve-p.cash).find(t=>t.action.type==='rescue_sell_stock');if(tool){const {cityId,shares,quoteVersion}=tool.action;return {type:'stock_trade',windowId:w.windowId,...(v.stockInvestmentRevision?{stockContext:v.self.stockInvestment.context}:{}),orders:[{cityId,side:'sell',shares,quoteVersion,listingEpoch:v.stocks[cityId].listingEpoch}]};}}
      const options=[];
      for(const id of Object.keys(v.stocks))for(const shares of [1,2])if(ev.stockAllowed(ctx,id,shares,w,memory)){
        const s=v.stocks[id],quote={finalAmount:s.price*shares,fee:0};
        options.push(stockCandidate(id,shares,quote,{type:'stock_trade',windowId:w.windowId,...(v.stockInvestmentRevision?{stockContext:v.self.stockInvestment.context}:{}),orders:[{cityId:id,side:'buy',shares,quoteVersion:s.quoteVersion,listingEpoch:s.listingEpoch}]}));
      }
      return best(ctx,options)?.action||{type:'stock_done'};
    }
    default:throw new Error('未支持的电脑阶段：'+v.phase);
  }
}
function fallback(v,memory={}) {
  if(v.phase==='waiting_roll'&&(v.self.activeManagement?.required||v.self.activeManagement?.optional&&v.self.activeManagement?.available))return requiredAction(v);
  if(v.phase==='opportunity_choose'){const c=v.self.choice;return {type:'opportunity_choose',stageId:c.stageId,candidateVersion:c.candidateVersion,opportunityId:c.candidateIds.slice().sort()[0]};}
  if(v.phase==='route_choose'){const c=v.self.routeChoice;return {type:'route_skip',opportunityId:c.opportunityId,candidateVersion:c.candidateVersion};}
  if(v.phase==='self_rescue')return rescue(v,memory,true);
  const choices={trade_confirm:{type:'stock_transfer',accept:false},frozen_turn:{type:'respond_frozen',decision:'pass'},jail_turn:{type:'respond_jail',decision:'roll'},waiting_roll:{type:'roll_dice'},stock:{type:'stock_done'},buy:{type:'buy',decision:'pass'},buy_airport:{type:'buy_airport',decision:'pass'},build_decide:{type:'respond_build',decision:'pass'},flight:{type:'flight',target:null},auction_bid:{type:'auction_respond',decision:'pass'},direct_sale_ask:{type:'direct_sale_respond',decision:'pass'},buy_fundraise:{type:'buy_fundraise',decision:'cancel'}};
  return choices[v.phase]||null;
}
module.exports={choose,fallback};
