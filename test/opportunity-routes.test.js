'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createGameState } = require('../src/state');
const routes = require('../src/opportunityRoutes'), opp = require('../src/opportunities');
const econ = require('../src/economy'), { BY_ID } = require('../src/gameplayCatalog');
const f = require('./helpers/gameplayFixtures');
const normalTime = { mode: 'normal', elapsedMs: null, totalRemainingMs: null, closed: false };
const quickTime = minute => ({ mode: 'quick', elapsedMs: minute * 60000, totalRemainingMs: (30 - minute) * 60000, closed: minute >= 30 });
function game(mode = 'normal') { return createGameState('ROUTE', ['甲', '乙'], 2, { routeRevision: routes.REVISION, gameMode: mode }); }
function ready(mode = 'normal') {
  const s = game(mode);
  for (const p of s.players) p.opportunities.selectedIds = ['H1', 'H8', 'H10'];
  for (let ordinal = 1; ordinal <= 3; ordinal++) { s.opportunityStage = { ordinal, resolved: true }; routes.markInitialResolved(s, ordinal); }
  return s;
}
function laps(s, n = 3) { for (let i = 0; i < n; i++) opp.refresh(s.players[0]); routes.markLapProgress(s, 'p0'); }
function open(s) {
  if (s.gameMode === 'normal') laps(s); else routes.markQuickDue(s, quickTime(15));
  assert.equal(routes.tryOpenRouteChoice(s, 'p0', f.rng(), s.gameMode === 'normal' ? normalTime : quickTime(15)).opened, true);
  return s.routeFlow.activeChoice;
}
function action(s, type = 'route_confirm', extra = {}) {
  const c = s.routeFlow.activeChoice;
  return { type, opportunityId: c.opportunityId, candidateVersion: c.candidateVersion, newId: c.candidateIds[0], replaceId: s.players[0].opportunities.selectedIds[0], ...extra };
}
function resolve(s, a) { return routes.resolveRouteChoice(s, a, { actorId: 'p0', source: a.type === 'route_expire' ? 'timeout' : 'player', timeContext: s.gameMode === 'normal' ? normalTime : quickTime(15) }); }

