'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {io:Client}=require('socket.io-client');
const api=require('../server'),f=require('./helpers/gameplayFixtures');
const {createActionClock}=require('../src/actionClock');
const {snapshot}=require('../src/state');
const stocks=require('../src/stocks');
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
 const {room,clients,fake}=await setup(),[a,b,c]=clients,outsider=await connect();
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
 assert.equal(outsider.game,undefined,'无房间身份连接不得收到对局私有状态');
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

// 以下单项边界用独立账务夹具；连续合法经营流程见 gameplay-scenario.test.js。
async function publish(room,clients,state){room.state=state;room.actionClock.clear();api.emitGame(room);await until(()=>clients.every(s=>s.game?.revision===state.revision&&s.game.gameId===state.gameId));}
test('V1、V5 二至四人真实开局、健康检查与重新开局',async()=>{
 assert.equal(await (await globalThis.fetch(url+'/healthz')).text(),'ok');
 for(const n of [2,3,4]){const {room,clients}=await setup(n);await until(()=>clients.every(s=>s.game?.self.choice));assert.equal(room.state.phase,'opportunity_choose');assert.equal(room.state.opportunityStage.participantIds.length,n);const id=room.state.gameId;await ack(clients[0],'disbandRoom',{});await ack(clients[0],'startGame',{});await until(()=>clients.every(s=>s.game?.gameId!==id));assert.equal(room.state.opportunityStage.ordinal,1);assert.equal(clients[0].game.self.choice.candidateIds.length,3);}
});
test('V66 已提交重连保留锁定、候选与剩余时间',async()=>{
 const {room,clients,fake}=await setup(2),[a,b]=clients;await until(()=>b.game?.self.choice);await action(a,choice(a));await until(()=>a.game.self.choice.submitted);const entry=a.game.self.choice,token=a.token;fake.advance(4000);a.close();await until(()=>room.actionClock.paused);fake.advance(60000);const a2=await connect();await ack(a2,'reconnect',{roomCode:room.code,name:'玩家0',token});await until(()=>a2.game?.self.choice);assert.deepEqual(a2.game.self.choice,entry);assert.equal(a2.game.decision.secondsRemaining,26);await action(b,choice(b));assert.equal(room.state.players[0].opportunities.selectedIds.length,1);
});
test('V46、V66、V67 股票重连不重置累计预算，成交重放一次',async()=>{
 const {room,clients,fake}=await setup(2),[a,b]=clients;await until(()=>b.game?.self.choice);const s=f.game(2);f.own(s,'p1','上海');s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};stocks.openStockWindow(s,'p0');await publish(room,clients,s);
 const payload=envelope(a,{type:'stock_trade',windowId:s.stockWindow.windowId,orders:[f.order(s,'上海','buy',1)]},'buy-once');assert.equal((await ack(a,'action',payload)).ok,true);await until(()=>a.game.revision===room.state.revision);const after=JSON.stringify(room.state);assert.equal((await ack(a,'action',payload)).ok,true);assert.equal(JSON.stringify(room.state),after);
 fake.advance(7000);const token=a.token;a.close();await until(()=>room.actionClock.paused);const w=globalThis.structuredClone(room.state.stockWindow);fake.advance(80000);const a2=await connect();await ack(a2,'reconnect',{roomCode:room.code,name:'玩家0',token});await until(()=>a2.game?.self.stockWindow);assert.deepEqual(a2.game.self.stockWindow,w);assert.equal(a2.game.decision.secondsRemaining,53);
 assert.equal((await action(a2,{type:'stock_trade',windowId:w.windowId,orders:[f.order(room.state,'上海','buy',2)]})).ok,false);assert.deepEqual(room.state.stockWindow,w);assert.equal(room.state.players[0].cash,146000);
});
test('V26、V67 远程重放、报价过期、越权及成功缓存有界',async()=>{
 const {room,clients,fake}=await setup(2),[a,b]=clients;await until(()=>b.game?.self.choice);const s=f.game(2);f.own(s,'p0','上海');f.selected(s,'p0','H1','H2');s.players[0].position=36;await publish(room,clients,s);fake.advance(1000);
 const q=a.game.self.quotes.remote['上海'],payload=envelope(a,{type:'remote_build',cityId:'上海',quoteVersion:q.quoteVersion},'remote-once');const before=JSON.stringify(room.state),deadline=room.actionClock.deadlineMs;
 assert.equal((await ack(b,'action',{...payload,actorRevision:b.game.self.actorRevision})).ok,false);assert.equal(JSON.stringify(room.state),before);
 assert.equal((await ack(a,'action',{...payload,actionId:'bad-quote',quoteVersion:'old'})).ok,false);assert.equal(JSON.stringify(room.state),before);assert.equal(room.actionClock.deadlineMs,deadline);
 const receipt=await ack(a,'action',payload);assert.equal(receipt.ok,true);assert.equal(room.state.players[0].cash,139200);const once=JSON.stringify(room.state);assert.deepEqual(await ack(a,'action',payload),receipt);assert.equal(JSON.stringify(room.state),once);assert.equal((await ack(a,'action',{...payload,cityId:'东京'})).ok,false);
 for(let i=0;i<130;i++){await until(()=>a.game.revision===room.state.revision);assert.equal((await action(a,{type:i%2?'redeem':'mortgage',cityId:'上海'},'bounded-'+i)).ok,true);}
 assert.equal(room.successfulActions.get('p0').size,128);assert.equal(room.successfulActions.get('p0').has('remote-once'),false);const final=JSON.stringify(room.state);assert.equal((await ack(a,'action',payload)).ok,false);assert.equal(JSON.stringify(room.state),final);assert.equal(room.actionClock.deadlineMs,deadline);
});
test('V64 暂停解散与闲置结束先派息，记录和重复终止一致',async()=>{
 for(const mode of ['disband','idle_timeout']){const {room,clients}=await setup(2),[a,b]=clients;await until(()=>b.game?.self.choice);const s=f.game(2);f.own(s,'p0','上海');s.stocks['上海'].holders.p1=2;s.stocks['上海'].dividendFund=2000;stocks.refreshPrice(s,'上海','待分红增加');stocks.syncHolders(s);await publish(room,clients,s);b.close();await until(()=>room.actionClock.paused);
  if(mode==='disband')assert.equal((await ack(a,'disbandRoom',{})).ok,true);else{a.close();await until(()=>room.idleSince!=null);api.sweepRooms(Date.now(),{gameIdleMs:0});assert.equal(api.rooms.has(room.code),false);}
  assert.equal(room.state.stocks['上海'].dividendFund,0);assert.equal(room.state.players[1].cash,150200);assert.equal(room.state.players[0].cash,151800);const rec=room.gameRecord;assert.equal(rec.endReason,mode);assert.strictEqual(api.finalizeGame(room,mode),rec);assert.equal(room.state.players[1].cash,150200);
 }
});
test('V4 缺新增信息旧对局认证重连后仍按旧规则，新开局升级',async()=>{
 const {room,clients}=await setup(2),[a,b]=clients;await until(()=>b.game?.self.choice);const s=f.game(2,1);delete s.ruleVersion;delete s.world;delete s.roundFlow;delete s.actorRevision;delete s.gameId;for(const p of s.players)delete p.opportunities;room.state=s;room.actionClock.clear();api.emitGame(room);await until(()=>a.game.ruleVersion===undefined);const token=b.token;b.close();await until(()=>room.actionClock.paused);const b2=await connect();await ack(b2,'reconnect',{roomCode:room.code,name:'玩家1',token});await until(()=>b2.game?.phase==='waiting_roll');assert.equal(b2.game.self,undefined);assert.equal(b2.game.world,undefined);assert.equal((await ack(a,'action',{type:'roll_dice'})).ok,true);await ack(a,'disbandRoom',{});assert.equal(room.gameRecord.schema,'global-tycoon.game-record.v1');await ack(a,'startGame',{});await until(()=>a.game?.ruleVersion===2);assert.equal(a.game.phase,'opportunity_choose');
});
test('V49、V67 协商转让确认重放只转一次，不提前派息',async()=>{
 const {room,clients}=await setup(2),[a,b]=clients;await until(()=>b.game?.self.choice);const s=f.game(2);f.own(s,'p1','上海');s.stocks['上海'].holders.p0=2;s.stocks['上海'].dividendFund=2000;stocks.refreshPrice(s,'上海','待分红增加');stocks.syncHolders(s);s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};stocks.openStockWindow(s,'p0');await publish(room,clients,s);await action(a,{type:'stock_transfer',windowId:s.stockWindow.windowId,targetId:'p1',items:[{cityId:'上海',shares:1}],cash:500});await until(()=>b.game.phase==='trade_confirm');const payload=envelope(b,{type:'stock_transfer',accept:true},'accept-once');const receipt=await ack(b,'action',payload);assert.equal(receipt.ok,true);const after=JSON.stringify(room.state);assert.deepEqual(await ack(b,'action',payload),receipt);assert.equal(JSON.stringify(room.state),after);assert.equal(room.state.players[0].cash,150500);assert.equal(room.state.players[1].cash,149500);assert.equal(room.state.stocks['上海'].dividendFund,2000);assert.equal(room.state.stockWindow.boughtTotal,0);
});
