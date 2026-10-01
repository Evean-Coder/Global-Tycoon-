'use strict';
const econ = require('../../src/economy');
const { assetSummary } = require('../../src/assets');
const { AIRPORTS, buildChanceDeck } = require('../../src/board');
const { OPPORTUNITIES } = require('../../src/gameplayCatalog');
const { hashCanonical, semanticAction } = require('./canonical');

const player = (s, id) => s.players.find(p => p.id === id);
const held = (s, id, h) => player(s, id)?.opportunities.selectedIds.includes(h);
const used = (s, id, h) => player(s, id)?.opportunities.usage[h] || 0;
const sum = values => values.reduce((a, b) => econ.safe(a + b), 0);

function completedTurns(before, after) {
  const turns = [];
  if (!before) return turns;
  const alive = after.players.filter(p => p.alive).map(p => p.id);
  const removed = before.players[before.turnIndex].id;
  let current = before.turnIndex;
  function next() {
    do { current = (current + 1) % before.players.length; } while (!alive.includes(before.players[current].id));
  }
  for (let turnId = before.turnId; turnId < after.turnId; turnId++) {
    const id = before.players[current].id;
    const skipped = turnId > before.turnId || before.phase === 'opportunity_choose';
    turns.push({ turnId, playerId: id, skipped, eliminated: !alive.includes(id) });
    next();
  }
  if (after.phase === 'game_over' && !before.roundFlow.completedTurns.includes(before.turnId) && after.roundFlow.completedTurns.includes(before.turnId) && !turns.some(t => t.turnId === before.turnId)) turns.push({ turnId: before.turnId, playerId: removed, skipped: false, eliminated: !alive.includes(removed) });
  return turns;
}

// Derive the legacy landing branch from the action, movement and pre-action
// deck. The audit may read the deck; the policy never receives this function.
function landingBranch(before, after, action) {
  const p = before.players[before.turnIndex];
  let position = null;
  if (action.type === 'roll_dice' || action.type === 'respond_jail' && action.decision === 'roll' && [1, 10].includes(after.dice)) {
    if (p.position + after.dice < 42) position = (p.position + after.dice) % 42;
  } else if (action.type === 'stock_done' && before.pending.after !== 'end') position = p.position;
  else {
    const resume = before.phase === 'self_rescue' ? before.pending?.resume : ['auction_bid', 'direct_sale_ask'].includes(before.phase) ? before.pending?.context?.resume : false;
    if (resume && ['rescue_done', 'rescue_mortgage', 'mortgage', 'rescue_demolish', 'demolish_house', 'rescue_sell_stock', 'auction_respond', 'direct_sale_respond'].includes(action.type) && player(after, p.id).cash >= 0 && after.pending?.kind !== 'self_rescue') position = p.position;
  }
  if (position === null) return null;
  let square = before.board[position], card = null;
  if (square.type === 'chance') {
    card = before.chanceDeck[0] || buildChanceDeck()[0];
    if (card.type === 'move' && !card.toStart) square = before.board[(position + card.delta + 42) % 42];
    else square = null;
  }
  return { playerId: p.id, position, square, card };
}

