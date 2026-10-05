'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { io: Client } = require('socket.io-client');
const api = require('../server'), { createActionClock } = require('../src/actionClock');
const { fakeClock } = require('./helpers/gameplayFixtures');
const { fixture, own } = require('../scripts/light-balance/cases');
const { REVISION } = require('../src/travelExpense');
let url, seq = 0; const clients = [];
const ack = (s, event, data) => new Promise(resolve => s.emit(event, data, resolve));
async function until(fn) { const end = Date.now() + 3000; while (Date.now() < end) { if (fn()) return; await new Promise(r => setTimeout(r, 5)); } throw new Error('等待联机状态超时'); }
async function connect() {
  const s = Client(url, { transports: ['websocket'] }); clients.push(s); s.on('gameState', g => { s.game = g; }); s.on('reconnectToken', t => { s.token = t.token; });
  await new Promise(r => s.once('connect', r)); return s;
}
function envelope(s, raw, actionId = 'expense-' + (++seq)) {
  return { ...raw, actionId, gameId: s.game.gameId, actorRevision: s.game.self.actorRevision, decisionId: s.game.decision.decisionId };
}
async function setup() {
  const a = await connect(), b = await connect(); const res = await ack(a, 'createRoom', { name: '甲' });
  await ack(b, 'joinRoom', { name: '乙', roomCode: res.roomCode }); const room = api.rooms.get(res.roomCode), fake = fakeClock(); room.actionClock = createActionClock(fake);
  await ack(a, 'startGame', {}); await until(() => a.game?.self.choice && b.game?.self.choice);
  assert.equal(room.state.economyRevision, REVISION, '效果与投资压力审查通过后新局启用');
  return { a, b, room, fake };
}
async function publish(room, s, a, b) {
  s.gameId = room.state.gameId; s.revision = room.state.revision + 1;
  s.players.forEach((p, i) => { p.socketId = room.players[i].socketId; });
  room.state = s; room.events = []; room.lastEvents = []; api.emitGame(room);
  await until(() => a.game?.revision === s.revision && b.game?.revision === s.revision);
}
function ending(cash = 10000) {
  const s = fixture(); s.economyRevision = REVISION; s.travelExpenseReceipts = {}; s.roundFlow.index = 81;
  s.phase = 'stock'; s.pending = { playerId: 'p0', after: 'end' }; require('../src/stocks').openStockWindow(s, 'p0'); s.players[0].cash = cash;
  return s;
}
test.before(async () => { await new Promise(r => api.server.listen(0, '127.0.0.1', r)); url = 'http://127.0.0.1:' + api.server.address().port; });
test.afterEach(() => { for (const s of clients.splice(0)) s.close(); for (const r of api.rooms.values()) { r.actionClock.clear(); if (r.hostTimer) clearTimeout(r.hostTimer); } api.rooms.clear(); });
test.after(async () => { await new Promise(r => api.io.close(r)); });
test('服务器非法/过期拒绝与成功动作重放均不产生重复费用', async () => {
  const { a, b, room } = await setup(); await publish(room, ending(), a, b);
  const good = envelope(a, { type: 'stock_done' }), before = JSON.stringify(room.state);
  assert.equal((await ack(a, 'action', { ...good, actionId: 'invalid', type: 'buy', decision: 'buy' })).ok, false);
  assert.equal((await ack(a, 'action', { ...good, actionId: 'stale', actorRevision: -1 })).ok, false);
  assert.equal(JSON.stringify(room.state), before);
  const res = await ack(a, 'action', good); assert.equal(res.ok, true); assert.equal(room.state.players[0].cash, 8500);
  const after = JSON.stringify(room.state); assert.deepEqual(await ack(a, 'action', good), res); assert.equal(JSON.stringify(room.state), after);
  assert.equal(room.events.filter(e => e.kind === 'travel_expense').length, 1);
});
test('收费债务断线暂停、认证重连与自救一致', async () => {
  const { a, b, room, fake } = await setup(), s = ending(0); own(s, 'p0', '上海'); await publish(room, s, a, b);
  assert.equal((await ack(a, 'action', envelope(a, { type: 'stock_done' }))).ok, true);
  await until(() => a.game.phase === 'self_rescue'); const debt = room.state.players[0].cash, token = b.token;
  b.close(); await until(() => room.actionClock.paused); fake.advance(120000);
  assert.equal(room.state.phase, 'self_rescue'); assert.equal(room.state.players[0].cash, debt);
  const re = await connect(); assert.equal((await ack(re, 'reconnect', { roomCode: room.code, name: '乙', token })).ok, true);
  await until(() => !room.actionClock.paused && re.game?.phase === 'self_rescue');
  assert.equal(re.game.pending.reason, '远航开支'); assert.equal(re.game.pending.resume, undefined);
  await until(() => a.game.decision.paused === false);
  assert.equal((await ack(a, 'action', envelope(a, { type: 'rescue_mortgage', cityId: '上海' }))).ok, true);
  assert.equal(room.state.turnIndex, 1); assert.equal(room.events.filter(e => e.kind === 'travel_expense').length, 1);
});
test('直接出售与拍卖超时恢复收费自救，债务超时终局仍只扣一次', async () => {
  for (const mode of ['direct', 'auction']) {
    const { a, b, room, fake } = await setup(), s = ending(0); own(s, 'p0', '上海'); await publish(room, s, a, b);
    await ack(a, 'action', envelope(a, { type: 'stock_done' })); await until(() => a.game.phase === 'self_rescue');
    await ack(a, 'action', envelope(a, { type: 'sell_city', cityId: '上海', mode }));
    fake.advance(60000); assert.equal(room.state.phase, mode === 'direct' ? 'self_rescue' : 'waiting_roll');
    assert.equal(room.events.filter(e => e.kind === 'travel_expense').length, 1); room.actionClock.clear();
  }
  const { a, b, room, fake } = await setup(); await publish(room, ending(0), a, b); await ack(a, 'action', envelope(a, { type: 'stock_done' }));
  fake.advance(60000); assert.equal(room.state.status, 'over'); assert.equal(room.state.winner, 'p1');
  assert.equal(room.gameRecord.stats.economy.travelExpenses, 1500);
});
