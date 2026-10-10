'use strict';
const {decisionDescriptor}=require('./actionClock');
function actors(room){
 const s=room.state;
 if(!s||s.phase==='game_over')return [];
 if(s.phase==='opportunity_choose')return (s.opportunityStage?.participantIds||[]).filter(id=>!s.opportunityStage.participants[id].submitted);
 return [decisionDescriptor(s).actorId];
}
function stop(room){for(const job of room.botJobs?.values()||[])clearTimeout(job.timer);room.botJobs=new Map();}
function sync(room,execute){
 room.botJobs ||= new Map();room.botMemory ||= new Map();
 const active=!!room.state&&room.state.phase!=='game_over'&&!room.actionClock?.paused&&room.players.some(p=>p.kind!=='bot'&&p.connected);
 const key=id=>room.state.gameId+'|'+room.actionClock.decisionId+'|'+id+'|'+room.state.actorRevision[id];
 const eligible=active?actors(room).filter(id=>room.players.some(p=>p.id===id&&p.kind==='bot')&&room.botMemory.get(id)?.blockedKey!==key(id)):[];
 for(const [id,job]of room.botJobs)if(!eligible.includes(id)||job.key!==key(id)){clearTimeout(job.timer);room.botJobs.delete(id);}
 for(const id of eligible){
  if(room.botJobs.has(id))continue;
  const k=key(id),job={key:k,timer:null};
  job.timer=setTimeout(()=>{
   if(room.botJobs.get(id)!==job)return;
   room.botJobs.delete(id);
   if(!room.state||room.state.phase==='game_over'||key(id)!==k||room.actionClock.paused||!room.players.some(p=>p.kind!=='bot'&&p.connected))return;
   execute(room,id);sync(room,execute);
  },room.botDelayMs??1000);
  job.timer.unref?.();room.botJobs.set(id,job);
 }
 return eligible;
}
module.exports={actors,sync,stop};
