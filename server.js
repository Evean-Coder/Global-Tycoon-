'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { createGameState, snapshot, resetDeck } = require('./src/state');
const logic = require('./src/gameLogic');
const { createRng } = require('./src/random');
const { buildGameRecord } = require('./src/record');
const privateReplay = require('./src/privateReplay');
const { normalizeAction, validateEnvelope } = require('./src/actionValidation');
const { createActionClock } = require('./src/actionClock');
const { createQuickClock } = require('./src/quickClock');
const quick = require('./src/quickMode');
const opportunities = require('./src/opportunities');
const routes = require('./src/opportunityRoutes');
const stocks = require('./src/stocks');
const { assetSummary } = require('./src/assets');
const { safe } = require('./src/economy');
const botPolicy = require('./src/botPolicy');
const botScheduler = require('./src/botScheduler');
const BOT_AUTH = Symbol('internal-bot');

const PORT = process.env.PORT || 3000;
// 2026-10-05有限对照及投资压力审查通过，仅新局启用；旧局不迁移。
const NEW_GAME_ECONOMY = { economyRevision: 'travel-expense-v1', routeRevision: routes.REVISION, gameMode: 'normal', propertySupportRevision:require('./src/propertySupport').REVISION, activeManagementRevision:require('./src/activeManagement').REVISION };
const HOST_TRANSFER_MS = 10 * 60 * 1000;
const LOBBY_IDLE_MS = 10 * 60 * 1000; // 大厅（未开局）空房保留时限
const GAME_IDLE_MS = 30 * 60 * 1000; // 对局中/已结束房间无人保留时限
const SWEEP_INTERVAL_MS = 60 * 1000; // 房间清扫周期
const RECORDS_DIR = path.join(__dirname, 'records'); // 对局记录落盘目录

const app = express();
app.get('/healthz', (req, res) => res.send('ok')); // Render 健康检查
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server);

// 异常兜底：记录日志后保持进程存活，避免单个错误拖垮所有房间
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

const rooms = new Map(); // roomCode -> room

function genToken() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

function issueToken(socket, rp) {
  rp.token = genToken();
  socket.emit('reconnectToken', { token: rp.token });
}

function genRoomCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

function makeRoom(hostSocket, name) {
  const code = genRoomCode();
  const room = {
    code,
    hostId: hostSocket.id,
    players: [{ socketId: hostSocket.id, id: 'p0', name, seat: 0, connected: true, token: null }],
    state: null,
    gameMode: 'normal',
    timers: new Map(),
    hostTimer: null,
    awaiting: null, // {playerId, phase}
    lastEvents: [], // 最近一次动作的事件日志（仅用于前端展示）
    eventSeq: 0, // 事件全局序号（用于前端去重与排序）
    lastEventBase: 0,
    events: [], // 完整对局事件流水（用于生成对局数据记录）
    gameRecord: null, // 已生成的对局记录（防重复）
    actionClock: createActionClock(),
    successfulActions: new Map(),
    idleSince: null, // 最后一名在线玩家断开的时间；null 表示有人在线
  };
  issueToken(hostSocket, room.players[0]);
  rooms.set(code, room);
  hostSocket.join(`room:${code}`);
  return room;
}

function touchRoom(room) {
  room.idleSince = null; // 有玩家加入/重连时取消闲置计时
}

function shouldSweepRoom(room, now, cfg) {
  if (room.idleSince == null) return false; // 有人在线的房间永不清理
  const c = Object.assign({ lobbyIdleMs: LOBBY_IDLE_MS, gameIdleMs: GAME_IDLE_MS }, cfg);
  const idle = now - room.idleSince;
  return room.state ? idle >= c.gameIdleMs : idle >= c.lobbyIdleMs;
}

function persistRecord(record, dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, record.roomCode + '-' + record.startedAt + '.json'), JSON.stringify(record, null, 2));
  } catch (err) {
    console.error('[record] 落盘失败:', err);
  }
}

function sweepRooms(now = Date.now(), cfg) {
  const c = Object.assign({ lobbyIdleMs: LOBBY_IDLE_MS, gameIdleMs: GAME_IDLE_MS }, cfg);
  for (const [code, room] of rooms) {
    if (!shouldSweepRoom(room, now, c)) continue;
    if (room.state && !room.gameRecord) finalizeGame(room, 'idle_timeout');
    clearTimer(room, 'action');
    if (room.actionClock) room.actionClock.clear();
    stopQuickTimers(room);
    botScheduler.stop(room);
    if (room.hostTimer) {
      clearTimeout(room.hostTimer);
      room.hostTimer = null;
    }
    rooms.delete(code);
  }
}

function roomStatePayload(room) {
  return {
    roomCode: room.code,
    hostId: room.hostId,
    players: room.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, connected: p.connected, kind:p.kind||'human' })),
    started: !!room.state,
    gameMode: room.gameMode || 'normal',
  };
}

