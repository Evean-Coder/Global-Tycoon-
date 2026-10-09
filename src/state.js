'use strict';

const { buildBoard, buildChanceDeck } = require('./board');
const { shuffle } = require('./random');
const { randomUUID } = require('crypto');
const { createWorld } = require('./worldEvents');
const { initial } = require('./opportunities');

const START_CASH = 150000;
const PLAYER_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835'];

function createPlayer(name, seat, id) {
  return {
    id,
    name,
    seat,
    color: PLAYER_COLORS[seat % PLAYER_COLORS.length],
    cash: START_CASH,
    position: 0,
    alive: true,
    jailed: false,
    jailTurns: 0,
    frozen: false,
    cities: [],
    airports: [],
    stocks: {}, // cityId -> shares
    lapBuys: 0, // 一圈（起点到起点）内购买城市数
    lapDone: false, // 本圈是否已经过起点
    connected: true,
    reconnectToken: null,
  };
}

function createGameState(roomCode, playerNames, ruleVersion = 2, options = {}) {
  const players = playerNames.map((name, i) => createPlayer(name, i, `p${i}`));
  for (const p of players) p.opportunities = initial();
  const routesEnabled = ruleVersion === 2 && options.routeRevision === 'opportunity-routes-v1';
  if (routesEnabled && !['normal', 'quick'].includes(options.gameMode || 'normal')) throw new Error('对局模式无效');
  if (routesEnabled) for (const p of players) p.opportunities.oneTimeRewards = { H12: null };
  const board = buildBoard();
  const cities = {};
  for (const sq of board) {
    if (sq.type === 'city') {
      cities[sq.cityId] = { id: sq.cityId, name: sq.cityId, country: require('./board').CITIES[sq.cityId].country, continent: require('./board').CITIES[sq.cityId].continent, ownerId: null, houseLevel: 0, mortgaged: false, price: sq.price, group: sq.group };
    }
  }
  const airports = {};
  for (const sq of board) {
    if (sq.type === 'airport') {
      airports[sq.airportId] = { id: sq.airportId, ownerId: null };
    }
  }
  const stocks = {};
  for (const cityId of Object.keys(cities)) {
    cities[cityId].buildCosts = [];
    stocks[cityId] = { price: Math.round((cities[cityId].price / 10) * 2), holders: {}, operatingPrice: Math.round(cities[cityId].price * 0.2), dividendFund: 0, roundRent: 0, rentHistory: [], listingEpoch: 0, quoteVersion: 0, clearing: false, lastDividendPerShare: 0 };
  }
  return {
    ...(routesEnabled ? {
      routeRevision: options.routeRevision, gameMode: options.gameMode || 'normal',
      routeFlow: {
        initialCompletedOrdinal: 0, initialDueOrdinal: 0, quickDueMask: [false, false],
        laterClosed: false, activeChoice: null, rollStartedTurnId: null,
        players: Object.fromEntries(players.map(p => [p.id, {
          baselineLapEpoch: null, lastThreshold: 0, pending: [], lastOpenedTurnId: null, lastResult: null,
        }])),
      },
    } : {}),
    ...(ruleVersion === 2 && options.economyRevision === require('./travelExpense').REVISION
      ? { economyRevision: options.economyRevision, travelExpenseReceipts: {} } : {}),
    roomCode,
    gameId: randomUUID(), ruleVersion, revision: 0, turnId: 1,
    actorRevision: Object.fromEntries(players.map(p => [p.id, 0])),
    roundFlow: { index: 1, requiredIds: players.map(p => p.id), completedIds: [], completedTurns: [], boundaryId: 0, continuation: null },
    world: createWorld(), opportunityStage: null, stockWindow: null, movement: null,
    status: 'playing',
    players,
    board,
    cities,
    airports,
    stocks,
    chanceDeck: buildChanceDeck(),
    firstRoundDone: false, // 第一轮（每个玩家从起点出发回到起点一次）是否结束；结束前禁止购买房产与机场
    turnIndex: 0,
    phase: 'waiting_roll',
    pending: null, // 当前等待决策
    dice: null,
    diceBag: [], // 骰子洗牌袋（1–10 各一张，抽完重洗）
    rounds: 0,
    rank: [],
    winner: null,
    rngSeed: Math.floor(Math.random() * 1e9),
    startedAt: Date.now(),
  };
}

// 对外快照：只投影客户端需要的字段，避免泄露未来随机序列与身份凭据。
function snapshot(state, viewerId, clockView) {
  if (state.ruleVersion === 2) return require('./gameView').snapshot(state, viewerId, clockView);
  const keys = ['roomCode', 'status', 'players', 'board', 'cities', 'airports', 'stocks', 'firstRoundDone', 'turnIndex', 'phase', 'pending', 'dice', 'rounds', 'rank', 'winner', 'startedAt'];
  const out = {};
  for (const key of keys) out[key] = state[key];
  return JSON.parse(JSON.stringify(out, (key, value) => (key === 'reconnectToken' ? undefined : value)));
}

function resetDeck(state, rng) {
  state.chanceDeck = shuffle(state.chanceDeck, rng);
}

module.exports = { createGameState, snapshot, resetDeck, START_CASH };
