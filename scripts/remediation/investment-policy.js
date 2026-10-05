'use strict';
// Independent evaluation policy. The old frozen policy and production stay intact.
const base = require('../balance/policy');
const VERSION = 'investment-review-v2-20261005';
const has = (v, id) => v.self.opportunities.selectedIds.includes(id);
function estimate(v, id) {
  const st = v.stocks[id], c = v.cities[id], self = v.self.playerId;
  const meanRent = (st.rentHistory || []).reduce((a, n) => a + n, 0) / Math.max(1, st.rentHistory.length);
  const dividend = c.ownerId !== self && !c.mortgaged ? meanRent * 0.01 * 8 : 0;
  const target = st.priceChange?.target ?? st.operatingPrice;
  const trend = Math.max(-st.operatingPrice * 0.1, Math.min(st.operatingPrice * 0.1, target - st.operatingPrice));
  const saving = has(v, 'H6') && c.ownerId !== self && !c.mortgaged && !(st.holders[self] || 0)
    ? Math.min(1000, (v.self.quotes.rent[id]?.finalAmount || 0) * 0.1, Math.max(0, 2000 - (v.self.opportunities.usage.H6 || 0))) * 8 / 42 : 0;
  // Accrued dividends are already in the price and are not a free capital gain.
  return { dividend, trend, saving, margin: dividend + trend + saving - st.price * 0.05 };
}
function decide(v, config, memory = {}, rng) {
  if (config.id !== 'investment' || !['stock', 'trade_confirm'].includes(v.phase)) return base.decide(v, config, memory, rng);
  const p = v.players.find(p => p.id === v.self.playerId), reserve = base.reserveFor(v, config), m = globalThis.structuredClone(memory);
  const output = (action, code, extra = {}) => ({ action, reason: { code, phase: v.phase, playerId: p.id, cash: p.cash, reserve, policyVersion: VERSION, ...extra }, nextMemory: m });
  const valid = ([id, st]) => !!v.cities[id].ownerId && !st.clearing;
  if (v.phase === 'trade_confirm') {
    const items = v.pending.items, cash = v.pending.cash;
    const market = items.reduce((n, i) => n + v.stocks[i.cityId].price * i.shares, 0);
    const value = items.reduce((n, i) => n + (v.stocks[i.cityId].price + estimate(v, i.cityId).margin) * i.shares, 0);
    const eligible = items.every(i => valid([i.cityId, v.stocks[i.cityId]]) && (v.cities[i.cityId].ownerId !== p.id || (v.stocks[i.cityId].holders[p.id] || 0) + i.shares <= 4));
    return output({ type: 'stock_transfer', accept: eligible && cash <= value && p.cash - cash >= reserve && p.assetSummary.stockValue + market <= config.maxStockRatio * p.assetSummary.total }, 'review_transfer', { value, cost: cash, eligible });
  }
  const w = v.self.stockWindow; if (!w) throw new Error('本人股票窗口缺失');
  if (m.windowId !== w.windowId) { m.windowId = w.windowId; m.directions = {}; }
  m.directions ||= {}; m.lastPhase = 'stock';
  const cap = config.maxStockRatio * p.assetSummary.total;
  const need = Math.max(0, reserve - p.cash, p.assetSummary.stockValue - cap);
  const order = (id, side, shares) => ({ cityId: id, side, shares, quoteVersion: v.stocks[id].quoteVersion, listingEpoch: v.stocks[id].listingEpoch });
  const held = Object.entries(v.stocks).filter(x => valid(x) && (x[1].holders[p.id] || 0) > 0 && m.directions[x[0]] !== 'buy')
    .sort((a, b) => estimate(v, a[0]).margin - estimate(v, b[0]).margin || a[0].localeCompare(b[0]));
  if (need > 0 && held.length) {
    const [id, st] = held[0], shares = Math.min(st.holders[p.id], Math.max(1, Math.ceil(need / st.price)));
    m.directions[id] = 'sell';
    return output({ type: 'stock_trade', windowId: w.windowId, orders: [order(id, 'sell', shares)] }, 'review_bank_sale', { proceeds: shares * st.price, need });
  }
  let cash = p.cash, valueHeld = p.assetSummary.stockValue, bought = w.boughtTotal;
  const byCity = { ...w.boughtByCity }, orders = [];
  const validStocks = Object.entries(v.stocks).filter(valid);
  const candidates = validStocks.filter(([id]) => m.directions[id] !== 'sell');
  function available(id) {
    const st = v.stocks[id];
    if (!Object.hasOwn(byCity, id) && Object.keys(byCity).length >= 3) return 0;
    return Math.max(0, Math.min(2 - (byCity[id] || 0), 6 - bought, 20 - Object.values(st.holders).reduce((a, n) => a + n, 0),
      v.cities[id].ownerId === p.id ? 4 - (st.holders[p.id] || 0) : 20, Math.floor((cash - reserve) / st.price), Math.floor((cap - valueHeld) / st.price)));
  }
  function buy(id, shares) { const cost = v.stocks[id].price * shares; orders.push(order(id, 'buy', shares)); cash -= cost; valueHeld += cost; bought += shares; byCity[id] = (byCity[id] || 0) + shares; m.directions[id] = 'buy'; }
  const validHeld = validStocks.filter(([id, st]) => !v.cities[id].mortgaged && (st.holders[p.id] || 0) > 0).length;
  if (has(v, 'H5') && validHeld < 3) {
    const missing = candidates.filter(([id, st]) => !v.cities[id].mortgaged && !(st.holders[p.id] || 0) && available(id) >= 1)
      .sort((a, b) => a[1].price - b[1].price || a[0].localeCompare(b[0])).slice(0, 3 - validHeld);
    const cost = missing.reduce((n, [, st]) => n + st.price, 0);
    const cityCount = new Set([...Object.keys(byCity), ...missing.map(([id]) => id)]).size;
    if (missing.length === 3 - validHeld && cost * 0.05 < 2000 && cash - cost >= reserve && valueHeld + cost <= cap && cityCount <= 3 && bought + missing.length <= 6) {
      for (const [id] of missing) buy(id, 1);
      // One coherent decision buys eligibility, rather than extra shares for the same flat bonus.
      return output({ type: 'stock_trade', windowId: w.windowId, orders }, 'review_H5_eligibility', { cost, qualifyingCities: 3 });
    }
  }
  const productive = candidates.filter(([id]) => !v.cities[id].mortgaged && v.cities[id].ownerId !== p.id && estimate(v, id).margin > 0)
    .sort((a, b) => estimate(v, b[0]).margin / b[1].price - estimate(v, a[0]).margin / a[1].price || a[0].localeCompare(b[0]));
  for (const [id] of productive) { const shares = available(id); if (shares) buy(id, shares); }
  return orders.length ? output({ type: 'stock_trade', windowId: w.windowId, orders }, 'review_productive_stock', { cost: p.cash - cash }) : output({ type: 'stock_done' }, 'review_preserve_cash');
}
module.exports = { VERSION, decide, estimate };
