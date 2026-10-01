'use strict';

// Decisions use only the supplied gameView snapshot, fixed configuration and
// this player's own memory/RNG. There is deliberately no session/observer import.
const { AIRPORTS } = require('../../src/board');
const { cityTotalValue, buildFee, mortgageValue, refundFor } = require('../../src/economy');

const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const selfPlayer = v => v.players.find(p => p.id === v.self.playerId);
const has = (v, id) => v.self.opportunities.selectedIds.includes(id);
const ownCities = v => Object.values(v.cities).filter(c => c.ownerId === v.self.playerId);
const recentRent = (v, id, positive = false) => mean((v.stocks[id]?.rentHistory || []).slice(-3).filter(n => !positive || n > 0));

function reserveFor(v, config) {
  const maxRent = Math.max(0, ...Object.entries(v.cities).filter(([, c]) => c.ownerId && c.ownerId !== v.self.playerId && !c.mortgaged).map(([id]) => v.self.quotes.rent[id]?.finalAmount || 0));
  return config.baseReserve + Math.min(12000, Math.ceil(maxRent * 0.5));
}
function cityValue(v, config, id) {
  const c = v.cities[id], owned = ownCities(v);
  let value = cityTotalValue(c) * config.cityWeight;
  if (!c.mortgaged && owned.filter(x => !x.mortgaged && x.group === c.group && x.id !== id).length >= 1) value += c.price * 0.1;
  if (!c.mortgaged && Object.entries(AIRPORTS).some(([airport, meta]) => meta.adjacentCity === id && v.airports[airport].ownerId === v.self.playerId)) value += c.price * 0.1;
  if (config.id === 'cautious' && has(v, 'H10') && c.ownerId !== v.self.playerId && owned.length === 2) value -= 6000;
  return Math.round(value);
}
function buildValue(v, config, id) { return Math.round(buildFee(v.cities[id]) * config.buildWeight + recentRent(v, id, true) * 0.2); }
function stockValue(v, id) {
  const st = v.stocks[id];
  return st.operatingPrice + Math.floor(st.dividendFund / 20) + Math.min(Math.round(st.operatingPrice * 0.1), Math.floor(recentRent(v, id) * 0.2 / 20));
}
function airportValue(v, config, id) {
  const city = v.cities[AIRPORTS[id].adjacentCity];
  return 15000 + (city.ownerId === v.self.playerId && !city.mortgaged ? 3000 : 0) + (config.id === 'aviation' ? 3000 : 0);
}
function best(items, score, rng) {
  if (!items.length) return null;
  const max = Math.max(...items.map(score));
  const ties = items.filter(item => score(item) === max);
  return ties.length === 1 ? ties[0] : ties[Math.floor(rng() * ties.length)];
}
function opportunityScore(v, config, id) {
  let score = config.scores[id] ?? config.defaultScore;
  const owned = ownCities(v), valid = owned.filter(c => !c.mortgaged);
  const held = Object.keys(v.stocks).filter(cid => (v.stocks[cid].holders[v.self.playerId] || 0) > 0);
  const conditions = {
    H1: valid.some(c => c.houseLevel < 4),
    H3: valid.some(c => valid.filter(x => x.group === c.group).length >= 2),
    H5: held.filter(cid => v.cities[cid].ownerId && !v.cities[cid].mortgaged).length >= 3,
    H6: held.some(cid => v.cities[cid].ownerId && v.cities[cid].ownerId !== v.self.playerId && !v.cities[cid].mortgaged && v.self.quotes.rent[cid]?.finalAmount > 0),
    H9: Object.entries(AIRPORTS).some(([aid, a]) => v.airports[aid].ownerId === v.self.playerId && v.cities[a.adjacentCity].ownerId === v.self.playerId && !v.cities[a.adjacentCity].mortgaged),
    H10: owned.length <= 2,
  };
  if (conditions[id]) score += 15;
  if (id === 'H8') score -= 5 * v.self.opportunities.visitedAirportIds.length;
  return score;
}
function fundingPotential(v) {
  const owned = ownCities(v), slots = Math.max(0, 2 - owned.filter(c => c.mortgaged).length);
  let base = 0; const extras = [];
  for (const c of owned.filter(c => !c.mortgaged)) {
    const costs = (c.buildCosts || []).slice();
    while (costs.length < c.houseLevel) costs.push(buildFee(c));
    const demolition = costs.reduce((a, cost) => a + Math.round(cost * 0.6), 0);
    base += demolition; extras.push(Math.max(0, mortgageValue(c) - demolition));
  }
  return base + extras.sort((a, b) => b - a).slice(0, slots).reduce((a, b) => a + b, 0);
}
function airportFee(v, id) {
  const owner = v.players.find(p => p.id === v.airports[id].ownerId);
  return owner && owner.id !== v.self.playerId ? 3000 * owner.airports.length : 0;
}
function landingExpectation(v, config, position) {
  const p = selfPlayer(v); let opportunity = 0, rent = 0;
  for (let die = 1; die <= 10; die++) {
    const square = v.board[(position + die) % 42];
    if (square.type === 'city') {
      const c = v.cities[square.cityId];
      if (!c.ownerId && v.firstRoundDone && p.lapBuys < 4) opportunity += Math.max(0, cityValue(v, config, c.id) - c.price);
      else if (c.ownerId === p.id && !c.mortgaged && c.houseLevel < 4) opportunity += Math.max(0, buildValue(v, config, c.id) - (v.self.quotes.build[c.id]?.finalAmount ?? buildFee(c)));
      else if (c.ownerId !== p.id && !c.mortgaged) rent += v.self.quotes.rent[c.id]?.finalAmount || 0;
    } else if (square.type === 'airport') rent += airportFee(v, square.airportId);
  }
  return { opportunity: opportunity / 10, rent: rent / 10, score: config.flightWeight * opportunity / 10 - rent / 10 };
}

