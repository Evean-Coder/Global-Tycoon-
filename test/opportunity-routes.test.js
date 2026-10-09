'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createGameState } = require('../src/state');
const routes = require('../src/opportunityRoutes'), opp = require('../src/opportunities');
const econ = require('../src/economy'), { BY_ID } = require('../src/gameplayCatalog');
const f = require('./helpers/gameplayFixtures');
const logic = require('../src/gameLogic');
const {snapshot}=require('../src/state'),{buildGameRecord}=require('../src/record');
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

test('R22 私有候选与公共进度投影',()=>{
 const s=ready();open(s);
 const mine=snapshot(s,'p0'),other=snapshot(s,'p1'),publicView=snapshot(s);
 assert.deepEqual(mine.self.routeChoice.candidateIds,s.routeFlow.activeChoice.candidateIds);
 for(const v of [other,publicView]){assert.equal(v.self?.routeChoice,undefined);assert.equal(JSON.stringify(v).includes('candidateIds'),false);assert.equal(JSON.stringify(v).includes('selectedIdsAtOpen'),false);}
 assert.equal(other.routeProgress.activeChoice.playerId,'p0');assert.equal(mine.self.route.lapsSinceInitial,3);
 const old=snapshot(f.game(2),'p0');assert.equal(old.routeProgress,undefined);assert.equal(old.self.opportunities.oneTimeRewards,undefined);
});
test('R23 记录仅存确定结果和版本',()=>{
 const s=ready();open(s);const result=resolve(s,action(s));
 const record=buildGameRecord({code:'R',state:s,events:result.events},'normal');
 assert.equal(record.routeRevision,routes.REVISION);assert.equal(record.gameMode,'normal');
 assert.equal(record.events[0].kind,'route_replaced');
 for(const field of ['candidateIds','selectedIdsAtOpen','routeFlow','routeChoice'])assert.equal(JSON.stringify(record).includes(field),false);
 const old=buildGameRecord({code:'OLD',state:f.game(2),events:[]},'normal');assert.equal(old.routeRevision,undefined);
});

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
  for(const mode of ['normal','quick']){
  const s = ready(mode); open(s); const before = JSON.stringify(s);
  for (const extra of [{ newId: 'bad' }, { replaceId: 'H2' }, { opportunityId: 'old' }, { candidateVersion: 2 }]) { assert.throws(() => resolve(s, action(s, 'route_confirm', extra))); assert.equal(JSON.stringify(s), before); }
  const a = action(s), result = resolve(s, a); assert.equal(result.result.replacedId, 'H1'); assert.deepEqual(s.players[0].opportunities.selectedIds, [a.newId, 'H8', 'H10']);
  assert.equal(s.players[0].opportunities.selectedIds.length, 3);
  }
});
test('R11 主动跳过和超时原路线不变', () => {
  for (const mode of ['normal','quick']) for (const type of ['route_skip', 'route_expire']) {
    const s = ready(mode), p = s.players[0]; open(s); p.opportunities.usage = { H1: 1 }; const original = JSON.stringify(p); const a = action(s, type); resolve(s, a);
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

test('R13 原初始超时结算及H12首次事实', () => {
  const s = game(); opp.beginOpportunityStage(s, 1, {kind:'start'}, f.rng()); s.opportunityStage.participants.p0.candidateIds = ['H12', 'H1', 'H4'];
  const act = {type:'opportunity_expire',stageId:s.opportunityStage.stageId};
  logic.apply(s, act, f.rng(), {source:'timeout'});
  assert.equal(s.players[0].cash, 156000); assert.equal(s.routeFlow.initialCompletedOrdinal, 1); assert.equal(s.players[0].opportunities.oneTimeRewards.H12.amount, 6000);
  assert.equal(logic.apply(s, act, f.rng(), {source:'timeout'}).rejected, true); assert.equal(s.players[0].cash, 156000);
  const old = f.game(2); opp.beginOpportunityStage(old, 1, {kind:'start'}, f.rng()); logic.apply(old,{type:'opportunity_expire',stageId:old.opportunityStage.stageId},f.rng(),{source:'timeout'}); assert.equal(old.routeFlow, undefined);
});
test('R14 真实起点先开股票不插入后续', () => {
  const s = ready(); s.players[0].opportunities.selectedIds = ['H1', 'H2', 'H3']; laps(s, 2); s.players[0].position = 41; s.diceBag = [1];
  logic.apply(s, {type:'roll_dice'}, f.rng()); assert.equal(s.phase, 'stock'); assert.equal(s.routeFlow.players.p0.pending.length, 1); assert.equal(s.routeFlow.activeChoice, null); assert.equal(s.players[0].cash, 160000);
  logic.apply(s, {type:'stock_done'}, f.rng()); assert.equal(s.turnIndex, 1); assert.equal(s.routeFlow.activeChoice, null);
});
test('R14b 基准已两圈时第三第四第五圈真实结算',()=>{
 const s=ready(),p=s.players[0];p.opportunities.lapEpoch=2;s.routeFlow.players.p0.baselineLapEpoch=2;
 for(let epoch=3;epoch<=5;epoch++){
  p.position=41;s.diceBag=[1];logic.apply(s,{type:'roll_dice'},f.rng());assert.equal(p.opportunities.lapEpoch,epoch);assert.equal(s.phase,'stock');assert.equal(s.routeFlow.players.p0.pending.length,epoch===5?1:0);logic.apply(s,{type:'stock_done'},f.rng());
  s.players[1].position=9;s.diceBag=[1];logic.apply(s,{type:'roll_dice'},f.rng());assert.equal(s.phase,epoch===5?'route_choose':'waiting_roll');
 }
 assert.equal(s.routeFlow.players.p0.baselineLapEpoch,2);
});
test('R21b 债务破产与结束取消排队且迟到确认无效',()=>{
 const s=ready();laps(s);const choiceId=s.routeFlow.players.p0.pending[0].opportunityId;s.players[0].cash=-100;s.phase='self_rescue';s.pending={playerId:'p0',due:100,reason:'测试欠费'};
 logic.apply(s,{type:'rescue_done'},f.rng());assert.equal(s.players[0].alive,false);assert.equal(s.phase,'game_over');assert.equal(s.routeFlow.players.p0.pending.length,0);
 const before=JSON.stringify(s);assert.equal(logic.apply(s,{type:'route_confirm',opportunityId:choiceId,candidateVersion:1,newId:'H12',replaceId:'H1'},f.rng(),{actorId:'p0',source:'player'}).rejected,true);assert.equal(JSON.stringify(s),before);
});
test('R15 普通与监狱掷骰记录当轮且不误开', () => {
  for (const jail of [false, true]) {
    const s = ready(); const turn = s.turnId; laps(s); s.players[0].position = jail ? 21 : 0; s.diceBag = [1];
    if (jail) { s.phase = 'jail_turn'; s.players[0].jailed = true; s.pending = {playerId:'p0',kind:'jail'}; }
    logic.apply(s, jail ? {type:'respond_jail',decision:'roll'} : {type:'roll_dice'}, f.rng());
    assert.equal(s.routeFlow.rollStartedTurnId, turn); assert.equal(s.routeFlow.activeChoice, null); assert.equal(s.routeFlow.players.p0.pending.length, 1);
  }
});
test('R16 回合安全入口不重复完成上一回合', () => {
  const s = ready(); laps(s); const turn = s.turnId, round = s.roundFlow.index;
  logic.prepareTurn(s, [], f.rng()); assert.equal(s.phase, 'route_choose'); assert.equal(s.turnId, turn); assert.equal(s.roundFlow.index, round);
  logic.apply(s, action(s,'route_skip'), f.rng(), {source:'player',actorId:'p0'}); assert.equal(s.turnId, turn); assert.equal(s.phase, 'waiting_roll');
});
test('R17 冻结监狱决定处理后才打开', () => {
  for (const jail of [false, true]) {
    const s = ready(); laps(s); const p = s.players[0], before = p.cash;
    if (jail) { p.position=21; p.jailed=true; s.phase='jail_turn'; s.pending={playerId:p.id,kind:'jail'}; }
    else { p.frozen=true; s.phase='frozen_turn'; s.pending={playerId:p.id,kind:'frozen'}; }
    logic.apply(s,{type:jail?'respond_jail':'respond_frozen',decision:'pay'},f.rng()); assert.equal(s.phase,'route_choose'); assert.equal(p.cash,before-(jail?15000:5000));
    const cash=p.cash; logic.apply(s,action(s,'route_skip'),f.rng(),{actorId:p.id,source:'player'}); assert.equal(s.phase,'waiting_roll'); assert.equal(p.cash,cash);
  }
  const s = ready(); laps(s); s.players[0].jailed=true; s.players[0].position=11; logic.prepareTurn(s,[],f.rng()); assert.equal(s.turnIndex,1); assert.equal(s.routeFlow.activeChoice,null);
});
test('R18 自救和股票完成不删必要上下文', () => {
  const s = ready(); laps(s); s.phase='self_rescue'; s.pending={playerId:'p0',kind:'self_rescue',due:100,reason:'测试欠费'}; s.players[0].cash=-100;
  const before=JSON.stringify(s); assert.equal(logic.apply(s,{type:'route_skip',opportunityId:'none'},f.rng(),{actorId:'p0',source:'player'}).rejected,true); assert.equal(JSON.stringify(s),before);
  s.players[0].cash=100; logic.apply(s,{type:'rescue_done'},f.rng()); assert.equal(s.turnIndex,1); assert.equal(s.routeFlow.players.p0.pending.length,1); assert.equal(s.routeFlow.activeChoice,null);
});
test('R19 后续首次应急资金原子到账', () => {
  for(const mode of ['normal','quick']){
  const s = ready(mode); open(s); s.routeFlow.activeChoice.candidateIds=['H12','H2','H4']; const before=s.players[0].cash;
  const context={actorId:'p0',source:'player',timeContext:mode==='quick'?quickTime(15):normalTime};
  const a=action(s,'route_confirm',{newId:'H12'}), result=logic.apply(s,a,f.rng(),context);
  assert.equal(s.players[0].cash,before+6000); assert.equal(s.players[0].opportunities.oneTimeRewards.H12.amount,6000); assert.equal(result.events.filter(e=>e.kind==='opportunity_reward').length,1);
  assert.equal(logic.apply(s,a,f.rng(),context).rejected,true); assert.equal(s.players[0].cash,before+6000);
  }
});
test('R20 跳过与超时恢复可继续掷骰', () => {
  for (const mode of ['normal','quick']) for (const type of ['route_skip','route_expire']) { const s=ready(mode); open(s); const a=action(s,type); const timeContext=mode==='quick'?quickTime(15):normalTime;logic.apply(s,a,f.rng(),{actorId:'p0',source:type==='route_expire'?'timeout':'player',timeContext}); assert.equal(s.phase,'waiting_roll'); s.diceBag=[1]; const result=logic.apply(s,{type:'roll_dice'},f.rng(),{timeContext}); assert.equal(result.rejected,undefined); assert.equal(s.routeFlow.rollStartedTurnId,1); }
});
test('R21 原正常结束清理不补发未选奖励', () => {
  const s=ready(); laps(s); s.players[0].opportunities.selectedIds=[]; const cash=s.players[1].cash;
  logic.apply(s,{type:'surrender'},f.rng()); assert.equal(s.phase,'game_over'); assert.equal(s.winner,'p1'); assert.equal(s.routeFlow.players.p0.pending.length,0); assert.equal(s.routeFlow.activeChoice,null); assert.equal(s.players[1].cash,cash);
});
