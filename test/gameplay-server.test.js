'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {io:Client}=require('socket.io-client');
const api=require('../server'),f=require('./helpers/gameplayFixtures');
const {createActionClock}=require('../src/actionClock');
const {snapshot}=require('../src/state');
let url,seq=0;
const sockets=[];
const ack=(s,event,data)=>new Promise(resolve=>s.emit(event,data,resolve));
async function connect(){const s=Client(url,{transports:['websocket']});sockets.push(s);s.on('gameState',g=>s.game=g);s.on('reconnectToken',t=>s.token=t.token);await new Promise(r=>s.once('connect',r));return s;}
async function setup(n=3){const clients=[];for(let i=0;i<n;i++)clients.push(await connect());const result=await ack(clients[0],'createRoom',{name:'玩家0'});for(let i=1;i<n;i++)await ack(clients[i],'joinRoom',{name:'玩家'+i,roomCode:result.roomCode});const room=api.rooms.get(result.roomCode),fake=f.fakeClock();room.actionClock=createActionClock(fake);room.rng=f.rng();await ack(clients[0],'startGame',{});return {room,clients,fake};}
function envelope(s,a,id){const g=s.game;return {...a,gameId:g.gameId,actionId:id||'net-'+(++seq),decisionId:g.decision.decisionId,actorRevision:g.self.actorRevision};}
async function action(s,a,id){return ack(s,'action',envelope(s,a,id));}
function choice(s){const c=s.game.self.choice;return {type:'opportunity_choose',stageId:c.stageId,candidateVersion:c.candidateVersion,opportunityId:c.candidateIds[0]};}
async function until(fn){const end=Date.now()+3000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw new Error('等待联机状态超时');}
test.before(async()=>{await new Promise(r=>api.server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+api.server.address().port;});
test.afterEach(()=>{for(const s of sockets.splice(0))s.close();for(const room of api.rooms.values()){room.actionClock.clear();if(room.hostTimer)clearTimeout(room.hostTimer);}api.rooms.clear();});
test.after(async()=>{await new Promise(r=>api.io.close(r));});
test('逐人私有投影 / 三十秒时钟 / 迟到消息与同时提交',async()=>{
 const {room,clients,fake}=await setup(),[a,b,c]=clients;
 await until(()=>clients.every(s=>s.game?.self.choice));
 assert.equal(room.actionClock.remainingMs,30000);
 const publicBefore=snapshot(room.state);assert.equal(publicBefore.self,undefined);
 const aChoice=choice(a),bPayload=envelope(b,choice(b));
 const aPayload=envelope(a,aChoice,'retry-choice'),first=await ack(a,'action',aPayload);assert.equal(first.ok,true);
 const original=JSON.stringify(room.state),replay=await ack(a,'action',aPayload);assert.deepEqual(replay,first);assert.equal(JSON.stringify(room.state),original);
 assert.equal((await ack(a,'action',{...aPayload,opportunityId:'H12'})).ok,aPayload.opportunityId==='H12');
 await until(()=>b.game.opportunityStage.completed.p0);
 assert.equal(b.game.players[0].opportunities.selectedIds.length,0);assert.equal(b.game.self.choice.submitted,false);
 const other=JSON.stringify(b.game);assert.equal(other.includes('submittedId'),true);assert.equal('participants' in b.game.opportunityStage,false);assert.equal('typeBag' in b.game.world,false);
 assert.equal((await ack(b,'action',bPayload)).ok,true,'他人的提交不使本人的操作版本过期');
 const late=envelope(c,choice(c));fake.advance(29999);assert.equal(room.state.phase,'opportunity_choose');fake.advance(1);
 await until(()=>c.game.phase!=='opportunity_choose');assert.equal(room.state.opportunityStage.resolved,true);assert.equal(room.state.players[2].opportunities.selectedIds[0],c.game.players[2].opportunities.selectedIds[0]);
 assert.equal((await ack(c,'action',late)).ok,false);
});
test('换组选项不延长倒计时 / 断线暂停 / 重连保留选项和剩余秒数',async()=>{
 const {room,clients,fake}=await setup(2),[a,b]=clients;await until(()=>b.game?.self.choice);
 const old=b.game.self.choice.candidateIds.slice(),c=b.game.self.choice;
 fake.advance(5000);assert.equal((await action(b,{type:'opportunity_reroll',stageId:c.stageId,candidateVersion:c.candidateVersion})).ok,true);
 assert.equal(room.actionClock.remainingMs,25000);assert.equal(room.state.players[1].opportunities.rerollsLeft,0);
 const changed=room.state.opportunityStage.participants.p1.candidateIds.slice();assert.ok(changed.every(x=>!old.includes(x)));
 await action(a,choice(a));const token=b.token,code=room.code;b.close();await until(()=>room.actionClock.paused);
 fake.advance(100000);assert.equal(room.state.phase,'opportunity_choose');assert.equal(room.actionClock.remainingMs,25000);
 const b2=await connect();assert.equal((await ack(b2,'reconnect',{name:'玩家1',roomCode:code,token})).ok,true);await until(()=>b2.game?.self.choice);
 assert.deepEqual(b2.game.self.choice.candidateIds,changed);assert.equal(b2.game.self.choice.rerollsLeft,0);assert.equal(b2.game.decision.secondsRemaining,25);assert.equal(b2.game.decision.paused,false);
 await action(b2,choice(b2));assert.equal(room.state.phase,'waiting_roll');
});
test('普通动作封装 / 费用版本 / 去重缓存 / 新开局隔离 / 未确认选择终止',async()=>{
 const {room,clients}=await setup(2),[a,b]=clients;await until(()=>b.game?.self.choice);
 assert.equal((await action(a,{type:'roll_dice'})).ok,false);
 await action(a,choice(a));await action(b,choice(b));await until(()=>a.game.phase==='waiting_roll');
 const payload=envelope(a,{type:'roll_dice'},'one-roll');assert.equal((await ack(a,'action',payload)).ok,true);
 const after=JSON.stringify(room.state);assert.equal((await ack(a,'action',payload)).ok,true);assert.equal(JSON.stringify(room.state),after);
 assert.equal((await ack(a,'action',{...payload,actionId:'other-old'})).ok,false);
 assert.equal((await ack(a,'disbandRoom',{})).ok,true);await until(()=>a.game.phase==='game_over');
 const id=room.state.gameId;assert.equal(room.gameRecord.schema,'global-tycoon.game-record.v2');assert.equal('opportunityStage' in room.gameRecord,false);
 assert.equal((await ack(a,'startGame',{})).ok,true);await until(()=>a.game.gameId!==id);
 assert.equal(room.successfulActions.size,0);assert.equal(room.eventSeq,0);assert.equal(room.gameRecord,null);assert.equal((await ack(a,'action',payload)).ok,false);
 await ack(a,'disbandRoom',{});assert.equal(room.state.players[0].opportunities.selectedIds.length,0);assert.equal(room.state.players[0].cash,150000);
});
