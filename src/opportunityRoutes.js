'use strict';

const opp = require('./opportunities');
const { BY_ID } = require('./gameplayCatalog');
const REVISION = 'opportunity-routes-v1';
const MINUTE = 60000;
const enabled = s => s.ruleVersion === 2 && s.routeRevision === REVISION && !!s.routeFlow;
const playerFor = (s, id) => s.players.find(p => p.id === id);
const empty = () => ({ changed: false, events: [] });
const totalClosed = (s, time) => s.status === 'over' || s.phase === 'game_over' ||
  (s.gameMode === 'quick' && (!time || time.mode !== 'quick' || time.closed || time.elapsedMs >= 30 * MINUTE));

function event(s, id, choice, outcome, extra = {}) {
  const player = playerFor(s, id);
  const reason = extra.reason || (outcome === 'expired' ? '选择超时，保留原路线' : outcome === 'skipped' ? '主动跳过，保留原路线' : outcome === 'cancelled' ? '机会已取消' : '经营路线已调整');
  return { type: 'opportunity', kind: 'route_' + outcome, playerId: id, opportunityId: choice.opportunityId,
    source: choice.source, ...extra, text: player.name + '：' + reason };
}

function assertRoutes(s) {
  if (!enabled(s)) return;
  const flow = s.routeFlow;
  if (!Number.isSafeInteger(flow.initialCompletedOrdinal) || flow.initialCompletedOrdinal < 0 || flow.initialCompletedOrdinal > 3) throw new Error('初始机遇进度无效');
  for (const p of s.players) {
    const r = flow.players[p.id], o = p.opportunities;
    if (!r || !o.oneTimeRewards || o.selectedIds.length > 3 || new Set(o.selectedIds).size !== o.selectedIds.length || o.selectedIds.some(id => !BY_ID[id])) throw new Error('经营路线状态无效');
    if (!Number.isSafeInteger(r.lastThreshold) || r.lastThreshold < 0 || (r.baselineLapEpoch !== null && (!Number.isSafeInteger(r.baselineLapEpoch) || r.baselineLapEpoch < 0 || r.baselineLapEpoch > o.lapEpoch))) throw new Error('圈进度无效');
    const active = flow.activeChoice?.playerId === p.id ? 1 : 0;
    if (r.pending.length + active > (s.gameMode === 'normal' ? 1 : 2) || new Set(r.pending.map(c => c.opportunityId)).size !== r.pending.length) throw new Error('待处理机会无效');
    for (const value of Object.values(o.usage)) if (!Number.isSafeInteger(value) || value < 0) throw new Error('机遇额度无效');
    if (o.oneTimeRewards.H12 && o.oneTimeRewards.H12.amount !== 6000) throw new Error('应急资金历史无效');
  }
  const c = flow.activeChoice;
  if (c) {
    const p = playerFor(s, c.playerId);
    if (!p?.alive || s.phase !== 'route_choose' || s.pending?.playerId !== p.id || s.players[s.turnIndex].id !== p.id || c.candidateIds.length !== 3 || new Set(c.candidateIds).size !== 3 || c.candidateIds.some(id => !BY_ID[id] || p.opportunities.selectedIds.includes(id) || (id === 'H12' && p.opportunities.oneTimeRewards.H12)) || new Set(c.candidateIds.map(id => BY_ID[id].direction)).size < 2) throw new Error('个人候选状态无效');
  }
}

function markInitialResolved(s, ordinal) {
  if (!enabled(s)) return empty();
  const f = s.routeFlow;
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > 3) throw new Error('初始阶段序号无效');
  if (ordinal <= f.initialCompletedOrdinal) return empty();
  if (ordinal !== f.initialCompletedOrdinal + 1 || !s.opportunityStage?.resolved || s.opportunityStage.ordinal !== ordinal) throw new Error('初始阶段尚未完整结算');
  f.initialCompletedOrdinal = ordinal;
  if (ordinal === 3) for (const p of s.players.filter(p => p.alive)) f.players[p.id].baselineLapEpoch = p.opportunities.lapEpoch;
  return { changed: true, events: [] };
}