test('R01 新局显式版本和旧局隔离', () => {
  const s = game(); assert.equal(s.gameMode, 'normal'); assert.equal(s.routeFlow.players.p0.baselineLapEpoch, null);
  assert.deepEqual(s.players[0].opportunities.oneTimeRewards, { H12: null });
  for (const v of [1, 2]) { const old = f.game(2, v); assert.equal(old.routeFlow, undefined); assert.equal(routes.markLapProgress(old, 'p0').changed, false); assert.equal(old.players[0].opportunities.oneTimeRewards, undefined); }
  assert.throws(() => game('bad'));
});
test('R02 首次奖励意图与领取事实', () => {
  const s = game(), p = s.players[0]; p.opportunities.selectedIds = ['H12'];
  const before = p.cash, intent = opp.emergencyIntent(s, p, 'choice:1');
  assert.equal(intent.amount, 6000); assert.equal(p.cash, before);
  econ.reward(s, p, intent.amount, intent.catalogId, [], '应急资金'); opp.recordEmergency(p, intent);
  assert.equal(p.cash, before + 6000); assert.equal(opp.emergencyIntent(s, p, 'choice:3'), null);
  assert.throws(() => opp.recordEmergency(p, intent)); assert.equal(p.cash, before + 6000);
  assert.equal(opp.emergencyIntent(f.game(2), f.game(2).players[0], 'old'), null);
});
test('R03 第三阶段基准不追溯不漂移', () => {
  const s = game(); s.players[0].opportunities.lapEpoch = 2;
  assert.throws(() => routes.markInitialResolved(s, 2));
  for (let ordinal = 1; ordinal <= 3; ordinal++) { s.opportunityStage = { ordinal, resolved: true }; routes.markInitialResolved(s, ordinal); }
  assert.equal(s.routeFlow.players.p0.baselineLapEpoch, 2); assert.equal(s.routeFlow.players.p0.pending.length, 0);
  s.players[0].opportunities.lapEpoch = 5; assert.equal(routes.markInitialResolved(s, 3).changed, false);
  assert.equal(s.routeFlow.players.p0.baselineLapEpoch, 2);
});
test('R04 有效圈门槛与合并维持原进度', () => {
  const s = ready(), r = s.routeFlow.players.p0;
  laps(s, 2); assert.equal(r.pending.length, 0); laps(s, 1); const id = r.pending[0].opportunityId;
  laps(s, 3); laps(s, 3); assert.equal(r.pending.length, 1); assert.equal(r.pending[0].opportunityId, id); assert.equal(r.pending[0].lastThreshold, 3);
  routes.tryOpenRouteChoice(s, 'p0', f.rng(), normalTime); resolve(s, action(s, 'route_skip'));
  s.turnId++; laps(s, 2); assert.equal(r.pending.length, 0); laps(s, 1); assert.equal(r.lastThreshold, 4); assert.notEqual(r.pending[0].opportunityId, id);
  assert.equal(routes.markLapProgress(s, 'p0').changed, false);
});
test('R05 快速初始时点0 5 10只登记不打断', () => {
  const s = game('quick'); s.phase = 'trade_confirm'; s.pending = { targetId: 'p1' };
  for (const [minute, ordinal] of [[0, 1], [4.999, 1], [5, 2], [9.999, 2], [10, 3]]) { routes.markQuickDue(s, quickTime(minute)); assert.equal(s.routeFlow.initialDueOrdinal, ordinal); assert.equal(s.phase, 'trade_confirm'); }
  assert.equal(routes.markQuickDue(s, quickTime(10)).changed, false);
  assert.equal(routes.markQuickDue(game(), quickTime(10)).changed, false);
});
test('R06 快速15 22按来源登记一次', () => {
  const s = ready('quick'), r = s.routeFlow.players.p0;
  routes.markQuickDue(s, quickTime(14.999)); assert.equal(r.pending.length, 0);
  routes.markQuickDue(s, quickTime(22)); assert.deepEqual(r.pending.map(c => c.source), ['minute:15', 'minute:22']);
  assert.equal(routes.markQuickDue(s, quickTime(22)).changed, false); assert.equal(r.pending.length, 2);
});
test('R07 28分钟只清未打开与结束取消幂等', () => {
  const s = ready('quick'); open(s); const id = s.routeFlow.activeChoice.opportunityId;
  routes.markQuickDue(s, quickTime(22)); const result = routes.markQuickDue(s, quickTime(28));
  assert.equal(result.changed, true); assert.equal(s.routeFlow.players.p0.pending.length, 0); assert.equal(s.routeFlow.activeChoice.opportunityId, id);
  assert.equal(routes.markQuickDue(s, quickTime(28)).changed, false);
  assert.equal(routes.cancelRoutes(s, null, 'total_deadline').changed, true); assert.equal(s.routeFlow.activeChoice, null);
  assert.equal(routes.cancelRoutes(s, null, 'total_deadline').changed, false);
  const late = ready('quick'); routes.markQuickDue(late, quickTime(28)); assert.equal(late.routeFlow.players.p0.pending.length, 0);
});
test('R08 三候选方向限制排除持有和已领奖', () => {
  const s = ready(); s.players[0].opportunities.oneTimeRewards.H12 = { amount: 6000, receiptId: 'claimed' }; const c = open(s);
  assert.equal(c.candidateIds.length, 3); assert.equal(new Set(c.candidateIds).size, 3); assert.ok(new Set(c.candidateIds.map(id => BY_ID[id].direction)).size >= 2);
  assert.ok(c.candidateIds.every(id => !s.players[0].opportunities.selectedIds.includes(id) && id !== 'H12'));
  const before = JSON.stringify(c); routes.tryOpenRouteChoice(s, 'p0', () => { throw new Error('不能重抽'); }, normalTime); assert.equal(JSON.stringify(c), before);
});
test('R09 安全入口和同回合只开一次', () => {
  const s = ready(); laps(s); const failRng = () => { throw new Error('不应消耗随机'); };
  s.phase = 'stock'; assert.equal(routes.tryOpenRouteChoice(s, 'p0', failRng, normalTime).opened, false);
  s.phase = 'waiting_roll'; s.pending = { due: 5 }; assert.equal(routes.tryOpenRouteChoice(s, 'p0', failRng, normalTime).opened, false);
  s.pending = null; s.routeFlow.rollStartedTurnId = s.turnId; assert.equal(routes.tryOpenRouteChoice(s, 'p0', failRng, normalTime).opened, false);
  s.turnId++; assert.equal(routes.tryOpenRouteChoice(s, 'p1', failRng, normalTime).opened, false);
  routes.tryOpenRouteChoice(s, 'p0', f.rng(), normalTime); resolve(s, action(s, 'route_skip')); laps(s);
  assert.equal(routes.tryOpenRouteChoice(s, 'p0', failRng, normalTime).opened, false); s.turnId++; assert.equal(routes.tryOpenRouteChoice(s, 'p0', f.rng(), normalTime).opened, true);
});
test('R10 非法替换无部分修改合法替换指定项', () => {
  const s = ready(); open(s); const before = JSON.stringify(s);
  for (const extra of [{ newId: 'bad' }, { replaceId: 'H2' }, { opportunityId: 'old' }, { candidateVersion: 2 }]) { assert.throws(() => resolve(s, action(s, 'route_confirm', extra))); assert.equal(JSON.stringify(s), before); }
  const a = action(s), result = resolve(s, a); assert.equal(result.result.replacedId, 'H1'); assert.deepEqual(s.players[0].opportunities.selectedIds, [a.newId, 'H8', 'H10']);
  assert.equal(s.players[0].opportunities.selectedIds.length, 3);
});
test('R11 主动跳过和超时原路线不变', () => {
  for (const type of ['route_skip', 'route_expire']) {
    const s = ready(), p = s.players[0]; open(s); p.opportunities.usage = { H1: 1 }; const original = JSON.stringify(p); const a = action(s, type); resolve(s, a);
    assert.equal(JSON.stringify(p), original); assert.equal(s.phase, 'waiting_roll'); assert.equal(s.pending, null); assert.equal(s.routeFlow.activeChoice, null);
    assert.throws(() => resolve(s, a)); assert.equal(JSON.stringify(p), original);
  }
});
test('R12 换出再换回保留额度机场历史和真实成本', () => {
  const s = ready('quick'), p = s.players[0]; f.own(s, 'p0', '上海'); s.cities['上海'].houseLevel = 1; s.cities['上海'].buildCosts = [10800];
  open(s); p.opportunities.usage = { H1: 1, H2: 1, H3: 1, H4: 900, H6: 1200, H7: 1, H11: 1 }; p.opportunities.visitedAirportIds = ['开罗国际机场'];
  const usage = { ...p.opportunities.usage }, history = p.opportunities.visitedAirportIds.slice(), cost = s.cities['上海'].buildCosts.slice();
  const chosen = s.routeFlow.activeChoice.candidateIds.find(id => id !== 'H12'); resolve(s, action(s, 'route_confirm', { newId: chosen }));
  s.turnId++; routes.markQuickDue(s, quickTime(22)); routes.tryOpenRouteChoice(s, 'p0', f.rng(), quickTime(22));
  s.routeFlow.activeChoice.candidateIds = ['H1', ...Object.values(BY_ID).filter(o => !p.opportunities.selectedIds.includes(o.id) && o.direction !== '地产').slice(0, 2).map(o => o.id)];
  resolve(s, action(s, 'route_confirm', { newId: 'H1', replaceId: chosen }));
  assert.deepEqual(p.opportunities.usage, usage); assert.deepEqual(p.opportunities.visitedAirportIds, history); assert.deepEqual(s.cities['上海'].buildCosts, cost);
  assert.equal(econ.quoteBuild(s, { playerId: 'p0', cityId: '上海', mode: 'remote' }).ok, false);
  const cash = p.cash; econ.airportReward(s, p, '开罗国际机场', []); assert.equal(p.cash, cash); econ.airportReward(s, p, '伦敦希思罗国际机场', []); assert.equal(p.cash, cash + 2000);
  const demolition = econ.quoteDemolition(s, { playerId: 'p0', cityId: '上海' });
  assert.equal(demolition.finalAmount, -6480); assert.equal(demolition.cashDeltas.p0, 6480);
  opp.refresh(p); assert.deepEqual(p.opportunities.usage, {}); assert.equal(econ.quoteBuild(s, { playerId: 'p0', cityId: '上海', mode: 'remote' }).ok, true); assert.equal(p.opportunities.visitedAirportIds.length, 2);
});