function observeTransition(before, outcome, after, reason = {}) {
  const source = outcome.source;
  if (!['formal', 'debug', 'controlled', 'audit'].includes(source) || !Number.isSafeInteger(outcome.step) || outcome.step < 0) throw new Error('观察来源或步骤无效');
  const entries = [], step = outcome.step, action = outcome.action || {}, seenSettlements = new Set();
  const add = (type, data) => {
    const row = { type, source, step, ...data };
    row.id = `${step}:${entries.length}:${hashCanonical(semanticAction(row, after.gameId)).slice(0, 16)}`;
    entries.push(row); return row;
  };
  const cash = Object.fromEntries(after.players.map(p => [p.id, 0]));
  const funds = Object.fromEntries(Object.keys(after.stocks).map(id => [id, 0]));
  function money(kind, ref, id, delta, options = {}) {
    econ.safe(delta);
    const row = {
      kind, settlementRef: ref, playerId: id, counterpartyId: null, cityId: null, airportId: null,
      cashDelta: delta, bankFlow: 0, fundDelta: 0, baseAmount: null, finalAmount: null, effects: [], basis: 'structured', ...options,
    };
    for (const k of ['bankFlow', 'fundDelta']) econ.safe(row[k]);
    for (const k of ['baseAmount', 'finalAmount', 'shares', 'unitPrice', 'bankSupplement']) if (row[k] !== null && row[k] !== undefined) econ.safe(row[k]);
    if (id !== null) { if (!Object.hasOwn(cash, id)) throw new Error('观察包含不存在的玩家'); cash[id] = econ.safe(cash[id] + delta); }
    if (row.fundDelta) { if (!Object.hasOwn(funds, row.cityId)) throw new Error('观察基金城市不存在'); funds[row.cityId] = econ.safe(funds[row.cityId] + row.fundDelta); }
    add('economy', row);
  }
  const legacy = (kind, id, amount, fields = {}) => money(kind, `${after.gameId}:action:${step}:legacy:${kind}:${id}:${entries.length}`, id, amount, { bankFlow: amount, basis: 'action-and-state-rule-branch', ...fields });
  const eligible = (id, h, condition, quota, target, key, details = {}) => add('eligibility', {
    playerId: id, opportunityId: h, target, condition, quotaAvailable: quota,
    status: !condition ? 'unmet' : !quota ? 'exhausted' : 'available_unused',
    passive: true, eligibilityKey: key, ...details,
  });
  const trigger = (id, h, ref, amount, benefitKind, target = null) => {
    econ.safe(amount);
    add('opportunity', { playerId: id, opportunityId: h, settlementRef: ref, amount, benefitKind, target });
  };

  if (!outcome.ok && before) {
    add('failure', { error: outcome.error || '动作失败', actorId: outcome.actorId });
    return entries;
  }
  // Candidate offers, submissions and the public simultaneous resolution are
  // separate records. Submitted choices retain the pre-choice assets/rank.
  const stage = after.opportunityStage, oldStage = before?.opportunityStage;
  if (stage && !stage.resolved) for (const id of stage.participantIds) {
    const c = stage.participants[id], old = oldStage?.stageId === stage.stageId ? oldStage.participants[id] : null;
    if (!old || old.candidateVersion !== c.candidateVersion) add('choice', { kind: old ? 'reroll_offer' : 'offer', playerId: id, stage: stage.ordinal, stageId: stage.stageId, candidateVersion: c.candidateVersion, candidateIds: c.candidateIds.slice() });
  }
  if (before && action.type === 'opportunity_choose') {
    const assets = assetSummary(before, outcome.actorId).total;
    add('choice', { kind: 'submitted', playerId: outcome.actorId, opportunityId: action.opportunityId, stage: oldStage.ordinal, stageId: oldStage.stageId, candidateVersion: action.candidateVersion, assets, cash: player(before, outcome.actorId).cash, aliveCount: before.players.filter(p => p.alive).length, assetRank: 1 + before.players.filter(p => p.alive && assetSummary(before, p.id).total > assets).length });
  }
  const h4Usage = Object.fromEntries(after.players.map(p => [p.id, before && p.opportunities.lapEpoch === player(before, p.id).opportunities.lapEpoch ? used(before, p.id, 'H4') : 0]));
  for (let index = 0; index < (outcome.events || []).length; index++) {
    const e = outcome.events[index], ref = e.settlementId || `${after.gameId}:action:${step}:event:${index}`;
    if (e.settlementId) { if (seenSettlements.has(ref)) throw new Error('观察存在重复结算引用'); seenSettlements.add(ref); }
    if (e.kind === 'opportunity_selection') {
      add('choice', { kind: 'resolved', playerId: e.playerId, opportunityId: e.opportunityId, stage: oldStage.ordinal, stageId: oldStage.stageId });
      if (e.opportunityId === 'H12') eligible(e.playerId, 'H12', true, true, null, ref + ':H12', { status: 'used' });
    }
    if (e.cashDeltas) {
      const deltas = Object.entries(e.cashDeltas), fundDeltas = Object.entries(e.fundDeltas || {});
      const bankFlow = sum(deltas.map(([, n]) => n)) + sum(fundDeltas.map(([, n]) => n));
      deltas.forEach(([id, delta]) => money(e.kind, ref, id, delta, { bankFlow: id === e.playerId ? bankFlow : 0, cityId: e.cityId, baseAmount: e.baseAmount, finalAmount: e.finalAmount, effects: id === e.playerId ? e.effects || [] : [], primary: id === e.playerId, bankSupplement: id === e.playerId ? e.bankSupplement || 0 : 0 }));
      fundDeltas.forEach(([cityId, delta]) => money(e.kind + '_fund', ref, null, 0, { cityId, fundDelta: delta }));
      for (const effect of e.effects || []) if (/^H\d+$/.test(effect.id) && effect.amount > 0) trigger(e.playerId, effect.id, ref, effect.amount, 'saving', e.cityId || action.target || null);
      if (e.kind === 'build' && action.type === 'remote_build') trigger(e.playerId, 'H1', ref, 0, 'permission', e.cityId);
      if (e.kind === 'city_rent' && before) for (const h of ['H6', 'H11']) if (held(before, e.playerId, h)) {
        const qualifies = e.baseAmount > 0 && (h !== 'H6' || (before.stocks[e.cityId].holders[e.playerId] || 0) > 0);
        const quota = h === 'H6' ? used(before, e.playerId, h) < 2000 : !used(before, e.playerId, h);
        eligible(e.playerId, h, qualifies, quota, e.cityId, ref + ':' + h, { status: (e.effects || []).some(x => x.id === h && x.amount > 0) ? 'used' : !qualifies ? 'unmet' : !quota ? 'exhausted' : 'available_unused' });
      }
    } else if (e.kind === 'opportunity_reward') {
      money('opportunity_reward', ref, e.playerId, e.amount, { bankFlow: e.amount, finalAmount: e.amount, opportunityId: e.opportunityId });
      trigger(e.playerId, e.opportunityId, ref, e.amount, 'reward');
      if (e.opportunityId === 'H4') h4Usage[e.playerId] += e.amount;
    } else if (e.kind === 'dividend' || e.kind === 'retained_income') {
      money(e.kind, ref, e.playerId, e.playerId ? e.amount : 0, { bankFlow: e.playerId ? 0 : -e.amount, cityId: e.cityId, fundDelta: -e.amount, finalAmount: e.amount });
      if (e.kind === 'dividend' && held(before, e.playerId, 'H4')) {
        const next = outcome.events[index + 1];
        const bonus = next?.kind === 'opportunity_reward' && next.opportunityId === 'H4' && next.playerId === e.playerId && next.amount > 0;
        eligible(e.playerId, 'H4', e.amount > 0, h4Usage[e.playerId] < 1000, e.cityId, ref + ':H4', { status: bonus ? 'used' : h4Usage[e.playerId] >= 1000 ? 'exhausted' : 'available_unused', amountBase: e.amount });
      }
    } else if (e.kind === 'stock_trade' || e.kind === 'stock_liquidation') {
      const delta = e.kind === 'stock_trade' && e.side === 'buy' ? -e.amount : e.amount;
      money(e.side === 'buy' ? 'stock_buy' : e.kind === 'stock_liquidation' ? e.kind : e.side === 'sell' ? 'stock_sell' : 'stock_forced_sell', ref, e.playerId, delta, { bankFlow: delta, cityId: e.cityId, shares: e.shares, unitPrice: e.unitPrice, finalAmount: e.amount });
    } else if (e.kind === 'stock_transfer') {
      money('stock_transfer', ref, e.playerId, e.cash, { counterpartyId: e.targetId, finalAmount: e.cash, items: e.items });
      money('stock_transfer', ref, e.targetId, -e.cash, { counterpartyId: e.playerId, finalAmount: e.cash, items: e.items });
    }
  }

  if (before) {
    for (const p of after.players) {
      const old = player(before, p.id), laps = p.opportunities.lapEpoch - old.opportunities.lapEpoch;
      if (!Number.isSafeInteger(laps) || laps < 0) throw new Error('绕圈计数不能倒退');
      if (laps) {
        legacy('go', p.id, 10000 * laps, { laps });
        for (const h of ['H5', 'H9', 'H10']) if (held(after, p.id, h)) {
          const condition = h === 'H5' ? Object.entries(after.stocks).filter(([id, st]) => (st.holders[p.id] || 0) > 0 && after.cities[id].ownerId && !after.cities[id].mortgaged).length >= 3 : h === 'H9' ? Object.entries(AIRPORTS).some(([id, a]) => after.airports[id].ownerId === p.id && after.cities[a.adjacentCity].ownerId === p.id && !after.cities[a.adjacentCity].mortgaged) : Object.values(after.cities).filter(c => c.ownerId === p.id).length <= 2;
          const actual = entries.some(x => x.type === 'opportunity' && x.playerId === p.id && x.opportunityId === h);
          eligible(p.id, h, condition, true, null, `${after.gameId}:${p.id}:go:${p.opportunities.lapEpoch}:${h}`, { status: actual ? 'used' : condition ? 'available_unused' : 'unmet' });
        }
        add('progress', { kind: 'lap', playerId: p.id, count: laps });
      }
    }
    const branch = landingBranch(before, after, action);
    if (branch?.card && ['reward', 'fine'].includes(branch.card.type)) legacy('chance_' + branch.card.type, branch.playerId, (branch.card.type === 'fine' ? -1 : 1) * branch.card.amount, { card: { ...branch.card } });
    if (branch?.square?.type === 'airport') {
      const aid = branch.square.airportId, ownerId = before.airports[aid].ownerId;
      if (ownerId && ownerId !== branch.playerId) {
        const fee = 3000 * player(before, ownerId).airports.length, ref = `${after.gameId}:action:${step}:airport:${aid}`;
        money('airport_fee', ref, branch.playerId, -fee, { counterpartyId: ownerId, airportId: aid, finalAmount: fee, basis: 'landing-and-owned-airports' });
        money('airport_fee', ref, ownerId, fee, { counterpartyId: branch.playerId, airportId: aid, finalAmount: fee, basis: 'landing-and-owned-airports' });
      }
      if (held(before, branch.playerId, 'H8')) {
        const movement = after.movement, dice = movement?.source === 'dice' && movement.playerId === branch.playerId && movement.target === branch.square.id;
        const quota = !player(before, branch.playerId).opportunities.visitedAirportIds.includes(aid);
        eligible(branch.playerId, 'H8', dice, quota, aid, `${after.gameId}:${before.turnId}:${branch.playerId}:H8:${aid}`, { status: entries.some(x => x.type === 'opportunity' && x.opportunityId === 'H8' && x.playerId === branch.playerId) ? 'used' : !dice ? 'unmet' : !quota ? 'exhausted' : 'available_unused' });
      }
    }
    legacyActionMoney(before, after, action, outcome.actorId, entries, legacy, money, { step, source });
    for (const turn of completedTurns(before, after)) add('progress', { kind: 'turn', ...turn });
    const rounds = after.roundFlow.index - before.roundFlow.index;
    if (rounds) add('progress', { kind: 'round', count: rounds, completed: after.roundFlow.index - 1 });
    for (const p of after.players) if (player(before, p.id).alive && !p.alive) add('progress', { kind: 'eliminated', playerId: p.id, turnId: before.turnId });
    observeActiveEligibility(before, after, outcome, reason, eligible, entries);
  }
  for (const p of after.players) {
    const assets = assetSummary(after, p.id), oldAssets = before ? assetSummary(before, p.id) : null;
    if (!oldAssets || hashCanonical(assets) !== hashCanonical(oldAssets) || p.alive !== player(before, p.id).alive || p.opportunities.selectedIds.join(',') !== player(before, p.id).opportunities.selectedIds.join(',')) add('assets', { playerId: p.id, alive: p.alive, assets, selectedIds: p.opportunities.selectedIds.slice(), initial: !before });
  }
  if (before) {
    for (const p of after.players) if (p.cash - player(before, p.id).cash !== cash[p.id]) throw new Error(`现金观察无法对账：${p.id}，实际${p.cash - player(before, p.id).cash}，分解${cash[p.id]}`);
    for (const id of Object.keys(after.stocks)) if (after.stocks[id].dividendFund - before.stocks[id].dividendFund !== funds[id]) throw new Error(`基金观察无法对账：${id}`);
    const bank = sum(entries.filter(e => e.type === 'economy').map(e => e.bankFlow));
    if (bank !== sum(Object.values(cash)) + sum(Object.values(funds))) throw new Error('银行/玩家/基金不守恒');
  }
  return entries;
}