function markLapProgress(s, playerId) {
  if (!enabled(s) || s.gameMode !== 'normal' || s.status === 'over') return empty();
  const p = playerFor(s, playerId), r = s.routeFlow.players[playerId];
  if (!p?.alive || !r || r.baselineLapEpoch === null) return empty();
  const threshold = Math.floor((p.opportunities.lapEpoch - r.baselineLapEpoch) / 3);
  if (threshold <= r.lastThreshold) return empty();
  const waiting = s.routeFlow.activeChoice?.playerId === playerId ? s.routeFlow.activeChoice : r.pending[0];
  if (waiting) waiting.lastThreshold = threshold;
  else r.pending.push({ opportunityId: s.gameId + ':route:' + playerId + ':lap:' + threshold, source: 'lap', firstThreshold: r.lastThreshold + 1, lastThreshold: threshold });
  r.lastThreshold = threshold;
  return { changed: true, events: [] };
}

function cancelRoutes(s, playerIdOrNull, reason) {
  if (!enabled(s)) return empty();
  if (!['eliminated', 'surrender', 'normal_end', 'room_closed', 'later_closed', 'total_deadline'].includes(reason)) throw new Error('机会取消原因无效');
  const f = s.routeFlow, events = [];
  const ids = playerIdOrNull === null ? s.players.map(p => p.id) : [playerIdOrNull];
  for (const id of ids) {
    const r = f.players[id];
    if (!r) continue;
    const choices = r.pending.splice(0);
    if (reason !== 'later_closed' && f.activeChoice?.playerId === id) { choices.push(f.activeChoice); f.activeChoice = null; }
    for (const c of choices) {
      r.lastResult = { opportunityId: c.opportunityId, playerId: id, outcome: 'cancelled', newId: null, replacedId: null, reason };
      events.push(event(s, id, c, 'cancelled', { reason }));
    }
  }
  return { changed: events.length > 0, events };
}

function markQuickDue(s, time) {
  if (!enabled(s) || s.gameMode !== 'quick' || totalClosed(s, time)) return empty();
  if (!Number.isFinite(time.elapsedMs) || time.elapsedMs < 0) throw new Error('服务端时间无效');
  const f = s.routeFlow, due = time.elapsedMs >= 10 * MINUTE ? 3 : time.elapsedMs >= 5 * MINUTE ? 2 : 1;
  let changed = due > f.initialDueOrdinal;
  f.initialDueOrdinal = Math.max(f.initialDueOrdinal, due);
  if (time.elapsedMs >= 28 * MINUTE) {
    if (!f.laterClosed) changed = true;
    f.laterClosed = true;
    const cleared = cancelRoutes(s, null, 'later_closed');
    return { changed: changed || cleared.changed, events: cleared.events };
  }
  for (const [index, minute] of [15, 22].entries()) {
    if (time.elapsedMs < minute * MINUTE || f.quickDueMask[index]) continue;
    f.quickDueMask[index] = true; changed = true;
    for (const p of s.players.filter(p => p.alive)) f.players[p.id].pending.push({ opportunityId: s.gameId + ':route:' + p.id + ':minute:' + minute, source: 'minute:' + minute });
  }
  return { changed, events: [] };
}

