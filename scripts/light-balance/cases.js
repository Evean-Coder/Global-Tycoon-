'use strict';
const assert = require('node:assert/strict');
const { createGameState } = require('../../src/state');
const econ = require('../../src/economy');
const stocks = require('../../src/stocks');
const opp = require('../../src/opportunities');
const round = require('../../src/roundFlow');
const world = require('../../src/worldEvents');
const logic = require('../../src/gameLogic');
const { normalizeAction } = require('../../src/actionValidation');
const { createRng } = require('../../src/random');
const { assertEconomy } = require('../balance/session');
const { assetSummary } = require('../../src/assets');
const { hashCanonical, semanticState } = require('../balance/canonical');

function fixture(n = 2) {
  const s = createGameState('LIGHT_CONTROLLED', Array.from({ length: n }, (_, i) => '测试' + i));
  s.gameId = 'light-fixture'; s.startedAt = 0; s.rngSeed = 22; s.firstRoundDone = true;
  for (const p of s.players) p.lapDone = true;
  s.world.status = 'running'; s.world.active = { type: 'stable', region: null, remaining: 3, name: '市场平稳期' }; s.world.roundsCompleted = 6;
  s.opportunityStage = { ordinal: 3, resolved: true };
  return s;
}
function own(s, pid, id, level = 0) {
  const c = s.cities[id];
  if (c.ownerId) s.players.find(p => p.id === c.ownerId).cities = s.players.find(p => p.id === c.ownerId).cities.filter(x => x !== id);
  c.ownerId = pid; c.houseLevel = level; c.buildCosts = Array.from({ length: level }, () => c.price * 0.6); c.buildReady = true;
  if (!s.players.find(p => p.id === pid).cities.includes(id)) s.players.find(p => p.id === pid).cities.push(id);
  stocks.initializeListing(s, id);
}
function airport(s, pid, id) { s.airports[id].ownerId = pid; if (!s.players.find(p => p.id === pid).airports.includes(id)) s.players.find(p => p.id === pid).airports.push(id); }
function grant(s, pid, ids) { if (ids.length > 3) throw new Error('超过三个机遇阶段'); const p = s.players.find(p => p.id === pid); p.opportunities.selectedIds = ids.slice(); p.opportunities.usage = Object.fromEntries(ids.map(id => [id, 0])); }
function order(s, id, side, shares) { return { cityId: id, side, shares, quoteVersion: s.stocks[id].quoteVersion, listingEpoch: s.stocks[id].listingEpoch }; }
function metrics(s) {
  return { players: s.players.map(p => ({ id: p.id, alive: p.alive, cash: p.cash, position: p.position, usage: { ...p.opportunities.usage }, assets: assetSummary(s, p.id) })),
    cashTotal: s.players.reduce((n, p) => n + p.cash, 0), funds: Object.values(s.stocks).reduce((n, st) => n + st.dividendFund, 0),
    mortgages: Object.values(s.cities).filter(c => c.mortgaged).map(c => ({ city: c.id, interest: c.mortgageInterest || 0 })),
    houses: Object.values(s.cities).filter(c => c.ownerId).map(c => ({ city: c.id, ownerId: c.ownerId, level: c.houseLevel })),
    completeRounds: s.roundFlow.index - 1, phase: s.phase };
}
function context() {
  const s = fixture(), events = [], assertions = [], actions = [], rng = createRng(22);
  function equal(actual, expected, note) { assertions.push({ note, actual, expected }); assert.deepEqual(actual, expected, note); }
  function yes(actual, note) { equal(!!actual, true, note); }
  function denied(fn, note) { let error; try { fn(); } catch (e) { error = e.message; } yes(error, note); actions.push({ expectedRejection: error }); }
  function action(raw, actorId = s.players[s.turnIndex].id) {
    const q = normalizeAction(s, raw, { actorId, source: 'player' });
    if (!q.ok) throw new Error('工具案例动作不合法：' + q.error);
    const before = hashCanonical(semanticState(s)), result = logic.apply(s, q.action, rng, { actorId, source: 'player' });
    if (result.rejected) throw new Error('动作被引擎拒绝');
    s.revision++; s.actorRevision[actorId]++; assertEconomy(s); events.push(...result.events); actions.push({ actorId, raw, before, after: hashCanonical(semanticState(s)) });
  }
  return { s, events, assertions, actions, equal, yes, denied, action, rng };
}
function catalog() {
  const cases = [], add = (category, name, run) => cases.push({ id: category + '-' + String(cases.filter(c => c.category === category).length + 1).padStart(2, '0'), category, name, run });
  const setupStock = t => { own(t.s, 'p1', '上海'); t.s.phase = 'stock'; t.s.pending = { type: 'stock', playerId: 'p0', stage: 'end' }; stocks.openStockWindow(t.s, 'p0'); };
  const trade = (t, id, side, shares) => t.action({ type: 'stock_trade', windowId: t.s.stockWindow.windowId, orders: [order(t.s, id, side, shares)] });
  add('stock', '同窗买卖本金守恒', t => { setupStock(t); const before = metrics(t.s).cashTotal; trade(t, '上海', 'buy', 2); trade(t, '上海', 'sell', 2); t.equal(metrics(t.s).cashTotal, before, '固定报价买卖未生钱'); t.equal(t.s.stocks['上海'].holders.p0, 0, '恢复持仓'); });
  add('stock', '窗口累计限购不能卖出后重置', t => { setupStock(t); trade(t, '上海', 'buy', 2); trade(t, '上海', 'sell', 2); t.denied(() => trade(t, '上海', 'buy', 1), '累计两股额度不恢复'); t.equal(t.s.stockWindow.boughtTotal, 2, '窗口购买次数保留'); });
  add('stock', '城主持股四股上限', t => { own(t.s, 'p0', '上海'); t.s.stocks['上海'].holders.p0 = 4; stocks.syncHolders(t.s); stocks.openStockWindow(t.s, 'p0'); t.denied(() => trade(t, '上海', 'buy', 1), '所有者不能买第五股'); });
  add('stock', '除息不重复创造基本资产', t => { setupStock(t); const st = t.s.stocks['上海']; st.holders.p0 = 2; st.dividendFund = 2000; stocks.syncHolders(t.s); stocks.refreshPrice(t.s, '上海', 'fixture'); const before = t.s.players.map(p => assetSummary(t.s, p.id).total); stocks.settleCityDividend(t.s, '上海', 'go', 'one', t.events); t.equal(t.s.players.map(p => assetSummary(t.s, p.id).total), before, '现金与待分红/股价互换'); t.equal(st.price, 4000, '每股100分红后除息'); });
  add('stock', '重复派息不重复获利', t => { setupStock(t); t.s.stocks['上海'].holders.p0 = 2; t.s.stocks['上海'].dividendFund = 2000; stocks.settleCityDividend(t.s, '上海', 'go', 'a', t.events); const cash = metrics(t.s).cashTotal; stocks.settleCityDividend(t.s, '上海', 'go', 'b', t.events); t.equal(metrics(t.s).cashTotal, cash, '基金清零后重复派息无收益'); });
  add('stock', '产权变化先给原经营者派息', t => { setupStock(t); t.s.stocks['上海'].holders.p0 = 2; t.s.stocks['上海'].dividendFund = 2000; stocks.transferCity(t.s, { cityId: '上海', newOwnerId: 'p0' }, t.events); t.equal(t.s.players.map(p => p.cash), [150200, 151800], '原城主保留1800，持股者200'); t.equal(t.s.stocks['上海'].dividendFund, 0, '新产权不重复得到旧基金'); });
  add('stock', '银行清算折价且只能一次', t => { setupStock(t); t.s.stocks['上海'].holders.p0 = 2; t.s.stocks['上海'].dividendFund = 2000; stocks.clearCityToBank(t.s, { cityId: '上海' }, t.events); t.equal(t.s.players[0].cash, 154200, '股息200与折价清算4000'); const cash = metrics(t.s).cashTotal; stocks.clearCityToBank(t.s, { cityId: '上海' }, t.events); t.equal(metrics(t.s).cashTotal, cash, '清算幂等'); });
  add('stock', '无租金报价下限', t => { setupStock(t); t.s.stocks['上海'].operatingPrice = 2000; stocks.updateOperatingQuotes(t.s, 1, t.events); t.equal(t.s.stocks['上海'].operatingPrice, 2200, '从低端向无租金目标3800按10%恢复'); t.yes(t.s.stocks['上海'].operatingPrice >= 2000, '不低于初价50%'); });
  add('stock', '经营报价上限', t => { setupStock(t); t.s.cities['上海'].houseLevel = 4; t.s.cities['上海'].buildCosts = [12000, 12000, 12000, 12000]; t.s.stocks['上海'].operatingPrice = 8000; t.s.stocks['上海'].roundRent = 99000; stocks.updateOperatingQuotes(t.s, 1, t.events); t.equal(t.s.stocks['上海'].operatingPrice, 7200, '由8000向目标7000按10%下降'); t.yes(t.s.stocks['上海'].operatingPrice <= 8000, '不高于初价两倍'); });
  add('stock', '同轮报价不重复推进', t => { setupStock(t); t.s.stocks['上海'].roundRent = 18000; stocks.updateOperatingQuotes(t.s, 1, t.events); const st = globalThis.structuredClone(t.s.stocks['上海']); stocks.updateOperatingQuotes(t.s, 1, t.events); t.equal(t.s.stocks['上海'], st, '同轮只更新一次'); });
  for (const cash of [3000, 0]) add('stock', cash ? '有价转让资金守恒' : '无价转让不能生钱', t => { setupStock(t); t.s.stocks['上海'].holders.p0 = 1; const before = metrics(t.s).cashTotal; const q = stocks.planTransfer(t.s, 'p0', 'p1', [{ cityId: '上海', shares: 1 }], cash); stocks.applyTransfer(t.s, q, t.events); t.equal(metrics(t.s).cashTotal, before, '合谋双方总现金守恒'); t.equal(t.s.stocks['上海'].holders.p1, 1, '股份仅转移'); });

  add('business', '低价建设现金回本条件', t => { own(t.s, 'p0', '内罗毕'); t.s.players[0].position = 1; const before = econ.quoteRent(t.s, { playerId: 'p1', cityId: '内罗毕' }).income; const q = econ.quoteBuild(t.s, { playerId: 'p0', cityId: '内罗毕' }); econ.applySettlement(t.s, q, t.events); const after = econ.quoteRent(t.s, { playerId: 'p1', cityId: '内罗毕' }); t.equal(q.finalAmount, 2160, '建设费用'); t.equal(after.income - before, 1080, '单次租金增量'); t.equal(after.cashDeltas.p0, 1728, '20%暂存基金，城主当次收到80%'); });
  add('business', '高价城满级增量', t => { own(t.s, 'p0', '上海', 3); t.s.players[0].position = 36; const q = econ.quoteBuild(t.s, { playerId: 'p0', cityId: '上海' }); econ.applySettlement(t.s, q, t.events); t.equal(econ.quoteRent(t.s, { playerId: 'p1', cityId: '上海' }).income, 33000, '满级高价城含10%加成'); t.equal(q.finalAmount, 12000, '最后一级建设成本'); });
  add('business', '优惠建拆存在损失', t => { own(t.s, 'p0', '上海'); grant(t.s, 'p0', ['H1', 'H2']); t.s.world.active.type = 'construction'; const cash = t.s.players[0].cash; const q = econ.quoteBuild(t.s, { playerId: 'p0', cityId: '上海', mode: 'remote' }); econ.applySettlement(t.s, q, t.events); econ.applySettlement(t.s, econ.quoteDemolition(t.s, { playerId: 'p0', cityId: '上海' }), t.events); t.equal(t.s.players[0].cash - cash, -3600, '按实际9000的60%返5400'); t.equal(t.s.cities['上海'].houseLevel, 0, '房屋恢复而现金损失'); });
  add('business', '抵押赎回费用不生钱', t => { own(t.s, 'p0', '上海'); t.s.players[0].position = 36; const cash = t.s.players[0].cash; t.action({ type: 'mortgage', cityId: '上海' }); t.s.cities['上海'].mortgageInterest = 500; t.action({ type: 'redeem', cityId: '上海' }); t.equal(t.s.players[0].cash - cash, -500, '本金抵消，付已计利息'); });
  add('business', '机场通行收益随机场数增长', t => { airport(t.s, 'p1', '开罗国际机场'); airport(t.s, 'p1', '伦敦希思罗国际机场'); t.s.players[0].position = 5; t.s.diceBag = [1]; t.action({ type: 'roll_dice' }); t.equal(t.s.players.map(p => p.cash), [144000, 156000], '两机场通行费6000为转移'); });
  add('business', '普通航班费用', t => { const q = econ.quoteFlight(t.s, { playerId: 'p0', fromAirportId: '开罗国际机场', target: '伦敦希思罗国际机场' }); t.equal(q.finalAmount, 5000, '10格短边×500'); });
  add('business', '免费航班不消耗优惠', t => { grant(t.s, 'p0', ['H7']); const q = econ.quoteFlight(t.s, { playerId: 'p0', fromAirportId: '开罗国际机场', target: '伦敦希思罗国际机场', free: true }); econ.applySettlement(t.s, q, t.events); t.equal(t.s.players[0].opportunities.usage.H7, 0, '免费不耗H7'); t.equal(t.s.players[0].cash, 150000, '免费不付票价'); });
  for (const n of [2, 3, 4]) add('business', n + '人租金身份映射', t => { const values = []; for (let seat = 0; seat < n; seat++) { const s = fixture(n), payer = 'p' + seat, owner = 'p' + ((seat + 1) % n); own(s, owner, '上海'); grant(s, payer, ['H6', 'H11']); s.stocks['上海'].holders[payer] = 1; const q = econ.quoteRent(s, { playerId: payer, cityId: '上海' }); assertEconomy(s); values.push([q.finalAmount, q.cashDeltas[owner], q.fundDeltas['上海']]); } t.equal(values, Array.from({ length: n }, () => [4320, 4800, 1200]), '同资产/机遇条件映射后相同'); t.actions.push({ mappedSeats: n, actual: values }); });
  add('business', '建设资格身份映射', t => { const out = []; for (let seat = 0; seat < 4; seat++) { const s = fixture(4), pid = 'p' + seat; own(s, pid, '上海'); grant(s, pid, ['H1']); s.turnIndex = seat; out.push(econ.quoteBuild(s, { playerId: pid, cityId: '上海', mode: 'remote' }).finalAmount); } t.equal(out, [12000, 12000, 12000, 12000], '远程资格不固定首座'); });
  add('business', '完整轮边界不依赖首座', t => { const results = []; for (const ids of [['p0', 'p1', 'p2'], ['p2', 'p0', 'p1']]) { const s = fixture(3); const answers = ids.map((id, i) => round.completeTurn(s, id, i + 1)); results.push(answers); } t.equal(results, [[false, false, true], [false, false, true]], '所有所需玩家结束才完整轮'); });

  for (let i = 1; i <= 12; i++) add('opportunity', 'H' + i + '合法作用与条件', t => {
    const id = 'H' + i; grant(t.s, 'p0', [id]);
    if (i <= 3) { own(t.s, 'p0', '上海'); if (i === 3) own(t.s, 'p0', '东京'); if (i !== 1) t.s.players[0].position = 36; const q = econ.quoteBuild(t.s, { playerId: 'p0', cityId: '上海', mode: i === 1 ? 'remote' : 'normal' }); econ.applySettlement(t.s, q, t.events); t.equal(q.finalAmount, i === 1 ? 12000 : 10800, '实际建房费'); t.equal(opp.used(t.s.players[0], id), 1, '成功耗一次'); if (i === 1) t.equal(econ.quoteBuild(t.s, { playerId: 'p0', cityId: '上海', mode: 'remote' }).ok, false, '本圈不能再远程'); }
    if (i === 4) { own(t.s, 'p1', '上海'); t.s.stocks['上海'].holders.p0 = 2; t.s.stocks['上海'].dividendFund = 2000; stocks.settleCityDividend(t.s, '上海', 'go', 'h4', t.events); t.equal(t.s.players[0].cash, 150240, '基础200额外40'); t.equal(opp.used(t.s.players[0], id), 40, '额度为奖励金额'); }
    if (i === 5) { for (const city of ['上海', '东京', '悉尼']) { own(t.s, 'p1', city); t.s.stocks[city].holders.p0 = 1; } econ.goRewards(t.s, t.s.players[0], t.events); t.equal(t.s.players[0].cash, 152000, '三有效城市起点奖励'); t.s.cities['东京'].mortgaged = true; econ.goRewards(t.s, t.s.players[0], t.events); t.equal(t.s.players[0].cash, 152000, '抵押后不足三城不给'); }
    if (i === 6 || i === 11) { own(t.s, 'p1', '上海'); t.s.stocks['上海'].holders.p0 = 1; const q = econ.quoteRent(t.s, { playerId: 'p0', cityId: '上海' }); econ.applySettlement(t.s, q, t.events); t.equal(q.finalAmount, i === 6 ? 5400 : 4800, '单机遇减免'); t.equal(q.bankSupplement, i === 6 ? 600 : 1200, '银行補足单列'); }
    if (i === 7) { const q = econ.quoteFlight(t.s, { playerId: 'p0', fromAirportId: '开罗国际机场', target: '伦敦希思罗国际机场' }); econ.applySettlement(t.s, q, t.events); t.equal(q.finalAmount, 4000, '首次票价优惠1000'); t.equal(opp.used(t.s.players[0], id), 1, '首次付费消耗'); }
    if (i === 8) { t.s.players[0].position = 5; t.s.diceBag = [1]; t.action({ type: 'roll_dice' }); econ.airportReward(t.s, t.s.players[0], '开罗国际机场', t.events); t.equal(t.s.players[0].cash, 152000, '真实骰子直接落机场后同机场只给一次'); }
    if (i === 9) { own(t.s, 'p0', '开罗'); airport(t.s, 'p0', '开罗国际机场'); econ.goRewards(t.s, t.s.players[0], t.events); t.equal(t.s.players[0].cash, 151500, '一邻城配对奖励'); }
    if (i === 10) { econ.goRewards(t.s, t.s.players[0], t.events); t.equal(t.s.players[0].cash, 152000, '轻资产奖励'); for (const city of ['上海', '东京', '悉尼']) own(t.s, 'p0', city); econ.goRewards(t.s, t.s.players[0], t.events); t.equal(t.s.players[0].cash, 152000, '三座即失资格'); }
    if (i === 12) { t.s.players[0].opportunities.selectedIds = []; opp.beginOpportunityStage(t.s, 1, { kind: 'start' }, t.rng); for (const pid of ['p0', 'p1']) { const entry = t.s.opportunityStage.participants[pid]; entry.candidateIds = ['H12', 'H1', 'H4']; t.action({ type: 'opportunity_choose', stageId: t.s.opportunityStage.stageId, candidateVersion: 1, opportunityId: pid === 'p0' ? 'H12' : 'H1' }, pid); } t.equal(t.s.players[0].cash, 156000, '全体选择后应急6000'); t.equal(t.s.players[0].opportunities.selectedIds, ['H12'], '仅取得一次'); }
  });

  for (const type of ['boom', 'slowdown', 'construction', 'aviation', 'stable']) add('combination', '资讯 ' + type, t => { t.s.world.active = { type, region: '亚洲', remaining: 3 }; if (type === 'construction') { own(t.s, 'p0', '上海'); t.s.players[0].position = 36; const q = econ.quoteBuild(t.s, { playerId: 'p0', cityId: '上海' }); econ.applySettlement(t.s, q, t.events); t.equal(q.finalAmount, 10200, '首次建设优惠1800'); } else if (type === 'aviation') { const q = econ.quoteFlight(t.s, { playerId: 'p0', fromAirportId: '开罗国际机场', target: '伦敦希思罗国际机场' }); t.equal(q.finalAmount, 3500, '航班七折'); } else { own(t.s, 'p1', '上海'); const q = econ.quoteRent(t.s, { playerId: 'p0', cityId: '上海' }); t.equal(q.income, { boom: 6900, slowdown: 5100, stable: 6000 }[type], '匹配地区租金'); } });
  add('combination', '施工+H2+H3总折扣封顶', t => { own(t.s, 'p0', '上海'); own(t.s, 'p0', '东京'); grant(t.s, 'p0', ['H2', 'H3']); t.s.players[0].position = 36; t.s.world.active.type = 'construction'; const q = econ.quoteBuild(t.s, { playerId: 'p0', cityId: '上海' }); econ.applySettlement(t.s, q, t.events); t.equal(q.finalAmount, 8400, '合计30%封顶'); t.equal(q.effects.map(e => e.amount), [1800, 1200, 600], '按顺序截断连锁'); });
  add('combination', 'H1支付施工叠加实际费', t => { own(t.s, 'p0', '上海'); own(t.s, 'p0', '东京'); grant(t.s, 'p0', ['H1', 'H2', 'H3']); t.s.world.active.type = 'construction'; t.s.players[0].cash = 8400; const q = econ.quoteBuild(t.s, { playerId: 'p0', cityId: '上海', mode: 'remote' }); t.action({ type: 'remote_build', cityId: '上海', quoteVersion: q.quoteVersion }); t.equal(t.s.players[0].cash, 0, '远程没有额外免费'); t.equal(t.s.cities['上海'].buildCosts, [8400], '真实成本持久'); });
  add('combination', 'H6+H11付款与银行补足', t => { own(t.s, 'p1', '上海'); grant(t.s, 'p0', ['H6', 'H11']); t.s.stocks['上海'].holders.p0 = 1; const q = econ.quoteRent(t.s, { playerId: 'p0', cityId: '上海' }); econ.applySettlement(t.s, q, t.events); t.equal([q.finalAmount, q.bankSupplement, q.fundDeltas['上海'], q.cashDeltas.p1], [4320, 1680, 1200, 4800], '先10%再20%，保留全收入'); t.equal(metrics(t.s).cashTotal + metrics(t.s).funds, 301680, '系统补足注入1680'); });
  add('combination', '航空+H7总优惠', t => { grant(t.s, 'p0', ['H7']); t.s.world.active.type = 'aviation'; const q = econ.quoteFlight(t.s, { playerId: 'p0', fromAirportId: '开罗国际机场', target: '伦敦希思罗国际机场' }); econ.applySettlement(t.s, q, t.events); t.equal(q.finalAmount, 2500, '五折总上限'); const next = econ.quoteFlight(t.s, { playerId: 'p0', fromAirportId: '开罗国际机场', target: '伦敦希思罗国际机场' }); t.equal(next.finalAmount, 3500, '本圈H7不能再用'); });
  add('combination', 'H4派息奖励上限与除息', t => { own(t.s, 'p1', '上海'); grant(t.s, 'p0', ['H4']); t.s.stocks['上海'].holders.p0 = 10; t.s.stocks['上海'].dividendFund = 20000; stocks.settleCityDividend(t.s, '上海', 'go', 'large', t.events); t.equal(t.s.players[0].cash, 161000, '基础10000额外封顶1000'); t.s.stocks['上海'].dividendFund = 2000; stocks.settleCityDividend(t.s, '上海', 'go', 'later', t.events); t.equal(t.s.players[0].cash, 162000, '额度耗尽后仅基础1000'); });
  add('combination', 'H5+H10低城市门槛组合', t => { grant(t.s, 'p0', ['H5', 'H10']); for (const city of ['上海', '东京', '悉尼']) { own(t.s, 'p1', city); t.s.stocks[city].holders.p0 = 1; } econ.goRewards(t.s, t.s.players[0], t.events); t.equal(t.s.players[0].cash, 154000, '两项起点额外共4000'); own(t.s, 'p0', '内罗毕'); own(t.s, 'p0', '开普敦'); own(t.s, 'p0', '卡萨布兰卡'); econ.goRewards(t.s, t.s.players[0], t.events); t.equal(t.s.players[0].cash, 156000, '三城失去轻资产，仅分散投资2000'); });
  add('combination', 'H9抵押与完整轮额度边界', t => { grant(t.s, 'p0', ['H9']); own(t.s, 'p0', '开罗'); own(t.s, 'p0', '伦敦'); airport(t.s, 'p0', '开罗国际机场'); airport(t.s, 'p0', '伦敦希思罗国际机场'); econ.goRewards(t.s, t.s.players[0], t.events); t.equal(t.s.players[0].cash, 153000, '两对奖励封顶3000'); t.s.cities['开罗'].mortgaged = true; econ.goRewards(t.s, t.s.players[0], t.events); t.equal(t.s.players[0].cash, 154500, '抵押配对不计'); t.s.world.constructionUsedIds = ['p0']; t.s.roundFlow.completedIds = ['p0', 'p1']; logic.completeRoundBoundary(t.s, t.events, t.rng); t.equal(t.s.world.constructionUsedIds, [], '完整轮建设额度重置'); });
  assert.equal(cases.length, 48);
  return cases;
}
function executeCase(item) {
  const t = context(), before = hashCanonical(semanticState(t.s));
  let error = null;
  try { item.run(t); assertEconomy(t.s); } catch (e) { error = { message: e.message, stack: e.stack }; }
  return { id: item.id, category: item.category, name: item.name, origin: 'synthetic-local-rules', ok: !error, beforeHash: before,
    finalHash: hashCanonical(semanticState(t.s)), actual: metrics(t.s), assertions: t.assertions, events: t.events, actions: t.actions, error,
    finalState: semanticState(t.s), scope: '局部真实规则检查，人工状态不声称正常起局可达或总体胜率' };
}
module.exports = { fixture, own, airport, grant, order, metrics, catalog, executeCase, context, world };
