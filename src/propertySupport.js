'use strict';
const REVISION='property-support-v2',LEGACY_REVISION='property-support-v1',BUDGET=20000;
function enabled(s){return [REVISION,LEGACY_REVISION].includes(s?.propertySupportRevision);}
function budgetEnabled(s){return s?.propertySupportRevision===REVISION;}
function markOwned(s,id){if(!enabled(s))return;const p=s.players.find(x=>x.id===id);if(p){p.propertySupport.everOwnedCity=true;p.propertySupport.eligible=false;}}
function beginRoll(s,p){if(enabled(s))p.propertySupport.turn={id:s.turnId,normal:true,unlocked:s.firstRoundDone,rejected:false};}
function offer(s,p,city){if(!enabled(s))return;const t=p.propertySupport.turn;if(t?.id===s.turnId)t.affordable=!!city&&!city.ownerId&&p.cash>=city.price&&p.lapBuys<4;}
function refuse(s,p){if(!enabled(s))return;const r=p.propertySupport,t=r.turn;if(t?.id===s.turnId&&t.affordable){t.rejected=true;r.missedPurchaseTurns=0;r.eligible=false;}}
function finish(s,p){
 if(!enabled(s))return;const r=p.propertySupport,t=r.turn;
 if(r.processedTurnId===s.turnId)return;r.processedTurnId=s.turnId;
 if(r.everOwnedCity||r.used||p.cities.length||!p.alive||!t?.normal||t.id!==s.turnId||!t.unlocked)return;
 if(t.rejected){r.missedPurchaseTurns=0;return;}
 r.missedPurchaseTurns=Math.min(6,r.missedPurchaseTurns+1);if(r.missedPurchaseTurns===6)r.eligible=true;
}
function candidates(s){
 const blocked=new Set();if(s.pending?.cityId&&['auction_bid','direct_sale_ask'].includes(s.phase))blocked.add(s.pending.cityId);
 if(budgetEnabled(s)){
  const premiumOpen=s.board.filter(q=>q.type==='city'&&!['纽约','上海'].includes(q.cityId)).every(q=>!!s.cities[q.cityId].ownerId);
  return s.board.filter(q=>q.type==='city'&&!s.cities[q.cityId].ownerId&&!blocked.has(q.cityId)&&(premiumOpen||!['纽约','上海'].includes(q.cityId))).sort((a,b)=>s.cities[a.cityId].price-s.cities[b.cityId].price||a.id-b.id).map(q=>q.cityId);
 }
 return s.board.filter(q=>q.type==='city'&&!s.cities[q.cityId].ownerId&&!blocked.has(q.cityId)).sort((a,b)=>a.price-b.price||s.board.indexOf(a)-s.board.indexOf(b)).slice(0,3).map(q=>q.cityId);
}
function selectionVersion(s,id){
 const p=s.players.find(x=>x.id===id),r=p?.propertySupport;
 return JSON.stringify([s.propertySupportRevision,s.gameId,s.turnId,id,s.phase,s.pending?.cityId,p?.cash,p?.lapBuys,p?.alive,p?.jailed,p?.frozen,s.firstRoundDone,r?.eligible,r?.used,r?.everOwnedCity,s.players[s.turnIndex]?.id,s.board.filter(q=>q.type==='city').map(q=>[q.cityId,s.cities[q.cityId].ownerId,s.cities[q.cityId].price,s.stocks[q.cityId]?.listingEpoch,s.stocks[q.cityId]?.clearedEpoch])]);
}
function quoteSelection(s,id,cityIds){
 const p=s.players.find(x=>x.id===id),r=p?.propertySupport,version=selectionVersion(s,id);
 let reason='',total=0;
 if(!budgetEnabled(s)||!r?.eligible||r.used||r.everOwnedCity||!p?.alive||p.cities.length)reason='尚无预算置业扶持资格';
 else if(s.phase!=='waiting_roll'||s.players[s.turnIndex]?.id!==id||s.pending||p.jailed||p.frozen)reason='请在本人正常掷骰前使用';
 else if(!s.firstRoundDone)reason='购地尚未解锁';
 else if(!Array.isArray(cityIds)||!cityIds.length||cityIds.length>4||cityIds.some(cid=>typeof cid!=='string')||new Set(cityIds).size!==cityIds.length)reason='请选择1至4座不同城市';
 else{
  const pool=candidates(s);
  if(cityIds.some(cid=>!pool.includes(cid)))reason='候选城市已变化，请重新选择';
  else{
   total=cityIds.reduce((sum,cid)=>sum+s.cities[cid].price,0);
   if(!Number.isSafeInteger(total)||cityIds.some(cid=>!Number.isSafeInteger(s.cities[cid].price)||s.cities[cid].price<=0))reason='城市价格资料无效';
   else if(total>BUDGET)reason='选购总价超过20,000预算';
   else if(cityIds.length>Math.max(0,4-p.lapBuys))reason='本圈剩余购地额度不足';
   else if(p.cash<total)reason='现金不足，资格仍保留';
  }
 }
 const ids=Array.isArray(cityIds)?s.board.filter(q=>q.type==='city'&&cityIds.includes(q.cityId)).map(q=>q.cityId):[];
 return {ok:!reason,reason,cityIds:ids,finalAmount:total,cashAfter:p?p.cash-total:null,quoteVersion:version};
}
function quote(s,id,cityId){
 const p=s.players.find(x=>x.id===id),c=s.cities[cityId],r=p?.propertySupport;
 let reason='';
 if(!enabled(s)||!r?.eligible||r.used||r.everOwnedCity||!p?.alive||p.cities.length)reason='尚无置业扶持资格';
 else if(s.phase!=='waiting_roll'||s.players[s.turnIndex].id!==id||s.pending||p.jailed||p.frozen)reason='请在正常掷骰前使用';
 else if(!s.firstRoundDone)reason='购地尚未解锁';
 else if(!c||!candidates(s).includes(cityId))reason='候选城市已变化，请重新选择';
 else if(p.lapBuys>=4)reason='本圈购地额度已用完';
 else if(p.cash<c.price)reason='现金不足，资格仍保留';
 return {ok:!reason,reason,cityId,finalAmount:c?.price,quoteVersion:budgetEnabled(s)?selectionVersion(s,id):JSON.stringify([s.propertySupportRevision,s.turnId,cityId,c?.ownerId,c?.price,s.stocks[cityId]?.listingEpoch,s.stocks[cityId]?.clearedEpoch,r?.eligible,r?.used]),cashAfter:c&&p?p.cash-c.price:null};
}
function view(s,id){if(!enabled(s))return null;const p=s.players.find(x=>x.id===id);if(!p)return null;return {progress:p.propertySupport.missedPurchaseTurns,eligible:p.propertySupport.eligible,used:p.propertySupport.used,everOwnedCity:p.propertySupport.everOwnedCity,remaining:Math.max(0,4-p.lapBuys),...(budgetEnabled(s)?{budgetPurchase:true,budgetAmount:BUDGET,selectionVersion:selectionVersion(s,id),premiumOpen:s.board.filter(q=>q.type==='city'&&!['纽约','上海'].includes(q.cityId)).every(q=>!!s.cities[q.cityId].ownerId)}:{}),candidates:candidates(s).map(cid=>quote(s,id,cid))};}
module.exports={REVISION,LEGACY_REVISION,BUDGET,enabled,budgetEnabled,selectionVersion,quoteSelection,markOwned,beginRoll,offer,refuse,finish,candidates,quote,view};