function emitRoom(room) {
  io.to(`room:${room.code}`).emit('roomState', roomStatePayload(room));
}

function emitGame(room, newDecision = false) {
  privateReplay.capture(room, room.replayMetadata);
  room.replayMetadata = undefined;
  if (!room.state) return;
  if (quick.enabled(room.state) && room.state.quick.status !== 'closed' && room.quickClock?.read().elapsedMs >= 1800000) closeQuickGame(room, 'time_limit');
  if (room.state.phase === 'game_over' && !room.gameRecord) finalizeGame(room, 'normal');
  startTimer(room, newDecision);
  const thinking=botScheduler.sync(room,runBotDecision)||[];
  const evs = (room.lastEvents || []).map((e, i) => Object.assign({}, e, { id: (room.lastEventBase || 0) + i }));
  // 事件全局可见：每个客户端收到完整事件记录
  for (const rp of room.players) {
    const sock = io.sockets.sockets.get(rp.socketId);
    if (!sock) continue;
    const base = snapshot(room.state, rp.id, room.actionClock.view(room.state.gameId));
    if(routes.enabled(room.state)&&room.state.gameMode==='quick')base.quickTime=routeTime(room);
    for (const gp of base.players) gp.connected = room.players.find(p=>p.id===gp.id)?.connected !== false;
    for(const gp of base.players)gp.kind=room.players.find(p=>p.id===gp.id)?.kind||'human';
    sock.emit('gameState', Object.assign({}, base, { events: evs,botThinking:thinking }));
  }
  if (room.state.phase === 'game_over') emitRoom(room);
}

function finalizeGame(room, endReason) {
  if (room.gameRecord) return room.gameRecord;
  if (quick.enabled(room.state) && room.state.quick.status !== 'closed') return closeQuickGame(room, endReason);
  if (room.state.ruleVersion === 2 && !room.state.finalSettlementDone) {
    const candidate = globalThis.structuredClone(room.state), events = [];
    events.push(...routes.cancelRoutes(candidate, null, endReason === 'normal' ? 'normal_end' : 'room_closed').events);
    stocks.settleFinalEconomy(candidate, endReason, events);
    if (candidate.status !== 'over') {
      candidate.rank = candidate.players.slice().sort((a,b)=>totalAssets(candidate,b)-totalAssets(candidate,a)).map(p=>p.id);
      candidate.winner = candidate.rank[0] || null;
      candidate.status = 'over'; candidate.phase = 'game_over'; candidate.pending = null;
    }
    candidate.revision++; room.state = candidate;
    appendEvents(room, events);
  }
  room.gameRecord = buildGameRecord(room, quick.enabled(room.state) ? room.state.quick.reason : endReason);
  for (const rp of room.players) {
    const sock = io.sockets.sockets.get(rp.socketId);
    if (sock) sock.emit('gameRecord', room.gameRecord);
  }
  privateReplay.capture(room, {source:'finalize',endReason});
  // Private state transitions are written only to server storage. The socket
  // receives the public record above, without this journal.
  const journal=privateReplay.exportJournal(room);
  persistRecord(journal?{...room.gameRecord,privateReplay:journal}:room.gameRecord, RECORDS_DIR);
  return room.gameRecord;
}

function stopQuickTimers(room) {
  room.quickClock?.stop();
  if (room.quickHeartbeat != null) (room.quickClockOptions?.clearTimeout || clearTimeout)(room.quickHeartbeat);
  room.quickHeartbeat = null;
}

function closeQuickGame(room, reason) {
  if (room.gameRecord) return room.gameRecord;
  if (!quick.enabled(room.state)) throw new Error('本局不适用快速封盘');
  if (room.state.quick.status !== 'closed') {
    const time = room.quickClock.read();
    if (time.elapsedMs >= 1800000) reason = 'time_limit';
    const candidate = globalThis.structuredClone(room.state);
    const result = quick.finalize(candidate, {reason,elapsedMs:time.elapsedMs,endedAt:candidate.quick.startedAt + Math.floor(time.elapsedMs)});
    assertEconomy(candidate); routes.assertRoutes(candidate);
    candidate.revision++; room.state = candidate; appendEvents(room, result.events);
  }
  stopQuickTimers(room); room.actionClock.clear();
  return finalizeGame(room, room.state.quick.reason);
}

function installQuickClock(room, clock) {
  room.quickClock = clock;
  room.quickTimeProvider = { read: () => clock.read(), close: () => closeQuickGame(room, 'time_limit') };
  const setTimer = room.quickClockOptions?.setTimeout || setTimeout;
  const gameId = room.state.gameId;
  function heartbeat() {
    room.quickHeartbeat = null;
    if (room.quickClock !== clock || room.state?.gameId !== gameId || room.state.quick.status === 'closed') return;
    try { advanceRouteTime(room); } catch (err) { console.error('[quick-clock]', err); }
    if (room.state.quick.status === 'closed') return;
    io.to(`room:${room.code}`).emit('quickTimeUpdate', {...clock.read(),quickRevision:quick.REVISION});
    room.quickHeartbeat = setTimer(heartbeat, 5000);
    room.quickHeartbeat?.unref?.();
  }
  room.quickHeartbeat = setTimer(heartbeat, 5000);
  room.quickHeartbeat?.unref?.();
}

