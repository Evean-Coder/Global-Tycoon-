'use strict';
function startRound(state) {
 const old=state.roundFlow;
 state.roundFlow={index:old?old.index+1:1, requiredIds:state.players.filter(p=>p.alive).map(p=>p.id), completedIds:[], completedTurns:[], boundaryId:old?old.boundaryId:0, continuation:null};
}
function completeTurn(state,playerId,turnId) {
 const flow=state.roundFlow;
 if(!flow || flow.completedTurns.includes(turnId))return false;
 flow.completedTurns.push(turnId);
 if(!flow.completedIds.includes(playerId))flow.completedIds.push(playerId);
 flow.requiredIds=flow.requiredIds.filter(id=>state.players.some(p=>p.id===id&&p.alive)||flow.completedIds.includes(id));
 return flow.requiredIds.every(id=>flow.completedIds.includes(id));
}
function removeEliminated(state) {
 if(!state.roundFlow)return;
 const f=state.roundFlow;
 f.requiredIds=f.requiredIds.filter(id=>state.players.some(p=>p.id===id&&p.alive)||f.completedIds.includes(id));
}
function isComplete(state){removeEliminated(state);return state.roundFlow.requiredIds.every(id=>state.roundFlow.completedIds.includes(id));}
module.exports={startRound,completeTurn,removeEliminated,isComplete};
