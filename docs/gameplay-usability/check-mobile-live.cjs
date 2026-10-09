'use strict';
// 显式执行时核对公网资源，并仅创建/解散脚本自己的测试房间。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {io}=require('socket.io-client');
const {execFileSync}=require('node:child_process');
const base='https://global-tycoon-abx0.onrender.com',sockets=[];
const output={date:new Date().toISOString(),status:'verifying',productionCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:path.join(__dirname,'../..'),encoding:'utf8'}).trim(),url:base+'/',staticVersion:'20261009-mobile-r2',cache:'global-tycoon-v8-mobile',resources:[],tests:{distinctPassed:29,evidence:['mobile-final-tests.txt','mobile-rooms-final.txt','mobile-cache-final.txt']},limits:['实体手机/微信/iOS未实测','未测试冷启动','离线暂停新规则未实施']};
const normalize=s=>s.replace(/\r\n/g,'\n');
const hash=s=>crypto.createHash('sha256').update(normalize(s)).digest('hex');
async function connect(){const s=io(base,{transports:['websocket'],timeout:10000,reconnection:false});sockets.push(s);s.on('gameState',g=>{s.game=g;});await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;}
const ack=(s,event,data)=>new Promise((resolve,reject)=>s.timeout(10000).emit(event,data,(e,r)=>e?reject(e):resolve(r)));
async function until(fn){const limit=Date.now()+10000;while(!fn()){if(Date.now()>limit)throw new Error('等待状态超时');await new Promise(r=>setTimeout(r,50));}}
async function main(){
 await Promise.all(['index.html','client.js','style.css','rules-catalog.js','sw.js'].map(async file=>{const r=await fetch(base+'/'+file+'?verify=20261009-mobile-r2',{signal:AbortSignal.timeout(15000)});const body=await r.text(),local=fs.readFileSync(path.join(__dirname,'../../public',file),'utf8');const item={file,status:r.status,sha256:hash(body),matchesLocal:normalize(body)===normalize(local)};output.resources.push(item);assert.equal(r.status,200);assert.equal(item.matchesLocal,true,file);}));
 const health=await fetch(base+'/healthz',{signal:AbortSignal.timeout(15000)});output.health={status:health.status,body:await health.text()};assert.equal(health.status,200);
 const a=await connect(),b=await connect();const t=Date.now(),first=await ack(a,'createRoom',{name:'上线核验甲'}),second=await ack(a,'createRoom',{name:'上线核验甲'});assert.equal(first.ok,true);assert.equal(second.roomCode,first.roomCode);
 assert.equal((await ack(b,'joinRoom',{roomCode:first.roomCode,name:'上线核验乙'})).ok,true);assert.equal((await ack(a,'startGame',{})).ok,true);await until(()=>a.game?.phase==='opportunity_choose'&&b.game?.phase==='opportunity_choose');
 output.ownRoom={duplicateCreateSameRoom:true,twoPlayersStarted:true,transport:'websocket',requestSequenceMs:Date.now()-t};
 const end=await ack(a,'disbandRoom',{});assert.equal(end.ok,true);await until(()=>a.game?.phase==='game_over');output.ownRoom.disbanded=true;output.status='public_resources_and_own_room_verified';
}
main().catch(e=>{output.status='failed';output.error=e.message;process.exitCode=1;}).finally(()=>{for(const s of sockets)s.close();fs.writeFileSync(path.join(__dirname,'mobile-deployment.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));});
