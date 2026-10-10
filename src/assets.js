'use strict';
const {cityTotalValue,mortgageValue,safe}=require('./economy');
function assetSummary(s,id){
 const p=s.players.find(p=>p.id===id);let propertyValue=0,stockValue=0,retainedPending=0;
 for(const c of Object.values(s.cities))if(c.ownerId===id)propertyValue=safe(propertyValue+cityTotalValue(c));
 for(const [cid,st]of Object.entries(s.stocks)){
  stockValue=safe(stockValue+(st.holders[id]||0)*st.price);
  if(s.ruleVersion===2&&s.cities[cid].ownerId===id){
   const held=s.players.filter(p=>p.alive).reduce((n,p)=>n+(st.holders[p.id]||0),0);
   retainedPending=safe(retainedPending+st.dividendFund-Math.floor(st.dividendFund/20)*held);
  }
 }
 const airportValue=Object.values(s.airports).filter(a=>a.ownerId===id).length*15000;
 return {cash:p.cash,propertyValue,airportValue,stockValue,retainedPending,total:safe(p.cash+propertyValue+airportValue+stockValue+retainedPending)};
}
function netAssetSummary(s,id){
 const a=assetSummary(s,id);let mortgagePrincipal=0,mortgageInterest=0;
 for(const c of Object.values(s.cities))if(c.ownerId===id&&c.mortgaged){
  mortgagePrincipal=safe(mortgagePrincipal+mortgageValue(c));
  mortgageInterest=safe(mortgageInterest+(c.mortgageInterest||0));
 }
 return {cash:a.cash,propertyValue:a.propertyValue,airportValue:a.airportValue,stockValue:a.stockValue,retainedPending:a.retainedPending,grossAssets:a.total,mortgagePrincipal,mortgageInterest,netAssets:safe(safe(a.total-mortgagePrincipal)-mortgageInterest)};
}
module.exports={assetSummary,netAssetSummary};
