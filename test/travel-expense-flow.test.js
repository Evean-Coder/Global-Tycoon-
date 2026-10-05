'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, own } = require('../scripts/light-balance/cases');
const { REVISION } = require('../src/travelExpense');
const logic = require('../src/gameLogic'), stocks = require('../src/stocks'), econ = require('../src/economy');
const { normalizeAction, resolveActorId } = require('../src/actionValidation');
const { createRng } = require('../src/random');
function setup(n = 2) { const s = fixture(n); s.economyRevision = REVISION; s.travelExpenseReceipts = {}; s.roundFlow.index = 81; return s; }
function action(s, raw, events = []) {
  const actorId = resolveActorId(s, raw.type), q = normalizeAction(s, raw, { actorId, source: 'player' });
  assert.equal(q.ok, true, q.error); const r = logic.apply(s, q.action, createRng(22), { actorId, source: 'player' });
  assert.equal(!!r.rejected, false); events.push(...r.events); return r;
}
test('正常与极地回合收费一次，恰好付清不自救', () => {
  for (const cash of [1500, 10000]) { const s = setup(), events = []; s.players[0].cash = cash; logic.endTurn(s, events, createRng(22));
    assert.equal(s.players[0].cash, cash - 1500); assert.equal(s.turnIndex, 1); assert.equal(events.filter(e => e.kind === 'travel_expense').length, 1); }
  const s = setup(); s.phase = 'frozen_turn'; s.players[0].frozen = true; const r = action(s, { type: 'respond_frozen', decision: 'pass' });
  assert.equal(s.players[0].cash, 148500); assert.equal(r.events.filter(e => e.kind === 'travel_expense').length, 1);
});
test('费用自救留在当前轮，抵押/拆房/卖股恢复不重复落点或收费', () => {
  for (const mode of ['mortgage', 'demolish', 'stock']) {
    const s = setup(), events = []; s.players[0].cash = 100; own(s, mode === 'stock' ? 'p1' : 'p0', '上海', mode === 'demolish' ? 1 : 0);
    s.players[0].position = 36;
    if (mode === 'stock') { s.stocks['上海'].holders.p0 = 1; stocks.syncHolders(s); }
    logic.endTurn(s, events, createRng(22));
    assert.equal(s.phase, 'self_rescue'); assert.equal(s.turnIndex, 0); assert.equal(s.roundFlow.index, 81); assert.deepEqual(s.roundFlow.completedIds, []);
    assert.equal(s.pending.reason, '远航开支');
    const raw = mode === 'mortgage' ? { type: 'rescue_mortgage', cityId: '上海' }
      : mode === 'demolish' ? { type: 'rescue_demolish', cityId: '上海', quoteVersion: econ.quoteDemolition(s, { playerId: 'p0', cityId: '上海' }).quoteVersion }
        : { type: 'rescue_sell_stock', cityId: '上海', shares: 1, quoteVersion: s.stocks['上海'].quoteVersion };
    action(s, raw, events); assert.equal(s.turnIndex, 1); assert.equal(s.phase, 'waiting_roll');
    assert.equal(events.filter(e => e.kind === 'travel_expense').length, 1); assert.equal(s.players[0].position, 36);
  }
});
test('自动监禁收费自救只完成跳过，多人自动跳过正确推进完整轮', () => {
  const s = setup(3), events = []; s.turnIndex = 1; s.players[1].jailed = true; s.players[1].position = 11; s.players[1].cash = 0; own(s, 'p1', '上海');
  logic.prepareTurn(s, events, createRng(22)); assert.equal(s.phase, 'self_rescue'); assert.equal(s.pending.resume.continuation, 'skipped_jail');
  action(s, { type: 'rescue_mortgage', cityId: '上海' }, events);
  assert.equal(s.turnIndex, 2); assert.equal(s.players[1].jailed, true); assert.equal(s.players[1].jailTurns, 1);
  assert.equal(events.filter(e => e.kind === 'travel_expense').length, 1);
  const all = setup(3), allEvents = []; for (const p of all.players) { p.jailed = true; p.position = 11; }
  logic.prepareTurn(all, allEvents, createRng(22)); assert.equal(all.roundFlow.index, 82); assert.equal(all.phase, 'waiting_roll');
  assert.equal(allEvents.filter(e => e.kind === 'travel_expense').length, 3); assert.equal(all.turnId, 4);
});
test('三回合监狱跳过与死亡玩家不漏收或多收', () => {
  const s = setup(), events = []; s.phase = 'jail_turn'; s.players[0].jailed = true; s.players[0].position = 21;
  action(s, { type: 'respond_jail', decision: 'pass' }, events); assert.equal(s.turnIndex, 1); assert.equal(s.players[0].cash, 148500);
  const dead = setup(3); dead.players[0].alive = false; logic.advanceTurn(dead, [], createRng(22)); assert.equal(dead.players[0].cash, 150000);
});
test('自救出售上下文由服务端补齐，直接成交/拒购、拍卖/流拍正确续接', () => {
  for (const mode of ['direct', 'auction']) for (const success of [true, false]) {
    const s = setup(), events = []; own(s, 'p0', '上海'); s.players[0].cash = 0; logic.endTurn(s, events, createRng(22));
    const raw = { type: 'sell_city', cityId: '上海', mode, context: { resume: true } };
    const q = normalizeAction(s, raw, { actorId: 'p0', source: 'player' }); assert.equal(q.action.context.resume.kind, 'travel_expense');
    action(s, raw, events);
    if (mode === 'direct') action(s, { type: 'direct_sale_respond', decision: success ? 'buy' : 'pass' }, events);
    else {
      action(s, { type: 'auction_respond', decision: success ? 'bid' : 'pass', ...(success ? { amount: 15000 } : {}) }, events);
      if (success && s.phase === 'auction_bid') action(s, { type: 'auction_respond', decision: 'end' }, events);
    }
    assert.equal(events.filter(e => e.kind === 'travel_expense').length, 1);
    const rescued = success || mode === 'auction'; // 原自救流拍由银行支付半价，仍可能足额自救。
    assert.equal(s.phase, rescued ? 'waiting_roll' : 'self_rescue'); if (rescued) assert.equal(s.turnIndex, 1);
  }
});
test('无资产收费债务按原破产结束，原落点自救仍可续接', () => {
  const s = setup(), events = []; s.players[0].cash = 0; logic.endTurn(s, events, createRng(22)); action(s, { type: 'rescue_done' }, events);
  assert.equal(s.status, 'over'); assert.equal(s.winner, 'p1'); assert.equal(events.filter(e => e.kind === 'travel_expense').length, 1);
  const old = fixture(); old.phase = 'self_rescue'; old.pending = { playerId: 'p0', kind: 'self_rescue', resume: true, due: 0 }; old.players[0].position = 10;
  action(old, { type: 'rescue_done' }); assert.equal(old.turnIndex, 1);
});
test('股票等待不收费，仅完成股票窗口时收取', () => {
  const s = setup(), events = []; own(s, 'p1', '上海'); s.phase = 'stock'; s.pending = { playerId: 'p0', after: 'end' }; stocks.openStockWindow(s, 'p0');
  action(s, { type: 'stock_trade', windowId: s.stockWindow.windowId, orders: [{ cityId: '上海', shares: 1, side: 'buy', quoteVersion: s.stocks['上海'].quoteVersion, listingEpoch: s.stocks['上海'].listingEpoch }] }, events);
  assert.equal(events.filter(e => e.kind === 'travel_expense').length, 0); action(s, { type: 'stock_done' }, events); assert.equal(events.filter(e => e.kind === 'travel_expense').length, 1);
});
test('募资、股票转让确认和无主城拍卖等待均不提前收费', () => {
  const s=setup(),events=[];own(s,'p0','上海');s.players[0].cash=14000;s.phase='buy_airport';s.pending={playerId:'p0',airportId:'开罗国际机场'};
  action(s,{type:'buy_fundraise',decision:'start'},events);action(s,{type:'rescue_mortgage',cityId:'上海'},events);
  assert.equal(s.phase,'buy_fundraise');assert.equal(events.filter(e=>e.kind==='travel_expense').length,0);
  action(s,{type:'buy_fundraise',decision:'confirm'},events);assert.equal(s.players[0].cash,7500);assert.equal(events.filter(e=>e.kind==='travel_expense').length,1);
  const transfer=setup(),te=[];own(transfer,'p1','上海');transfer.stocks['上海'].holders.p0=1;stocks.syncHolders(transfer);transfer.phase='stock';transfer.pending={playerId:'p0',after:'end'};stocks.openStockWindow(transfer,'p0');
  action(transfer,{type:'stock_transfer',windowId:transfer.stockWindow.windowId,targetId:'p1',items:[{cityId:'上海',shares:1}],cash:500},te);
  assert.equal(transfer.phase,'trade_confirm');action(transfer,{type:'stock_transfer',accept:false},te);assert.equal(te.filter(e=>e.kind==='travel_expense').length,0);
  action(transfer,{type:'stock_done'},te);assert.equal(te.filter(e=>e.kind==='travel_expense').length,1);
  const auction=setup(),ae=[];auction.phase='buy';auction.pending={playerId:'p0',cityId:'上海'};action(auction,{type:'buy',decision:'pass'},ae);
  assert.equal(ae.filter(e=>e.kind==='travel_expense').length,0);while(auction.phase==='auction_bid')action(auction,{type:'auction_respond',decision:'pass'},ae);
  assert.equal(ae.filter(e=>e.kind==='travel_expense').length,1);
});
