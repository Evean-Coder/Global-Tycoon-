'use strict';
const {OPPORTUNITIES}=require('./gameplayCatalog');
function initial(){return {selectedIds:[],rerollsLeft:1,lapEpoch:0,usage:{},visitedAirportIds:[]};}
function has(player,id){return !!player.opportunities?.selectedIds.includes(id);}
function used(player,id){return player.opportunities?.usage[id]||0;}
function consume(player,id,amount=1){player.opportunities.usage[id]=used(player,id)+amount;}
function refresh(player){if(player.opportunities){player.opportunities.lapEpoch++;player.opportunities.usage={};}}
function emergencyIntent(state,player,sourceId){
 if(!player.alive||!has(player,'H12')||!player.opportunities.oneTimeRewards||player.opportunities.oneTimeRewards.H12)return null;
 return {playerId:player.id,catalogId:'H12',amount:6000,sourceId,receiptId:state.gameId+':H12:'+player.id+':'+sourceId};
}
function recordEmergency(player,intent){
 if(!intent||intent.playerId!==player.id||intent.amount!==6000||intent.catalogId!=='H12'||!player.opportunities.oneTimeRewards||player.opportunities.oneTimeRewards.H12)throw new Error('应急资金领取事实无效');
 player.opportunities.oneTimeRewards.H12={receiptId:intent.receiptId,amount:6000,sourceId:intent.sourceId};
}
function candidates(player,rng,exclude=[]){
 const eligible=OPPORTUNITIES.filter(o=>!has(player,o.id)&&!exclude.includes(o.id));
 const combinations=[];
 for(let i=0;i<eligible.length;i++)for(let j=i+1;j<eligible.length;j++)for(let k=j+1;k<eligible.length;k++){
  const c=[eligible[i],eligible[j],eligible[k]];
  if(new Set(c.map(o=>o.direction)).size>=2)combinations.push(c.map(o=>o.id));
 }
 if(!combinations.length)throw new Error('当前没有符合条件的经营机遇');
 return combinations[Math.floor(rng()*combinations.length)];
}
function beginOpportunityStage(state,ordinal,continuation,rng){
 const stageId=state.gameId+':choice:'+ordinal;
 const participantIds=state.players.filter(p=>p.alive).map(p=>p.id);
 const participants=Object.fromEntries(participantIds.map(id=>{
  const p=state.players.find(p=>p.id===id);
  return [id,{candidateIds:candidates(p,rng),candidateVersion:1,submitted:false,submittedId:null,replacedIds:[]}];
 }));
 state.opportunityStage={stageId,ordinal,participantIds,participants,resolved:false,continuation};
 state.phase='opportunity_choose';state.pending=null;
}
function submit(state,playerId,action){
 const s=state.opportunityStage,p=s?.participants[playerId];
 if(!s||s.resolved||s.stageId!==action.stageId||!p||p.submitted||p.candidateVersion!==action.candidateVersion||!p.candidateIds.includes(action.opportunityId))throw new Error('经营机遇选择已失效');
 p.submitted=true;p.submittedId=action.opportunityId;
}
function reroll(state,player,action,rng){
 const s=state.opportunityStage,p=s?.participants[player.id];
 if(!s||s.resolved||s.stageId!==action.stageId||!p||p.submitted||p.candidateVersion!==action.candidateVersion||!player.opportunities.rerollsLeft)throw new Error('当前不能换组选项');
 const ids=candidates(player,rng,p.candidateIds);
 p.replacedIds=p.candidateIds;p.candidateIds=ids;p.candidateVersion++;player.opportunities.rerollsLeft--;
}
function ready(state){const s=state.opportunityStage;return s&&!s.resolved&&s.participantIds.filter(id=>state.players.some(p=>p.id===id&&p.alive)).every(id=>s.participants[id].submitted);}
function resolveOpportunityStage(state,stageId,cause,events){
 const s=state.opportunityStage;
 if(!s||s.stageId!==stageId||s.resolved)return null;
 if(cause!=='timeout'&&!ready(state))return null;
 s.participantIds=s.participantIds.filter(id=>state.players.some(p=>p.id===id&&p.alive));
 if(s.participantIds.length<=1)return null;
 for(const id of s.participantIds){
  const entry=s.participants[id],player=state.players.find(p=>p.id===id);
  const chosen=entry.submittedId||entry.candidateIds[0];
  player.opportunities.selectedIds.push(chosen);
  player.opportunities.usage[chosen]=0;
  events.push({type:'opportunity',kind:'opportunity_selection',playerId:id,opportunityId:chosen,text:player.name+' 选择经营机遇：'+OPPORTUNITIES.find(o=>o.id===chosen).name});
 }
 s.resolved=true;return s.continuation;
}
module.exports={initial,has,used,consume,refresh,candidates,beginOpportunityStage,submit,reroll,ready,resolveOpportunityStage,emergencyIntent,recordEmergency};
