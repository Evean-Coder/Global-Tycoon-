'use strict';
// 有限诊断：独立两人房间、每种连接最多6个游戏动作；不修改规则或加入玩家房间。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks'),{io}=require('socket.io-client');
const remote='https://global-tycoon-abx0.onrender.com';
const result={at:new Date().toISOString(),scope:'本机网络路径；本地及公网短流程，不能代表用户手机或压力场景',runs:[]};
const until=async fn=>{const limit=performance.now()+12000;while(!fn()){if(performance.now()>limit)throw new Error('等待对局状态超时');await new Promise(r=>setTimeout(r,10));}};
async function probe(url,transport,label){
 const sockets=[],run={label,transport,actions:[],disconnects:[]};result.runs.push(run);let roomCreated=false;
 const ack=(s,event,data)=>new Promise((resolve,reject)=>s.timeout(10000).emit(event,data,(e,r)=>e?reject(e):resolve(r)));
 try{
  for(let i=0;i<2;i++){const t=performance.now(),s=io(url,{transports:[transport],reconnection:false,timeout:10000});sockets.push(s);s.on('gameState',g=>{s.game=g;s.stateTime=performance.now();});s.on('disconnect',reason=>run.disconnects.push({player:i,reason}));await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});run['connect'+i+'Ms']=Math.round(performance.now()-t);}
  const a=sockets[0],created=await ack(a,'createRoom',{name:'动作诊断甲'});assert.equal(created.ok,true);roomCreated=true;assert.equal((await ack(sockets[1],'joinRoom',{name:'动作诊断乙',roomCode:created.roomCode})).ok,true);assert.equal((await ack(a,'startGame',{})).ok,true);await until(()=>sockets.every(s=>s.game?.phase==='opportunity_choose'));
  async function act(s,action){const g=s.game,started=performance.now(),payload={...action,gameId:g.gameId,actionId:'latency-'+run.actions.length,decisionId:g.decision.decisionId,actorRevision:g.self.actorRevision};const receipt=await ack(s,'action',payload),ackAt=performance.now();assert.equal(receipt.ok,true,receipt.error);await until(()=>s.game.revision>=receipt.revision);run.actions.push({phase:g.phase,type:action.type,ackMs:Math.round(ackAt-started),stateMs:Math.round(s.stateTime-started),stateBytes:Buffer.byteLength(JSON.stringify(s.game)),paused:s.game.decision.paused});}
  for(const s of sockets){const c=s.game.self.choice;await act(s,{type:'opportunity_choose',stageId:c.stageId,candidateVersion:c.candidateVersion,opportunityId:c.candidateIds[0]});}
  await until(()=>sockets.every(s=>s.game.phase!=='opportunity_choose'));
  for(let i=0;i<4;i++){const g=a.game,actor=g.pending?.awaiting||g.pending?.targetId||g.pending?.playerId||g.players[g.turnIndex].id,s=sockets.find(s=>s.game.self.playerId===actor);const action={waiting_roll:{type:'roll_dice'},stock:{type:'stock_done'},buy:{type:'buy',decision:'pass'},buy_airport:{type:'buy_airport',decision:'pass'},build_decide:{type:'respond_build',decision:'pass'},flight:{type:'flight',target:null},frozen_turn:{type:'respond_frozen',decision:'pass'},jail_turn:{type:'respond_jail',decision:'roll'},auction_bid:{type:'auction_respond',decision:'pass'},direct_sale_ask:{type:'direct_sale_respond',decision:'pass'},trade_confirm:{type:'stock_transfer',accept:false}}[g.phase];if(!action||!s){run.stoppedAt=g.phase;break;}await act(s,action);await until(()=>sockets.every(p=>p.game.revision>=s.game.revision));}
  assert.equal((await ack(a,'disbandRoom',{})).ok,true);run.ownRoomDisbanded=true;run.ok=true;
 }catch(e){run.error=e.message;process.exitCode=1;}
 finally{if(roomCreated&&!run.ownRoomDisbanded&&sockets[0]?.connected){try{await ack(sockets[0],'disbandRoom',{});run.ownRoomDisbanded=true;}catch{}}for(const s of sockets)s.close();}
}
async function main(){
 const api=require('../../server');await new Promise(r=>api.server.listen(0,'127.0.0.1',r));
 try{await probe('http://127.0.0.1:'+api.server.address().port,'websocket','local');}finally{for(const r of api.rooms.values()){r.actionClock.clear();if(r.hostTimer)clearTimeout(r.hostTimer);}api.rooms.clear();await new Promise(r=>api.io.close(r));}
 await probe(remote,'websocket','render-websocket');await probe(remote,'polling','render-polling');
}
main().catch(e=>{result.error=e.message;process.exitCode=1;}).finally(()=>{fs.writeFileSync(path.join(__dirname,'gameplay-latency.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));});
