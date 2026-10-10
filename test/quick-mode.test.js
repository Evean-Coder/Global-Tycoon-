'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createGameState } = require('../src/state');
const { assetSummary, netAssetSummary } = require('../src/assets');
const quick = require('../src/quickMode'), stocks = require('../src/stocks'), econ = require('../src/economy');
const f = require('./helpers/gameplayFixtures');
function game(n = 3) { return createGameState('TEST', Array.from({length:n}, (_, i) => '玩家' + i), 2, { routeRevision: 'opportunity-routes-v1', gameMode: 'quick', quickRevision: quick.REVISION, startedAt: 1000 }); }
function close(s, reason = 'time_limit') { return quick.finalize(s, { reason, elapsedMs: 1800000, endedAt: 1801000 }); }

test('QM01: net asset example, debt principal, negative values and original gross', () => {
  const s = game(); f.own(s, 'p0', '上海', '伦敦'); f.own(s, 'p1', '东京');
  s.players[0].cash = 100000; s.cities['上海'].mortgaged = true; s.cities['上海'].mortgageInterest = 1800;
  s.airports[Object.keys(s.airports)[0]].ownerId = 'p0';
  s.stocks['东京'].holders.p0 = 2; s.stocks['东京'].price = 4400;
  assert.equal(netAssetSummary(s, 'p0').netAssets, 146000);
  assert.equal(assetSummary(s, 'p0').total, 157800);
  s.cities['上海'].mortgaged = false; s.players[0].cash -= 10000;
  assert.equal(netAssetSummary(s, 'p0').netAssets, 147800);
  s.players[0].cash += 10000; s.cities['上海'].mortgaged = true;
  assert.equal(netAssetSummary(s, 'p0').netAssets, 146000);
  s.players[0].cash = -100000; assert.equal(netAssetSummary(s, 'p0').netAssets, -54000);
});
test('QM02: retained fund excludes issued dividends; standard construction differs from expense', () => {
  const s = game(); f.own(s, 'p0', '上海'); const st = s.stocks['上海'];
  st.holders.p1 = 2; st.dividendFund = 2000; stocks.refreshPrice(s, '上海', 'test');
  f.selected(s, 'p1', 'H4');
  const before = s.players.map(p => netAssetSummary(s, p.id).netAssets);
  close(s);
  assert.equal(netAssetSummary(s, 'p0').netAssets, before[0]);
  assert.equal(netAssetSummary(s, 'p1').netAssets, before[1] + 40);
  assert.equal(st.price, st.operatingPrice); assert.equal(netAssetSummary(s, 'p0').retainedPending, 0);
  const b = game(); f.own(b, 'p0', '上海'); f.selected(b, 'p0', 'H2');
  b.players[0].position = b.board.find(q => q.cityId === '上海').id;
  const q = econ.quoteBuild(b, { playerId: 'p0', cityId: '上海' });
  const value = netAssetSummary(b, 'p0').netAssets, cash = b.players[0].cash;
  econ.applySettlement(b, q, []);
  assert.equal(cash - b.players[0].cash, q.finalAmount);
  assert.equal(netAssetSummary(b, 'p0').netAssets - value, q.baseAmount - q.finalAmount);
});
test('QM03: quick version gating never migrates ordinary or legacy states', () => {
  assert.equal(quick.enabled(game()), true);
  assert.equal(quick.enabled(f.game()), false);
  assert.equal(quick.enabled(f.game(2, 1)), false);
  const legacy = createGameState('T', ['a', 'b'], 2, { routeRevision: 'opportunity-routes-v1', gameMode: 'quick' });
  assert.equal(quick.enabled(legacy), false);
  assert.throws(() => createGameState('T', ['a', 'b'], 2, { quickRevision: 'bad' }), /版本/);
  assert.throws(() => close(legacy), /不适用/);
});
test('QM04: unfinished sales, highest bids, transfers and rescue cannot create transactions', () => {
  for (const phase of ['stock_transfer_confirm', 'direct_sale', 'auction', 'self_rescue', 'buy_city', 'buy_airport', 'build']) {
    const s = game(); f.own(s, 'p0', '上海'); s.cities['上海'].houseLevel = 2;
    s.players[0].cash = -1000; s.stocks['上海'].holders.p0 = 1; stocks.syncHolders(s);
    s.phase = phase; s.pending = { type: phase, cityId: '上海', playerId: 'p0', fromId: 'p0', targetId: 'p1', currentBid: 20000, currentBidder: 'p1', sellerId: 'p0' };
    const before = s.players.map(p => p.cash); close(s);
    assert.deepEqual(s.players.map(p => p.cash), before);
    assert.equal(s.cities['上海'].ownerId, 'p0'); assert.equal(s.cities['上海'].houseLevel, 2);
    assert.equal(s.stocks['上海'].holders.p0, 1); assert.equal(s.players[0].alive, true);
    assert.ok(s.quick.result.cancelled.some(x => x.phase === phase));
  }
  const s = game(); s.phase = 'auction'; s.pending = { type:'auction', cityId:'上海', currentBid:20000, currentBidder:'p1', sellerId:null };
  close(s); assert.equal(s.cities['上海'].ownerId, null); assert.equal(s.players[1].cash, 150000);
});
test('QM05: incomplete initial and route choices do not grant rewards or reveal candidates', () => {
  const s = game(); f.selected(s, 'p0', 'H1');
  s.opportunityStage = { ordinal:2, resolved:false, participants:{p0:{submitted:true,selectedId:'H12',candidateIds:['H12','H2','H3']}} };
  s.routeFlow.activeChoice = { playerId:'p0',opportunityId:'choice',source:'minute:15',candidateIds:['H12','H2','H3'] };
  s.routeFlow.players.p1.pending.push({opportunityId:'later',source:'minute:22'});
  const result = close(s);
  assert.deepEqual(s.players[0].opportunities.selectedIds, ['H1']);
  assert.equal(s.players[0].cash, 150000); assert.equal(s.players[0].opportunities.oneTimeRewards.H12, null);
  assert.equal(s.routeFlow.activeChoice, null); assert.equal(s.opportunityStage, null);
  assert.ok(!JSON.stringify(result).includes('candidateIds'));
});
test('QM06: bankrupt residual ownership clears before ranking even with empty player city list', () => {
  const s = game(); f.own(s,'p0','上海','东京'); f.own(s,'p1','伦敦');
  s.players[0].alive = false; s.players[0].cities = []; s.rank = ['p0'];
  const st = s.stocks['上海']; st.holders.p1 = 2; st.dividendFund = 2000; st.clearing = true; stocks.refreshPrice(s,'上海','test');
  s.phase = 'auction'; s.pending = {cityId:'上海',isBankruptcyAuction:true,queue:['东京']};
  const before = s.players[1].cash, result = close(s);
  assert.equal(s.players[1].cash - before, 4200);
  assert.deepEqual(result.result.clearedCityIds, ['上海','东京']);
  assert.equal(s.cities['上海'].ownerId,null); assert.deepEqual(st.holders,{});
  assert.equal(s.cities['伦敦'].ownerId,'p1');
  close(s); assert.equal(s.players[1].cash - before,4200);
});
test('QM07: final dividend respects remaining H4 allowance and leaves round economics untouched', () => {
  const s = game(); f.own(s,'p0','上海'); f.selected(s,'p1','H4'); s.players[1].opportunities.usage.H4 = 990;
  const st = s.stocks['上海']; st.holders.p1 = 2; st.dividendFund = 2000; stocks.refreshPrice(s,'上海','test');
  const round = s.rounds, pos = s.players[0].position;
  const result = close(s); assert.equal(s.players[1].cash,150210); assert.equal(s.players[0].cash,151800);
  assert.equal(s.rounds,round); assert.equal(s.players[0].position,pos); assert.equal(st.dividendFund,0);
  assert.equal(result.events.filter(e=>e.kind==='opportunity_reward').length,1);
  assert.equal(close(s).events.length,0);
});
test('QM08: tied winners, rank 1/1/3 and reversed elimination with negative values', () => {
  const s = game(4); s.players[2].cash=-10; s.players[3].alive=false; s.rank=['p3'];
  close(s); assert.deepEqual(s.quick.result.ranking.map(r=>r.rank),[1,1,3,4]);
  assert.deepEqual(s.quick.result.winnerIds,['p0','p1']); assert.equal(s.winner,null);
  const b=game(4); b.players[0].alive=false;b.players[1].alive=false;b.rank=['p0','p1'];b.players[2].cash=1;b.players[3].cash=2;
  close(b); assert.deepEqual(b.rank,['p3','p2','p1','p0']);
  for(const reason of ['normal','disband','idle_timeout']){const n=game();n.players[0].cash=160000;close(n,reason);assert.equal(n.quick.result.reason,reason);assert.equal(n.winner,'p0');}
});
test('QM09: candidate failures never touch authoritative state; closure is idempotent', () => {
  const s=game();f.own(s,'p0','上海');s.stocks['上海'].dividendFund=Infinity;
  const before=globalThis.structuredClone(s);assert.throws(()=>close(globalThis.structuredClone(s)),/金额/);assert.deepEqual(s,before);
  const good=game();close(good);const frozen=globalThis.structuredClone(good);close(good);assert.deepEqual(good,frozen);
  assert.throws(()=>quick.finalize(game(),{reason:'bad',elapsedMs:1,endedAt:1001}),/参数/);
});
test('QM10: quick bankruptcy ends without new auction or premature final settlement', () => {
  const logic = require('../src/gameLogic');
  const s = game(2); f.own(s, 'p0', '上海'); s.players[0].cash = -1;
  s.phase = 'self_rescue'; s.pending = {playerId:'p0',due:1,reason:'test'};
  const res = logic.apply(s, {type:'rescue_done'}, f.rng(), {actorId:'p0',source:'timeout',timeContext:{mode:'quick',elapsedMs:1000,totalRemainingMs:1799000,closed:false}});
  assert.ok(res.events.some(e => e.type === 'bankrupt')); assert.equal(s.quickEndIntent,'normal');
  assert.equal(s.phase,'game_over'); assert.equal(s.finalSettlementDone,undefined);
  assert.equal(s.cities['上海'].ownerId,'p0');
  close(s,'normal'); assert.equal(s.winner,'p1'); assert.equal(s.cities['上海'].ownerId,null);
  const ordinary = f.game(2); f.own(ordinary,'p0','上海'); ordinary.players[0].cash=-1;
  ordinary.phase='self_rescue'; ordinary.pending={playerId:'p0',due:1,reason:'test'};
  logic.apply(ordinary,{type:'rescue_done'},f.rng(),{actorId:'p0',source:'timeout'});
  assert.equal(ordinary.phase,'auction_bid'); assert.equal(ordinary.quickEndIntent,undefined);
  const surrendered = game(2);logic.apply(surrendered,{type:'surrender'},f.rng(),{actorId:'p0',source:'player'});
  assert.equal(surrendered.quickEndIntent,'normal'); assert.equal(surrendered.finalSettlementDone,undefined);
});
test('QM11: public net values and frozen results omit private candidates and credentials', () => {
  const {snapshot}=require('../src/state'),opp=require('../src/opportunities');
  const s=game();s.players[0].reconnectToken='secret';opp.beginOpportunityStage(s,1,{kind:'start'},f.rng());
  const other=snapshot(s,'p1');assert.equal(other.players[0].netAssetSummary.netAssets,150000);
  assert.equal(other.self.choice.candidateIds.length,3);assert.equal(other.self.playerId,'p1');
  assert.equal(other.players[0].reconnectToken,undefined);assert.equal(other.quickResult,undefined);
  const publicView=snapshot(s);assert.equal(JSON.stringify(publicView).includes('candidateIds'),false);
  close(s);assert.deepEqual(snapshot(s,'p0').quickResult,snapshot(s,'p1').quickResult);
  assert.equal(JSON.stringify(snapshot(s)).includes('candidateIds'),false);
  assert.equal(snapshot(f.game()).quickRevision,undefined);
});
test('QM12: records use one frozen end time and match net ranking without inventing old values', () => {
  const {buildGameRecord}=require('../src/record');const s=game();s.players[0].cash=170000;
  const out=close(s);const room={code:'T',state:s,events:out.events};const first=buildGameRecord(room,'wrong'),second=buildGameRecord(room,'normal');
  assert.equal(first.endedAt,1801000);assert.equal(second.endedAt,first.endedAt);assert.equal(first.endReason,'time_limit');
  assert.deepEqual(first.quick.ranking,s.quick.result.ranking);assert.equal(first.quick.quickRevision,quick.REVISION);
  assert.equal(buildGameRecord({code:'T',state:f.game(),events:[]},'normal').quick,undefined);
});
