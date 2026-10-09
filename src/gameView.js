'use strict';
const econ=require('./economy');
const {assetSummary}=require('./assets');
const {BY_ID}=require('./gameplayCatalog');
const routes=require('./opportunityRoutes');
function snapshot(s,viewerId,clockView){
 const out={};
 for(const k of ['roomCode','gameId','ruleVersion','revision','status','board','cities','airports','stocks','firstRoundDone','turnIndex','phase','dice','rounds','rank','winner','startedAt'])out[k]=s[k];
 out.players=s.players.map(p=>{
  const x={};for(const k of ['id','name','seat','color','cash','position','alive','jailed','jailTurns','frozen','cities','airports','stocks','lapBuys','lapDone','connected','socketId'])x[k]=p[k];
  x.opportunities={selectedIds:p.opportunities.selectedIds.slice()};
  x.assetSummary=assetSummary(s,p.id);return x;
 });
 out.cities=Object.fromEntries(Object.entries(s.cities).map(([id,c])=>[id,{...c,standardRent:c.mortgaged?0:econ.rentFor(c)}]));
 out.stocks=Object.fromEntries(Object.entries(s.stocks).map(([id,st])=>[id,{price:st.price,holders:{...st.holders},operatingPrice:st.operatingPrice,dividendFund:st.dividendFund,rentHistory:st.rentHistory.slice(),lastDividendPerShare:st.lastDividendPerShare,priceChange:st.priceChange,listingEpoch:st.listingEpoch,quoteVersion:st.quoteVersion,clearing:st.clearing}]));
 out.world={status:s.world.status,active:s.world.active?{...s.world.active}:null,preview:s.world.preview?{...s.world.preview}:null,roundsCompleted:s.world.roundsCompleted};
 out.completeRounds=s.roundFlow.index;
 out.travelExpense=require('./travelExpense').stage(s);
 if(out.travelExpense.enabled)out.economyRevision=s.economyRevision;
 out.pending=null;
 if(s.pending){
  const p={};for(const k of ['type','kind','playerId','cityId','airportId','fromAirportId','free','target','due','reason','awaiting','targetId','fromId','items','cash','currentBid','currentBidder','minBid','index','buyerIndex','buyers','bankrupted','isBankruptcyAuction'])if(s.pending[k]!==undefined)p[k]=s.pending[k];
  out.pending=p;
 }
 if(s.opportunityStage&&!s.opportunityStage.resolved){
  const stage=s.opportunityStage;
  out.opportunityStage={stageId:stage.stageId,ordinal:stage.ordinal,participantIds:stage.participantIds,completed:Object.fromEntries(stage.participantIds.map(id=>[id,!!stage.participants[id].submitted]))};
 }
 out.decision=clockView||null;out.opportunityCatalog=BY_ID;
 if(routes.enabled(s)){
  out.routeRevision=s.routeRevision;out.gameMode=s.gameMode;
  const flow=s.routeFlow,c=flow.activeChoice;
  out.routeProgress={initialCompletedOrdinal:flow.initialCompletedOrdinal,laterClosed:flow.laterClosed,activeChoice:c?{playerId:c.playerId,opportunityId:c.opportunityId}:null,
   players:Object.fromEntries(s.players.map(p=>{const r=flow.players[p.id];return [p.id,{pendingCount:r.pending.length,lapsSinceInitial:r.baselineLapEpoch===null?null:p.opportunities.lapEpoch-r.baselineLapEpoch,lastResult:r.lastResult?{...r.lastResult}:null}];}))};
 }
 const player=s.players.find(p=>p.id===viewerId);
 if(player){
  out.self={playerId:player.id,actorRevision:s.actorRevision[player.id],opportunities:globalThis.structuredClone(player.opportunities),quotes:{build:{},demolish:{},rent:{},flight:{}},stockWindow:null};
  if(routes.enabled(s)){
   const r=s.routeFlow.players[player.id];
   out.self.route={baselineLapEpoch:r.baselineLapEpoch,lastThreshold:r.lastThreshold,pending:r.pending.map(c=>({...c})),lastResult:r.lastResult?{...r.lastResult}:null,lapsSinceInitial:r.baselineLapEpoch===null?null:player.opportunities.lapEpoch-r.baselineLapEpoch};
   if(s.routeFlow.activeChoice?.playerId===player.id)out.self.routeChoice=globalThis.structuredClone(s.routeFlow.activeChoice);
  }
  for(const [id,c]of Object.entries(s.cities)){
   out.self.quotes.rent[id]=econ.quoteRent(s,{playerId:player.id,cityId:id});
   if(c.ownerId===player.id){
    out.self.quotes.build[id]=econ.quoteBuild(s,{playerId:player.id,cityId:id});
    out.self.quotes.demolish[id]=econ.quoteDemolition(s,{playerId:player.id,cityId:id});
   }
  }
  out.self.quotes.remote={};
  for(const id of player.cities)out.self.quotes.remote[id]=econ.quoteBuild(s,{playerId:player.id,cityId:id,mode:'remote'});
  if(s.phase==='flight'&&s.pending?.playerId===player.id)for(const id of Object.keys(s.airports))if(id!==s.pending.fromAirportId)out.self.quotes.flight[id]=econ.quoteFlight(s,{playerId:player.id,target:id,fromAirportId:s.pending.fromAirportId,free:s.pending.free});
  if(s.phase==='flight'&&s.pending?.playerId===player.id)out.self.flightInfo={fromAirportId:s.pending.fromAirportId,fromOwnerId:s.airports[s.pending.fromAirportId]?.ownerId||null,free:!!s.pending.free,airportFeePaid:s.pending.airportFeePaid?{...s.pending.airportFeePaid}:null,travelExpense:out.travelExpense};
  if(s.stockWindow?.playerId===player.id)out.self.stockWindow=globalThis.structuredClone(s.stockWindow);
  if(s.opportunityStage&&!s.opportunityStage.resolved&&s.opportunityStage.participants[player.id]){
   const entry=s.opportunityStage.participants[player.id];
   out.self.choice={stageId:s.opportunityStage.stageId,...globalThis.structuredClone(entry),rerollsLeft:player.opportunities.rerollsLeft};
  }
 }
 return JSON.parse(JSON.stringify(out));
}
module.exports={snapshot};
