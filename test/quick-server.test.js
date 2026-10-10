'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {io:Client}=require('socket.io-client'),api=require('../server');
const {createActionClock}=require('../src/actionClock'),logic=require('../src/gameLogic');
const f=require('./helpers/gameplayFixtures'),stocks=require('../src/stocks');
let url,sequence=0;const clients=[];
const ack=(s,event,data)=>new Promise((resolve,reject)=>{s.timeout(3000).emit(event,data,(err,result)=>err?reject(err):resolve(result));});
async function until(fn){const end=Date.now()+3000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw new Error('等待状态超时');}
async function connect(quick=true){const s=Client(url,{transports:['websocket'],auth:{clientRouteRevision:'opportunity-routes-v1',...(quick?{clientQuickRevision:'quick-mode-v1'}:{})}});clients.push(s);s.on('gameState',g=>s.game=g);s.on('roomState',g=>s.room=g);s.on('gameRecord',g=>s.record=g);s.on('reconnectToken',t=>s.token=t.token);await new Promise(r=>s.once('connect',r));return s;}
function timeSource(){let value=0,sequence=0;const timers=new Map();return {now:()=>value,setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,at:value+delay});return id;},clearTimeout:id=>timers.delete(id),set(n){value=n;},advance(n){value+=n;for(const[id,t]of [...timers])if(t.at<=value&&timers.has(id)){timers.delete(id);t.fn();}},timers};}
async function setup(n=2,compatible=true){const a=await connect(),others=[];const result=await ack(a,'createRoom',{name:'甲'});for(let i=1;i<n;i++){const b=await connect(compatible);await ack(b,'joinRoom',{roomCode:result.roomCode,name:'玩家'+i});others.push(b);}const room=api.rooms.get(result.roomCode),time=timeSource();room.rng=f.rng();room.quickClockOptions=time;room.actionClock=createActionClock(time);return {a,b:others[0],clients:[a,...others],room,time};}
async function start(x){assert.equal((await ack(x.a,'setRoomMode',{gameMode:'quick'})).ok,true);const res=await ack(x.a,'startGame',{gameMode:'quick'});assert.equal(res.ok,true,JSON.stringify(res));}
function envelope(room,id,action){return {...action,gameId:room.state.gameId,actionId:'quick-'+(++sequence),decisionId:room.actionClock.decisionId,actorRevision:room.state.actorRevision[id]};}
async function submit(x,id,action){return ack(x.clients[+id.slice(1)],'action',envelope(x.room,id,action));}
async function initial(x){const stage=x.room.state.opportunityStage;for(const id of stage.participantIds){const c=stage.participants[id];assert.equal((await submit(x,id,{type:'opportunity_choose',stageId:stage.stageId,candidateVersion:c.candidateVersion,opportunityId:c.candidateIds[0]})).ok,true);}}
async function allInitial(x){await initial(x);x.time.set(600000);api.advanceRouteTime(x.room);await initial(x);await initial(x);}
test.before(async()=>{await new Promise(r=>api.server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+api.server.address().port;});
test.afterEach(()=>{for(const s of clients.splice(0))s.close();for(const r of api.rooms.values()){api.stopQuickTimers(r);r.actionClock.clear();if(r.hostTimer)clearTimeout(r.hostTimer);}api.rooms.clear();});
test.after(async()=>{await new Promise(r=>api.io.close(r));});

test('QS01: room modes agree for two to four players and enforce owner permissions',async()=>{
  for(const n of [2,3,4]){const x=await setup(n);assert.equal(x.room.gameMode,'normal');assert.equal((await ack(x.b,'setRoomMode',{gameMode:'quick'})).ok,false);assert.equal((await ack(x.a,'setRoomMode',{gameMode:'bad'})).ok,false);await start(x);await until(()=>x.clients.every(c=>c.room?.gameMode==='quick'));assert.equal((await ack(x.a,'setRoomMode',{gameMode:'normal'})).ok,false);}
});
test('QS02: capabilities and conflicting mode fail without replacing prior state',async()=>{
  const x=await setup(2,false);await ack(x.a,'setRoomMode',{gameMode:'quick'});assert.equal((await ack(x.a,'startGame',{})).ok,false);assert.equal(x.room.state,null);assert.equal(x.room.quickClock,undefined);
  await ack(x.a,'setRoomMode',{gameMode:'normal'});assert.equal((await ack(x.a,'startGame',{gameMode:'quick'})).ok,false);assert.equal((await ack(x.a,'startGame',{})).ok,true);const state=x.room.state;assert.equal((await ack(x.a,'startGame',{})).ok,false);assert.equal(x.room.state,state);
});
test('QS03: real total clock begins with first choice and shares injected time source',async()=>{
  const x=await setup();x.time.advance(50000);await start(x);assert.equal(x.room.state.phase,'opportunity_choose');assert.equal(x.room.quickClock.read().elapsedMs,0);x.time.set(51000);assert.equal(x.room.quickTimeProvider.read().elapsedMs,1000);assert.equal(x.room.actionClock.remainingSeconds(),29);
});
test('QS04: atomic close can retry after failed economic checks with no partial authoritative mutation',async()=>{
  const x=await setup();await start(x);f.own(x.room.state,'p0','上海');x.room.state.stocks['上海'].dividendFund=Infinity;const before=globalThis.structuredClone(x.room.state);x.time.set(1800000);
  assert.throws(()=>api.closeQuickGame(x.room,'time_limit'),/金额/);assert.deepEqual(x.room.state,before);assert.equal(x.room.gameRecord,null);
  x.room.state.stocks['上海'].dividendFund=2000;api.closeQuickGame(x.room,'time_limit');const cash=x.room.state.players[0].cash;api.closeQuickGame(x.room,'time_limit');assert.equal(x.room.state.players[0].cash,cash);assert.equal(cash,152000);
});
test('QS05: skipped nodes, warning deduplication and late callbacks prioritize total deadline',async()=>{
  const x=await setup();await start(x);x.time.set(1500000);api.advanceRouteTime(x.room);api.advanceRouteTime(x.room);assert.equal(x.room.events.filter(e=>e.kind==='quick_warning').length,1);
  x.time.set(1680000);api.advanceRouteTime(x.room);assert.equal(x.room.events.filter(e=>e.kind==='quick_warning').length,2);const rounds=x.room.state.rounds,cash=x.room.state.players.map(p=>p.cash);
  x.time.advance(120000);assert.equal(x.room.state.phase,'game_over');assert.equal(x.room.state.rounds,rounds);assert.deepEqual(x.room.state.players.map(p=>p.cash),cash);assert.equal(x.room.events.filter(e=>e.kind==='quick_end').length,1);
});
test('QS06: committed action survives deadline; execution crossing cutoff discards candidate',async()=>{
  const x=await setup();await start(x);await allInitial(x);x.time.set(1799999);api.advanceRouteTime(x.room);x.room.actionClock.clear();api.startTimer(x.room);
  const res=await submit(x,'p0',{type:'roll_dice'});assert.equal(res.ok,true,JSON.stringify(res));const position=x.room.state.players[0].position;
  x.time.set(1800000);assert.equal((await submit(x,'p0',{type:'roll_dice'})).code,'OVER');assert.equal(x.room.state.players[0].position,position);
  const y=await setup();await start(y);await allInitial(y);y.time.set(1799999);api.advanceRouteTime(y.room);y.room.actionClock.clear();api.startTimer(y.room);const before=globalThis.structuredClone(y.room.state),original=logic.apply;
  logic.apply=(...args)=>{const result=original(...args);y.time.set(1800000);return result;};
  try{assert.equal((await submit(y,'p0',{type:'roll_dice'})).code,'OVER');assert.equal(y.room.state.players[0].position,before.players[0].position);assert.deepEqual(y.room.state.diceBag,before.diceBag);}finally{logic.apply=original;}
});
test('QS07: successful receipt remains queryable after closure while new requests fail',async()=>{
  const x=await setup();await start(x);const c=x.room.state.opportunityStage.participants.p0,raw=envelope(x.room,'p0',{type:'opportunity_choose',stageId:x.room.state.opportunityStage.stageId,candidateVersion:c.candidateVersion,opportunityId:c.candidateIds[0]});
  const first=await ack(x.a,'action',raw);assert.equal(first.ok,true);x.time.set(1800000);api.advanceRouteTime(x.room);assert.deepEqual(await ack(x.a,'action',raw),first);assert.equal((await ack(x.a,'action',{...raw,opportunityId:'bad'})).code,'ACTION_ID');assert.equal((await ack(x.a,'action',{...raw,actionId:'new'})).code,'OVER');
});
test('QS08: same decision has no refill, simultaneous personal and total deadline only closes',async()=>{
  const x=await setup();await start(x);await initial(x);const id=x.room.actionClock.decisionId,deadline=x.room.actionClock.deadlineMs;x.time.set(1000);api.emitGame(x.room);assert.equal(x.room.actionClock.decisionId,id);assert.equal(x.room.actionClock.deadlineMs,deadline);
  x.time.set(1799990);x.room.actionClock.clear();api.startTimer(x.room);assert.equal(x.room.actionClock.remainingMs,10);x.time.advance(10);assert.equal(x.room.state.phase,'game_over');assert.equal(x.room.state.dice,null);
});
test('QS09: stock quote updates keep budget; unconfirmed transfer is cancelled at deadline',async()=>{
  const x=await setup();await start(x);await initial(x);f.own(x.room.state,'p0','上海');const st=x.room.state.stocks['上海'];st.holders.p0=1;stocks.syncHolders(x.room.state);stocks.openStockWindow(x.room.state,'p0');
  x.room.state.phase='stock';x.room.state.pending={kind:'go_stock',playerId:'p0'};api.emitGame(x.room);const deadline=x.room.actionClock.deadlineMs;stocks.refreshPrice(x.room.state,'上海','test');api.emitGame(x.room);assert.equal(x.room.actionClock.deadlineMs,deadline);
  const transfer=await submit(x,'p0',{type:'stock_transfer',windowId:x.room.state.stockWindow.windowId,targetId:'p1',items:[{cityId:'上海',shares:1}],cash:100});assert.equal(transfer.ok,true,JSON.stringify(transfer));x.time.set(5000);assert.equal((await submit(x,'p1',{type:'stock_transfer',accept:false})).ok,true);assert.equal(x.room.actionClock.remainingMs,15000);assert.equal(x.room.actionClock.deadlineMs,deadline);const second=await submit(x,'p0',{type:'stock_transfer',windowId:x.room.state.stockWindow.windowId,targetId:'p1',items:[{cityId:'上海',shares:1}],cash:100});assert.equal(second.ok,true);const before=x.room.state.players.map(p=>p.cash);x.time.set(1800000);api.advanceRouteTime(x.room);assert.deepEqual(x.room.state.players.map(p=>p.cash),before);assert.equal(x.room.state.stocks['上海'].holders.p0,1);
});
test('QS10: due initial stages open safely in order without replaying turn preparation',async()=>{
  const x=await setup();await start(x);await initial(x);const turn=x.room.state.turnId;x.time.set(600000);api.advanceRouteTime(x.room);assert.equal(x.room.state.opportunityStage.ordinal,2);await initial(x);assert.equal(x.room.state.opportunityStage.ordinal,3);await initial(x);assert.equal(x.room.state.routeFlow.initialCompletedOrdinal,3);assert.equal(x.room.state.turnId,turn);assert.equal(x.room.state.phase,'waiting_roll');
});
test('QS11: later milestones queue once, active choice survives 28 then cancels at 30',async()=>{
  const x=await setup();await start(x);await initial(x);x.time.set(600000);api.advanceRouteTime(x.room);await initial(x);await initial(x);
  x.time.set(900000);api.advanceRouteTime(x.room);const c=x.room.state.routeFlow.activeChoice;assert.ok(c);api.advanceRouteTime(x.room);assert.equal(x.room.state.routeFlow.players.p0.pending.length,0);
  x.time.set(1320000);api.advanceRouteTime(x.room);assert.equal(x.room.state.routeFlow.players.p0.pending.length,1);x.time.set(1680000);api.advanceRouteTime(x.room);assert.equal(x.room.state.routeFlow.activeChoice.opportunityId,c.opportunityId);assert.equal(x.room.state.routeFlow.players.p0.pending.length,0);
  const held=x.room.state.players[0].opportunities.selectedIds.slice();x.time.set(1800000);api.advanceRouteTime(x.room);assert.equal(x.room.state.routeFlow.activeChoice,null);assert.deepEqual(x.room.state.players[0].opportunities.selectedIds,held);
});