function decide(v, config, memory = {}, rng) {
  if (typeof rng !== 'function' || !v.self || !selfPlayer(v)?.alive) throw new Error('策略输入或本人随机源无效');
  const p = selfPlayer(v), reserve = reserveFor(v, config);
  const m = globalThis.structuredClone(memory);
  const phase = v.phase;
  if (phase === 'waiting_roll' && (m.lastPhase !== 'waiting_roll' || m.waitDecisionId !== v.decision?.decisionId)) {
    m.waitTargets = []; m.waitDecisionId = v.decision?.decisionId;
  }
  if (phase === 'stock' && m.windowId !== v.self.stockWindow?.windowId) {
    m.windowId = v.self.stockWindow?.windowId; m.directions = {}; m.transferProposed = false;
  }
  if (phase === 'self_rescue' && !m.rescueActive) { m.rescueActive = true; m.saleAttempts = []; }
  if (!['self_rescue', 'auction_bid', 'direct_sale_ask'].includes(phase)) m.rescueActive = false;
  m.lastPhase = phase;
  const output = (action, code, details = {}) => ({ action, reason: { code, phase, playerId: p.id, cash: p.cash, reserve, ...details }, nextMemory: m });
  const affordable = (amount, value = amount) => value >= amount && p.cash - amount >= reserve;

  if (phase === 'opportunity_choose') {
    const c = v.self.choice;
    if (!c || c.submitted) throw new Error('本人没有合法待选候选');
    const envelope = { stageId: c.stageId, candidateVersion: c.candidateVersion };
    if (config.randomChoices) return output({ type: 'opportunity_choose', ...envelope, opportunityId: c.candidateIds[Math.floor(rng() * c.candidateIds.length)] }, 'random_choice');
    const selected = best(c.candidateIds, id => opportunityScore(v, config, id), rng);
    const value = opportunityScore(v, config, selected);
    if (v.opportunityStage.ordinal === config.rerollStage && c.rerollsLeft && value < config.rerollBelow) return output({ type: 'opportunity_reroll', ...envelope }, 'low_choice_reroll', { value });
    return output({ type: 'opportunity_choose', ...envelope, opportunityId: selected }, 'scored_choice', { target: selected, value });
  }
  if (phase === 'waiting_roll') {
    m.waitTargets ||= [];
    const city = v.board[p.position].cityId, c = v.cities[city];
    if (c?.ownerId === p.id && c.mortgaged && !m.waitTargets.includes(`redeem:${city}`)) {
      const cost = mortgageValue(c) + (c.mortgageInterest || 0), value = cityValue(v, config, city);
      if (affordable(cost, value)) { m.waitTargets.push(`redeem:${city}`); return output({ type: 'redeem', cityId: city }, 'redeem_position', { target: city, cost, value }); }
    }
    const options = [];
    for (const mode of ['build', 'remote']) for (const [id, q] of Object.entries(v.self.quotes[mode] || {})) {
      const key = `build:${id}`;
      if (q.ok && !m.waitTargets.includes(key) && affordable(q.finalAmount, buildValue(v, config, id))) options.push({ id, q, mode, key, gain: buildValue(v, config, id) - q.finalAmount });
    }
    const choice = best(options, item => item.gain, rng);
    if (choice) { m.waitTargets.push(choice.key); return output({ type: choice.mode === 'remote' ? 'remote_build' : 'build_house', cityId: choice.id, quoteVersion: choice.q.quoteVersion }, 'pre_roll_build', { target: choice.id, cost: choice.q.finalAmount, value: choice.q.finalAmount + choice.gain }); }
    const declinedTargets = [];
    for (const mode of ['build', 'remote']) for (const [target, q] of Object.entries(v.self.quotes[mode] || {})) {
      if (q.ok && !m.waitTargets.includes(`build:${target}`)) declinedTargets.push({ target, mode, cost: q.finalAmount, value: buildValue(v, config, target) });
    }
    return output({ type: 'roll_dice' }, 'roll_no_investment', { declinedTargets });
  }
  if (phase === 'buy' || phase === 'buy_airport') {
    const city = phase === 'buy', id = city ? v.pending.cityId : v.pending.airportId;
    const cost = city ? v.cities[id].price : 15000;
    const value = city ? cityValue(v, config, id) : airportValue(v, config, id);
    const eligible = v.firstRoundDone && (!city || p.lapBuys < 4) && !(city ? v.cities[id] : v.airports[id]).ownerId;
    if (eligible && affordable(cost, value)) return output({ type: city ? 'buy' : 'buy_airport', decision: 'buy' }, 'purchase', { target: id, cost, value });
    if (eligible && value >= cost && p.cash + fundingPotential(v) >= cost + reserve) return output({ type: 'buy_fundraise', decision: 'start' }, 'fundraise_worthwhile', { target: id, cost, value });
    return output({ type: city ? 'buy' : 'buy_airport', decision: 'pass' }, 'purchase_declined', { target: id, cost, value, eligible });
  }
  if (phase === 'build_decide') {
    const id = v.pending.cityId, q = v.self.quotes.build[id], value = buildValue(v, config, id);
    if (q?.ok && affordable(q.finalAmount, value)) return output({ type: 'respond_build', decision: 'build', quoteVersion: q.quoteVersion }, 'landing_build', { target: id, cost: q.finalAmount, value });
    return output({ type: 'respond_build', decision: 'pass' }, 'build_declined', { target: id, cost: q?.finalAmount ?? null, value });
  }
  if (phase === 'frozen_turn' || phase === 'jail_turn') {
    const cost = phase === 'frozen_turn' ? 5000 : 15000;
    return output({ type: phase === 'frozen_turn' ? 'respond_frozen' : 'respond_jail', decision: affordable(cost) ? 'pay' : phase === 'frozen_turn' ? 'pass' : 'roll' }, 'status_exit', { cost });
  }
  if (phase === 'auction_bid' || phase === 'direct_sale_ask') {
    const id = v.pending.cityId, value = cityValue(v, config, id);
    if (phase === 'direct_sale_ask') {
      const cost = cityTotalValue(v.cities[id]);
      return output({ type: 'direct_sale_respond', decision: p.lapBuys < 4 && affordable(cost, value) ? 'buy' : 'pass' }, 'direct_purchase', { target: id, cost, value });
    }
    if (v.pending.currentBidder === p.id && v.pending.currentBid > 0 && p.lapBuys < 4) return output({ type: 'auction_respond', decision: 'end' }, 'end_high_bid', { target: id });
    const amount = v.pending.currentBid > 0 ? v.pending.currentBid + 1000 : Math.round(cityTotalValue(v.cities[id]) * 0.75);
    return output({ type: 'auction_respond', decision: p.lapBuys < 4 && affordable(amount, value) ? 'bid' : 'pass', ...(p.lapBuys < 4 && affordable(amount, value) ? { amount } : {}) }, 'minimum_bid', { target: id, cost: amount, value });
  }
  if (phase === 'trade_confirm') {
    const items = v.pending.items, cost = v.pending.cash;
    const value = items.reduce((sum, item) => sum + stockValue(v, item.cityId), 0);
    const marketValue = items.reduce((sum, item) => sum + v.stocks[item.cityId].price, 0);
    const eligible = items.every(item => { const c = v.cities[item.cityId], st = v.stocks[item.cityId]; return c.ownerId && !st.clearing && (c.ownerId !== p.id || (st.holders[p.id] || 0) + 1 <= 4); });
    const accept = eligible && affordable(cost, value) && p.assetSummary.stockValue + marketValue <= config.maxStockRatio * p.assetSummary.total;
    return output({ type: 'stock_transfer', accept }, 'transfer_response', { cost, value, eligible });
  }
  if (phase === 'stock') {
    const w = v.self.stockWindow;
    if (!w) throw new Error('股票阶段缺少本人窗口');
    const ratioLimit = config.maxStockRatio * p.assetSummary.total;
    const need = Math.max(0, reserve - p.cash, p.assetSummary.stockValue - ratioLimit);
    const held = Object.entries(v.stocks).filter(([id, st]) => v.cities[id].ownerId && !st.clearing && (st.holders[p.id] || 0) > 0 && m.directions[id] !== 'buy');
    const lowYield = best(held, ([id]) => (v.cities[id].mortgaged ? 1e9 : 0) - (stockValue(v, id) - v.stocks[id].price), rng);
    if (need > 0 && lowYield) {
      const [id, st] = lowYield;
      if (!m.transferProposed) {
        const cash = Math.round(st.price * 0.95);
        const buyers = v.players.filter(b => b.alive && b.id !== p.id && b.cash >= cash && (v.cities[id].ownerId !== b.id || (st.holders[b.id] || 0) < 4));
        if (buyers.length) {
          m.transferProposed = true; m.directions[id] = 'sell';
          const buyer = buyers.length === 1 ? buyers[0] : buyers[Math.floor(rng() * buyers.length)];
          return output({ type: 'stock_transfer', targetId: buyer.id, items: [{ cityId: id, shares: 1 }], cash, windowId: w.windowId }, 'reduce_by_transfer', { target: id, cost: cash, need });
        }
      }
      const shares = Math.min(st.holders[p.id], Math.max(1, Math.ceil(need / st.price)));
      m.directions[id] = 'sell';
      return output({ type: 'stock_trade', windowId: w.windowId, orders: [{ cityId: id, side: 'sell', shares, quoteVersion: st.quoteVersion, listingEpoch: st.listingEpoch }] }, 'reduce_stock', { target: id, shares, need });
    }
    const candidates = Object.entries(v.stocks).filter(([id, st]) => v.cities[id].ownerId && !st.clearing && m.directions[id] !== 'sell' && stockValue(v, id) >= st.price);
    const orders = []; let cash = p.cash, valueHeld = p.assetSummary.stockValue, bought = w.boughtTotal;
    const boughtByCity = { ...w.boughtByCity };
    while (candidates.length && bought < 6) {
      const selected = best(candidates, ([id, st]) => stockValue(v, id) - st.price + (has(v, 'H5') && !v.cities[id].mortgaged && !(st.holders[p.id] || 0) ? 2000 : 0) + (has(v, 'H6') && v.cities[id].ownerId !== p.id && !v.cities[id].mortgaged && v.self.quotes.rent[id]?.finalAmount > 0 ? 1000 : 0), rng);
      candidates.splice(candidates.indexOf(selected), 1);
      const [id, st] = selected, currentBought = boughtByCity[id] || 0;
      if (!Object.hasOwn(boughtByCity, id) && Object.keys(boughtByCity).length >= 3) continue;
      const supplied = Object.values(st.holders).reduce((a, b) => a + b, 0);
      const shares = Math.min(2 - currentBought, 6 - bought, 20 - supplied, v.cities[id].ownerId === p.id ? 4 - (st.holders[p.id] || 0) : 20, Math.floor((cash - reserve) / st.price), Math.floor((ratioLimit - valueHeld) / st.price));
      if (shares <= 0) continue;
      orders.push({ cityId: id, side: 'buy', shares, quoteVersion: st.quoteVersion, listingEpoch: st.listingEpoch });
      boughtByCity[id] = currentBought + shares; bought += shares; cash -= shares * st.price; valueHeld += shares * st.price; m.directions[id] = 'buy';
    }
    if (orders.length) return output({ type: 'stock_trade', windowId: w.windowId, orders }, 'buy_stock', { cost: p.cash - cash, ratioLimit });
    return output({ type: 'stock_done' }, 'stock_complete');
  }
  if (phase === 'flight') {
    const stay = landingExpectation(v, config, p.position), options = [];
    for (const [id, q] of Object.entries(v.self.quotes.flight)) {
      // Formal flightAction ends the turn without charging a destination
      // airport toll. Ordinary next-dice tolls stay in landingExpectation.
      const fee = 0, square = v.board.find(s => s.airportId === id);
      if (!q.ok || p.cash - q.finalAmount - fee < reserve) continue;
      const expectation = landingExpectation(v, config, square.id);
      options.push({ id, q, fee, score: expectation.score - q.finalAmount - fee });
    }
    const choice = best(options, item => item.score, rng);
    if (choice && choice.score > stay.score) return output({ type: 'flight', target: choice.id, quoteVersion: choice.q.quoteVersion }, 'flight_advantage', { target: choice.id, cost: choice.q.finalAmount, airportFee: choice.fee, value: choice.score, stay: stay.score });
    return output({ type: 'flight', target: null }, 'flight_declined', { stay: stay.score });
  }
  if (phase === 'buy_fundraise' || phase === 'self_rescue') {
    const fundraising = phase === 'buy_fundraise';
    const target = fundraising ? v.pending.target : null;
    const purchaseCost = target ? target.kind === 'city' ? v.cities[target.cityId].price : 15000 : 0;
    const goal = fundraising ? purchaseCost + reserve : 0;
    if (p.cash >= goal) return output(fundraising ? { type: 'buy_fundraise', decision: 'confirm' } : { type: 'rescue_done' }, 'funding_complete', { goal });
    if (fundraising && p.cash + fundingPotential(v) < goal) return output({ type: 'buy_fundraise', decision: 'cancel' }, 'funding_unreachable', { goal });
    if (!fundraising) {
      const held = Object.entries(v.stocks).filter(([id, st]) => v.cities[id].ownerId && !st.clearing && (st.holders[p.id] || 0) > 0);
      const choice = best(held, ([, st]) => {
        const needed = Math.ceil(-p.cash / st.price);
        return needed <= st.holders[p.id] ? 1e9 - needed : st.price;
      }, rng);
      if (choice) {
        const [id, st] = choice, shares = Math.min(st.holders[p.id], Math.max(1, Math.ceil(-p.cash / st.price)));
        return output({ type: 'rescue_sell_stock', cityId: id, shares, quoteVersion: st.quoteVersion }, 'rescue_minimum_shares', { target: id, shares, goal });
      }
    }
    const owned = ownCities(v), mortgageSlots = 2 - owned.filter(c => c.mortgaged).length;
    const mortgage = mortgageSlots > 0 ? best(owned.filter(c => !c.mortgaged), c => -cityValue(v, config, c.id) / mortgageValue(c), rng) : null;
    if (mortgage) return output({ type: 'rescue_mortgage', cityId: mortgage.id }, 'rescue_mortgage', { target: mortgage.id, amount: mortgageValue(mortgage), goal });
    const demolition = best(owned.filter(c => v.self.quotes.demolish[c.id]?.ok), c => -recentRent(v, c.id) / refundFor(c), rng);
    if (demolition) {
      const q = v.self.quotes.demolish[demolition.id];
      return output({ type: 'rescue_demolish', cityId: demolition.id, quoteVersion: q.quoteVersion }, 'rescue_demolish', { target: demolition.id, amount: -q.finalAmount, goal });
    }
    if (!fundraising) {
      m.saleAttempts ||= [];
      const sale = best(owned.filter(c => !c.mortgaged && !m.saleAttempts.includes(c.id)), c => -recentRent(v, c.id), rng);
      if (sale) { m.saleAttempts.push(sale.id); return output({ type: 'sell_city', cityId: sale.id, mode: 'auction' }, 'rescue_sale', { target: sale.id, goal }); }
    }
    return output(fundraising ? { type: 'buy_fundraise', decision: 'cancel' } : { type: 'rescue_done' }, 'no_rescue_options', { goal });
  }
  throw new Error(`策略未支持阶段：${phase}`);
}
module.exports = { decide, reserveFor, cityValue, buildValue, stockValue, airportValue, opportunityScore, fundingPotential, landingExpectation };
