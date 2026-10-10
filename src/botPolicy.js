'use strict';

// Input is exclusively the same private snapshot supplied to this seat.
const RESERVE = 18000;
const {cityTotalValue}=require('./economy');
function score(v,id) {
  const p=v.players.find(x=>x.id===v.self.playerId);
  const defaults={H1:50,H2:55,H3:40,H4:50,H5:40,H6:40,H7:35,H8:35,H9:35,H10:45,H11:55,H12:60};
  return (defaults[id]||30)+(id==='H1'?p.cities.length*8:0)+(id==='H5'?Object.values(v.stocks).filter(s=>s.holders[p.id]).length*5:0);
}
function choose(v,memory={}) {
  const p=v.players.find(x=>x.id===v.self.playerId),q=v.self.quotes;
  const afford=n=>Number.isSafeInteger(n)&&p.cash-n>=RESERVE;
  const best=ids=>ids.slice().sort((a,b)=>score(v,b)-score(v,a)||a.localeCompare(b))[0];
  switch(v.phase) {
    case 'opportunity_choose': {
      const c=v.self.choice;
      return {type:'opportunity_choose',stageId:c.stageId,candidateVersion:c.candidateVersion,opportunityId:best(c.candidateIds)};
    }
    case 'route_choose': {
      const c=v.self.routeChoice,held=v.self.opportunities.selectedIds;
      const newId=best(c.candidateIds.filter(id=>!held.includes(id)));
      const replaceId=held.length===3?held.slice().sort((a,b)=>score(v,a)-score(v,b))[0]:null;
      const envelope={opportunityId:c.opportunityId,candidateVersion:c.candidateVersion};
      return newId&&(!replaceId||score(v,newId)>score(v,replaceId))?{type:'route_confirm',...envelope,newId,replaceId}:{type:'route_skip',...envelope};
    }
    case 'waiting_roll': {
      if((memory.steps||0)<6){
        const support=v.self.propertySupport?.candidates.find(c=>c.ok&&afford(c.finalAmount));
        if(support)return {type:'support_buy',cityId:support.cityId,quoteVersion:support.quoteVersion};
        const active=v.self.activeManagement;
        const options=(active?.available?active.quotes:[]).filter(c=>c.ok&&afford(c.finalAmount));
        // Build for durable income, otherwise limited stocks, then promotion on an earning city.
        const build=options.find(c=>c.type==='active_build'&&v.cities[c.cityId].houseLevel<2);
        const stock=options.find(c=>c.type==='active_stock_buy'&&c.shares===1&&(p.assetSummary.stockValue+c.finalAmount)<p.assetSummary.total*.2);
        const promo=options.find(c=>c.type==='active_promote'&&(v.stocks[c.cityId]?.rentHistory||[]).some(n=>n>0));
        const c=build||stock||promo;
        if(c)return {type:c.type,cityId:c.cityId,...(c.shares?{shares:c.shares,listingEpoch:c.listingEpoch}:{}),quoteVersion:c.quoteVersion};
      }
      return {type:'roll_dice'};
    }
    case 'buy':return {type:'buy',decision:afford(v.cities[v.pending.cityId].price)?'buy':'pass'};
    case 'buy_airport':return {type:'buy_airport',decision:afford(15000)?'buy':'pass'};
    case 'build_decide': {
      const c=q.build[v.pending.cityId];
      return c?.ok&&afford(c.finalAmount)?{type:'respond_build',decision:'build',quoteVersion:c.quoteVersion}:{type:'respond_build',decision:'pass'};
    }
    case 'buy_fundraise':return {type:'buy_fundraise',decision:'cancel'};
    case 'frozen_turn':return {type:'respond_frozen',decision:afford(5000)?'pay':'pass'};
    case 'jail_turn':return {type:'respond_jail',decision:afford(15000)?'pay':'roll'};
    case 'trade_confirm':return {type:'stock_transfer',accept:false};
    case 'direct_sale_ask':return {type:'direct_sale_respond',decision:p.lapBuys<4&&afford(cityTotalValue(v.cities[v.pending.cityId]))?'buy':'pass'};
    case 'auction_bid': {
      const a=v.pending,c=v.cities[a.cityId],amount=a.currentBid>0?a.currentBid+1000:Math.round(cityTotalValue(c)*.75);
      if(a.currentBidder===p.id)return {type:'auction_respond',decision:'end'};
      return p.lapBuys<4&&afford(amount)&&amount<=c.price?{type:'auction_respond',decision:'bid',amount}:{type:'auction_respond',decision:'pass'};
    }
    case 'flight':return {type:'flight',target:null};
    case 'stock': {
      const w=v.self.stockWindow;
      if((memory.steps||0)>=8)return {type:'stock_done'};
      for(const [id,s]of Object.entries(v.stocks)) {
        const c=v.cities[id],held=s.holders[p.id]||0;
        if(!c.ownerId||s.clearing)continue;
        if(held&&p.cash<RESERVE)return {type:'stock_trade',windowId:w.windowId,orders:[{cityId:id,side:'sell',shares:Math.min(held,Math.ceil((RESERVE-p.cash)/s.price)),quoteVersion:s.quoteVersion,listingEpoch:s.listingEpoch}]};
        if(!c.mortgaged&&afford(s.price)&&p.assetSummary.stockValue+s.price<p.assetSummary.total*.2&&w.boughtTotal<6&&(w.boughtByCity[id]||0)<2&&(Object.hasOwn(w.boughtByCity,id)||Object.keys(w.boughtByCity).length<3)&&(c.ownerId!==p.id||held<4)&&Object.values(s.holders).reduce((a,b)=>a+b,0)<20)
          return {type:'stock_trade',windowId:w.windowId,orders:[{cityId:id,side:'buy',shares:1,quoteVersion:s.quoteVersion,listingEpoch:s.listingEpoch}]};
      }
      return {type:'stock_done'};
    }
    case 'self_rescue': {
      if(p.cash>=0)return {type:'rescue_done'};
      for(const [id,s]of Object.entries(v.stocks))if(v.cities[id].ownerId&&!s.clearing&&s.holders[p.id]>0&&s.price>0)return {type:'rescue_sell_stock',cityId:id,shares:Math.min(s.holders[p.id],Math.ceil(-p.cash/s.price)),quoteVersion:s.quoteVersion};
      const cities=Object.values(v.cities).filter(c=>c.ownerId===p.id);
      const c=cities.filter(c=>!c.mortgaged).sort((a,b)=>a.price-b.price)[0];
      if(c&&cities.filter(c=>c.mortgaged).length<2)return {type:'rescue_mortgage',cityId:c.id};
      const d=cities.find(c=>q.demolish[c.id]?.ok);
      if(d)return {type:'rescue_demolish',cityId:d.id,quoteVersion:q.demolish[d.id].quoteVersion};
      if(c&&!(memory.saleAttempts||[]).includes(c.id))return {type:'sell_city',cityId:c.id,mode:'auction'};
      return {type:'rescue_done'};
    }
    default:throw new Error('未支持的电脑阶段：'+v.phase);
  }
}
function fallback(v){
  if(v.phase==='opportunity_choose'){const c=v.self.choice;return {type:'opportunity_choose',stageId:c.stageId,candidateVersion:c.candidateVersion,opportunityId:c.candidateIds[0]};}
  if(v.phase==='route_choose'){const c=v.self.routeChoice;return {type:'route_skip',opportunityId:c.opportunityId,candidateVersion:c.candidateVersion};}
  if(v.phase==='self_rescue')return {type:'rescue_done'};
  if(v.phase==='trade_confirm')return {type:'stock_transfer',accept:false};
  if(v.phase==='frozen_turn')return {type:'respond_frozen',decision:'pass'};
  if(v.phase==='jail_turn')return {type:'respond_jail',decision:'roll'};
  const choices={waiting_roll:{type:'roll_dice'},stock:{type:'stock_done'},buy:{type:'buy',decision:'pass'},buy_airport:{type:'buy_airport',decision:'pass'},build_decide:{type:'respond_build',decision:'pass'},flight:{type:'flight',target:null},auction_bid:{type:'auction_respond',decision:'pass'},direct_sale_ask:{type:'direct_sale_respond',decision:'pass'},buy_fundraise:{type:'buy_fundraise',decision:'cancel'}};
  return choices[v.phase]||null;
}
module.exports={choose,fallback,RESERVE};
