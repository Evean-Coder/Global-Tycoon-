'use strict';
const economy=require('./economy');
function previewOwnerCashflow(s,playerId,cityId){
 const c=s.cities[cityId],tenant=s.players.find(p=>p.alive&&p.id!==playerId);
 if(!c||c.ownerId!==playerId||!tenant)return null;
 const branches=[false,true].map(withBonus=>{
  const copy=globalThis.structuredClone(s);copy.commercialCompetition.advantages=[];copy.commercialCompetition.bids=[];
  if(withBonus)copy.commercialCompetition.advantages.push({advantageId:'preview',playerId,cityId,listingEpoch:copy.stocks[cityId].listingEpoch,ownershipEpoch:copy.cities[cityId].ownershipEpoch,startsRound:copy.roundFlow.index,expiresAfterRound:copy.roundFlow.index+3,remainingHits:2,endedReason:null});
  const totals={retained:0,rentalDividend:0,bankDividend:0,perkBonus:0},out=[];
  for(let i=0;i<2;i++){
   const q=economy.quoteRent(copy,{playerId:tenant.id,cityId}),d=q.stockDividends.find(d=>d.playerId===playerId);
   totals.retained+=q.ownerRentalIncome;totals.rentalDividend+=d?.rental||0;totals.bankDividend+=d?.bank||0;totals.perkBonus+=d?.extra||0;
   // Only the cloned H4 usage changes; real state, quotes and random source stay untouched.
   if(d?.extra)require('./opportunities').consume(copy.players.find(p=>p.id===playerId),'H4',d.extra);
   if(q.competition)require('./commercialCompetition').commitRent(copy,q.competition,'preview:'+i);
   out.push({...totals});
  }return out;
 });
 const increments=branches[1].map((row,i)=>{const delta=Object.fromEntries(Object.keys(row).map(k=>[k,row[k]-branches[0][i][k]]));return {...delta,total:Object.values(delta).reduce((a,b)=>a+b,0)};});
 return {baseRent:economy.rentFor(c),surcharge:Math.min(3000,economy.rounded(economy.rentFor(c),15)),increments,assumption:'按当前房级、股权、资讯及本人机遇余量计算；两次间不刷新额度，不保证未来到访或收益'};
}
module.exports={previewOwnerCashflow};
