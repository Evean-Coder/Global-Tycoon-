'use strict';
// Read-only qualification for selling stock inside an existing purchase decision.
function eligible(s,p){
 if(s.phase!=='buy_fundraise'||!p?.alive||s.players[s.turnIndex]?.id!==p.id||s.pending?.playerId!==p.id)return false;
 const t=s.pending.target;
 if(!t||!['city','airport'].includes(t.kind))return false;
 const asset=t.kind==='city'?s.cities[t.cityId]:s.airports[t.airportId];
 const price=t.kind==='city'?asset?.price:15000;
 return !!asset&&!asset.ownerId&&Number.isSafeInteger(price)&&price>0&&Number.isSafeInteger(p.cash)&&p.cash<price&&(t.kind!=='city'||(p.lapBuys||0)<4);
}
module.exports={eligible};
