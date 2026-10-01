'use strict';

const CITY_SHARES = 20;
const OWNER_SHARE_CAP = 4;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const economy = require('./economy');
const stocks = require('./stocks');

function fail(error) {
  return { ok: false, error };
}

function success(action, actorId) {
  return { ok: true, action, actorId };
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeInt(value, min = 0) {
  return Number.isSafeInteger(value) && value >= min && value <= MAX_SAFE;
}

function statePlayer(state, id) {
  return state.players.find((p) => p.id === id);
}

function currentPlayer(state) {
  return state.players[state.turnIndex];
}

function pendingActor(state) {
  const p = state.pending || {};
  return p.awaiting || p.targetId || p.playerId || p.bidderId || null;
}

function resolveActorId(state, actionType) {
  if (actionType === 'auction_respond' || actionType === 'direct_sale_respond' ||
      (actionType === 'stock_transfer' && state.phase === 'trade_confirm')) {
    return pendingActor(state) || (currentPlayer(state) && currentPlayer(state).id);
  }
  return currentPlayer(state) && currentPlayer(state).id;
}

function cityExists(state, cityId) {
  return typeof cityId === 'string' && !!state.cities && !!state.cities[cityId];
}

function airportExists(state, airportId) {
  return airportId === null || (typeof airportId === 'string' && !!state.airports && !!state.airports[airportId]);
}

function phaseAllows(state, type) {
  const phase = state.phase;
  const map = {
    roll_dice: ['waiting_roll'],
    respond_frozen: ['frozen_turn'],
    respond_jail: ['jail_turn'],
    respond_build: ['build_decide'],
    buy: ['buy'],
    buy_airport: ['buy_airport'],
    buy_fundraise: ['buy_fundraise', 'buy', 'buy_airport'],
    stock_done: ['stock'],
    flight: ['flight'],
    direct_sale_respond: ['direct_sale_ask'],
    auction_respond: ['auction_bid'],
    rescue_done: ['self_rescue'],
    rescue_mortgage: ['self_rescue', 'buy_fundraise'],
    rescue_demolish: ['self_rescue', 'buy_fundraise'],
    rescue_sell_stock: ['self_rescue'],
    stock_trade: ['stock'],
    stock_transfer: ['stock', 'trade_confirm'],
    surrender: ['waiting_roll', 'frozen_turn', 'jail_turn', 'buy', 'buy_airport', 'build_decide', 'buy_fundraise', 'flight', 'stock', 'auction_bid', 'direct_sale_ask', 'self_rescue'],
    build_house: ['waiting_roll'],
    demolish_house: ['waiting_roll', 'self_rescue'],
    mortgage: ['waiting_roll', 'frozen_turn', 'jail_turn', 'buy', 'buy_airport', 'build_decide', 'buy_fundraise', 'flight', 'stock', 'self_rescue'],
    redeem: ['waiting_roll'],
    sell_city: ['waiting_roll', 'stock', 'self_rescue'],
    remote_build: ['waiting_roll'],
    opportunity_choose: ['opportunity_choose'],
    opportunity_reroll: ['opportunity_choose'],
    opportunity_expire: ['opportunity_choose'],
  };
  return map[type] && map[type].includes(phase);
}

function stockTotal(state, cityId) {
  const holders = state.stocks[cityId] && state.stocks[cityId].holders;
  return holders ? Object.values(holders).reduce((sum, n) => sum + (Number.isSafeInteger(n) && n > 0 ? n : 0), 0) : 0;
}

function validateOrders(state, player, orders, windowId) {
  if (state.ruleVersion === 2) {
    try { stocks.planStockTrade(state, player.id, windowId, orders); }
    catch (err) { return fail(err.message); }
    return success({type:'stock_trade',windowId,orders:orders.map(o=>({cityId:o.cityId,side:o.side,shares:o.shares,quoteVersion:o.quoteVersion,listingEpoch:o.listingEpoch}))},player.id);
  }
  if (!Array.isArray(orders) || orders.length === 0) return fail('股票订单不能为空');
  const seen = new Set();
  let buyCities = 0;
  let buyShares = 0;
  let cost = 0;
  let proceeds = 0;
  const deltas = new Map();
  const buys = new Map();
  const sells = new Map();
  for (const order of orders) {
    if (!plainObject(order) || !cityExists(state, order.cityId) || !['buy', 'sell'].includes(order.side) || !safeInt(order.shares, 1)) {
      return fail('股票订单格式无效');
    }
    const key = order.side + ':' + order.cityId;
    if (seen.has(key)) return fail('同一城市不能重复提交同方向订单');
    seen.add(key);
    const city = state.cities[order.cityId];
    const stock = state.stocks[order.cityId];
    if (!stock || city.mortgaged || !city.ownerId) return fail('该城市股票当前不可交易');
    const held = stock.holders[player.id] || 0;
    if (order.side === 'buy') {
      if (order.shares > 2) return fail('股票买入数量超过限制');
      buyCities++;
      buyShares += order.shares;
      cost += order.shares * stock.price;
      deltas.set(order.cityId, (deltas.get(order.cityId) || 0) + order.shares);
      buys.set(order.cityId, order.shares);
    } else {
      if (order.shares > held) return fail('卖出数量超过持股');
      proceeds += order.shares * stock.price;
      deltas.set(order.cityId, (deltas.get(order.cityId) || 0) - order.shares);
      sells.set(order.cityId, order.shares);
    }
  }
  if (buyCities > 3 || buyShares > 6) return fail('股票买入超过本次交易上限');
  for (const [cityId, delta] of deltas) {
    if (stockTotal(state, cityId) + delta > CITY_SHARES) return fail('市场没有足够股票');
    const city = state.cities[cityId];
    const held = state.stocks[cityId].holders[player.id] || 0;
    if (city.ownerId === player.id && held - (sells.get(cityId) || 0) + (buys.get(cityId) || 0) > OWNER_SHARE_CAP) {
      return fail('股票买入数量超过限制');
    }
  }
  if (cost > player.cash + proceeds) return fail('现金不足');
  return success({ type: 'stock_trade', orders: orders.map((o) => ({ cityId: o.cityId, side: o.side, shares: o.shares })) }, player.id);
}

function validateTransfer(state, player, raw) {
  if (state.phase === 'trade_confirm') {
    if (typeof raw.accept !== 'boolean') return fail('转让确认必须选择接受或拒绝');
    const expected = pendingActor(state);
    if (raw.targetId !== undefined && raw.targetId !== expected) return fail('转让接收方不匹配');
    if (state.ruleVersion === 2 && raw.accept) {
      try { stocks.planTransfer(state,state.pending.fromId,expected,state.pending.items,state.pending.cash); } catch(err) { return fail(err.message); }
    }
    return success({ type: 'stock_transfer', accept: raw.accept }, expected);
  }
  if (state.phase !== 'stock' || !state.pending || !Array.isArray(raw.items)) return fail('当前不能发起股票转让');
  if (state.ruleVersion === 2 && (!state.stockWindow || player.transferDone || raw.windowId !== state.stockWindow.windowId)) return fail('当前窗口不能发起转让');
  const target = statePlayer(state, raw.targetId);
  if (!target || !target.alive || target.id === player.id) return fail('转让接收方无效');
  if (raw.items.length < 1 || raw.items.length > 3 || !safeInt(raw.cash, 0)) return fail('转让内容无效');
  const seen = new Set();
  const items = [];
  for (const item of raw.items) {
    if (!plainObject(item) || !cityExists(state, item.cityId) || !safeInt(item.shares, 1) || item.shares !== 1 || seen.has(item.cityId)) return fail('转让股票数量无效');
    const stock = state.stocks[item.cityId];
    if (!stock || (stock.holders[player.id] || 0) < 1) return fail('发起方持股不足');
    seen.add(item.cityId);
    items.push({ cityId: item.cityId, shares: 1 });
  }
  if (state.ruleVersion === 2) {
    try { stocks.planTransfer(state,player.id,target.id,items,raw.cash); } catch(err) { return fail(err.message); }
  }
  return success({ type: 'stock_transfer', targetId: target.id, items, cash: raw.cash, ...(state.ruleVersion===2?{windowId:raw.windowId}:{}) }, player.id);
}

function normalizeAction(state, raw, context = {}) {
  if (!plainObject(raw) || typeof raw.type !== 'string') return fail('动作格式无效');
  const type = raw.type;
  if (type === 'end_phase' || !phaseAllows(state, type)) return fail('当前阶段无法执行该操作');
  if (state.ruleVersion === 2 && type === 'opportunity_expire') {
    if(context.source!=='timeout'||raw.stageId!==state.opportunityStage?.stageId)return fail('阶段已失效');
    return success({type,stageId:raw.stageId},null);
  }
  const actorId = state.ruleVersion===2&&state.phase==='opportunity_choose' ? context.actorId : resolveActorId(state, type);
  const player = statePlayer(state, actorId);
  if (!player || !player.alive) return fail('行动玩家无效');
  if (state.ruleVersion===2&&['opportunity_choose','opportunity_reroll'].includes(type)) {
    const stage=state.opportunityStage,entry=stage?.participants[actorId];
    if(!entry||entry.submitted||stage.resolved||raw.stageId!==stage.stageId||raw.candidateVersion!==entry.candidateVersion)return fail('经营机遇选择已失效');
    if(type==='opportunity_choose'&&!entry.candidateIds.includes(raw.opportunityId))return fail('请选择当前候选中的机遇');
    if(type==='opportunity_reroll'&&!player.opportunities.rerollsLeft)return fail('本局换组选项次数已用完');
    return success({type,stageId:raw.stageId,candidateVersion:raw.candidateVersion,...(type==='opportunity_choose'?{opportunityId:raw.opportunityId}:{})},actorId);
  }
  if (type === 'stock_trade') return validateOrders(state, player, raw.orders, raw.windowId);
  if (type === 'stock_transfer') return validateTransfer(state, player, raw);
  if (type === 'surrender' && ((state.pending && state.phase !== 'waiting_roll') || actorId !== (currentPlayer(state) && currentPlayer(state).id))) return fail('当前不能认输');
  const enums = {
    respond_frozen: ['pay', 'pass'], respond_jail: ['pay', 'roll', 'pass'], respond_build: ['build', 'demolish', 'pass'],
    buy: ['buy', 'pass'], buy_airport: ['buy', 'pass'], buy_fundraise: ['start', 'confirm', 'cancel'],
    direct_sale_respond: ['buy', 'pass'], auction_respond: ['bid', 'pass', 'end'],
  };
  if (enums[type] && !enums[type].includes(raw.decision)) return fail('动作选项无效');
  if (type === 'auction_respond') {
    const pend = state.pending || {};
    const bidder = player;
    if (raw.decision === 'bid') {
      if (!safeInt(raw.amount, 1)) return fail('出价必须为正整数');
      if ((bidder.lapBuys || 0) >= 4) return fail('本圈购买上限已满');
      if (pend.currentBid > 0 && pend.currentBidder === bidder.id) return fail('当前最高出价者不能重复加价');
      const city = state.cities[pend.cityId];
      if (!city) return fail('拍卖城市无效');
      const total = city.price + Math.round(city.price * 0.6 * (city.houseLevel || 0));
      const min = pend.currentBid > 0 ? pend.currentBid + 1000 : Math.round(total * 0.75);
      if (raw.amount < min || raw.amount > bidder.cash) return fail('出价不在允许范围');
    } else if (raw.decision === 'end') {
      if ((bidder.lapBuys || 0) >= 4 || !pend.currentBid || pend.currentBidder !== bidder.id) return fail('只有当前最高出价者可以结束拍卖');
    }
  }
  if (type === 'flight' && !airportExists(state, raw.target)) return fail('机场目标无效');
  if (['remote_build', 'build_house', 'demolish_house', 'mortgage', 'redeem', 'rescue_mortgage', 'rescue_demolish', 'rescue_sell_stock'].includes(type)) {
    if (!cityExists(state, raw.cityId)) return fail('城市无效');
  }
  if (type === 'rescue_sell_stock' && raw.shares !== undefined && !safeInt(raw.shares, 1)) return fail('卖出股数无效');
  if (type === 'sell_city') {
    if (!cityExists(state, raw.cityId) || !['direct', 'auction'].includes(raw.mode)) return fail('出售动作无效');
  }
  if (state.ruleVersion === 2) {
    if(type==='direct_sale_respond'&&raw.decision==='buy'){
      const city=state.cities[state.pending.cityId];
      if(!city||(player.lapBuys||0)>=4||player.cash<economy.cityTotalValue(city))return fail('购买资格或现金不足，未成交');
    }
    if(type==='buy_fundraise'&&raw.decision==='confirm'){
      const target=state.pending.target,c=target.kind==='city'?state.cities[target.cityId]:state.airports[target.airportId];
      if(!c||c.ownerId||player.cash<(target.kind==='city'?c.price:15000)||(target.kind==='city'&&(player.lapBuys||0)>=4))return fail('购买目标或现金条件已失效');
    }
    let quote=null;
    if(['remote_build','build_house'].includes(type))quote=economy.quoteBuild(state,{playerId:actorId,cityId:raw.cityId,mode:type==='remote_build'?'remote':'normal'});
    if(type==='respond_build'&&raw.decision!=='pass')quote=raw.decision==='build'?economy.quoteBuild(state,{playerId:actorId,cityId:state.pending.cityId}):economy.quoteDemolition(state,{playerId:actorId,cityId:state.pending.cityId});
    if(['demolish_house','rescue_demolish'].includes(type))quote=economy.quoteDemolition(state,{playerId:actorId,cityId:raw.cityId});
    if(type==='flight'&&raw.target!==null)quote=economy.quoteFlight(state,{playerId:actorId,target:raw.target,fromAirportId:state.pending.fromAirportId,free:state.pending.free});
    if(quote&&(!quote.ok||(context.source!=='timeout'&&raw.quoteVersion!==quote.quoteVersion)))return fail(quote.reason||'费用依据已更新，请重新确认');
    if(type==='rescue_sell_stock'){
      const c=state.cities[raw.cityId],st=state.stocks[raw.cityId],held=st.holders[actorId]||0;
      if(!c.ownerId||st.clearing||held<1||(raw.shares!==undefined&&raw.shares>held)||raw.quoteVersion!==st.quoteVersion)return fail('卖出数量或报价已失效');
    }
  }
  const action = { type };
  for (const key of ['decision', 'amount', 'target', 'cityId', 'mode', 'shares', 'quoteVersion']) if (raw[key] !== undefined) action[key] = raw[key];
  if (type === 'sell_city' && state.phase === 'self_rescue') {
    const pending = state.pending;
    if (!pending || pending.playerId !== actorId) return fail('自救行动身份已失效');
    action.context = { type: 'self_rescue', playerId: pending.playerId, due: pending.due, reason: pending.reason, resume: pending.resume };
  }
  return success(action, actorId);
}

function validateEnvelope(state,raw,actorId,clock){
 if(!plainObject(raw)||raw.gameId===undefined||raw.actionId===undefined||raw.decisionId===undefined||raw.actorRevision===undefined)return fail('页面版本已更新，请刷新后重新操作');
 if(!plainObject(raw)||raw.gameId!==state.gameId||typeof raw.actionId!=='string'||raw.actionId.length<1||raw.actionId.length>128||raw.decisionId!==clock.decisionId||raw.actorRevision!==state.actorRevision[actorId])return fail('操作已过期，请根据当前页面重新操作');
 return {ok:true};
}
module.exports = { normalizeAction, resolveActorId, safeInt, phaseAllows, validateEnvelope };
