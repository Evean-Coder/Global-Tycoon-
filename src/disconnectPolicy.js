'use strict';
const {performance}=require('node:perf_hooks');
const {decisionDescriptor}=require('./actionClock');
const REVISION='disconnect-v1';
function enabled(s){return s?.disconnectRevision===REVISION;}
function actors(s){
 if(s.phase==='opportunity_choose')return (s.opportunityStage?.participantIds||[]).filter(id=>!s.opportunityStage.participants[id].submitted&&s.players.some(p=>p.id===id&&p.alive));
 return [decisionDescriptor(s).actorId].filter(Boolean);
}
function blocked(room){
 if(!room.state||room.state.phase==='game_over')return false;
 if(!enabled(room.state))return room.players.some(p=>p.kind==='bot')&&!room.players.some(p=>p.kind!=='bot'&&p.connected)||room.state.players.some(g=>g.alive&&room.players.some(p=>p.id===g.id&&!p.connected));
 if(!room.players.some(p=>p.kind!=='bot'&&p.connected))return true;
 return room.state.phase==='self_rescue'&&actors(room.state).some(id=>room.players.some(p=>p.id===id&&!p.connected));
}
function defaultAction(room,id,fallback){
 const s=room.state;
 if(s.phase==='opportunity_choose'){
  const e=s.opportunityStage.participants[id];
  return e&&!e.submitted?{type:'opportunity_choose',stageId:s.opportunityStage.stageId,candidateVersion:e.candidateVersion,opportunityId:e.candidateIds[0]}:null;
 }
 if(s.phase==='frozen_turn')return {type:'respond_frozen',decision:'pass'};
 if(s.phase==='jail_turn')return {type:'respond_jail',decision:'roll'};
 return fallback(room,s.phase);
}
function decisionKey(s){return decisionDescriptor(s).key+(s.phase==='stock'?'|'+(s.stockWindow?.windowId||''): '');}
function stop(room){
 const clear=room.disconnectOptions?.clearTimeout||clearTimeout;
 for(const job of room.offlineJobs?.values()||[])clear(job.timer);
 room.offlineJobs=new Map();
}
function sync(room,run,fallback){
 stop(room);
 const s=room.state;if(!enabled(s)||s.phase==='game_over')return;
 const now=room.disconnectOptions?.now||(()=>performance.now()),set=room.disconnectOptions?.setTimeout||setTimeout;
 const turn=s.gameId+'|'+s.turnId;
 if(room.offlineMemory?.turn!==turn)room.offlineMemory={turn,seen:new Map()};
 const key=decisionKey(s);
 for(const id of actors(s)){
  const rp=room.players.find(p=>p.id===id);if(!rp||rp.kind==='bot'||rp.connected)continue;
  if(s.phase==='self_rescue')continue;
  const memoryKey=key+'|'+id;
  let due=room.offlineMemory.seen.get(memoryKey);
  if(due===undefined){due=now()+(rp.offlineDefaulting?0:Math.min(20000,room.actionClock.remainingMilliseconds()??20000));room.offlineMemory.seen.set(memoryKey,due);}
  if(blocked(room))continue;
  const timer=set(()=>{
   room.offlineJobs.delete(id);
   if(room.state?.gameId!==s.gameId||decisionKey(room.state)!==key||rp.connected||blocked(room)||!actors(room.state).includes(id))return;
   const act=defaultAction(room,id,fallback);if(!act)return;
   rp.offlineDefaulting=true;run(room,null,act,'timeout',id);
  },Math.max(0,due-now()));
  timer?.unref?.();room.offlineJobs.set(id,{timer,due,key});
 }
}
function view(room){
 const now=room.disconnectOptions?.now||(()=>performance.now());
 return {revision:REVISION,paused:blocked(room),reason:room.state.phase==='self_rescue'&&blocked(room)?'self_rescue':'all_offline',offlineIds:room.players.filter(p=>p.kind!=='bot'&&!p.connected&&room.state.players.some(g=>g.id===p.id&&g.alive)).map(p=>p.id),waits:[...room.offlineJobs.entries()].map(([playerId,j])=>({playerId,secondsRemaining:Math.ceil(Math.max(0,j.due-now())/1000)})),defaultingIds:room.players.filter(p=>p.offlineDefaulting&&!p.connected).map(p=>p.id)};
}
module.exports={REVISION,enabled,actors,blocked,defaultAction,sync,stop,view};
