'use strict';
const economy=require('./economy');
// Shared qualification guard; no cash or ownership is modified here.
function eligible(s,p){
 if(s.phase!=='build_decide'||!p?.alive||s.players[s.turnIndex]?.id!==p.id||s.pending?.playerId!==p.id)return false;
 const id=s.pending.cityId,c=s.cities[id];
 if(!c||c.ownerId!==p.id||c.mortgaged||c.houseLevel>=4||c.buildReady===false||p.position!==s.board.find(x=>x.cityId===id)?.id)return false;
 const cost=s.ruleVersion===2?economy.quoteBuild(s,{playerId:p.id,cityId:id}).finalAmount:economy.buildFee(c);
 return Number.isSafeInteger(cost)&&cost>0&&p.cash<cost;
}
module.exports={eligible};