function tryOpenRouteChoice(s, playerId, rng, time) {
  if (!enabled(s) || totalClosed(s, time)) return { ...empty(), opened: false };
  const f = s.routeFlow, p = playerFor(s, playerId), r = f.players[playerId];
  if (!p?.alive || !r || s.players[s.turnIndex].id !== playerId || s.phase !== 'waiting_roll' || s.pending || f.initialCompletedOrdinal !== 3 || f.activeChoice || (s.opportunityStage && !s.opportunityStage.resolved) || f.rollStartedTurnId === s.turnId || r.lastOpenedTurnId === s.turnId || !r.pending.length || (s.gameMode === 'quick' && (f.laterClosed || time.elapsedMs >= 28 * MINUTE))) return { ...empty(), opened: false };
  const candidateIds = opp.candidates(p, rng, p.opportunities.oneTimeRewards.H12 ? ['H12'] : []);
  const c = { ...r.pending[0], playerId, candidateIds, candidateVersion: 1, selectedIdsAtOpen: p.opportunities.selectedIds.slice(), openedTurnId: s.turnId, continuation: { kind: 'waiting_roll' } };
  r.pending.shift(); r.lastOpenedTurnId = s.turnId; f.activeChoice = c;
  s.phase = 'route_choose'; s.pending = { kind: 'route_choice', playerId };
  assertRoutes(s);
  return { changed: true, opened: true, events: [] };
}

function validateChoice(s, a, context) {
  assertRoutes(s);
  const c = s.routeFlow?.activeChoice, p = c && playerFor(s, c.playerId);
  if (!enabled(s) || totalClosed(s, context.timeContext) || s.phase !== 'route_choose' || !c || !p?.alive || s.players[s.turnIndex].id !== p.id || a.opportunityId !== c.opportunityId) throw new Error('经营机遇选择已失效');
  if (!['player', 'timeout'].includes(context.source) || (a.type === 'route_expire' ? context.source !== 'timeout' : context.source !== 'player' || context.actorId !== p.id)) throw new Error('当前无权处理此选择');
  if (!['route_confirm', 'route_skip', 'route_expire'].includes(a.type) || (a.type !== 'route_expire' && a.candidateVersion !== c.candidateVersion)) throw new Error('候选已失效');
  if (JSON.stringify(c.selectedIdsAtOpen) !== JSON.stringify(p.opportunities.selectedIds)) throw new Error('当前经营路线已变化');
  if (a.type === 'route_confirm') {
    const held = p.opportunities.selectedIds;
    if (!c.candidateIds.includes(a.newId) || held.includes(a.newId) || (a.newId === 'H12' && p.opportunities.oneTimeRewards.H12)) throw new Error('请选择当前候选中的机遇');
    if (held.length === 3 ? !held.includes(a.replaceId) : a.replaceId !== null) throw new Error('请选择要替换的原机遇');
  }
  return { c, p };
}

function resolveRouteChoice(s, a, context) {
  const { c, p } = validateChoice(s, a, context);
  let outcome, rewardIntent = null;
  if (a.type === 'route_confirm') {
    const held = p.opportunities.selectedIds;
    outcome = held.length === 3 ? 'replaced' : 'added';
    if (outcome === 'replaced') held[held.indexOf(a.replaceId)] = a.newId;
    else held.push(a.newId);
    if (a.newId === 'H12') rewardIntent = opp.emergencyIntent(s, p, c.opportunityId);
  } else outcome = a.type === 'route_skip' ? 'skipped' : 'expired';
  const result = { opportunityId: c.opportunityId, playerId: p.id, outcome, newId: a.type === 'route_confirm' ? a.newId : null, replacedId: a.type === 'route_confirm' ? a.replaceId : null };
  s.routeFlow.players[p.id].lastResult = result; s.routeFlow.activeChoice = null;
  s.phase = 'waiting_roll'; s.pending = null;
  assertRoutes(s);
  const reason = outcome === 'replaced' ? '用「' + BY_ID[a.newId].name + '」替换「' + BY_ID[a.replaceId].name + '」' : outcome === 'added' ? '取得「' + BY_ID[a.newId].name + '」' : undefined;
  return { changed: true, result, rewardIntent, events: [event(s, p.id, c, outcome, { newId: result.newId, replacedId: result.replacedId, ...(reason ? { reason } : {}) })] };
}

module.exports = { REVISION, enabled, assertRoutes, markInitialResolved, markLapProgress, markQuickDue, tryOpenRouteChoice, validateChoice, resolveRouteChoice, cancelRoutes };
