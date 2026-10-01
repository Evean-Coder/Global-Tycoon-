'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { controlledFixture, ownCity, grant, gameSpec } = require('./helpers/balanceFixtures');
const { createSession } = require('../scripts/balance/session');
const logic = require('../src/gameLogic');

test('场景来源：受控分支显式标记且正式模块不引用测试夹具', () => {
  const fixture = controlledFixture({ setup(s) { ownCity(s, 'p0', '上海', 1); grant(s, 'p0', ['H2']); } });
  assert.equal(fixture.source, 'controlled');
  assert.equal(fixture.state.cities['上海'].ownerId, 'p0');
  assert.deepEqual(fixture.state.players[0].opportunities.selectedIds, ['H2']);
  const root = path.join(__dirname, '../scripts/balance');
  for (const file of fs.readdirSync(root).filter(f => f.endsWith('.js'))) assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /require\([^)]*(?:balanceFixtures|test\/)/);
});

function choose(session, id = session.nextActor()) {
  const c = session.view(id).self.choice;
  return session.dispatch(id, { type: 'opportunity_choose', stageId: c.stageId, candidateVersion: c.candidateVersion, opportunityId: c.candidateIds[0] });
}
function opened(n = 2) {
  const session = createSession(gameSpec(n));
  while (session.auditSnapshot().phase === 'opportunity_choose') assert.equal(choose(session).ok, true);
  return session;
}
function controlled(setup, options = {}, limits = {}) {
  const f = controlledFixture({ setup });
  return createSession(gameSpec(2, 'controlled', limits), { controlledState: f.state, ...options });
}
test('正式开局：2/3/4人完成首次全员选择后才进入首骰', () => {
  for (const n of [2, 3, 4]) {
    const s = createSession(gameSpec(n));
    const initial = s.auditSnapshot();
    assert.equal(initial.board.length, 42); assert.equal(initial.phase, 'opportunity_choose');
    assert.equal(initial.players.every(p => p.cash === 150000), true);
    for (let i = 0; i < n; i++) {
      assert.equal(s.nextActor(), `p${i}`);
      assert.equal(choose(s).ok, true);
      assert.equal(s.auditSnapshot().phase, i === n - 1 ? 'waiting_roll' : 'opportunity_choose');
    }
    assert.equal(s.auditSnapshot().players.every(p => p.opportunities.selectedIds.length === 1), true);
    assert.equal(s.dispatch('p0', { type: 'roll_dice' }).ok, true); s.close();
  }
});
test('决策时钟：提交/换组保持选择时限，进入首骰获得新决策', () => {
  const s = createSession(gameSpec()); const first = s.clockView();
  assert.equal(first.secondsRemaining, 30);
  const c = s.view('p0').self.choice;
  assert.equal(s.dispatch('p0', { type: 'opportunity_reroll', stageId: c.stageId, candidateVersion: c.candidateVersion }).ok, true);
  assert.deepEqual(s.clockView(), first);
  choose(s, 'p0'); assert.deepEqual(s.clockView(), first);
  choose(s, 'p1'); assert.equal(s.clockView().decisionId, first.decisionId + 1);
  assert.equal(s.clockView().secondsRemaining, 90); s.close();
});
test('私有视图：隐藏序列/他人候选/未公开提交不泄漏，副本不能改状态', () => {
  const s = createSession(gameSpec()); choose(s, 'p0');
  const v = s.view('p1');
  for (const key of ['diceBag', 'chanceDeck', 'rngSeed', 'actorRevision', 'startedAt']) assert.equal(v[key], undefined);
  assert.equal(v.world.bag, undefined); assert.equal(v.opportunityStage.participants, undefined);
  assert.equal(v.players[0].opportunities.selectedIds.length, 0);
  assert.equal(v.players[0].opportunities.usage, undefined);
  assert.equal(v.players[0].socketId, undefined);
  v.players[0].cash = 0; v.self.choice.candidateIds.length = 0;
  const audit = s.auditSnapshot(); audit.players[0].cash = 1;
  assert.equal(s.auditSnapshot().players[0].cash, 150000); s.close();
});
test('行动者：竞买/直接出售/转让确认由目标玩家处理', () => {
  for (const phase of ['auction_bid', 'direct_sale_ask', 'trade_confirm']) {
    const s = controlled(state => {
      state.phase = phase; state.pending = { awaiting: 'p1', targetId: 'p1', playerId: 'p0', cityId: '上海', currentBid: 0 };
    });
    assert.equal(s.nextActor(), 'p1');
    const type = { auction_bid: 'auction_respond', direct_sale_ask: 'direct_sale_respond', trade_confirm: 'stock_transfer' }[phase];
    const before = s.auditSnapshot();
    assert.equal(s.dispatch('p0', { type, decision: 'pass', accept: false }).ok, false);
    assert.deepEqual(s.auditSnapshot(), before); s.close();
  }
  const bad = controlled(state => { state.phase = 'unknown'; });
  assert.throws(() => bad.nextActor(), /未识别/); bad.close();
});
test('动作校验：过期封装、候选、报价和身份拒绝且不提交', () => {
  for (const bad of [{ decisionId: 0 }, { actorRevision: 99 }, { gameId: 'other' }, { opportunityId: 'H99' }, { candidateVersion: 0 }]) {
    const s = createSession(gameSpec()); const c = s.view('p0').self.choice;
    const before = s.auditSnapshot();
    const res = s.dispatch('p0', { type: 'opportunity_choose', stageId: c.stageId, candidateVersion: c.candidateVersion, opportunityId: c.candidateIds[0], ...bad });
    assert.equal(res.ok, false); assert.deepEqual(s.auditSnapshot(), before); s.close();
  }
  const s = controlled(state => { state.phase = 'waiting_roll'; ownCity(state, 'p0', '上海'); grant(state, 'p0', ['H1']); });
  const before = s.auditSnapshot();
  assert.equal(s.dispatch('p0', { type: 'remote_build', cityId: '上海', quoteVersion: 'old' }).ok, false);
  assert.deepEqual(s.auditSnapshot(), before); s.close();
});
test('原子提交：部分修改后抛错/拒绝不污染，成功修订一次', () => {
  for (const throwing of [true, false]) {
    const s = controlled(() => {}, { applyAction(state) { state.players[0].cash = 1; if (throwing) throw new Error('controlled failure'); return { state, events: [], rejected: true }; } });
    const before = s.auditSnapshot(); assert.equal(choose(s).ok, false);
    assert.deepEqual(s.auditSnapshot(), before); assert.equal(s.steps, 0); s.close();
  }
  const s = opened(); const before = s.auditSnapshot(); const result = s.dispatch('p0', { type: 'roll_dice' });
  assert.equal(result.ok, true); assert.equal(result.revision, before.revision + 1);
  assert.equal(s.auditSnapshot().actorRevision.p0, before.actorRevision.p0 + 1); s.close();
});
test('经济守卫：无效金额/房级/发行量/额度及真正无变化拒绝', () => {
  for (const mutate of [s => { s.players[0].cash = 0.5; }, s => { s.cities['上海'].houseLevel = 5; }, s => { s.stocks['上海'].holders.p0 = 21; }, s => { s.players[0].opportunities.usage.H1 = -1; }, () => {}]) {
    const s = controlled(() => {}, { applyAction(state) { mutate(state); return { state, events: [] }; } });
    const before = s.auditSnapshot(); assert.equal(choose(s).ok, false); assert.deepEqual(s.auditSnapshot(), before); s.close();
  }
  const s = opened(); assert.equal(s.dispatch('p0', { type: 'roll_dice' }).ok, true); s.close();
});
test('终止分类：自然优先，上限只截断，非法动作单列异常', () => {
  const capped = createSession(gameSpec(2, 'debug', { actions: 1 })); choose(capped);
  const before = capped.auditSnapshot(); const result = capped.finishIfNeeded();
  assert.equal(result.outcome, 'censored'); assert.equal(result.winnerId, null); assert.deepEqual(capped.auditSnapshot(), before); capped.close();
  const rounds = controlled(s => { s.roundFlow.index = 501; });
  assert.equal(rounds.finishIfNeeded().reason, 'round_limit'); rounds.close();
  const invalid = createSession(gameSpec()); invalid.dispatch('p0', { type: 'roll_dice' });
  assert.equal(invalid.finishIfNeeded().outcome, 'error'); invalid.close();
  const natural = controlled(s => { s.players[1].alive = false; s.phase = 'game_over'; s.status = 'over'; s.winner = 'p0'; }, {}, { actions: 0 });
  assert.equal(natural.finishIfNeeded().outcome, 'natural'); natural.close();
});
test('逐局结果：规范资产和身份可核对，截断无结算/自然终局只结算一次', () => {
  const s = controlled(state => { ownCity(state, 'p0', '上海', 1); state.stocks['上海'].dividendFund = 100; state.stocks['上海'].holders.p0 = 2; state.players[0].stocks['上海'] = 2; }, {}, { actions: 0 });
  const r = s.finishIfNeeded();
  assert.equal(r.source, 'controlled'); assert.equal(r.ruleVersion, 2); assert.equal(r.configHash, gameSpec(2, 'controlled').configHash);
  assert.equal(r.players[0].assets.propertyValue, 32000); assert.equal(r.players[0].assets.stockValue, 8000);
  assert.equal(r.players[0].assets.retainedPending, 90); assert.equal(r.players[0].cash, 150000);
  assert.equal(r.finalEvents.length, 0); s.close();
  // Trigger the actual engine's finish through a controlled surrender. The
  // production policies never use surrender or inject assets/alive status.
  const n = controlled(state => { state.phase = 'waiting_roll'; state.opportunityStage.resolved = true; state.stocks['上海'].dividendFund = 100; ownCity(state, 'p1', '上海'); });
  const done = n.dispatch('p0', { type: 'surrender' });
  assert.equal(done.ok, true); assert.equal(n.finishIfNeeded().outcome, 'natural');
  const after = n.auditSnapshot(); n.finishIfNeeded(); assert.deepEqual(n.auditSnapshot(), after);
  assert.equal(after.stocks['上海'].dividendFund, 0); n.close();
  assert.equal(typeof logic.apply, 'function');
});
