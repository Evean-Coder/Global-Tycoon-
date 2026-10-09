'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGameState}=require('../src/state'),routes=require('../src/opportunityRoutes'),opp=require('../src/opportunities');
const {normalizeAction}=require('../src/actionValidation'),{createActionClock}=require('../src/actionClock');
const f=require('./helpers/gameplayFixtures');
const {io:Client}=require('socket.io-client'),api=require('../server'),logic=require('../src/gameLogic');
let url,sequence=0;const clients=[];
const ack=(s,event,data)=>new Promise(r=>s.emit(event,data,r));
async function until(fn){const end=Date.now()+3000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw new Error('等待状态超时');}
async function connect(compatible=true){const s=Client(url,{transports:['websocket'],auth:compatible?{clientRouteRevision:routes.REVISION}:{}});clients.push(s);s.on('gameState',g=>s.game=g);s.on('reconnectToken',t=>s.token=t.token);await new Promise(r=>s.once('connect',r));return s;}
async function setup(compatible=true){const a=await connect(),b=await connect(compatible),res=await ack(a,'createRoom',{name:'甲'});await ack(b,'joinRoom',{roomCode:res.roomCode,name:'乙'});const room=api.rooms.get(res.roomCode);room.rng=f.rng();return {a,b,room};}
function envelope(room,action){return {...action,gameId:room.state.gameId,actionId:'route-net-'+(++sequence),decisionId:room.actionClock.decisionId,actorRevision:room.state.actorRevision.p0};}
function fixture(room){room.state=ready();room.state.roomCode=room.code;room.actionClock.clear();api.emitGame(room);}
function controlledClock(room){let now=0;room.actionClock.clear();room.actionClock=createActionClock({now:()=>now,setTimeout:()=>1,clearTimeout:()=>{}});api.startTimer(room);return n=>{now=n;};}
function provider(room){let minute=15,closes=0;room.state.gameMode='quick';room.quickTimeProvider={read:()=>({mode:'quick',elapsedMs:minute*60000,totalRemainingMs:Math.max(0,(30-minute)*60000),closed:minute>=30}),close:()=>{closes++;room.state.status='over';room.state.phase='game_over';room.state.pending=null;}};return {set:n=>{minute=n;},closes:()=>closes};}
test.before(async()=>{await new Promise(r=>api.server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+api.server.address().port;});
test.afterEach(()=>{for(const s of clients.splice(0))s.close();for(const r of api.rooms.values()){r.actionClock.clear();if(r.hostTimer)clearTimeout(r.hostTimer);}api.rooms.clear();});
test.after(async()=>{await new Promise(r=>api.io.close(r));});
function ready(){
 const s=createGameState('SERVER',['甲','乙'],2,{routeRevision:routes.REVISION});
 for(const p of s.players)p.opportunities.selectedIds=['H1','H8','H10'];
 for(let ordinal=1;ordinal<=3;ordinal++){s.opportunityStage={ordinal,resolved:true};routes.markInitialResolved(s,ordinal);}
 for(let i=0;i<3;i++)opp.refresh(s.players[0]);routes.markLapProgress(s,'p0');routes.tryOpenRouteChoice(s,'p0',f.rng());return s;
}
function choice(s){const c=s.routeFlow.activeChoice;return {type:'route_confirm',opportunityId:c.opportunityId,candidateVersion:1,newId:c.candidateIds[0],replaceId:'H1'};}
test('S01 动作契约非法载荷越权与旧窗口',()=>{
 const s=ready(),a=choice(s),before=JSON.stringify(s);
 for(const raw of [null,{...a,newId:'bad'},{...a,replaceId:'H2'},{...a,candidateVersion:2},{...a,opportunityId:'old'}])assert.equal(normalizeAction(s,raw,{actorId:'p0',source:'player'}).ok,false);
 assert.equal(normalizeAction(s,a,{actorId:'p1',source:'player'}).ok,false);assert.equal(JSON.stringify(s),before);
 assert.equal(normalizeAction(s,a,{actorId:'p0',source:'player'}).ok,true);
});
test('S02 个人阶段只允许合法选择或服务端超时',()=>{
 const s=ready(),c=s.routeFlow.activeChoice;
 for(const type of ['roll_dice','mortgage','opportunity_reroll','surrender'])assert.equal(normalizeAction(s,{type},{actorId:'p0',source:'player'}).ok,false);
 assert.equal(normalizeAction(s,{type:'route_expire',opportunityId:c.opportunityId},{actorId:'p0',source:'player'}).ok,false);
 assert.equal(normalizeAction(s,{type:'route_expire',opportunityId:c.opportunityId},{source:'timeout'}).ok,true);
});
test('S03 决定身份时间与暂停恢复',()=>{
 const s=ready(),fake=f.fakeClock(),clock=createActionClock(fake);let expired=0;
 clock.sync(s,()=>expired++);assert.equal(clock.remainingMs,30000);fake.advance(8000);const deadline=clock.deadlineMs,id=clock.decisionId;
 clock.sync(s,()=>expired++);assert.equal(clock.deadlineMs,deadline);assert.equal(clock.decisionId,id);clock.pause();fake.advance(100000);assert.equal(expired,0);assert.equal(clock.remainingSeconds(),22);
 clock.resume(()=>expired++);fake.advance(22000);assert.equal(expired,1);clock.clear();
 const quick=ready();quick.gameMode='quick';clock.sync(quick,()=>expired++);assert.equal(clock.remainingMs,20000);quick.routeFlow.activeChoice.opportunityId+='new';clock.sync(quick,()=>expired++);assert.ok(clock.decisionId>id);clock.clear();
});

test('S04 新页面能力门槛与普通开局',async()=>{
 const {a,b,room}=await setup(false);assert.equal((await ack(a,'startGame',{})).ok,false);assert.equal(room.state,null);
 const token=b.token;b.close();await until(()=>!room.players[1].connected);const next=await connect();assert.equal((await ack(next,'reconnect',{roomCode:room.code,name:'乙',token})).ok,true);
 assert.equal((await ack(a,'startGame',{gameMode:'quick'})).ok,false);assert.equal((await ack(a,'startGame',{})).ok,true);
 assert.equal(room.state.routeRevision,routes.REVISION);assert.equal(room.state.gameMode,'normal');
});
test('S05 成交结果回执去重与非法请求不修改',async()=>{
 const {a,room}=await setup();fixture(room);
 const c=room.state.routeFlow.activeChoice; if(!c.candidateIds.includes('H12'))c.candidateIds=['H12','H2','H7'];
 const payload=envelope(room,{...choice(room.state),newId:'H12'}),cash=room.state.players[0].cash;
 const first=await ack(a,'action',payload);assert.equal(first.ok,true);assert.equal(first.routeResult.outcome,'replaced');assert.equal(room.state.players[0].cash,cash+6000);
 const after=JSON.stringify(room.state);assert.deepEqual(await ack(a,'action',payload),first);assert.equal(JSON.stringify(room.state),after);
 assert.equal((await ack(a,'action',{...payload,newId:'H2'})).code,'ACTION_ID');assert.equal(JSON.stringify(room.state),after);
 assert.equal((await ack(a,'action',{...payload,actionId:'new-stale'})).ok,false);assert.equal(JSON.stringify(room.state),after);
});
test('S06 确认前及执行跨个人截止不提交副本',async()=>{
 const {a,room}=await setup();fixture(room);let set=controlledClock(room);const deadline=room.actionClock.deadlineMs,cash=room.state.players[0].cash;
 set(deadline-1);assert.equal((await ack(a,'action',envelope(room,choice(room.state)))).ok,true);
 fixture(room);set=controlledClock(room);set(room.actionClock.deadlineMs);
 assert.equal((await ack(a,'action',envelope(room,choice(room.state)))).code,'EXPIRED');assert.equal(room.state.routeFlow.players.p0.lastResult.outcome,'expired');assert.equal(room.state.players[0].cash,cash);
 fixture(room);set=controlledClock(room);const original=logic.apply;logic.apply=(...args)=>{const res=original(...args);if(args[1].type==='route_confirm')set(30000);return res;};
 try{assert.equal((await ack(a,'action',envelope(room,choice(room.state)))).code,'EXPIRED');assert.equal(room.state.routeFlow.players.p0.lastResult.outcome,'expired');assert.deepEqual(room.state.players[0].opportunities.selectedIds,['H1','H8','H10']);}finally{logic.apply=original;}
});
test('S07 受控总时间提供者截止优先适配（非快速核心验收）',async()=>{
 const {a,room}=await setup();fixture(room);const p=provider(room);p.set(30);const payload=envelope(room,choice(room.state));
 assert.equal((await ack(a,'action',payload)).code,'OVER');assert.equal(p.closes(),1);assert.equal(room.state.routeFlow.activeChoice,null);assert.deepEqual(room.state.players[0].opportunities.selectedIds,['H1','H8','H10']);
 fixture(room);const q=provider(room),original=logic.apply,cash=room.state.players[0].cash;logic.apply=(...args)=>{const res=original(...args);q.set(30);return res;};
 try{assert.equal((await ack(a,'action',envelope(room,choice(room.state)))).code,'OVER');assert.equal(room.state.players[0].cash,cash);assert.equal(q.closes(),1);}finally{logic.apply=original;}
});
test('S08 受控时点仅登记一次且不改行动版本',async()=>{
 const {room}=await setup();fixture(room);room.state.routeFlow.activeChoice=null;room.state.phase='buy';room.state.pending={kind:'city',playerId:'p0',cityId:'内罗毕'};
 const p=provider(room),actor=room.state.actorRevision.p0;api.advanceRouteTime(room);const revision=room.state.revision,deadline=room.actionClock.deadlineMs;
 assert.equal(room.state.routeFlow.players.p0.pending.length,1);assert.equal(room.state.actorRevision.p0,actor);api.advanceRouteTime(room);assert.equal(room.state.revision,revision);assert.equal(room.actionClock.deadlineMs,deadline);
 p.set(22);api.advanceRouteTime(room);assert.equal(room.state.routeFlow.players.p0.pending.length,2);p.set(28);api.advanceRouteTime(room);assert.equal(room.state.routeFlow.players.p0.pending.length,0);assert.equal(room.state.routeFlow.laterClosed,true);
});
test('S09 重连恢复原候选与剩余时间',async()=>{
 const {a,room}=await setup();fixture(room);const fake=f.fakeClock();room.actionClock.clear();room.actionClock=createActionClock(fake);api.emitGame(room);fake.advance(7000);
 const candidates=[...room.state.routeFlow.activeChoice.candidateIds],token=a.token;a.close();await until(()=>room.actionClock.paused);fake.advance(60000);const next=await connect();
 assert.equal((await ack(next,'reconnect',{roomCode:room.code,name:'甲',token})).ok,true);await until(()=>next.game?.self.routeChoice);
 assert.deepEqual(next.game.self.routeChoice.candidateIds,candidates);assert.equal(next.game.decision.secondsRemaining,23);assert.equal(next.game.decision.paused,false);
});
test('S10 旧能力重连可查看但新局动作要求更新，旧局仍可操作',async()=>{
 const {a,room}=await setup();fixture(room);const token=a.token;a.close();await until(()=>!room.players[0].connected);const old=await connect(false);await ack(old,'reconnect',{roomCode:room.code,name:'甲',token});
 assert.equal((await ack(old,'action',envelope(room,choice(room.state)))).code,'UPDATE');
 room.state=f.game(2);room.actionClock.clear();api.emitGame(room);assert.equal((await ack(old,'action',envelope(room,{type:'roll_dice'}))).ok,true);
});
test('S11 房间结束清理且记录重复获取不重复结算',async()=>{
 const {a,room}=await setup();fixture(room);const cash=room.state.players[0].cash;assert.equal((await ack(a,'disbandRoom',{})).ok,true);
 assert.equal(room.state.routeFlow.activeChoice,null);assert.equal(room.state.players[0].cash,cash);assert.equal(room.gameRecord.events.filter(e=>e.kind==='route_cancelled').length,1);
 const record=room.gameRecord;assert.equal(api.finalizeGame(room,'disband'),record);
});
