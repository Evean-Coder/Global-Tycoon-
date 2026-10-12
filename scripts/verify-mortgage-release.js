'use strict';
/* global fetch, AbortSignal */
// Finite deployment smoke check: only our disposable room, no complete games.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{io}=require('socket.io-client');
const url='https://global-tycoon-abx0.onrender.com',commit=process.argv[2]||'f7a234a8edaeced09b9fbf17771cf7513a7c26e0';
const result={date:new Date().toISOString(),commit,url,resources:[],socket:null,ci:null},clients=[];let code;
const hash=text=>crypto.createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
const ack=(socket,event,data)=>new Promise((resolve,reject)=>socket.timeout(15000).emit(event,data,(err,value)=>err?reject(err):resolve(value)));
async function until(fn){const end=Date.now()+15000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw new Error('remote state wait timeout');}
async function connect(){const socket=io(url,{transports:['websocket'],auth:{clientRouteRevision:'opportunity-routes-v1'},timeout:15000,reconnection:false});clients.push(socket);socket.on('gameState',s=>socket.game=s);await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});return socket;}
async function main(){
 try{
  result.resources=await Promise.all(['index.html','client.js','style.css','sw.js'].map(async file=>{const response=await fetch(url+'/'+file+'?release='+commit,{signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache'}});const text=await response.text(),local=fs.readFileSync(path.join(__dirname,'../public',file),'utf8');return {file,status:response.status,sha256:hash(text),matchesLocal:hash(text)===hash(local)};}));
  if(!result.resources.every(r=>r.status===200&&r.matchesLocal))throw new Error('deployed resources differ from local release');
  result.staticVersion='20261012-mortgage-unlimited-v1';result.cache='global-tycoon-v25-mortgage-unlimited';
  const a=await connect(),b=await connect(),created=await ack(a,'createRoom',{name:'上线检查甲'});if(!created.ok)throw new Error(JSON.stringify(created));code=created.roomCode;
  for(const value of [await ack(b,'joinRoom',{name:'上线检查乙',roomCode:code}),await ack(a,'startGame',{})])if(!value.ok)throw new Error(JSON.stringify(value));
  await until(()=>clients.every(s=>s.game?.self?.choice));
  for(const socket of clients){const s=socket.game,c=s.self.choice,value=await ack(socket,'action',{type:'opportunity_choose',stageId:c.stageId,candidateVersion:c.candidateVersion,opportunityId:c.candidateIds[0],gameId:s.gameId,decisionId:s.decision.decisionId,actorRevision:s.self.actorRevision,actionId:'release-choice-'+s.self.playerId});if(!value.ok)throw new Error(JSON.stringify(value));}
  await until(()=>a.game?.phase==='waiting_roll');const s=a.game,value=await ack(a,'action',{type:'roll_dice',gameId:s.gameId,decisionId:s.decision.decisionId,actorRevision:s.self.actorRevision,actionId:'release-one-roll'});if(!value.ok)throw new Error(JSON.stringify(value));
  await until(()=>a.game.revision>s.revision);result.socket={status:'passed',transport:a.io.engine.transport.name,create:true,join:true,start:true,initialChoices:true,roll:true};
 }catch(error){result.error=error.message;process.exitCode=1;}finally{
  if(code&&clients[0]?.connected){try{const ended=await ack(clients[0],'disbandRoom',{});result.disposableRoomClosed=ended.ok===true;}catch(error){result.cleanupError=error.message;}}
  for(const socket of clients)socket.close();
  try{const response=await fetch('https://api.github.com/repos/Evean-Coder/Global-Tycoon-/actions/runs?per_page=3',{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Global-Tycoon-release-check'}});const data=await response.json(),run=data.workflow_runs?.find(r=>r.head_sha===commit);if(run)result.ci={id:run.id,status:run.status,conclusion:run.conclusion,url:run.html_url};}catch(error){result.ciError=error.message;}
  fs.writeFileSync(path.join(__dirname,'../docs/mortgage-unlimited/deployment.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }
}
main();