function legacyActionMoney(before, after, action, actorId, entries, legacy, money, trace) {
  const p = player(before, actorId), oldTurn = before.players[before.turnIndex];
  const bought = Object.keys(after.cities).filter(id => !before.cities[id].ownerId && after.cities[id].ownerId);
  for (const id of bought) {
    const owner = after.cities[id].ownerId;
    if (action.type === 'auction_respond') continue;
    legacy('city_purchase', owner, -before.cities[id].price, { cityId: id, finalAmount: before.cities[id].price });
  }
  for (const [id, a] of Object.entries(after.airports)) if (!before.airports[id].ownerId && a.ownerId) legacy('airport_purchase', a.ownerId, -15000, { airportId: id, finalAmount: 15000 });
  if (action.type === 'auction_respond') {
    const pend = before.pending, id = pend.cityId, old = before.cities[id], next = after.cities[id];
    if (next.ownerId && next.ownerId !== old.ownerId) {
      const amount = action.decision === 'bid' ? action.amount : pend.currentBid;
      const ref = `${after.gameId}:action:${trace.step}:auction:${id}`;
      money('auction_purchase', ref, next.ownerId, -amount, { cityId: id, bankFlow: pend.sellerId ? 0 : -amount, counterpartyId: pend.sellerId || null, finalAmount: amount, basis: 'pending-bid-and-ownership-transition' });
      if (pend.sellerId) money('auction_sale', ref, pend.sellerId, amount, { cityId: id, counterpartyId: next.ownerId, finalAmount: amount, basis: 'pending-bid-and-ownership-transition' });
    } else if (old.ownerId && !next.ownerId && pend.sellerId) legacy('auction_bank_purchase', pend.sellerId, Math.round(old.price * 0.5), { cityId: id, basis: 'bank-clear-removes-houses-before-half-land-price' });
  }
  if (action.type === 'direct_sale_respond' && action.decision === 'buy' && after.cities[before.pending.cityId].ownerId === actorId) {
    const id = before.pending.cityId, amount = econ.cityTotalValue(before.cities[id]), proceeds = Math.round(amount * 0.8), ref = `${after.gameId}:direct:${before.turnId}:${id}`;
    money('direct_purchase', ref, actorId, -amount, { cityId: id, counterpartyId: before.pending.sellerId, bankFlow: -(amount - proceeds), finalAmount: amount, basis: 'pending-sale-and-standard-value' });
    money('direct_sale', ref, before.pending.sellerId, proceeds, { cityId: id, counterpartyId: actorId, finalAmount: proceeds, basis: 'pending-sale-and-standard-value' });
  }
  if (['mortgage', 'rescue_mortgage'].includes(action.type) && !before.cities[action.cityId].mortgaged && after.cities[action.cityId].mortgaged) legacy('mortgage', actorId, econ.mortgageValue(before.cities[action.cityId]), { cityId: action.cityId });
  if (action.type === 'redeem' && before.cities[action.cityId].mortgaged && !after.cities[action.cityId].mortgaged) legacy('redeem', actorId, -(econ.mortgageValue(before.cities[action.cityId]) + (before.cities[action.cityId].mortgageInterest || 0)), { cityId: action.cityId });
  if (action.type === 'rescue_sell_stock') {
    const shares = action.shares || before.stocks[action.cityId].holders[actorId];
    legacy('rescue_stock_sell', actorId, shares * before.stocks[action.cityId].price, { cityId: action.cityId, shares });
  }
  if (action.type === 'respond_frozen' && action.decision === 'pay' && p.cash >= 5000) legacy('freeze_fee', actorId, -5000);
  if (action.type === 'respond_jail' && action.decision === 'pay') legacy('jail_fee', actorId, -15000);
  for (const pp of after.players) {
    const old = player(before, pp.id);
    if (old.jailed && old.position === 21 && old.jailTurns >= 3 && !pp.jailed && after.rounds > 80 && !(pp.id === actorId && action.type === 'respond_jail' && action.decision === 'pay')) legacy('late_jail_fee', pp.id, -4500);
  }
  const eliminated = after.players.filter(p => player(before, p.id).alive && !p.alive);
  for (const dead of eliminated) {
    const old = player(before, dead.id);
    if (action.type !== 'surrender') {
      const survivors = before.players.filter(p => p.alive && p.id !== dead.id);
      const max = Math.max(...survivors.map(p => assetSummary(before, p.id).total));
      const receivers = survivors.filter(p => assetSummary(before, p.id).total < max);
      if (survivors.length > 1 && receivers.length) for (const receiver of receivers) legacy('bankrupt_relief', receiver.id, Math.floor(15000 / receivers.length));
    }
    if (old.cash) legacy(old.cash < 0 ? 'debt_forgiveness' : 'bankrupt_cash_return', dead.id, -old.cash);
  }
  for (const [id, c] of Object.entries(after.cities)) {
    const old = before.cities[id], delta = (c.mortgageInterest || 0) - (old.mortgageInterest || 0);
    if (delta) entries.push({ id: `interest:${after.gameId}:${trace.step}:${id}`, type: 'liability', source: trace.source, step: trace.step, cityId: id, playerId: c.ownerId || old.ownerId, kind: 'mortgage_interest', delta });
  }
  // oldTurn is the debtor/landing player even when a different bidder responds.
  if (!oldTurn) throw new Error('原回合玩家不存在');
}

