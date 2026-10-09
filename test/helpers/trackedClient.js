'use strict';
const {io}=require('socket.io-client');
let sequence=0;
function Client(url,options={}){
 const socket=io(url,{...options,auth:{clientRouteRevision:'opportunity-routes-v1',...options.auth}}),original=socket.emit.bind(socket);
 socket.emit=(event,...payload)=>{
  if(event==='action'&&socket.game?.ruleVersion===2){const s=socket.game;payload[0]={...payload[0],gameId:s.gameId,actionId:'regression-'+(++sequence),decisionId:s.decision.decisionId,actorRevision:s.self.actorRevision};}
  return original(event,...payload);
 };
 socket.on('gameState',s=>{
  socket.game=s;
  if(s.phase==='opportunity_choose'&&!s.decision.paused&&s.self.choice&&!s.self.choice.submitted){
   const c=s.self.choice,key=c.stageId+':'+c.candidateVersion;
   if(socket.autoChoice!==key){socket.autoChoice=key;socket.emit('action',{type:'opportunity_choose',stageId:c.stageId,candidateVersion:c.candidateVersion,opportunityId:c.candidateIds[0]});}
  }
 });
 return socket;
}
async function waitState(socket,phase){const end=Date.now()+6000;while(Date.now()<end){if(socket.game?.phase===phase)return socket.game;await new Promise(r=>setTimeout(r,10));}throw new Error('未到达阶段 '+phase);}
module.exports={Client,waitState};
