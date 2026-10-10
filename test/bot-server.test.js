'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{io:Client}=require('socket.io-client');
const api=require('../server'),bots=require('../src/botScheduler'),f=require('./helpers/gameplayFixtures'),{createActionClock}=require('../src/actionClock'),stocks=require('../src/stocks');
let url,seq=0;const sockets=[];
const ack=(s,event,data={})=>new Promise(resolve=>s.emit(event,data,resolve));
async function connect(){const s=Client(url,{transports:['websocket'],auth:{clientRouteRevision:'opportunity-routes-v1',clientQuickRevision:'quick-mode-v1'}});sockets.push(s);s.on('gameState',g=>s.game=g);s.on('reconnectToken',t=>s.token=t.token);await new Promise(r=>s.once('connect',r));return s;}
async function until(fn){const end=Date.now()+4000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('电脑联机等待超时');}
async function setup(mode='normal'){const a=await connect(),created=await ack(a,'createRoom',{name:'真人'}),room=api.rooms.get(created.roomCode);room.botDelayMs=25;room.actionClock=createActionClock(f.fakeClock());room.rng=f.rng();assert.equal((await ack(a,'addBot')).ok,true);if(mode==='quick')assert.equal((await ack(a,'setRoomMode',{gameMode:mode})).ok,true);assert.equal((await ack(a,'startGame')).ok,true);await until(()=>a.game?.self.choice);return {a,room};}
async function act(a,action){return ack(a,'action',{...action,gameId:a.game.gameId,actionId:'human-'+(++seq),decisionId:a.game.decision.decisionId,actorRevision:a.game.self.actorRevision});}
function fixture(room,phase,pending=null){bots.stop(room);room.botMemory=new Map();room.state.phase=phase;room.state.pending=pending;room.state.turnIndex=1;room.state.firstRoundDone=true;room.state.revision++;room.state.opportunityStage=null;room.state.status='playing';room.actionClock.clear();api.emitGame(room,true);}
test.before(async()=>{await new Promise(r=>api.server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+api.server.address().port;});
test.afterEach(()=>{for(const room of api.rooms.values()){bots.stop(room);room.actionClock.clear();api.stopQuickTimers(room);clearTimeout(room.hostTimer);}for(const s of sockets.splice(0))s.close();api.rooms.clear();});
test.after(async()=>new Promise(r=>api.io.close(r)));
test('一个真人添加电脑正常/快速开局，电脑自动提交同步机遇，保留隐私',async()=>{
 for(const mode of ['normal','quick']){
  const {a,room}=await setup(mode);await until(()=>room.state.opportunityStage.participants.p1.submitted);
  assert.equal(a.game.players.find(p=>p.id==='p1').kind,'bot');assert.equal(a.game.players[1].socketId,null);assert.equal(a.game.players[1].propertySupport,undefined);
  assert.equal(a.game.self.playerId,'p0');const c=a.game.self.choice;assert.equal((await act(a,{type:'opportunity_choose',stageId:c.stageId,candidateVersion:c.candidateVersion,opportunityId:c.candidateIds[0]})).ok,true);
  await until(()=>a.game.phase==='waiting_roll');assert.equal(room.state.players[1].opportunities.selectedIds.length,1);
  assert.equal((await act(a,{type:'roll_dice'})).ok,true);
  bots.stop(room);room.actionClock.clear();api.stopQuickTimers(room);
 }
});
test('房主管理容量、非房主拒绝、电脑无法冒名重连、对局中增删拒绝',async()=>{
 const a=await connect(),b=await connect();const created=await ack(a,'createRoom',{name:'甲'}),room=api.rooms.get(created.roomCode);room.botDelayMs=25;
 await ack(b,'joinRoom',{roomCode:room.code,name:'乙'});assert.equal((await ack(b,'addBot')).ok,false);
 assert.equal((await ack(a,'addBot')).ok,true);const bot=room.players[2];assert.equal((await ack(b,'reconnect',{roomCode:room.code,name:bot.name,token:null})).ok,false);
 assert.equal((await ack(a,'removeBot',{playerId:bot.id})).ok,true);assert.equal(room.players.length,2);
 await ack(a,'addBot');await ack(a,'addBot');assert.equal((await ack(a,'addBot')).ok,false);await ack(a,'startGame');assert.equal((await ack(a,'removeBot',{playerId:'p2'})).ok,false);
});
test('电脑落点购买与掷骰推进，重复发布只调度一次，结束取消任务',async()=>{
 const {room}=await setup();const before=room.state.players[1].cash;fixture(room,'buy',{playerId:'p1',cityId:'内罗毕'});
 for(let i=0;i<8;i++)api.emitGame(room);assert.equal(room.botJobs.size,1);
 await until(()=>room.state.cities['内罗毕'].ownerId==='p1');assert.equal(room.state.players[1].cash,before-room.state.cities['内罗毕'].price);
 room.state.phase='game_over';room.state.status='over';api.emitGame(room);assert.equal(room.botJobs.size,0);assert.equal(room.gameRecord.players[1].kind,'bot');
});
test('最后真人掉线停止电脑并记录闲置，重连恢复，房主不会转给电脑',async()=>{
 const {a,room}=await setup();await until(()=>room.state.opportunityStage.participants.p1.submitted);const token=a.token;
 room.botDelayMs=300;fixture(room,'waiting_roll');const revision=room.state.revision;a.disconnect();await until(()=>room.players[0].connected===false);
 assert.equal(room.hostId,room.players[0].socketId);assert.ok(room.idleSince);assert.equal(room.botJobs.size,0);await new Promise(r=>setTimeout(r,350));assert.equal(room.state.revision,revision);
 const b=await connect();assert.equal((await ack(b,'reconnect',{roomCode:room.code,name:'真人',token})).ok,true);await until(()=>room.state.revision>revision);assert.equal(room.idleSince,null);
});
test('股票成交后正常退出，欠款优先卖股后恢复，不依赖真人按钮',async()=>{
 const {room}=await setup();stocks.transferCity(room.state,{cityId:'内罗毕',newOwnerId:'p1'},[]);stocks.openStockWindow(room.state,'p1');fixture(room,'stock',{playerId:'p1'});
 await until(()=>room.state.phase!=='stock');assert.ok(room.state.stocks['内罗毕'].holders.p1>0);
 const p=room.state.players[1];p.cash=-1000;fixture(room,'self_rescue',{playerId:'p1',due:1000,reason:'指定债务',resume:{type:'end_turn'}});
 await until(()=>room.state.players[1].cash>=0);assert.equal(room.state.players[1].alive,true);
});
test('清理删除房间后电脑没有残留任务',async()=>{
 const {room}=await setup();room.idleSince=Date.now()-1000;api.sweepRooms(Date.now(),{gameIdleMs:1});assert.equal(api.rooms.has(room.code),false);assert.equal(room.botJobs.size,0);
});
test('非当前回合电脑回应拍卖与直接出售，股票转让拒绝回到原窗口',async()=>{
 const {room}=await setup();stocks.transferCity(room.state,{cityId:'内罗毕',newOwnerId:'p0'},[]);
 room.botDelayMs=50;fixture(room,'auction_bid',{type:'auction',cityId:'内罗毕',sellerId:'p0',order:['p1'],index:0,currentBid:0,currentBidder:null,roundBidMade:false,awaiting:'p1'});room.state.turnIndex=0;api.emitGame(room);
 await until(()=>room.state.cities['内罗毕'].ownerId==='p1');
 stocks.transferCity(room.state,{cityId:'开普敦',newOwnerId:'p0'},[]);
 fixture(room,'direct_sale_ask',{type:'direct',cityId:'开普敦',sellerId:'p0',buyers:['p1'],buyerIndex:0,awaiting:'p1'});room.state.turnIndex=0;api.emitGame(room);
 await until(()=>room.state.cities['开普敦'].ownerId==='p1');
 room.state.stocks['内罗毕'].holders.p0=1;stocks.openStockWindow(room.state,'p0');const window=globalThis.structuredClone(room.state.stockWindow);
 fixture(room,'trade_confirm',{type:'trade_confirm',fromId:'p0',targetId:'p1',awaiting:'p1',items:[{cityId:'内罗毕',shares:1}],cash:1000,windowId:window.windowId,fromStock:{playerId:'p0',kind:'stock'}});room.state.turnIndex=0;room.state.stockWindow=window;api.emitGame(room);
 await until(()=>room.state.phase==='stock');assert.equal(room.state.stockWindow.windowId,window.windowId);assert.equal(room.state.stocks['内罗毕'].holders.p0,1);
});
test('后续路线选择使用本人成熟路线并能推进，快速封盘撤销电脑动作',async()=>{
 const {room}=await setup(),routes=require('../src/opportunityRoutes');
 const s=room.state;for(const p of s.players)p.opportunities.selectedIds=['H1','H8','H10'];
 for(let ordinal=1;ordinal<=3;ordinal++){s.opportunityStage={ordinal,resolved:true};routes.markInitialResolved(s,ordinal);}
 bots.stop(room);s.phase='waiting_roll';s.pending=null;s.turnIndex=1;
 s.routeFlow.players.p1.pending.push({opportunityId:s.gameId+':test-route',source:'lap:3'});
 assert.equal(routes.tryOpenRouteChoice(s,'p1',f.rng(),{mode:'normal',elapsedMs:null,totalRemainingMs:null,closed:false}).opened,true);s.revision++;room.actionClock.clear();api.emitGame(room,true);
 await until(()=>s!==room.state&&room.state.routeFlow.players.p1.lastResult);assert.equal(room.state.players[1].opportunities.selectedIds.length,3);
 const other=await setup('quick');api.closeQuickGame(other.room,'time_limit');api.emitGame(other.room);assert.equal(other.room.botJobs.size,0);assert.equal(other.room.state.phase,'game_over');
});
test('真实单人局主动结束、记录电脑身份、重开与旧回调隔离',async()=>{
 const {a,room}=await setup();await until(()=>room.state.opportunityStage.participants.p1.submitted);const c=a.game.self.choice;
 assert.equal((await act(a,{type:'opportunity_choose',stageId:c.stageId,candidateVersion:c.candidateVersion,opportunityId:c.candidateIds[0]})).ok,true);await until(()=>a.game.phase==='waiting_roll');
 assert.equal((await act(a,{type:'surrender'})).ok,true);await until(()=>a.game.phase==='game_over');assert.equal(room.botJobs.size,0);assert.equal(room.gameRecord.players[1].kind,'bot');
 const old=room.state.gameId;assert.equal((await ack(a,'startGame')).ok,true);await until(()=>a.game.gameId!==old);await until(()=>room.state.opportunityStage.participants.p1.submitted);assert.equal(room.state.players.length,2);assert.equal(room.state.players[1].opportunities.selectedIds.length,0);assert.equal(room.botMemory.get('p1').gameId,room.state.gameId);
});