function observeActiveEligibility(before, _after, outcome, reason, eligible, entries) {
  const id = outcome.actorId, p = player(before, id);
  if (!p) return;
  const action = outcome.action;
  if (['waiting_roll', 'build_decide'].includes(before.phase)) {
    const local = before.board[p.position].cityId;
    const ids = before.phase === 'build_decide' ? [before.pending.cityId] : [...new Set([local, ...(held(before, id, 'H1') ? p.cities : [])].filter(Boolean))];
    for (const h of ['H1', 'H2', 'H3']) if (held(before, id, h) && (h !== 'H1' || before.phase === 'waiting_roll')) {
      for (const cid of ids.length ? ids : [null]) {
        const c = before.cities[cid];
        const underlying = !!c && c.ownerId === id && !c.mortgaged && c.houseLevel < 4 && (h !== 'H3' || Object.values(before.cities).filter(x => x.ownerId === id && !x.mortgaged && x.group === c.group).length >= 2);
        const quota = !used(before, id, h);
        const q = c ? econ.quoteBuild(before, { playerId: id, cityId: cid, mode: h === 'H1' || cid !== local ? 'remote' : 'normal' }) : null;
        const condition = underlying && (!quota || q?.ok);
        const actual = entries.some(e => e.type === 'opportunity' && e.playerId === id && e.opportunityId === h && e.target === cid);
        const declined = !actual && condition && quota && (reason.code === 'build_declined' && reason.target === cid || reason.declinedTargets?.some(t => t.target === cid));
        eligible(id, h, condition, quota, cid, `${before.gameId}:${before.turnId}:${id}:${h}:${cid}:${c?.houseLevel ?? '-'}:${used(before, id, h)}:${!!q?.ok}`, { passive: false, status: actual ? 'used' : !condition ? 'unmet' : !quota ? 'exhausted' : declined ? 'declined' : 'available_unused', reasonCode: declined ? reason.code : null });
      }
    }
  }
  if (before.phase === 'flight' && held(before, id, 'H7')) {
    const paid = !before.pending.free;
    const actual = entries.some(e => e.type === 'opportunity' && e.opportunityId === 'H7' && e.playerId === id);
    eligible(id, 'H7', paid, !used(before, id, 'H7'), action.target || null, `${before.gameId}:${before.turnId}:${id}:H7:${before.pending.fromAirportId}`, { passive: false, status: actual ? 'used' : !paid ? 'unmet' : used(before, id, 'H7') ? 'exhausted' : reason.code === 'flight_declined' ? 'declined' : 'available_unused', reasonCode: reason.code === 'flight_declined' ? reason.code : null });
  }
  if (before.phase === 'flight' && held(before, id, 'H8') && action.target) eligible(id, 'H8', false, !p.opportunities.visitedAirportIds.includes(action.target), action.target, `${before.gameId}:${before.turnId}:${id}:H8:flight:${action.target}`, { status: 'unmet', reasonCode: 'flight_is_not_dice_landing' });
}