function clearTimer(room, key) {
  if (key === 'action' && room.actionClock) room.actionClock.cancel();
  const t = room.timers.get(key);
  if (t) clearTimeout(t);
  room.timers.delete(key);
}

function defaultAction(room, phase) {
  const cur = room.state ? room.state.players[room.state.turnIndex] : null;
  switch (phase) {
    case 'route_choose': return {type:'route_expire',opportunityId:room.state.routeFlow.activeChoice.opportunityId};
    case 'opportunity_choose': return {type:'opportunity_expire',stageId:room.state.opportunityStage.stageId};
    case 'waiting_roll': return { type: 'roll_dice' };
    case 'frozen_turn': return { type: 'respond_frozen', decision: cur && cur.cash >= 5000 ? 'pay' : 'pass' };
    case 'jail_turn': return { type: 'respond_jail', decision: cur && cur.cash >= 15000 ? 'pay' : 'roll' };
    case 'buy': return { type: 'buy', decision: 'pass' };
    case 'buy_airport': return { type: 'buy_airport', decision: 'pass' };
    case 'build_decide': return { type: 'respond_build', decision: 'pass' };
    case 'buy_fundraise': return { type: 'buy_fundraise', decision: 'cancel' };
    case 'flight': return { type: 'flight', target: null };
    case 'stock': return { type: 'stock_done' };
    case 'auction_bid': return { type: 'auction_respond', decision: 'pass' };
    case 'direct_sale_ask': return { type: 'direct_sale_respond', decision: 'pass' };
    case 'trade_confirm': return { type: 'stock_transfer', accept: false };
    case 'self_rescue': return { type: 'rescue_done' };
    default: return null;
  }
}

function startTimer(room, newDecision = false) {
  const clock = room.actionClock || (room.actionClock = createActionClock());
  if (!room.state || room.state.phase === 'game_over') {
    clock.clear();
    return;
  }
  let totalBudget = null;
  if (quick.enabled(room.state)) {
    const time = room.quickClock.read(); totalBudget = time.totalRemainingMs;
    if (room.quickStockBudget) {
      if (hasDisconnectedAlive(room) && room.quickStockBudget.pausedAtElapsed === undefined) room.quickStockBudget.pausedAtElapsed = time.elapsedMs;
      if (!hasDisconnectedAlive(room) && room.quickStockBudget.pausedAtElapsed !== undefined) {
        room.quickStockBudget.elapsedDeadline += time.elapsedMs - room.quickStockBudget.pausedAtElapsed;
        delete room.quickStockBudget.pausedAtElapsed;
      }
    }
    const window = room.state.stockWindow;
    if (room.state.phase === 'stock' && window) {
      if (room.quickStockBudget?.windowId !== window.windowId || room.quickStockBudget?.gameId !== room.state.gameId) room.quickStockBudget = {gameId:room.state.gameId,windowId:window.windowId,elapsedDeadline:time.elapsedMs+Math.min(20000,totalBudget)};
      totalBudget = Math.min(totalBudget,Math.max(0,room.quickStockBudget.elapsedDeadline-(room.quickStockBudget.pausedAtElapsed ?? time.elapsedMs)));
    }
  }
  const result = clock.sync(room.state, (decisionId, key) => {
    if (!room.state || room.state.phase === 'game_over') return;
    if (clock.decisionId !== decisionId || clock.key !== key || clock.paused) return;
    const act = defaultAction(room, clock.phase);
    if (act) runAction(room, null, act, 'timeout');
  }, newDecision, totalBudget);
  if (hasDisconnectedAlive(room)) clock.pause();
  if (result.changed) {
    io.to(`room:${room.code}`).emit('timerStarted', timerPayload(room));
  }
}

