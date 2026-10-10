'use strict';
const stocks = require('./stocks');
const routes = require('./opportunityRoutes');
const { safe } = require('./economy');
const { netAssetSummary } = require('./assets');
const REVISION = 'quick-mode-v1';
const enabled = s => s.ruleVersion === 2 && s.gameMode === 'quick' && s.quickRevision === REVISION && !!s.quick;

// Caller supplies an isolated candidate and commits it only after all checks pass.
function finalize(s, { reason, elapsedMs, endedAt }) {
  if (!enabled(s)) throw new Error('本局不适用快速结算');
  if (s.quick.status === 'closed') return { events: [], result: s.quick.result };
  if (!['time_limit', 'normal', 'disband', 'idle_timeout'].includes(reason) || !Number.isFinite(elapsedMs) || elapsedMs < 0 || !Number.isFinite(endedAt) || endedAt < s.quick.startedAt) throw new Error('快速结束参数无效');
  for (const p of s.players) safe(p.cash);
  for (const st of Object.values(s.stocks)) { safe(st.price); safe(st.operatingPrice); safe(st.dividendFund); }
  const events = [], cancelled = [], clearedCityIds = [];
  if (s.pending) {
    const p = s.pending, item = { phase: s.phase, type: p.type || p.kind || s.phase, reason };
    for (const key of ['playerId', 'targetId', 'fromId', 'cityId', 'airportId']) if (p[key] !== undefined) item[key] = p[key];
    cancelled.push(item);
  }
  if (s.opportunityStage && !s.opportunityStage.resolved) cancelled.push({ type: 'opportunity_choose', ordinal: s.opportunityStage.ordinal, reason });
  const routeResult = routes.cancelRoutes(s, null, reason === 'time_limit' ? 'total_deadline' : reason === 'normal' ? 'normal_end' : 'room_closed');
  events.push(...routeResult.events);
  for (const e of routeResult.events) cancelled.push({ type: 'route_choose', playerId: e.playerId, reason });
  s.pending = null;
  for (const [cityId, c] of Object.entries(s.cities)) {
    if (c.ownerId && s.players.some(p => p.id === c.ownerId && !p.alive)) {
      stocks.clearCityToBank(s, { cityId }, events); clearedCityIds.push(cityId);
    }
  }
  stocks.settleFinalEconomy(s, reason, events);
  const alive = s.players.filter(p => p.alive).map(p => ({ playerId: p.id, alive: true, summary: netAssetSummary(s, p.id) }));
  alive.sort((a, b) => b.summary.netAssets - a.summary.netAssets);
  let rank = 0;
  const ranking = alive.map((p, i) => {
    if (i === 0 || p.summary.netAssets !== alive[i - 1].summary.netAssets) rank = i + 1;
    return { ...p, rank, netAssets: p.summary.netAssets };
  });
  const deadIds = [...new Set([...s.rank, ...s.players.filter(p => !p.alive && !s.rank.includes(p.id)).map(p => p.id)])].reverse();
  for (const id of deadIds) {
    const p = s.players.find(p => p.id === id && !p.alive); if (!p) continue;
    const summary = netAssetSummary(s, id);
    ranking.push({ playerId: id, alive: false, rank: ranking.length + 1, netAssets: summary.netAssets, summary });
  }
  const winnerIds = ranking.filter(p => p.alive && p.rank === 1).map(p => p.playerId);
  const result = { reason, elapsedMs, endedAt, ranking, winnerIds, cancelled, clearedCityIds };
  s.quick = { ...s.quick, status: 'closed', elapsedMs, endedAt, reason, result };
  s.status = 'over'; s.phase = 'game_over'; s.rank = ranking.map(p => p.playerId);
  if(require('./activeManagement').enabled(s)){s.promotions=[];s.promotionReceipts=[];}
  s.winner = winnerIds.length === 1 ? winnerIds[0] : null; s.endReason = reason;
  s.stockWindow = null; s.opportunityStage = null; s.movement = null;
  if (s.routeFlow) s.routeFlow.laterClosed = true;
  events.push({ type: 'win', kind: 'quick_end', reason, text: reason === 'time_limit' ? '30分钟已到，按净资产封盘结算' : '对局结束，按净资产结算', winnerIds });
  for (const item of cancelled) events.push({ type: 'log', kind: 'quick_cancel', ...item, text: '对局结束，未完成的' + item.type + '已取消' });
  return { events, result };
}
module.exports = { REVISION, enabled, finalize };
