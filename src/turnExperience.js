'use strict';

// A disposable projection of committed facts. It never participates in pricing.
const REVISION = 'turn-experience-v1';
const enabled = s => s?.turnExperienceRevision === REVISION && require('./managementEconomyRules').enabled(s);
const copy = value => JSON.parse(JSON.stringify(value));
const amount = n => Number.isSafeInteger(n) && n >= 0;
function initialPlayer() {
  return {recent: [], totals: {orders: {upfront: 0, principal: 0, profit: 0, newsBonus: 0, cancelledPrincipal: 0}, remote: {cost: 0, count: 0}, competition: {cost: 0, nominalSurcharge: 0, hits: 0}}, incompleteReasons: [], seen: [], highwater: {}};
}
function incomplete(p, reason) { if (!p.incompleteReasons.includes(reason)) p.incompleteReasons.push(reason); }
function add(target, key, n) {
  if (!amount(n) || !Number.isSafeInteger(target[key] + n)) throw new Error('收支资料金额无效');
  target[key] += n;
}
function remember(p, e, receipt, group, ordinal) {
  const key = e.settlementId || receipt.id;
  if (p.seen.includes(key) || Number.isSafeInteger(ordinal) && ordinal <= (p.highwater[group] ?? -1)) return false;
  if (Number.isSafeInteger(ordinal)) p.highwater[group] = ordinal;
  p.seen.push(key); if (p.seen.length > 48) p.seen.shift();
  p.recent.unshift({id: receipt.id, eventId: e.id, ...(e.settlementId ? {settlementId: e.settlementId} : {}), ...receipt});
  p.recent.length = Math.min(p.recent.length, 24);
  return true;
}
function consume(cache, s, e) {
  const targetId = e.targetId || e.cityId;
  const moneySeq = Number(/:money:(\d+)(?::|$)/.exec(e.settlementId || '')?.[1]);
  const emit = (id, fields, group, ordinal) => {
    const p = cache.players[id]; if (!p) return false;
    return remember(p, e, {id: s.gameId + ':experience:' + e.id + ':' + id, kind: e.kind, targetId, ...fields}, group, ordinal);
  };
  const p = cache.players[e.playerId];
  if (e.kind === 'order_started' && p) {
    if (!e.orderId) incomplete(p, '部分订单缺少完整来源');
    if (amount(e.amount) && emit(e.playerId, {cashOut: e.amount}, 'order_start', e.turnId)) add(p.totals.orders, 'upfront', e.amount);
  } else if (e.kind === 'order_payment' && p) {
    if (![e.amount, e.principal, e.profit, e.newsBonus].every(amount) || e.amount !== e.principal + e.profit || !Number.isSafeInteger(e.amount + e.newsBonus)) { incomplete(p, '部分订单回款未区分本金、利润或奖金'); return; }
    if (emit(e.playerId, {cashIn: e.amount + e.newsBonus, principal: e.principal, profit: e.profit, newsBonus: e.newsBonus}, 'order_payment', e.turnId)) {
      for (const key of ['principal', 'profit', 'newsBonus']) add(p.totals.orders, key, e[key]);
    }
  } else if (e.kind === 'order_cancelled' && p) {
    if (!amount(e.unpaidPrincipal)) { incomplete(p, '部分订单取消缺少未领本金'); return; }
    if (emit(e.playerId, {unpaidPrincipal: e.unpaidPrincipal, status: 'cancelled', reason: e.reason || '订单失效'}, 'order_cancel', e.orderCreatedTurnId)) add(p.totals.orders, 'cancelledPrincipal', e.unpaidPrincipal);
  } else if (e.kind === 'build' && p) {
    if (!e.managementKind) { incomplete(p, '部分建设未标记施工来源'); return; }
    if (e.managementKind === 'remote_build' && amount(e.finalAmount) && emit(e.playerId, {cashOut: e.finalAmount, levelBefore: e.levelBefore, levelAfter: e.levelAfter}, 'build', moneySeq)) {
      add(p.totals.remote, 'cost', e.finalAmount); add(p.totals.remote, 'count', 1);
    }
  } else if (e.kind === 'instant_stock_dividend' && p) {
    if (![e.amount, e.rental, e.bank, e.extra].every(amount)) { incomplete(p, '部分股息缺少来源组成'); return; }
    emit(e.playerId, {cashIn: e.amount, rental: e.rental, bank: e.bank, extra: e.extra}, 'dividend', moneySeq);
  } else if (e.kind === 'competition_period_closed') {
    for (const bid of e.bids || []) {
      const won = e.winner?.playerId === bid.playerId, cost = won ? e.winner.amount : 0;
      if (!amount(cost)) throw new Error('中标支出资料无效');
      if (emit(bid.playerId, {targetId: bid.cityId, status: won ? 'won' : bid.status || 'invalid', ...(won ? {cashOut: cost} : {}), reason: bid.reason}, 'competition_close', e.periodRound)) add(cache.players[bid.playerId].totals.competition, 'cost', cost);
    }
  } else if (e.kind === 'city_rent' && e.competition) {
    const owner = cache.players[e.ownerId];
    if (!owner) { for (const entry of Object.values(cache.players)) incomplete(entry, '部分竞争租金缺少城主事实'); return; }
    if (amount(e.competition.surcharge) && emit(e.ownerId, {kind: 'competition_rent', nominalSurcharge: e.competition.surcharge, ...(Number.isSafeInteger(e.cashDeltas?.[e.ownerId]) ? {settlementCash: e.cashDeltas[e.ownerId]} : {})}, 'competition_rent', moneySeq)) {
      add(owner.totals.competition, 'nominalSurcharge', e.competition.surcharge); add(owner.totals.competition, 'hits', 1);
    }
  } else if (e.kind === 'competition_advantage_ended' && p) emit(e.playerId, {status: 'ended', reason: e.text}, 'competition_end');
}
function update(room) {
  const s = room.state;
  if (!enabled(s)) { room.experienceCache = null; return null; }
  try {
    let c = room.experienceCache;
    if (!c || c.gameId !== s.gameId || c.scannedCount > room.events.length || c.failed) {
      c = {gameId: s.gameId, scannedCount: 0, lastEventId: -1, processedCount: 0, players: Object.fromEntries(s.players.map(p => [p.id, initialPlayer()]))};
      room.experienceCache = c;
    }
    while (c.scannedCount < room.events.length) {
      const e = room.events[c.scannedCount++];
      if (!Number.isSafeInteger(e.id) || e.id <= c.lastEventId) continue;
      consume(c, s, e); c.lastEventId = e.id; c.processedCount++;
    }
    return c;
  } catch (error) {
    room.experienceCache = {gameId: s.gameId, failed: true, error: error.message};
    return null;
  }
}
function view(s, id, cache, active) {
  if (!enabled(s)) return null;
  const data = cache?.gameId === s.gameId && !cache.failed ? cache.players[id] : null;
  active ||= require('./activeManagement').view(s, id);
  const player = s.players.find(p => p.id === id);
  return {revision: REVISION, historyAvailable: !!data, incompleteReasons: data ? data.incompleteReasons.slice() : ['历史资料暂不可用'], recent: data ? copy(data.recent) : [], totals: data && !data.incompleteReasons.length ? copy(data.totals) : null,
    turn: {key: [s.gameId, id, s.turnId].join('|'), canRoll: s.phase === 'waiting_roll' && s.players[s.turnIndex]?.id === id && !!player?.alive, canManage: !!active?.available, hasExecutable: !!active?.quotes.some(q => q.ok), managementStatus: active?.usedThisTurn ? 'used' : active?.skippedThisTurn ? 'skipped' : 'available'}};
}
module.exports = {REVISION, enabled, update, view};