function timerPayload(room) {
  const c=room.actionClock;
  return {gameId:room.state.gameId,decisionId:c.decisionId,phase:c.phase,seconds:c.remainingSeconds(),paused:c.paused};
}
function fingerprint(value) {
  if (Array.isArray(value)) return '['+value.map(fingerprint).join(',')+']';
  if (value&&typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+fingerprint(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function appendEvents(room, events) {
  room.lastEvents=events;room.lastEventBase=room.eventSeq;
  for(const e of events){room.events.push({...e,id:room.eventSeq,ts:Date.now()});room.eventSeq++;}
}
function assertEconomy(state) {
  if(state.ruleVersion!==2)return;
  for(const p of state.players){safe(p.cash);for(const n of Object.values(p.opportunities.usage))if(!Number.isSafeInteger(n)||n<0)throw new Error('机遇额度无效');}
  for(const c of Object.values(state.cities)){
    if(!Number.isSafeInteger(c.houseLevel)||c.houseLevel<0||c.houseLevel>4)throw new Error('房屋等级无效');
    for(const n of c.buildCosts){safe(n);if(n<0)throw new Error('建房成本无效');}
  }
  for(const st of Object.values(state.stocks)){
    for(const k of ['price','operatingPrice','dividendFund','roundRent']){safe(st[k]);if(st[k]<0)throw new Error('股票金额无效');}
    let total=0;for(const n of Object.values(st.holders)){if(!Number.isSafeInteger(n)||n<0)throw new Error('持股无效');total+=n;}
    if(total>20)throw new Error('持股超过发行量');
  }
}

function hasDisconnectedAlive(room) {
  if(room.players.some(p=>p.kind==='bot')&&!room.players.some(p=>p.kind!=='bot'&&p.connected))return true;
  return room.state && room.state.players.some((gp) => {
    const rp = room.players.find((x) => x.id === gp.id);
    return gp.alive && rp && !rp.connected;
  });
}

// Q1 supplies read(room) and close(room). This adapter owns no total clock or ranking.
function routeTime(room) {
  if (!routes.enabled(room.state) || room.state.gameMode !== 'quick') return {mode:'normal',elapsedMs:null,totalRemainingMs:null,closed:false};
  const provider = room.quickTimeProvider;
  if (typeof provider?.read !== 'function' || typeof provider?.close !== 'function') throw new Error('快速模式核心尚未就绪');
  const t = provider.read(room);
  if (t?.mode !== 'quick' || !Number.isFinite(t.elapsedMs) || t.elapsedMs < 0 || !Number.isFinite(t.totalRemainingMs) || t.totalRemainingMs < 0 || typeof t.closed !== 'boolean') throw new Error('快速模式时间无效');
  return {...t};
}
function closeRouteDeadline(room, time) {
  if (time.mode !== 'quick' || (!time.closed && time.elapsedMs < 1800000)) return false;
  room.quickTimeProvider.close(room);
  if (room.state.status !== 'over' || room.state.phase !== 'game_over') throw new Error('快速封盘未完成');
  const cleared = routes.cancelRoutes(room.state, null, 'total_deadline');
  if (cleared.changed) {room.state.revision++;appendEvents(room,cleared.events);}
  emitGame(room);
  return true;
}
function advanceRouteTime(room) {
  if (!room.state || !routes.enabled(room.state) || room.state.phase === 'game_over') return false;
  const time = routeTime(room);
  if (closeRouteDeadline(room,time)) return true;
  if (time.mode !== 'quick') return false;
  const candidate = globalThis.structuredClone(room.state);
  const due = routes.markQuickDue(candidate,time);
  const rng = room.rng || createRng();
  const initialOpened = !hasDisconnectedAlive(room) && logic.safeQuickInitial(candidate, rng);
  const opened = hasDisconnectedAlive(room) || initialOpened ? {changed:false} : routes.tryOpenRouteChoice(candidate,candidate.players[candidate.turnIndex].id,rng,time);
  const warnings = [];
  if (quick.enabled(candidate)) for (const [minute, remaining] of [[25,5],[28,2]]) {
    if (time.elapsedMs >= minute*60000 && !candidate.quick.warnings.includes(minute)) {
      candidate.quick.warnings.push(minute);
      warnings.push({type:'log',kind:'quick_warning',remainingMinutes:remaining,text:'剩余'+remaining+'分钟，到时按净资产排名'});
    }
  }
  if (!due.changed && !opened.changed && !initialOpened && !warnings.length) return false;
  routes.assertRoutes(candidate);
  if (closeRouteDeadline(room,routeTime(room))) return true;
  candidate.revision++;room.state=candidate;appendEvents(room,[...due.events,...warnings]);emitGame(room);
  return true;
}

function runBotDecision(room,id){
  const view=snapshot(room.state,id,room.actionClock.view(room.state.gameId));
  let memory=room.botMemory.get(id);
  if(memory?.gameId!==view.gameId)memory={gameId:view.gameId,saleAttempts:[]};
  if(memory.decisionId!==view.decision.decisionId){memory.decisionId=view.decision.decisionId;memory.steps=0;memory.failures=0;}
  let action;
  try {action=memory.failures?botPolicy.fallback(view):botPolicy.choose(view,memory);}
  catch(err){console.error('[bot-policy]',id,err);action=botPolicy.fallback(view);}
  if(!action){memory.blockedKey=room.state.gameId+'|'+room.actionClock.decisionId+'|'+id+'|'+room.state.actorRevision[id];room.botMemory.set(id,memory);return;}
  memory.steps++;room.botMemory.set(id,memory);
  const envelope={...action,gameId:view.gameId,actionId:'bot:'+id+':'+view.revision+':'+memory.steps,decisionId:view.decision.decisionId,actorRevision:view.self.actorRevision};
  const internalSocket={[BOT_AUTH]:id,handshake:{auth:{clientRouteRevision:routes.REVISION,clientQuickRevision:quick.REVISION}},emit(){}};
  const result=runAction(room,internalSocket,envelope);
  if(result.ok){memory.failures=0;if(action.type==='sell_city')memory.saleAttempts.push(action.cityId);}
  else {memory.failures++;if(memory.failures>=2)memory.blockedKey=room.state.gameId+'|'+room.actionClock.decisionId+'|'+id+'|'+room.state.actorRevision[id];console.error('[bot-action]',id,action.type,result.error);}
}

function runAction(room, socket, rawAction, source = 'player') {
  if (!room.state) return { ok: false, code:'OVER',error: '对局已结束' };
  const trustedBot=socket?.[BOT_AUTH];
  const authenticated = source==='player' ? room.players.find(p=>p.connected&&(trustedBot?p.kind==='bot'&&p.id===trustedBot:p.kind!=='bot'&&p.socketId===socket?.id)) : null;
  if(source==='player'&&!authenticated)return {ok:false,code:'IDENTITY',error:'连接身份已失效'};
  const v2=room.state.ruleVersion===2;
  let cache, print;
  if(v2&&source==='player'){
    room.successfulActions ||= new Map();
    cache=room.successfulActions.get(authenticated.id);
    print=fingerprint(rawAction);
    const remembered=cache?.get(rawAction?.actionId);
    if(remembered){if(remembered.print!==print)return {ok:false,code:'ACTION_ID',error:'同一操作身份不能更改内容'};return {...remembered.receipt};}
    if(routes.enabled(room.state) && socket.handshake?.auth?.clientRouteRevision !== routes.REVISION)return {ok:false,code:'UPDATE',error:'页面版本过旧，请刷新后重新连接'};
    if(quick.enabled(room.state) && socket.handshake?.auth?.clientQuickRevision !== quick.REVISION)return {ok:false,code:'UPDATE',error:'页面版本过旧，请刷新后重新连接'};
  }
  let timeContext;
  try {
    timeContext=routeTime(room);
    if(closeRouteDeadline(room,timeContext))return {ok:false,code:'OVER',error:'总时限已到，对局已结算'};
    if(timeContext.mode==='quick')advanceRouteTime(room);
  } catch(err) { return {ok:false,code:'TIME',error:err.message}; }
  if(v2&&source==='player'){
    if(room.state.phase==='game_over')return {ok:false,code:'OVER',error:'对局已结束'};
    const envelope=validateEnvelope(room.state,rawAction,authenticated.id,room.actionClock);
    if(!envelope.ok)return {ok:false,code:'STALE',error:envelope.error};
    if(room.actionClock.expired()){
      const act=defaultAction(room,room.state.phase);if(act)runAction(room,null,act,'timeout');
      return {ok:false,code:'EXPIRED',error:'操作时限已到，请查看当前状态'};
    }
  }
  if(room.state.phase==='game_over')return {ok:false,code:'OVER',error:'对局已结束'};
  // 任一存活玩家离线时冻结对局动作与决策时钟。
  if (hasDisconnectedAlive(room)) {
    const error = '有玩家掉线，对局暂停，等待重连';
    if (socket) socket.emit('error', { message: error });
    return { ok: false,code:'PAUSED', error };
  }
  const normalized = normalizeAction(room.state, rawAction, {actorId:authenticated?.id,source,timeContext});
  if (!normalized.ok) {
    if (socket) socket.emit('error', { message: normalized.error });
    return { ok: false, error: normalized.error };
  }
  const allowedId = normalized.actorId;
  const allowedRp = playerByGameId(room, allowedId);
  const allowedSocketId = allowedRp ? allowedRp.socketId : null;
  if (source === 'player' && (!socket || (trustedBot?trustedBot!==allowedId:socket.id !== allowedSocketId))) {
    const error = '还没轮到你行动';
    if (socket) socket.emit('error', { message: error });
    return { ok: false, error };
  }
  const rng = room.rng || createRng();
  let res;
  let candidate;
  try {
    candidate = globalThis.structuredClone(room.state);
    res = logic.apply(candidate, normalized.action, rng, {actorId:normalized.actorId,source,timeContext});
    assertEconomy(candidate);
    routes.assertRoutes(candidate);
  } catch (err) {
    const error = err.message || '操作异常，请重试';
    if (socket) socket.emit('error', { message: error });
    return { ok: false, error };
  }
  if (!res || res.rejected) {
    const error = '当前状态下无法执行该操作';
    if (socket) socket.emit('error', { message: error });
    return { ok: false, error };
  }
  const beforeJson = JSON.stringify(room.state);
  const afterState = res.state || candidate;
  if (JSON.stringify(afterState) === beforeJson) {
    const error = '操作未产生变化';
    if (socket) socket.emit('error', { message: error });
    return { ok: false, error };
  }
  try {
    if(closeRouteDeadline(room,routeTime(room)))return {ok:false,code:'OVER',error:'总时限已到，未提交的选择已取消'};
  } catch(err) { return {ok:false,code:'TIME',error:err.message}; }
  if(source==='player' && routes.enabled(room.state) && room.state.phase==='route_choose' && room.actionClock.expired()){
    runAction(room,null,defaultAction(room,'route_choose'),'timeout');
    return {ok:false,code:'EXPIRED',error:'选择时限已到，保留原经营路线'};
  }
  room.state = afterState;
  room.replayMetadata={action:normalized.action,actorId:normalized.actorId||null,source:trustedBot?'bot':source,timeContext};
  if(v2){room.state.revision++;if(normalized.actorId)room.state.actorRevision[normalized.actorId]++;}
  appendEvents(room, res.events || []);
  emitGame(room, normalized.action.type === 'auction_respond' || normalized.action.type === 'direct_sale_respond');
  const receipt=v2?{ok:true,gameId:room.state.gameId,actionId:rawAction.actionId||null,revision:room.state.revision,actorRevision:room.state.actorRevision[normalized.actorId]??null,decisionId:room.actionClock.decisionId,...(res.routeResult?{routeResult:res.routeResult}:{})}:{ok:true};
  if(cache||v2&&source==='player'){
    if(!cache){cache=new Map();room.successfulActions.set(authenticated.id,cache);}
    cache.set(rawAction.actionId,{print,receipt});while(cache.size>128)cache.delete(cache.keys().next().value);
  }
  return receipt;
}

function playerByGameId(room, pid) {
  return room.players.find((p) => p.id === pid);
}

function syncSocketIds(room) {
  // 将对局玩家与房间成员按 id 对应，更新 socketId
  if (!room.state) return;
  for (const gp of room.state.players) {
    const rp = playerByGameId(room, gp.id);
    if (rp) gp.socketId = rp.socketId;
  }
}

function safeHandler(fn) {
  return (...args) => {
    try { fn(...args); } catch (err) { console.error('[socket] 回调异常:', err); }
  };
}

io.on('connection', (socket) => {
  socket.on('setRoomMode', safeHandler((data, cb) => {
    const room = [...rooms.values()].find(r => r.players.some(p => p.connected && p.socketId === socket.id));
    if (!room || room.hostId !== socket.id) return cb?.({ok:false,error:'只有房主能设置模式'});
    if (room.state && room.state.phase !== 'game_over') return cb?.({ok:false,error:'对局中不能修改模式'});
    if (!['normal','quick'].includes(data?.gameMode)) return cb?.({ok:false,error:'模式无效'});
    room.gameMode = data.gameMode; emitRoom(room); cb?.({ok:true,gameMode:room.gameMode});
  }));
  socket.on('createRoom', safeHandler((data, cb) => {
    const name = String(data && data.name || '玩家').slice(0, 12);
    const existing = [...rooms.values()].find(r => r.players.some(p => p.socketId === socket.id));
    if (existing) {
      const player = existing.players.find(p => p.socketId === socket.id);
      if (existing.state || player.name !== name) return cb && cb({ ok: false, error: '你已在房间中，请先退出当前房间' });
      cb && cb({ ok: true, roomCode: existing.code });
      emitRoom(existing);
      return;
    }
    const room = makeRoom(socket, name);
    cb && cb({ ok: true, roomCode: room.code });
    emitRoom(room);
  }));

  for(const event of ['addBot','removeBot'])socket.on(event,safeHandler((data,cb)=>{
    const room=[...rooms.values()].find(r=>r.players.some(p=>p.kind!=='bot'&&p.socketId===socket.id));
    if(!room||room.hostId!==socket.id)return cb?.({ok:false,error:'仅房主可管理电脑玩家'});
    if(room.state&&room.state.phase!=='game_over')return cb?.({ok:false,error:'对局中不能增减电脑玩家'});
    if(event==='addBot'){
      if(room.players.length>=4)return cb?.({ok:false,error:'房间已满'});
      let index=1;while(room.players.some(p=>p.name==='电脑玩家'+index))index++;
      room.players.push({kind:'bot',id:'p'+room.players.length,name:'电脑玩家'+index,seat:room.players.length,connected:true,socketId:null,token:null});
    }else{
      const index=room.players.findIndex(p=>p.kind==='bot'&&p.id===data?.playerId);
      if(index<0)return cb?.({ok:false,error:'电脑座位已变化'});
      room.players.splice(index,1);
    }
    room.players.forEach((p,i)=>{p.id='p'+i;p.seat=i;});
    emitRoom(room);cb?.({ok:true});
  }));

  socket.on('joinRoom', safeHandler((data, cb) => {
    const code = String(data && data.roomCode || '').trim();
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: '房间不存在' });
    if (room.state) return cb && cb({ ok: false, error: '对局已开始' });
    if (room.players.length >= 4) return cb && cb({ ok: false, error: '房间已满' });
    const name = String(data.name || '玩家').slice(0, 12);
    if (room.players.some((x) => x.name === name)) return cb && cb({ ok: false, error: '该昵称已被使用，请换一个昵称' });
    const p = { socketId: socket.id, id: `p${room.players.length}`, name, seat: room.players.length, connected: true, token: null };
    issueToken(socket, p);
    room.players.push(p);
    touchRoom(room);
    socket.join(`room:${code}`);
    cb && cb({ ok: true, roomCode: code });
    emitRoom(room);
  }));

  socket.on('reconnect', safeHandler((data, cb) => {
    const code = String(data && data.roomCode || '').trim();
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: '房间不存在' });
    const rp = room.players.find((p) => p.kind!=='bot' && p.token && p.name === data.name && p.token === data.token);
    if (!rp) return cb && cb({ ok: false, error: '重连校验失败' });
    const oldSocketId = rp.socketId;
    // 令牌有效但旧连接仍标记在线（网络抖动自动重连、快速刷新竞态等）：
    // 先接管身份，再强制断开旧连接（顺序不可颠倒，否则旧连接的 disconnect 会误处理本玩家）
    const oldSock = rp.connected && oldSocketId !== socket.id ? io.sockets.sockets.get(oldSocketId) : null;
    rp.socketId = socket.id;
    rp.connected = true;
    rp.token = null;
    touchRoom(room);
    socket.join(`room:${code}`);
    if (oldSock) oldSock.disconnect(true);
    issueToken(socket, rp);
    if (room.hostId === oldSocketId) {
      room.hostId = socket.id;
      clearTimeout(room.hostTimer);
      room.hostTimer = null;
    }
    syncSocketIds(room);
    if(room.state && routes.enabled(room.state))advanceRouteTime(room);
    if (room.state && !hasDisconnectedAlive(room) && room.actionClock) {
      if (quick.enabled(room.state) && room.state.phase !== 'game_over') startTimer(room);
      if (room.actionClock.resume(() => {
        if (!room.state || room.state.phase === 'game_over') return;
        const act = defaultAction(room, room.actionClock.phase);
        if (act) runAction(room, null, act, 'timeout');
      })) {
        io.to(`room:${room.code}`).emit('timerStarted', timerPayload(room));
      }
    }
    cb && cb({ ok: true, roomCode: code });
    emitRoom(room);
    emitGame(room);
    if (room.gameRecord) socket.emit('gameRecord',room.gameRecord);
  }));

  socket.on('startGame', safeHandler((data, cb) => {
    const room = [...rooms.values()].find((r) => r.players.some((p) => p.socketId === socket.id));
    if (!room) return cb && cb({ ok: false, error: '不在房间内' });
    if (room.hostId !== socket.id) return cb && cb({ ok: false, error: '只有房主能开始' });
    if (room.players.length < 2) return cb && cb({ ok: false, error: '至少需要 2 名玩家' });
    if (room.state && room.state.phase !== 'game_over') return cb && cb({ ok: false, error: '对局已开始' });
    const mode = room.gameMode || 'normal';
    if(data?.gameMode !== undefined && data.gameMode !== mode)return cb && cb({ok:false,error:'模式与房间配置不一致，请核对后开始'});
    if(room.players.filter(p=>p.kind!=='bot').some(p=>!p.connected || io.sockets.sockets.get(p.socketId)?.handshake.auth?.clientRouteRevision !== routes.REVISION))return cb && cb({ok:false,error:'请所有玩家刷新页面并连接后再开始'});
    if(mode==='quick' && room.players.filter(p=>p.kind!=='bot').some(p=>io.sockets.sockets.get(p.socketId)?.handshake.auth?.clientQuickRevision !== quick.REVISION))return cb && cb({ok:false,error:'快速模式需要所有玩家刷新页面后再开始'});
    const startedAt = Date.now();
    const candidate = createGameState(room.code, room.players.map(p=>p.name), 2, {...NEW_GAME_ECONOMY,gameMode:mode,...(mode==='quick'?{quickRevision:quick.REVISION,startedAt}:{})});
    let clock = null;
    if (mode==='quick') {
      clock = createQuickClock({...room.quickClockOptions,onAdvance: time => {
        if (room.quickClock !== clock || room.state?.gameId !== time.gameId) return;
        try { advanceRouteTime(room); } catch(err) { console.error('[quick-clock]',err); }
      }});
      clock.start(candidate.gameId,startedAt);
    }
    candidate.startedAt = startedAt;
    try {
      resetDeck(candidate, room.rng || createRng());
      if (clock) routes.markQuickDue(candidate,clock.read());
      opportunities.beginOpportunityStage(candidate,1,{kind:'start'},room.rng||createRng());
    } catch (err) { clock?.stop(); return cb?.({ok:false,error:err.message}); }
    clearTimer(room, 'action');
    if (room.actionClock) room.actionClock.clear();
    stopQuickTimers(room);
    botScheduler.stop(room);room.botMemory=new Map();
    room.quickClock = null; room.quickTimeProvider = null;
    room.quickStockBudget = null;
    room.state = candidate;
    if (clock) installQuickClock(room,clock);
    room.players.forEach((p, i) => {
      room.state.players[i].socketId = p.socketId;
      room.state.players[i].kind = p.kind||'human';
    });
    room.events=[];room.lastEvents=[];room.eventSeq=0;room.lastEventBase=0;room.gameRecord=null;room.successfulActions=new Map();
    cb && cb({ ok: true });
    emitRoom(room);
    emitGame(room);
  }));

  socket.on('action', safeHandler((action, cb) => {
    const room = [...rooms.values()].find((r) => r.players.some((p) => p.socketId === socket.id));
    if (!room) return cb && cb({ ok: false, error: '不在房间内' });
    const result = runAction(room, socket, action);
    cb && cb(result);
  }));

  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      const rp = room.players.find((p) => p.socketId === socket.id);
      if (!rp) continue;
      rp.connected = false;
      if (room.state && hasDisconnectedAlive(room) && room.actionClock) {
        if (room.actionClock.pause()) {
          io.to(`room:${room.code}`).emit('timerStarted', timerPayload(room));
        }
      }
      // 全部玩家离线时开始记录闲置时间，供房间清扫器清理
      if (room.players.filter(p=>p.kind!=='bot').every((p) => !p.connected)) room.idleSince = room.idleSince || Date.now();
      // 房主掉线：大厅或对局已结束时立即转移；对局进行中按 spec 等 10 分钟
      if (room.hostId === socket.id && room.players.filter((p) => p.kind!=='bot'&&p.connected).length > 0) {
        clearTimeout(room.hostTimer);
        room.hostTimer = null;
        const immediate = !room.state || room.state.phase === 'game_over';
        if (immediate) {
          const next = room.players.find((p) => p.kind!=='bot'&&p.connected);
          if (next) room.hostId = next.socketId;
        } else {
          room.hostTimer = setTimeout(() => {
            const next = room.players.find((p) => p.kind!=='bot'&&p.connected);
            if (next) {
              room.hostId = next.socketId;
              emitRoom(room);
            }
          }, HOST_TRANSFER_MS);
        }
      }
      emitRoom(room);
      if (room.state) {
        // 对局暂停：广播等待提示（前端据 connected 显示）
        emitGame(room);
      }
      return;
    }
  });

  socket.on('disbandRoom', safeHandler((data, cb) => {
    const room = [...rooms.values()].find((r) => r.players.some((p) => p.socketId === socket.id));
    if (!room) return cb && cb({ ok: false });
    if (room.hostId !== socket.id && room.state) return cb && cb({ ok: false, error: '仅房主可解散' });
    if (room.state && room.state.phase !== 'game_over') {
      if (quick.enabled(room.state)) {
        closeQuickGame(room,'disband'); emitGame(room); return cb?.({ok:true});
      }
      if(room.state.ruleVersion===2) finalizeGame(room,'disband');
      // 按总资产排名结算
      const rank = room.state.players.slice().sort((a, b) => totalAssets(room.state, b) - totalAssets(room.state, a));
      room.state.rank = rank.map((p) => p.id);
      room.state.winner = room.state.rank[0] || null;
      room.state.status = 'over';
      room.state.phase = 'game_over';
      finalizeGame(room, 'disband');
      emitGame(room);
    }
    cb && cb({ ok: true });
  }));
});

function totalAssets(state, player) {
  if(state.ruleVersion===2)return assetSummary(state,player.id).total;
  let cash = player.cash;
  for (const cityId of player.cities) cash += logic.cityTotalValue(state.cities[cityId]);
  cash += (player.airports || []).length * 15000;
  for (const cityId of Object.keys(state.stocks)) cash += (state.stocks[cityId].holders[player.id] || 0) * state.stocks[cityId].price;
  return cash;
}

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('环球大亨运行于 http://localhost:' + PORT);
  });
  setInterval(() => sweepRooms(), SWEEP_INTERVAL_MS);
}

module.exports = { app, server, io, rooms, totalAssets, shouldSweepRoom, sweepRooms, runAction, startTimer, emitGame, finalizeGame, assertEconomy, advanceRouteTime, closeQuickGame, stopQuickTimers };