function summarizeObservations(entries) {
  const summary = { players: {}, abilities: Object.fromEntries(OPPORTUNITIES.map(o => [o.id, { offered: 0, selected: 0, triggers: 0, rewards: 0, savings: 0, permissions: 0, statuses: { unmet: 0, exhausted: 0, available_unused: 0, declined: 0, used: 0, unknown: 0 } }])), choices: [], economy: {}, bankFlow: 0, completeRounds: 0, combinations: {}, failures: [] };
  const ids = new Set(), opportunities = new Map(), priorities = { unknown: 0, unmet: 1, exhausted: 2, available_unused: 3, declined: 4, used: 5 };
  for (const e of entries) {
    if (ids.has(e.id)) throw new Error('汇总存在重复观察记录'); ids.add(e.id);
    if (e.playerId && !summary.players[e.playerId]) summary.players[e.playerId] = { selectedIds: [], turns: 0, skippedTurns: 0, laps: 0, cashDelta: 0, economy: {}, opportunityTriggers: {}, opportunityBenefits: {} };
    const p = summary.players[e.playerId];
    if (e.type === 'assets') { p.assets = e.assets; p.alive = e.alive; p.selectedIds = e.selectedIds; if (e.initial) p.initialAssets = e.assets; }
    if (e.type === 'choice' && ['offer', 'reroll_offer'].includes(e.kind)) for (const h of e.candidateIds) summary.abilities[h].offered++;
    if (e.type === 'choice' && e.kind === 'resolved') summary.abilities[e.opportunityId].selected++;
    if (e.type === 'choice' && e.kind === 'submitted') summary.choices.push(e);
    if (e.type === 'eligibility') { const previous = opportunities.get(e.eligibilityKey); if (!previous || priorities[e.status] > priorities[previous.status]) opportunities.set(e.eligibilityKey, e); }
    if (e.type === 'opportunity') {
      const ability = summary.abilities[e.opportunityId]; ability.triggers++; ability[e.benefitKind === 'saving' ? 'savings' : e.benefitKind === 'reward' ? 'rewards' : 'permissions'] += e.benefitKind === 'permission' ? 1 : e.amount;
      p.opportunityTriggers[e.opportunityId] = (p.opportunityTriggers[e.opportunityId] || 0) + 1;
      p.opportunityBenefits[e.opportunityId] ||= { reward: 0, saving: 0, permission: 0 };
      p.opportunityBenefits[e.opportunityId][e.benefitKind] = econ.safe(p.opportunityBenefits[e.opportunityId][e.benefitKind] + (e.benefitKind === 'permission' ? 1 : e.amount));
    }
    if (e.type === 'economy') {
      summary.bankFlow = econ.safe(summary.bankFlow + e.bankFlow);
      summary.economy[e.kind] ||= { cashDelta: 0, bankFlow: 0, fundDelta: 0, count: 0, bankSupplement: 0 };
      const total = summary.economy[e.kind];
      for (const k of ['cashDelta', 'bankFlow', 'fundDelta']) total[k] = econ.safe(total[k] + e[k]); total.count++; total.bankSupplement += e.bankSupplement || 0;
      if (p) { p.cashDelta = econ.safe(p.cashDelta + e.cashDelta); p.economy[e.kind] = econ.safe((p.economy[e.kind] || 0) + e.cashDelta); }
    }
    if (e.type === 'progress') {
      if (e.kind === 'round') summary.completeRounds += e.count;
      if (e.kind === 'lap') p.laps += e.count;
      if (e.kind === 'turn') { p.turns++; if (e.skipped) p.skippedTurns++; }
      if (e.kind === 'eliminated') p.eliminatedTurn = e.turnId;
    }
    if (e.type === 'failure') summary.failures.push(e);
  }
  for (const e of opportunities.values()) summary.abilities[e.opportunityId].statuses[e.status]++;
  for (const [id, p] of Object.entries(summary.players)) if (p.initialAssets && p.assets.cash - p.initialAssets.cash !== p.cashDelta) throw new Error(`逐局现金汇总无法对账：${id}`);
  const combos = { remote_build: ['H1', 'H2', 'H3'], investment_defense: ['H4', 'H5', 'H6', 'H11'], airport_neighbor: ['H9', 'H7', 'H8'] };
  for (const [name, match] of Object.entries({ remote_build: ids => ids.includes('H1') && ids.some(h => ['H2', 'H3'].includes(h)), investment_defense: ids => ids.some(h => ['H4', 'H5'].includes(h)) && ids.some(h => ['H6', 'H11'].includes(h)), airport_neighbor: ids => ids.includes('H9') && ids.some(h => ['H7', 'H8'].includes(h)) })) {
    summary.combinations[name] = Object.entries(summary.players).filter(([, p]) => match(p.selectedIds)).map(([id, p]) => ({ playerId: id, selectedIds: p.selectedIds, triggers: Object.fromEntries(Object.entries(p.opportunityTriggers).filter(([h]) => combos[name].includes(h))), benefits: Object.fromEntries(Object.entries(p.opportunityBenefits).filter(([h]) => combos[name].includes(h))), assets: p.assets }));
  }
  return summary;
}
module.exports = { observeTransition, summarizeObservations, completedTurns, landingBranch };
