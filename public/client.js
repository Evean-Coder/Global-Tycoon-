'use strict';

/* exported afterReceipt, emitAct, downloadRecord, openReplay, replayPrev, replayNext, replayPlay, replayClose, clickTransferEntry, submitTransfer, returnFromTransfer, resumeStockView, startSelectedGame, returnToRoom */

// PWA：注册 service worker（缓存静态资源，离线可用）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// 移动端：底部操作栏高度变化时动态调整页面底部留白，避免遮挡事件记录等内容
function fitActionBarPadding() {
  const ab = document.getElementById('actionBar');
  const gm = document.getElementById('gameMain');
  if (!ab || !gm) return;
  gm.style.paddingBottom = Math.max(120, ab.offsetHeight + 20) + 'px';
  const board = document.getElementById('board');
  if (board?.getClientRects().length) {
    const occupied = board.getBoundingClientRect().top + window.scrollY + ab.offsetHeight + 36;
    document.documentElement.style.setProperty('--board-available', Math.max(0, window.innerHeight - occupied) + 'px');
  }
}
window.addEventListener('load', fitActionBarPadding);
window.addEventListener('resize', fitActionBarPadding);

const socket = io({ auth: {clientRouteRevision:'opportunity-routes-v1',clientQuickRevision:'quick-mode-v1'}, transports: ['websocket', 'polling'], tryAllTransports: true });
let me = { name: '', roomCode: null };
let game = null;
let awaitingPlayerId = null;
let stockDraft = {};
const transferDraft = {};
let stockContext = null;
let stockGeneration = 0;
let activeRequest = null;
let disconnectedNames = [];
let roomHostId = null;
let pendingToken = null;
let clientLog = [];
let lastEventId = -1;
let lastGameJson = '';
let lastPos = {};
let animBusy = false;
let animQueued = null;
let diceAnimating = false;
let receiptPending = false;
let stockAutoShown = false;
let timerIv = null;
let lastRecord = null;
let latestState = null;
let actionPending = false;
let choiceRenderKey = '';
let routeDraft = null;
let requestSequence = 0;
let lobbyRequest = null;
let lastRoomState = null;
let restoringSession = false;
let lobbyFeedback = '';
let transferReturn = null;
let toastTimer = null;
let moveTimer = null, diceTimer = null, diceFinishTimer = null;
let animationGeneration = 0, quickTimerIv = null, quickTimeAnchor = null;

function stopVisualAnimations() {
  animationGeneration++;
  clearInterval(moveTimer);clearInterval(diceTimer);clearTimeout(diceFinishTimer);
  moveTimer=null;diceTimer=null;diceFinishTimer=null;
  animBusy=false;diceAnimating=false;animQueued=null;
  $('dice').classList.remove('rolling');
}
function quickGame(state=game) { return state?.quickRevision === 'quick-mode-v1'; }
function updateQuickTime(time) {
  if (!quickGame(latestState) || time?.gameId !== latestState.gameId) {
    if (!quickGame(latestState)) {clearInterval(quickTimerIv);quickTimerIv=null;quickTimeAnchor=null;$('quickClockBar').classList.add('hidden');}
    return;
  }
  if (!Number.isFinite(time.elapsedMs) || time.elapsedMs<0) return;
  const same=quickTimeAnchor?.gameId===time.gameId;
  if(same && time.elapsedMs<quickTimeAnchor.acceptedElapsed) return;
  if(same && time.elapsedMs===quickTimeAnchor.acceptedElapsed && !time.closed) return;
  const point=window.performance.now(),oldElapsed=same?quickTimeAnchor.elapsedMs+(quickTimeAnchor.closed?0:point-quickTimeAnchor.receivedAt):0;
  quickTimeAnchor={gameId:time.gameId,elapsedMs:time.closed?time.elapsedMs:Math.max(oldElapsed,time.elapsedMs),acceptedElapsed:time.elapsedMs,receivedAt:point,closed:time.closed};
  clearInterval(quickTimerIv);quickTimerIv=null;$('quickClockBar').classList.remove('hidden');
  const render=()=>{
    const a=quickTimeAnchor,remain=Math.max(0,Math.ceil((1800000-a.elapsedMs-(a.closed?0:window.performance.now()-a.receivedAt))/1000));
    $('quickTimer').textContent=a.closed?'已结束':String(Math.floor(remain/60)).padStart(2,'0')+':'+String(remain%60).padStart(2,'0');
    $('quickEndHint').textContent=a.closed?'结果已按实际净资产结算':remain===0?'等待服务器结算…':remain<=120?'即将封盘：剩余不足2分钟':remain<=300?'即将封盘：剩余不足5分钟':'到时封盘，按净资产排名';
  };
  render();if(!time.closed)quickTimerIv=setInterval(render,250);
}
function netSummaryHTML(a) {
  return kv('现金（可支付余额）',fmt(a.cash))+kv('城市标准价值',fmt(a.propertyValue))+kv('机场价值',fmt(a.airportValue))+kv('持股报价价值',fmt(a.stockValue))+kv('待结经营收益',fmt(a.retainedPending))+kv('原资产总值',fmt(a.grossAssets))+kv('抵押本金（负债）',fmt(a.mortgagePrincipal))+kv('抵押利息（负债）',fmt(a.mortgageInterest))+kv('净资产',fmt(a.netAssets),'g');
}

const $ = (id) => document.getElementById(id);
let pieceResizeFrame = 0;
function requestPieceLayout() {
  if (!game || pieceResizeFrame) return;
  pieceResizeFrame = window.requestAnimationFrame(() => {
    pieceResizeFrame = 0;
    renderPieces();
  });
}
if ('ResizeObserver' in window) new window.ResizeObserver(requestPieceLayout).observe($('board'));
if ('ResizeObserver' in window) {
  const chromeLayout = new window.ResizeObserver(fitActionBarPadding);
  for (const id of ['newsBar', 'waitBanner', 'quickClockBar', 'actionBar']) chromeLayout.observe($(id));
}
window.addEventListener('resize', requestPieceLayout);

function show(id) {
  ['view-lobby', 'view-room', 'view-game'].forEach((v) => $(v).classList.toggle('hidden', v !== id));
  document.body.classList.toggle('game-active', id === 'view-game');
  fitActionBarPadding();
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

const fmt = (n) => '￥' + Math.round(n).toLocaleString('zh-CN');
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function stockKey(state) {
  if (!state || state.phase === 'game_over') return null;
  if (state.ruleVersion === 2) {
    const w = state.self?.stockWindow;
    return w && w.playerId === state.self.playerId ? JSON.stringify([state.gameId,state.self.playerId,w.windowId]) : null;
  }
  if (!['stock','trade_confirm'].includes(state.phase)) return null;
  const playerId = state.phase === 'trade_confirm' ? state.pending?.fromId : state.pending?.playerId;
  if (playerId !== me.gameId) return null;
  const base = JSON.stringify([state.roomCode,state.startedAt,playerId]);
  return stockContext?.legacyBase === base ? stockContext.key : base+':'+(stockGeneration+1);
}
function syncStockContext(state) {
  const key = stockKey(state);
  if (key === stockContext?.key) return;
  if (activeRequest?.context && activeRequest.context.generation === stockContext?.generation) {
    activeRequest = null; actionPending = false; document.body.classList.remove('action-pending');
  }
  stockGeneration++;
  transferReturn = null;
  stockDraft = {}; for (const id of Object.keys(transferDraft)) delete transferDraft[id];
  stockAutoShown = false;
  stockContext = key ? {key,generation:stockGeneration,legacyBase:state.ruleVersion===2?null:JSON.stringify([state.roomCode,state.startedAt,me.gameId]),status:'editing',error:'',pendingRequest:null,receipt:null} : null;
}
function captureStockContext() {
  return stockContext ? {key:stockContext.key,generation:stockContext.generation} : null;
}
function isCurrentStockContext(context) {
  return !!context && context.key === stockContext?.key && context.generation === stockContext.generation && context.key === stockKey(latestState || game);
}
function stockReady() {
  return !!stockContext && game?.phase === 'stock' && isMyTurn() && !animBusy && !diceAnimating &&
    stockKey(game) === stockContext.key && (game.ruleVersion !== 2 || (game.revision === latestState?.revision && latestState.phase === 'stock'));
}
function refreshStockDraftQuotes() {
  if (!stockReady()) return;
  for (const [id,d] of Object.entries(stockDraft)) {
    const st=game.stocks[id]; if (st) d.basis={price:st.price,quoteVersion:st.quoteVersion,listingEpoch:st.listingEpoch};
  }
  stockContext.status='editing';stockContext.error='报价已更新，请核对金额后确认交易。';renderStock();
}

function saveReconnect(data) {
  try { localStorage.setItem('gt_reconnect', JSON.stringify(data)); }
  catch { toast('浏览器未允许保存重连身份；刷新后可能需要重新加入。'); }
}
function loadReconnect() { try { return JSON.parse(localStorage.getItem('gt_reconnect') || 'null'); } catch { return null; } }
function clearReconnect() { try { localStorage.removeItem('gt_reconnect'); } catch { /* 受限存储不阻断退出。 */ } }

function updateWaitBanner() {
  const banner = $('waitBanner');
  if (!banner) return;
  const aliveOffline = disconnectedNames.filter((n) => {
    const gp = game ? game.players.find((p) => p.name === n) : null;
    return !gp || gp.alive; // 已破产玩家掉线不提示暂停
  });
  if (aliveOffline.length && game && game.phase !== 'game_over') {
    banner.textContent = '⏸ ' + aliveOffline.join('、') + ' 掉线，对局暂停，等待重连…';
    banner.classList.remove('hidden');
  } else banner.classList.add('hidden');
}

// ---------- 数值口径（与服务端一致，仅展示） ----------
function houseInvest(city) { return Math.round(city.price * 0.6 * (city.houseLevel || 0)); }
function cityTotalValue(city) { return city.price + houseInvest(city); }
function mortgageValue(city) { return Math.round(cityTotalValue(city) * 0.5); }
function rentFor(city) { let r = Math.round(city.price * (0.3 + 0.3 * (city.houseLevel || 0))); if ((city.houseLevel || 0) >= 4 && city.price >= 15000) r = Math.round(r * 1.1); return r; }
function demolitionRefund(cityId) {const q=game?.self?.quotes.demolish[cityId];return q?.ok?-q.finalAmount:Math.round(game.cities[cityId].price*.36);}
function totalAssetsFor(p) {
  if (!p) return 0;
  if (game?.ruleVersion === 2 && p.assetSummary) return p.assetSummary.total;
  let t = p.cash;
  for (const id of p.cities) t += cityTotalValue(game.cities[id]);
  t += (p.airports || []).length * 15000;
  for (const cid of Object.keys(game.stocks)) t += (game.stocks[cid].holders[p.id] || 0) * game.stocks[cid].price;
  return t;
}
function playerById(id) { return game ? game.players.find((p) => p.id === id) : null; }
function isMyTurn() { return !['opportunity_choose','route_choose'].includes(game?.phase) && !game?.decision?.paused && awaitingPlayerId === me.gameId; }
function hostName() {
  const h = game && game.players.find((p) => p.socketId === roomHostId);
  return h ? h.name : '';
}

// ---------- 棋盘 ----------
function gridPos(id) {
  // 横向长方形闭环：起点左上角，顺时针。上边 0-11 → 右边 12-20 → 下边 21-32 → 左边 33-41
  if (id <= 10) return [1, id + 1];
  if (id === 11) return [1, 12];
  if (id <= 20) return [id - 10, 12];
  if (id === 21) return [11, 12];
  if (id <= 31) return [11, 33 - id];
  if (id === 32) return [11, 1];
  return [43 - id, 1];
}
function typeClass(sq) {
  if (sq.type === 'city') return 'g-' + (game.cities[sq.cityId] ? game.cities[sq.cityId].group : '');
  if (sq.type === 'start') return 't-start';
  if (sq.type === 'airport') return 't-airport';
  if (sq.type === 'chance') return 't-chance';
  if (sq.type === 'jail') return 't-jail';
  if (sq.type === 'pole') return 't-pole';
  return 't-rest';
}
function sqLabel(sq) {
  if (sq.type === 'city') {
    const c = game.cities[sq.cityId];
    return (c.country ? c.country + '·' : '') + sq.cityId;
  }
  if (sq.type === 'airport') return sq.airportId;
  return sq.name || { chance: '机会卡', pole: sq.name, jail: '监狱', rest: '休闲', start: '起点' }[sq.type] || '';
}
function renderBoard() {
  const board = $('board');
  board.innerHTML = '';
  for (const sq of game.board) {
    const [r, c] = gridPos(sq.id);
    const div = document.createElement('button');
    div.type = 'button';
    div.className = 'sq ' + typeClass(sq);
    div.dataset.squareId = String(sq.id);
    div.style.gridRow = r;
    div.style.gridColumn = c;
    let owner = '', sub = '';
    if (sq.type === 'city') {
      const city = game.cities[sq.cityId];
      owner = city.ownerId ? (playerById(city.ownerId)?.name || '') : '';
      if (city.houseLevel > 0) sub += '<span class="lvl">房' + city.houseLevel + '</span>';
      if (city.mortgaged) sub += '<span class="mg">抵</span>';
      div.onclick = () => openCityDetail(sq.cityId); // 无主城市也可查看地价/初始租金
    }
    if (sq.type === 'airport') {
      const a = game.airports[sq.airportId];
      owner = a.ownerId ? (playerById(a.ownerId)?.name || '') : '';
    }
    if (sq.type !== 'city') div.onclick = () => openSquareDetail(sq.id);
    const glyph = { start: '↗', city: '◆', chance: '?', airport: '✈', rest: '☀', jail: '▥', pole: '✦' }[sq.type] || '•';
    div.setAttribute('aria-label', sq.id + ' 号地块：' + sqLabel(sq) + (owner ? '，持有者 ' + owner : ''));
    div.innerHTML = '<span class="num">' + sq.id + '</span><span class="glyph" aria-hidden="true">' + glyph + '</span><span class="nm">' + sqLabel(sq) + '</span>'
      + (sub ? '<span class="subrow">' + sub + '</span>' : '')
      + (owner ? '<span class="own">' + escapeHTML(owner) + '</span>' : '');
    board.appendChild(div);
  }
}

// ---------- 掷骰 / 棋子移动动画 ----------
function pieceXY(posId) {
  const sq = $('board').children[posId];
  if (!sq) return { x: 0, y: 0, width: 0, height: 0 };
  const bd = $('board');
  const br = bd.getBoundingClientRect();
  const sr = sq.getBoundingClientRect();
  return { x: sr.left - br.left + sr.width / 2, y: sr.top - br.top + sr.height / 2, width: sr.width, height: sr.height };
}
function renderPieces() {
  const layer = $('pieces');
  if (!layer || !game) return;
  layer.innerHTML = '';
  const alive = game.players.filter((p) => p.alive);
  const offsets = {};
  alive.forEach((p) => {
    const pos = lastPos[p.id] != null ? lastPos[p.id] : p.position;
    offsets[pos] = (offsets[pos] || 0) + 1;
  });
  const counts = { ...offsets };
  alive.forEach((p) => {
    const pos = lastPos[p.id] != null ? lastPos[p.id] : p.position;
    const xy = pieceXY(pos);
    const idx = offsets[pos]-- - 1;
    const d = document.createElement('span');
    d.className = 'piece';
    d.style.background = p.color;
    const columns = Math.min(2, counts[pos]);
    const rows = Math.ceil(counts[pos] / columns);
    const gapX = Math.min(14, xy.width / (columns + 1));
    const gapY = Math.min(14, xy.height / (rows + 1));
    d.style.left = (xy.x + (idx % columns - (columns - 1) / 2) * gapX) + 'px';
    d.style.top = (xy.y + (Math.floor(idx / columns) - (rows - 1) / 2) * gapY) + 'px';
    layer.appendChild(d);
  });
}
function movePath(from, to) {
  const cw = [];
  let cur = from;
  while (cur !== to) { cur = (cur + 1) % 42; cw.push(cur); }
  const ccw = [];
  cur = from;
  while (cur !== to) { cur = (cur + 41) % 42; ccw.push(cur); }
  return cw.length <= ccw.length ? cw : ccw;
}
function playMoveAnim(movers, done) {
  const steps = movers.map((p) => ({ id: p.id, path: movePath(lastPos[p.id] != null ? lastPos[p.id] : p.position, p.position) }));
  const maxLen = steps.reduce((m, st) => Math.max(m, st.path.length), 0);
  if (!maxLen) { done(); return; }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const st of steps) lastPos[st.id] = st.path[st.path.length - 1];
    renderPieces();
    done();
    return;
  }
  let i = 0;
  const generation=animationGeneration;
  const iv = moveTimer = setInterval(() => {
    if(generation!==animationGeneration){clearInterval(iv);return;}
    i++;
    for (const st of steps) lastPos[st.id] = st.path[Math.min(i, st.path.length) - 1];
    renderPieces();
    if (i >= maxLen) { clearInterval(iv);moveTimer=null; done(); }
  }, 110);
}
function playDiceAnim() {
  const el = $('dice');
  if (!el) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    diceAnimating = false;
    if (animQueued) { const st = animQueued; animQueued = null; processState(st); }
    return;
  }
  diceAnimating = true;
  el.classList.add('rolling');
  const generation=animationGeneration;
  const iv = diceTimer = setInterval(() => {
    el.textContent = '骰子 ' + (1 + Math.floor(Math.random() * 10));
  }, 90);
  diceFinishTimer=setTimeout(() => {
    if(generation!==animationGeneration)return;
    clearInterval(iv);
    diceTimer=null;diceFinishTimer=null;
    el.classList.remove('rolling');
    diceAnimating = false;
    if (animQueued) { const st = animQueued; animQueued = null; processState(st); }
  }, 680);
}
function processState(state) {
  const movers = state.players.filter((p) => p.alive && lastPos[p.id] != null && lastPos[p.id] !== p.position);
  if (movers.length) {
    animBusy = true;
    playMoveAnim(movers, () => { animBusy = false; afterAnim(state); });
  } else {
    afterAnim(state);
  }
}
function afterAnim(state) {
  for (const p of state.players) lastPos[p.id] = p.position;
  finishRender(state);
  if (animQueued) { const st = animQueued; animQueued = null; processState(st); }
}
function finishRender(state) {
  game = state;
  awaitingPlayerId = game.phase === 'waiting_roll' ? game.players[game.turnIndex]?.id : (game.pending?.awaiting || game.pending?.targetId || game.pending?.playerId || null);
  if (state.phase !== 'stock') {
    stockAutoShown = false;
    hideOverlay('stockModal'); // 股票阶段结束（含超时自动跳过）后收起股票弹窗，防止遮罩拦截后续弹窗
  }
  renderBoard();
  renderPieces();
  renderSide();
  renderLedger();
  renderActionBar();
  renderNews();
  renderOpportunities();
  renderRouteChoice();
  if (!$('stockModal').classList.contains('hidden')) renderStock();
  updateWaitBanner();
  fitActionBarPadding();
  let chanceShown = false;
  const json = JSON.stringify(state);
  if (json !== lastGameJson) {
    lastGameJson = json;
    const ev = state.events || [];
    const fresh = ev.filter((e) => e && e.id != null && e.id > lastEventId);
    if (fresh.length) {
      lastEventId = fresh[fresh.length - 1].id;
      clientLog = fresh.slice().reverse().concat(clientLog).slice(0, 500);
      renderSide();
      const saleFail = fresh.find((e) => e.type === 'sale' && e.text && e.text.indexOf('现金不足，无法购买') >= 0);
      if (saleFail) toast(saleFail.text);
      const chance = fresh.filter((e) => e.type === 'chance');
      if (chance.length && state.phase !== 'game_over') {
        const c = chance[chance.length - 1];
        if (c.text && c.text.indexOf(me.name + ' 抽到机会卡') === 0) {
          receiptPending = true;
          openReceipt(c);
          chanceShown = true;
        }
      }
    }
  }
  // 终局显示优先于尚未确认的机会卡票据，避免旧提示遮住结算。
  if (state.phase === 'game_over') { receiptPending = false; renderGameOver(); return; }
  // 机会卡票据保持显示直到玩家点击「确认」：后续广播（如其他玩家行动）不得自动关闭/替换
  if (!chanceShown && !receiptPending) renderPending();
  finishStockAfterReceipt();
}
function afterReceipt() {
  receiptPending = false;
  closeModal();
  renderPending();
}

// ---------- 右侧极简面板 ----------
function renderSide() {
  if (!game) return;
  const meP = game.players.find((p) => p.id === me.gameId);
  if (!meP) return;
  const cur = meP;
  const panel = $('sidePlayer');
  const isHost = hostName() === cur.name;
  let state = '';
  if (!cur.alive) state = ' <span class="badge bankrupt">已破产</span>';
  if (cur.jailed) state += ' <span class="badge host">入狱</span>';
  if (cur.frozen) state += ' <span class="badge host">冰冻</span>';
  panel.innerHTML = '<h3>当前玩家</h3>'
    + '<div class="pinfo"><span class="pdot" style="background:' + cur.color + '"></span><b>' + escapeHTML(cur.name) + '</b>' + (isHost ? ' <span class="badge host">房主</span>' : '') + state + '</div>'
    + '<div class="turn-phase">' + (isMyTurn() ? '轮到你行动' : '等待其他玩家行动') + ' · 第 ' + game.rounds + ' 轮</div>';
  const others = game.players.filter((p) => p.id !== me.gameId);
  const othersEl = $('sideOthers');
  if (othersEl) {
    othersEl.innerHTML = '<h3>其他玩家</h3>'
      + (others.length ? others.map((p) => {
        let ost = '';
        if (!p.alive) ost = ' <span class="badge bankrupt">已破产</span>';
        if (p.jailed) ost += ' <span class="badge host">入狱</span>';
        if (p.frozen) ost += ' <span class="badge host">冰冻</span>';
        return '<div class="pinfo"><span class="pdot" style="background:' + p.color + '"></span><b>' + escapeHTML(p.name) + '</b>' + ost + '</div>'
          + (p.opportunities?'<div class="public-opportunities">'+p.opportunities.selectedIds.map(id=>game.opportunityCatalog[id].name).join(' · ')+'</div>':'')
          + '<div class="assets">'
          + '<div class="asset-row"><span>' + (game.quickRevision === 'quick-mode-v1' ? '当前净资产' : '总资产') + '</span><b class="total">' + fmt(game.quickRevision === 'quick-mode-v1' && p.netAssetSummary ? p.netAssetSummary.netAssets : totalAssetsFor(p)) + '</b></div>'
          + '<div class="asset-row"><span>当前现金</span><b>' + fmt(p.cash) + '</b></div>'
          + '</div>';
      }).join('') : '<p class="hint">暂无其他玩家</p>');
  }
  const log = $('log');
  log.innerHTML = '';
  const list = clientLog.filter((e) => e.text).slice(0, 30);
  if (!list.length) log.innerHTML = '<div class="ev">暂无事件记录</div>';
  list.forEach((e, i) => {
    const d = document.createElement('div');
    d.className = 'ev' + (i === 0 ? ' cur' : '');
    d.textContent = e.text;
    log.appendChild(d);
  });
  for (const heading of $('side').querySelectorAll('.panel h3')) {
    heading.tabIndex = 0;
    heading.setAttribute('role', 'button');
    heading.setAttribute('aria-expanded', String(!heading.parentElement.classList.contains('closed')));
  }
}

// ---------- 中心资产台账 ----------
function ledgerCityRow(p, cityId, allowOps) {
  const c = game.cities[cityId];
  const mgCount = p.cities.filter((id) => game.cities[id].mortgaged).length;
  const canOpsNow = isMyTurn() && !['auction_bid', 'direct_sale_ask', 'trade_confirm'].includes(game.phase);
  const row = document.createElement('div');
  row.className = 'lrow';
  row.onclick = () => openCityDetail(cityId);
  const nm = document.createElement('span');
  nm.className = 'nm';
  nm.textContent = (c.country ? c.country + '·' : '') + cityId;
  const info = document.createElement('span');
  info.className = 'info';
  info.innerHTML = '房 <b>' + (c.houseLevel || 0) + '</b> · ' + (c.mortgaged ? '<span class="mg">抵押</span>' : '正常');
  row.appendChild(nm);
  row.appendChild(info);
  if (allowOps && p.id === me.gameId) {
    if (!c.mortgaged) {
      const m = document.createElement('button');
      m.textContent = '抵押';
      m.disabled = !canOpsNow || mgCount >= 2;
      m.title = !canOpsNow ? '轮到你行动时可抵押（竞拍/交易确认期间除外）' : (mgCount >= 2 ? '已达抵押上限（最多抵押 2 座城市）' : '抵押金 = 总价值 × 50%');
      m.onclick = (e) => { e.stopPropagation(); sendAction({ type: 'mortgage', cityId }); };
      row.appendChild(m);
      if (p.position === 0) {
        const sd = document.createElement('button');
        sd.className = 'risk';
        sd.textContent = '出售';
        sd.onclick = (e) => { e.stopPropagation(); sellChoice(cityId); };
        row.appendChild(sd);
      }
    } else {
      const tip = document.createElement('span');
      tip.className = 'info';
      tip.textContent = '（赎回需落到该城市）';
      row.appendChild(tip);
    }
  }
  return row;
}

function renderLedger() {
  const box = $('ledger');
  if (!game || game.phase === 'game_over') { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const meP = game.players.find((p) => p.id === me.gameId);
  const body = $('ledgerBody');
  if (!meP) return;
  body.innerHTML = '';
  if (!meP.alive) {
    box.classList.remove('dim');
    body.innerHTML = '<div class="ledger-liquidate"><h4>破产清算文书</h4>'
      + '<p>你已破产出局。未赎回的抵押城市归银行（债务豁免），其余城市进入拍卖，机场归还银行，持股作废，剩余现金归银行。</p></div>';
    return;
  }
  const waitingRoll = game.phase === 'waiting_roll' && isMyTurn();
  box.classList.toggle('dim', waitingRoll);
  const stocks = Object.entries(meP.stocks || {}).filter(([, n]) => n > 0);
  const stockCount = stocks.reduce((sum, [, n]) => sum + n, 0);
  const mgCount = meP.cities.filter((id) => game.cities[id].mortgaged).length;
  const allowOps = isMyTurn() && game.phase !== 'game_over';
  body.innerHTML = '<div class="ledger-title">我的资产 <em>· 航海家</em></div>'
    + '<div class="ledger-total"><span>'+(quickGame()?'当前净资产':'总资产')+'</span><strong>' + fmt(quickGame()?meP.netAssetSummary.netAssets:totalAssetsFor(meP)) + '</strong></div>'
    + '<div class="ledger-summary">'
    + '<div><span>现金</span><b>' + fmt(meP.cash) + '</b></div>'
    + '<div><span>城市</span><b>' + meP.cities.length + ' 座</b></div>'
    + '<div><span>机场</span><b>' + (meP.airports || []).length + ' 座</b></div>'
    + '<div><span>持股</span><b>' + stockCount + ' 股</b></div></div>';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'ledger-open';
  open.textContent = '查看完整资产 ↗';
  open.onclick = openAssetOverview;
  body.appendChild(open);
  if(game.self?.opportunities){const selected=document.createElement('button');selected.className='ledger-open';selected.type='button';selected.textContent='已选机遇 · '+game.self.opportunities.selectedIds.length+' 项';selected.onclick=()=>{openAssetOverview();$('modalBody').querySelector('.selected-opportunities')?.scrollIntoView({block:'nearest'});};body.append(selected);}
  if (meP.cities.length) {
    const wrap = document.createElement('div');
    wrap.className = 'ledger-list';
    for (const id of meP.cities) wrap.appendChild(ledgerCityRow(meP, id, allowOps));
    body.appendChild(wrap);
    body.insertAdjacentHTML('beforeend', '<div class="ledger-note">抵押 ' + mgCount + ' / 2 座 · 点击城市查看详情</div>');
  } else {
    body.insertAdjacentHTML('beforeend', '<div class="ledger-empty">暂无城市资产</div>');
  }
  if (waitingRoll) body.insertAdjacentHTML('beforeend', '<div class="ledger-wait">等待掷骰子</div>');
}

// ---------- 底部操作栏 ----------
function renderActionBar() {
  if (!game) return;
  const cur = game.players[game.turnIndex];
  $('dice').textContent = game.dice ? '骰子 ' + game.dice : '骰子 · 待掷';
  $('turnInfo').textContent = '当前回合：' + cur.name + '（第 ' + game.rounds + ' 轮）';
  const canRoll = game.phase === 'waiting_roll' && isMyTurn();
  $('btnRoll').disabled = !canRoll;
  $('btnEndTurn').disabled = !canRoll;
  const resumeStock = game.phase === 'stock' && isMyTurn();
  $('btnResumeStock').classList.toggle('hidden', !resumeStock);
  $('btnResumeStock').disabled = !stockReady();
  $('btnRoll').classList.toggle('hidden', resumeStock);
  $('btnEndTurn').title = canRoll ? '掷骰并推进本回合' : '当前阶段由系统自动推进';
  if (game.phase === 'opportunity_choose') $('turnInfo').textContent = '经营机遇 · 等待全员选择';
  if (game.phase === 'route_choose') $('turnInfo').textContent = (game.players.find(p=>p.id===game.routeProgress?.activeChoice?.playerId)?.name || '当前玩家')+' 正在调整经营路线';
}

function quoteExplanation(q) {
  if (!q || q.baseAmount === undefined) return '';
  return '<div class="fee-basis">'+kv('标准金额',fmt(q.baseAmount))+(q.effects||[]).map(e=>kv(e.name,fmt(Math.abs(e.amount)))).join('')+kv('实际金额',fmt(Math.abs(q.finalAmount)),'g')+'</div>';
}
function renderNews() {
  const bar=$('newsBar');
  if (!game?.world) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');bar.replaceChildren();
  const label=document.createElement('strong');label.textContent='环球资讯';bar.append(label);
  const active=game.world.active;
  const info=document.createElement('span');info.className='news-current';
  info.textContent=active?active.name+(active.region?' · '+active.region:'')+' · '+active.remaining+' 轮':'首次环球行程完成后发布';bar.append(info);
  if(active){const detail=document.createElement('details'),sum=document.createElement('summary'),p=document.createElement('p');sum.textContent='影响说明';p.textContent=active.description;detail.append(sum,p);bar.append(detail);}
  if(game.world.preview){const next=document.createElement('span');next.className='news-preview';next.textContent='下轮预告：'+game.world.preview.name+(game.world.preview.region?' · '+game.world.preview.region:'');bar.append(next);}
  const expense=game.travelExpense;
  if(expense){
    const line=document.createElement('span');line.className='travel-expense';
    line.textContent=expense.enabled?'第 '+(expense.completedRounds+1)+' 完整轮 · 回合结束远航开支 '+fmt(expense.currentAmount):'本局沿用原规则 · 无远航开支';
    bar.append(line);
    if(expense.preview){const next=document.createElement('span');next.className='travel-preview';next.textContent='远航预告：'+expense.preview.roundsUntil+' 个完整轮后，第 '+expense.preview.startsAtRound+' 轮起每回合 '+fmt(expense.preview.amount);bar.append(next);}
  }
}
function renderOpportunities() {
  if (game?.phase !== 'opportunity_choose' || !game.self?.choice) { hideOverlay('choiceModal');choiceRenderKey='';return; }
  const c=game.self.choice,stage=game.opportunityStage;
  receiptPending=false;
  const hadFocus=$('choiceModal').contains(document.activeElement);
  const completed=Object.values(stage.completed).filter(Boolean).length;
  $('choiceStatus').textContent=(game.decision.paused?'有玩家离线，对局暂停。':c.submitted?'已提交，等待其他玩家。':'请选择一项经营机遇。')+' '+completed+' / '+stage.participantIds.length+' 已完成';
  const key=c.stageId+':'+c.candidateVersion;
  if (choiceRenderKey!==key) {
    choiceRenderKey=key;$('choiceCards').replaceChildren();$('choiceError').textContent='';
    for (const id of c.candidateIds) {
      const item=game.opportunityCatalog[id],card=document.createElement('article');card.className='opportunity-card';
      const dir=document.createElement('span');dir.className='opportunity-direction';dir.textContent=item.direction;
      const title=document.createElement('h4');title.textContent=item.name;
      const description=document.createElement('p');description.textContent=item.description;
      const button=document.createElement('button');button.type='button';button.className='primary';button.textContent='选择这项机遇';button.dataset.opportunityId=id;
      button.onclick=()=>sendAction({type:'opportunity_choose',stageId:c.stageId,candidateVersion:c.candidateVersion,opportunityId:id});
      card.append(dir,title,description,button);$('choiceCards').append(card);
    }
  }
  for(const b of $('choiceCards').querySelectorAll('button')){b.disabled=c.submitted||game.decision.paused;b.textContent=c.submitted?(b.dataset.opportunityId===c.submittedId?'已选择':'已锁定'):'选择这项机遇';}
  $('btnReroll').disabled=c.submitted||game.decision.paused||c.rerollsLeft<1;
  $('btnReroll').textContent='换一组选项 · 剩余 '+c.rerollsLeft+' 次';
  $('btnReroll').onclick=()=>sendAction({type:'opportunity_reroll',stageId:c.stageId,candidateVersion:c.candidateVersion});
  $('btnChoiceRules').onclick=()=>{buildRules();showOverlay('rulesModal');};
  $('btnChoiceDisband').hidden=roomHostId!==socket.id;
  $('btnChoiceDisband').onclick=()=>{if(confirm('解散房间并结算当前资产？'))socket.emit('disbandRoom');};
  closeModal();hideOverlay('stockModal');showOverlay('choiceModal');
  if(hadFocus&&(!$('choiceModal').contains(document.activeElement)||document.activeElement.disabled)){
    const target=c.submitted?$('choiceTitle'):$('choiceCards').querySelector('button:not(:disabled)');
    target?.focus({preventScroll:true});
  }
}
function opportunityDescription(id) {
  if(id==='H12' && game?.routeRevision==='opportunity-routes-v1')return '本局首次取得后获得6000。初始同步选择在全员完成后到账；后续调整在本人确认成功后到账。本局只领取一次，换出不补发。';
  return game.opportunityCatalog[id].description;
}
function opportunityHistory(id) {
  const o=game.self.opportunities,use=o.usage[id]||0;
  if(['H1','H2','H3','H7','H11'].includes(id))return use?'本圈已用，换回不恢复':'本圈可用';
  if(id==='H4'||id==='H6')return '本圈剩余额度 '+fmt(Math.max(0,(id==='H4'?1000:2000)-use));
  if(id==='H8')return '本局已领奖机场：'+(o.visitedAirportIds.join('、')||'无')+'；记录保留';
  if(id==='H12')return o.oneTimeRewards?.H12?'本局已领取6000，不再补发':'本局尚未领取';
  return '持续效果，仅影响之后的经营';
}
function currentRouteContext(c) {
  return {kind:'route',gameId:game.gameId,playerId:game.self.playerId,opportunityId:c.opportunityId,candidateVersion:c.candidateVersion};
}
function isCurrentRouteContext(c) {
  const s=latestState||game,w=s?.self?.routeChoice;
  return s?.gameId===c.gameId && s.phase==='route_choose' && s.self?.playerId===c.playerId && w?.opportunityId===c.opportunityId && w.candidateVersion===c.candidateVersion;
}
function renderRouteChoice() {
  const c=game?.self?.routeChoice;
  if(game?.phase!=='route_choose'||!c){
    hideOverlay('routeModal');routeDraft=null;
    if(activeRequest?.context?.kind==='route'){activeRequest=null;actionPending=false;document.body.classList.remove('action-pending');}
    return;
  }
  const context=currentRouteContext(c),key=JSON.stringify(context),hadFocus=$('routeModal').contains(document.activeElement),focusId=document.activeElement?.id;
  if(routeDraft?.key!==key)routeDraft={key,context,newId:null,replaceId:null,status:'editing',error:'',pendingRequest:null};
  const d=routeDraft,held=game.self.opportunities.selectedIds;
  const locked=actionPending||d.status==='submitting'||d.status==='unconfirmed'||game.decision?.paused||!socket.connected||restoringSession;
  $('routeStatus').textContent=game.decision?.paused?'对局暂停，原候选和剩余时间保留。':d.status==='submitting'?'已发送，等待服务器确认…':d.status==='unconfirmed'?'结果尚未确认，请查询原操作结果。':held.length===3?'选择一项新机遇，替换一项原机遇。':'选择一项新机遇加入经营路线。';
  function cards(root,ids,old){
    root.replaceChildren();
    for(const id of ids){
      const item=game.opportunityCatalog[id],card=document.createElement('article');card.className='opportunity-card';
      const title=document.createElement('h4');title.textContent=item.name;
      const direction=document.createElement('span');direction.className='opportunity-direction';direction.textContent=item.direction;
      const description=document.createElement('p');description.textContent=opportunityDescription(id);
      const history=document.createElement('p');history.className='route-history';history.textContent=opportunityHistory(id);
      const button=document.createElement('button');button.type='button';button.className='secondary';button.id=(old?'route-old-':'route-new-')+id;button.dataset.opportunityId=id;
      const selected=(old?d.replaceId:d.newId)===id;button.setAttribute('aria-pressed',String(selected));button.textContent=selected?'已选中':old?'替换这项':'选择这项';button.disabled=locked||(old&&(!d.newId||held.length<3));
      button.onclick=()=>{if(old)d.replaceId=id;else d.newId=id;d.error='';renderRouteChoice();$(button.id)?.focus({preventScroll:true});};
      card.append(direction,title,description,history,button);root.append(card);
    }
  }
  cards($('routeCandidates'),c.candidateIds,false);cards($('routeHeld'),held,true);
  const compare=$('routeComparison');compare.replaceChildren();
  if(d.newId){for(const [label,id] of [['获得',d.newId],['失去',d.replaceId]]){if(!id)continue;const p=document.createElement('p');p.textContent=label+'：'+game.opportunityCatalog[id].name+' — '+opportunityDescription(id);compare.append(p);}}
  else compare.textContent='尚未选定新机遇；当前持有项和资产保持原样。';
  if(d.newId&&held.length===3&&!d.replaceId){const p=document.createElement('p');p.textContent='请选择要替换的原机遇，之后才能确认。';compare.append(p);}
  $('routeError').textContent=d.error;
  $('btnRouteConfirm').disabled=locked||!d.newId||(held.length===3&&!d.replaceId);
  $('btnRouteSkip').disabled=locked;$('btnRouteBack').disabled=locked||!d.newId;
  $('btnRouteBack').onclick=()=>{d.newId=null;d.replaceId=null;renderRouteChoice();$('routeCandidates').querySelector('button')?.focus();};
  function submit(type){
    const payload={type,opportunityId:c.opportunityId,candidateVersion:c.candidateVersion,...(type==='route_confirm'?{newId:d.newId,replaceId:held.length===3?d.replaceId:null}:{})};
    sendAction(payload,()=>renderRouteChoice(),{context});
  }
  $('btnRouteConfirm').onclick=()=>submit('route_confirm');$('btnRouteSkip').onclick=()=>submit('route_skip');
  $('btnRouteRetry').classList.toggle('hidden',d.status!=='unconfirmed');$('btnRouteRetry').disabled=!socket.connected||game.decision?.paused;
  $('btnRouteRetry').onclick=()=>d.pendingRequest?.retrieve();
  $('btnRouteRules').onclick=()=>{buildRules();showOverlay('rulesModal');};
  closeModal();hideOverlay('stockModal');showOverlay('routeModal');
  if(hadFocus&&focusId&&$(focusId)&&!$(focusId).disabled)$(focusId).focus({preventScroll:true});
}
function appendSelectedOpportunities(container) {
  if (!game?.self?.opportunities) return;
  const personal=game.self.opportunities,wrap=document.createElement('section');wrap.className='selected-opportunities';
  const heading=document.createElement('h4');heading.textContent='已选机遇';wrap.append(heading);
  if(game.routeRevision==='opportunity-routes-v1'&&game.self.route){
    const r=game.self.route,line=document.createElement('p');line.className='route-progress';
    line.textContent=game.gameMode==='normal'?(r.baselineLapEpoch===null?'初始三次机遇完成后，每完成3圈可调整一次路线。':r.pending.length?'路线调整已排队，将在本人下一次掷骰前处理。':'距下一次路线调整还需 '+(3-(r.lapsSinceInitial%3))+' 圈。'):(game.routeProgress.laterClosed?'后续调整已关闭；未打开机会已失效。':'后续调整时点：第15、22分钟 · 待处理 '+r.pending.length+' 次。');
    if(game.gameMode==='quick'&&game.quickTime)line.textContent+=' 总剩余 '+Math.ceil(game.quickTime.totalRemainingMs/60000)+' 分钟；个人选择倒计时另计。';
    wrap.append(line);
  }
  if(!personal.selectedIds.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='尚未完成选择';wrap.append(empty);}
  for(const id of personal.selectedIds){
    const item=game.opportunityCatalog[id],details=document.createElement('details'),summary=document.createElement('summary'),p=document.createElement('p');
    const use=personal.usage[id]||0;
    let note='';
    if(['H1','H2','H3','H7','H11'].includes(id))note=use?'本圈已用':'本圈可用';
    if(id==='H4')note='本圈剩余额度 '+fmt(Math.max(0,1000-use));
    if(id==='H6')note='本圈剩余额度 '+fmt(Math.max(0,2000-use));
    if(id==='H8')note='已探访 '+personal.visitedAirportIds.length+' / '+Object.keys(game.airports).length+' 机场';
    if(id==='H12')note='已到账';
    summary.textContent=item.name+(note?' · '+note:'');p.textContent=opportunityDescription(id);details.append(summary,p);wrap.append(details);
    if(id==='H1'){
      const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='远程施工';button.disabled=game.phase!=='waiting_roll'||!isMyTurn()||use>0;button.onclick=openRemoteConstruction;wrap.append(button);
    }
  }
  container.append(wrap);
}
function openRemoteConstruction() {
  const body=$('modalBody');body.innerHTML='<p class="hint">选择一座自有、非抵押且未满四级的城市；本圈一次，施工后继续当前回合。</p>';
  for(const [id,q] of Object.entries(game.self.quotes.remote)){
    const row=document.createElement('article');row.className='remote-city';
    const title=document.createElement('h4');title.textContent=id;row.append(title);
    const info=document.createElement('div');info.innerHTML=quoteExplanation(q)||'<p class="hint">'+(q.reason||'当前不可施工')+'</p>';row.append(info);
    const button=document.createElement('button');button.type='button';button.className='primary';button.textContent='施工 '+(q.finalAmount!==undefined?fmt(q.finalAmount):'');button.disabled=!q.ok;button.onclick=()=>sendAction({type:'remote_build',cityId:id,quoteVersion:q.quoteVersion});row.append(button);body.append(row);
  }
  const close=document.createElement('button');close.className='textbtn';close.textContent='关闭';close.onclick=closeModal;body.append(close);openModal('远程施工');
}

// ---------- 通用弹窗 ----------
const overlayReturnFocus = new Map();
function showOverlay(id) {
  const overlay = $(id);
  const opening=overlay.classList.contains('hidden');
  if (opening) {
    const active = document.activeElement;
    overlayReturnFocus.set(id, { element: active, squareId: active?.dataset?.squareId });
  }
  overlay.classList.remove('hidden');
  const title = overlay.querySelector('.mh h3');
  if (title && opening) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
}
function hideOverlay(id) {
  const overlay = $(id);
  if (overlay.classList.contains('hidden')) return;
  overlay.classList.add('hidden');
  const previous = overlayReturnFocus.get(id);
  overlayReturnFocus.delete(id);
  const target = previous?.element?.isConnected && previous.element.getClientRects().length && !previous.element.disabled && !previous.element.closest('.overlay.hidden')
    ? previous.element
    : (previous?.squareId ? document.querySelector('#board [data-square-id="' + previous.squareId + '"]') : null);
  const fallback = target || [...document.querySelectorAll('.overlay:not(.hidden) button:not(:disabled),#actionBar button:not(:disabled),#btnStart:not(:disabled),#nickname')].find(el => el.getClientRects().length);
  if (fallback && typeof fallback.focus === 'function') fallback.focus({ preventScroll: true });
}
function openModal(title) { $('modalTitle').textContent = title; showOverlay('modal'); }
function closeModal() { hideOverlay('modal'); }
function actionQuote(action) {
  const quotes = game?.self?.quotes;
  if (!quotes) return null;
  if (action.type === 'remote_build') return quotes.remote[action.cityId];
  if (action.type === 'build_house') return quotes.build[action.cityId];
  if (['demolish_house','rescue_demolish'].includes(action.type)) return quotes.demolish[action.cityId];
  if (action.type === 'respond_build') return action.decision === 'build' ? quotes.build[game.pending.cityId] : action.decision === 'demolish' ? quotes.demolish[game.pending.cityId] : null;
  if (action.type === 'flight' && action.target) return quotes.flight[action.target];
  return null;
}
function renderFlightCosts(state) {
  const info=state.self?.flightInfo,fromId=info?.fromAirportId||state.pending.fromAirportId;
  const owner=state.players.find(p=>p.id===(info?.fromOwnerId||state.airports[fromId]?.ownerId));
  const paid=info?.airportFeePaid||state.pending.airportFeePaid;
  const expense=info?.travelExpense||state.travelExpense;
  return '<section class="flight-costs"><p><b>出发机场：</b>'+escapeHTML(fromId)+' · '+escapeHTML(owner?.name||'无主')+'</p>'
    +'<p><b>已支付通行费：</b>'+(paid&&Number.isSafeInteger(paid.amount)?fmt(paid.amount):'本次资料未提供')+'</p>'
    +'<p><b>机票规则：</b>'+(state.pending.free?'从自家机场出发，机票免费。':'从他人机场出发，按当前报价付机票；目的地属于自己也不会免票。')+'飞抵不再次收目的地通行费。</p>'
    +'<p><b>结束本回合的远航开支：</b>'+fmt(expense?.enabled?expense.currentAmount:0)+(expense?.enabled?'（独立费用，免费航班也适用）':'（本局无新增远航开支）')+'</p>'
    +(expense?.preview?'<p>预告：第'+expense.preview.startsAtRound+'完整轮起 '+fmt(expense.preview.amount)+'</p>':'')+'</section>';
}
function sendAction(action, callback, options = {}) {
  if (!game) return;
  if (!socket.connected || restoringSession) { toast('连接正在恢复，操作尚未发送；请等恢复完成后再操作。'); return; }
  if (actionPending) { toast('上一操作仍在等待服务器确认，请稍候。'); return; }
  if (game.decision?.paused) { toast('有玩家掉线，当前对局暂停；等待重连后可继续。'); return; }
  const context = options.context || (['stock_trade','stock_done','stock_transfer'].includes(action.type) && stockContext ? captureStockContext() : null);
  const routeRequest=context?.kind==='route';
  const current=()=>!context||(routeRequest?isCurrentRouteContext(context):isCurrentStockContext(context));
  if (!current()) return;
  let payload = {...action};
  if (game.ruleVersion === 2) {
    const q = actionQuote(action);
    if (q) payload.quoteVersion = action.quoteVersion || q.quoteVersion;
    if (action.type === 'rescue_sell_stock') payload.quoteVersion = game.stocks[action.cityId].quoteVersion;
    if (['stock_trade','stock_transfer'].includes(action.type) && game.phase === 'stock') payload.windowId = game.self.stockWindow?.windowId;
    payload = {...payload,gameId:game.gameId,actionId:window.crypto?.randomUUID?.() || socket.id+':'+Date.now()+':'+(++requestSequence),decisionId:game.decision.decisionId,actorRevision:game.self.actorRevision};
  }
  const request = {payload,context,attempt:0,finished:false,retrieve:null};
  request.retrieve = () => {
    if (actionPending || request.finished || !current() || !socket.connected) return;
    if (context && (game.ruleVersion !== 2 || latestState?.decision?.paused)) return;
    const attempt=++request.attempt;
    activeRequest=request;actionPending=true;document.body.classList.add('action-pending');
    toast('操作已发送，等待服务器确认…');
    if(routeRequest){routeDraft.pendingRequest=request;routeDraft.status='submitting';routeDraft.error='';renderRouteChoice();}
    else if(context){stockContext.pendingRequest=request;stockContext.status='submitting';renderStock();}
    const finish = (result) => {
      if(request.attempt!==attempt)return;
      const released = activeRequest === request;
      if(released){activeRequest=null;actionPending=false;document.body.classList.remove('action-pending');}
      if(!current())return;
      const res=result||{ok:false,error:'操作未确认',unconfirmed:true};request.finished=!res.unconfirmed;
      if(routeRequest){routeDraft.status=res.unconfirmed?'unconfirmed':'editing';routeDraft.error=res.ok?'':res.error||'操作尚未确认';if(!res.unconfirmed)routeDraft.pendingRequest=null;}
      else if(context){stockContext.status=res.unconfirmed?'unconfirmed':'editing';if(!res.unconfirmed)stockContext.pendingRequest=null;}
      if(!res.ok){toast(res.error||'操作未确认，请重试');if(game.phase==='opportunity_choose')$('choiceError').textContent=res.error||'操作未确认，请重试';}
      else toast('操作已确认');
      callback?.(res);
      if(routeRequest&&current())renderRouteChoice();
      else if((context&&current())||(released&&!context&&!$('stockModal').classList.contains('hidden')))renderStock();
    };
    const transmit = (retry) => {
      if(!current())return;
      socket.timeout(5000).emit('action',payload,(err,res)=>{
        if(request.attempt!==attempt)return;
        if(err&&!retry&&socket.connected&&(!context||game.ruleVersion===2)&&current()){toast('网络响应较慢，正在查询刚才的操作结果；请勿重复提交。');transmit(true);return;}
        finish(err?{ok:false,error:'连接未确认，请重试获取原操作结果；不要重复下单。',unconfirmed:true}:res);
      });
    };
    transmit(false);
  };
  // 首次旧协议请求仍允许正常发送，但不支持自动或显式重复未确认订单。
  if(context&&game.ruleVersion!==2){
    activeRequest=request;actionPending=true;document.body.classList.add('action-pending');stockContext.pendingRequest=request;stockContext.status='submitting';
    socket.timeout(5000).emit('action',payload,(err,res)=>{
      if(activeRequest===request){activeRequest=null;actionPending=false;document.body.classList.remove('action-pending');}
      if(!isCurrentStockContext(context))return;
      stockContext.status=err?'unconfirmed':'editing';if(!err)stockContext.pendingRequest=null;
      callback?.(err?{ok:false,error:'操作未确认，请核对持股和现金。旧对局不自动补单。',unconfirmed:true}:res);renderStock();
    });
  }else request.retrieve();
  return request;
}
function emitAct(action) { sendAction(action); }
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const overlay = ['rulesModal', 'routeModal', 'choiceModal', 'stockModal', 'modal'].map($).find((el) => !el.classList.contains('hidden'));
  if (!overlay) return;
  const items = [...overlay.querySelectorAll('a[href],summary,button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')]
    .filter((el) => el.getClientRects().length);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) {
    event.preventDefault(); first.focus();
  }
});
function kv(label, val, cls) { return '<div class="kv"><span>' + label + '</span><b class="' + (cls || '') + '">' + val + '</b></div>'; }

function renderPending() {
  const meP = game.players.find((p) => p.id === me.gameId);
  if (!meP || game.phase === 'game_over') return;
  const isMe = isMyTurn();
  const body = $('modalBody');
  switch (game.phase) {
    case 'waiting_roll': closeModal(); break;
    case 'frozen_turn':
      if (isMe) {
        const canPay = meP.cash >= 5000;
        body.innerHTML = '<div class="card-tag">FROZEN</div><p>你被冰冻了！可支付 5000 购买救援服务解除冰冻并正常行动；放弃则跳过本回合。</p>'
          + kv('当前现金', fmt(meP.cash), canPay ? 'g' : 'r')
          + (canPay ? '' : '<p class="hint">现金不足 5000，无法支付救援费，只能跳过本回合。</p>')
          + '<div class="btnrow"><button class="primary" ' + (canPay ? '' : 'disabled') + ' onclick="emitAct({type:\'respond_frozen\',decision:\'pay\'})">支付 5000 解除</button>'
          + (canPay ? '<button class="secondary" onclick="emitAct({type:\'respond_frozen\',decision:\'pass\'})">放弃</button>' : '<button class="secondary" onclick="closeModal(); openAssetOverview()">募集资金</button><button class="secondary" onclick="emitAct({type:\'respond_frozen\',decision:\'pass\'})">放弃</button>') + '</div>';
        openModal('极地救援');
      } else {
        const fp = playerById(game.pending ? game.pending.playerId : null);
        closeModal();
        toast('等待 ' + (fp ? fp.name : '对方') + ' 解除冰冻…');
      }
      break;
    case 'jail_turn':
      if (isMe) {
        const canPayJ = meP.cash >= 15000;
        body.innerHTML = '<p>你被关押在监狱。</p><p class="hint">掷出 1 或 10（幸运点数）即可出狱并移动；其余点数记一回合。出狱费 15000 可提前出狱（非强制）。</p>'
          + (canPayJ ? '' : '<p class="hint">资金不足（当前 ' + fmt(meP.cash) + '），可先募集资金。</p>')
          + '<div class="btnrow"><button class="primary" ' + (canPayJ ? '' : 'disabled') + ' onclick="emitAct({type:\'respond_jail\',decision:\'pay\'})">支付 15000 出狱</button>'
          + '<button class="secondary" onclick="emitAct({type:\'respond_jail\',decision:\'roll\'})">掷骰试出狱</button>'
          + (canPayJ ? '<button class="secondary" onclick="emitAct({type:\'respond_jail\',decision:\'pass\'})">放弃</button>' : '') + '</div>'
          + (canPayJ ? '' : '<div class="btnrow"><button class="secondary" onclick="closeModal(); openAssetOverview()">募集资金</button>'
          + '<button class="secondary" onclick="emitAct({type:\'respond_jail\',decision:\'pass\'})">放弃</button></div>');
        openModal('监狱');
      } else {
        const jp = playerById(game.pending ? game.pending.playerId : null);
        closeModal();
        toast('等待 ' + (jp ? jp.name : '对方') + ' 出狱…');
      }
      break;
    case 'buy':
      if (isMe) {
        const city = game.cities[game.pending.cityId];
        const poor = meP.cash < city.price;
        const lapCap = (meP.lapBuys || 0) >= 4;
        body.innerHTML = '<div class="card-tag">PROPERTY</div>'
          + kv('地产名称', (city.country ? city.country + '·' : '') + game.pending.cityId)
          + kv('当前价格', fmt(city.price), 'g')
          + kv('当前租金', fmt(rentFor(city)))
          + kv('当前现金', fmt(meP.cash), poor ? 'r' : '')
          + kv('持有玩家', '无')
          + (poor
            ? '<p class="hint">现金不足，无法直接购买。你可以募集资金（抵押/拆房凑够地价）或取消购买（进入拍卖）。</p>'
              + '<div class="row"><button class="secondary" onclick="emitAct({type:\'buy_fundraise\',decision:\'start\'})">募集资金</button><button class="risk" onclick="emitAct({type:\'buy\',decision:\'pass\'})">取消购买</button></div>'
            : (lapCap
              ? '<p class="hint">本圈（起点到起点）已达 4 座房产上限（购买、拍卖与直接出售所得均计入，机场不限），本圈不能再获得城市。</p><div class="row"><button class="risk" onclick="emitAct({type:\'buy\',decision:\'pass\'})">放弃购买（进入拍卖）</button></div>'
              : '<div class="row"><button class="risk" onclick="emitAct({type:\'buy\',decision:\'pass\'})">放弃购买</button><button class="positive" onclick="emitAct({type:\'buy\',decision:\'buy\'})">确认购买</button></div>'));
        openModal('地产购买');
      }
      break;
    case 'buy_airport':
      if (isMe) {
        const poor = meP.cash < 15000;
        body.innerHTML = '<div class="card-tag">AIRPORT</div>'
          + kv('机场', game.pending.airportId)
          + kv('购买价格', '￥15,000', 'g')
          + kv('当前现金', fmt(meP.cash), poor ? 'r' : '')
          + (poor
            ? '<p class="hint">现金不足，无法直接购买。你可以募集资金（抵押/拆房凑够 15000）或取消购买。</p>'
              + '<div class="row"><button class="secondary" onclick="emitAct({type:\'buy_fundraise\',decision:\'start\'})">募集资金</button><button class="risk" onclick="emitAct({type:\'buy_airport\',decision:\'pass\'})">取消购买</button></div>'
            : '<div class="row"><button class="secondary" onclick="emitAct({type:\'buy_airport\',decision:\'pass\'})">放弃</button><button class="primary" onclick="emitAct({type:\'buy_airport\',decision:\'buy\'})">购买</button></div>');
        openModal('购买机场');
      }
      break;
    case 'buy_fundraise':
      if (isMe) {
        const t = game.pending.target;
        const isCity = t.kind === 'city';
        const price = isCity ? game.cities[t.cityId].price : 15000;
        const tname = isCity ? (game.cities[t.cityId].country ? game.cities[t.cityId].country + '·' : '') + t.cityId : t.airportId;
        const enough = meP.cash >= price;
        const owned = meP.cities.filter((id) => !game.cities[id].mortgaged);
        const mgCapF = meP.cities.filter((x) => game.cities[x].mortgaged).length >= 2;
        let html = '<div class="card-tag">FUNDRAISE</div>'
          + kv('购买目标', tname)
          + kv('所需资金', fmt(price), 'g')
          + kv('当前现金', fmt(meP.cash), enough ? 'g' : 'r')
          + kv('尚缺', fmt(Math.max(0, price - meP.cash)), enough ? '' : 'r')
          + '<p class="hint">通过抵押城市或拆除房屋募集资金，凑够后点击「完成购买」。</p>';
        if (owned.length) {
          owned.forEach((id) => {
            const c = game.cities[id];
            html += '<div class="lrow" style="cursor:default"><span class="nm">' + (c.country ? c.country + '·' : '') + id + '（房 ' + (c.houseLevel || 0) + '）</span>'
              + '<button class="secondary" ' + (mgCapF ? 'disabled title="已达抵押上限（最多抵押 2 座城市）"' : '') + ' onclick="emitAct({type:\'rescue_mortgage\',cityId:\'' + id + '\'})">抵押 +' + fmt(mortgageValue(c)) + '</button>'
              + (c.houseLevel > 0 ? '<button onclick="emitAct({type:\'rescue_demolish\',cityId:\'' + id + '\'})">拆房 +' + fmt(demolitionRefund(id)) + '</button>' : '')
              + '</div>';
          });
        } else {
          html += '<p class="hint">你没有可抵押/拆房的城市资产。</p>';
        }
        html += '<div class="row"><button class="risk" onclick="emitAct({type:\'buy_fundraise\',decision:\'cancel\'})">取消购买</button><button class="positive" ' + (enough ? '' : 'disabled') + ' onclick="emitAct({type:\'buy_fundraise\',decision:\'confirm\'})">完成购买</button></div>';
        body.innerHTML = html;
        openModal('募集资金');
      }
      break;
    case 'build_decide':
      if (isMe) {
        const city = game.cities[game.pending.cityId];
        const bq=game.self?.quotes.build[game.pending.cityId],dq=game.self?.quotes.demolish[game.pending.cityId];
        const cost = bq?.finalAmount ?? Math.round(city.price * 0.6);
        const refund = dq ? -dq.finalAmount : Math.round(city.price * 0.36);
        const canBuild = bq ? bq.ok : city.houseLevel < 4 && meP.cash >= cost;
        const canDemolish = city.houseLevel > 0;
        body.innerHTML = '<div class="card-tag">MY CITY</div>'
          + kv('城市', (city.country ? city.country + '·' : '') + game.pending.cityId)
          + kv('房屋等级', (city.houseLevel || 0) + ' / 4')
          + kv('建房费用', fmt(cost), 'g')
          + (bq ? quoteExplanation(bq) : '')
          + (city.houseLevel > 0 ? kv('拆房返还', fmt(refund)) : '')
          + kv('当前现金', fmt(meP.cash), canBuild ? '' : 'r')
          + '<div class="row">'
          + '<button class="positive" ' + (canBuild ? '' : 'disabled title="现金不足或已满级"') + ' onclick="emitAct({type:\'respond_build\',decision:\'build\'})">建造 1 级（-' + fmt(cost) + '）</button>'
          + '<button class="secondary" ' + (canDemolish ? '' : 'disabled title="空地皮无法拆房"') + ' onclick="emitAct({type:\'respond_build\',decision:\'demolish\'})">拆除 1 级（+' + fmt(refund) + '）</button>'
          + '<button class="secondary" onclick="emitAct({type:\'respond_build\',decision:\'pass\'})">放弃</button></div>';
        openModal('建房 / 拆房');
      } else {
        const bp = playerById(game.pending ? game.pending.playerId : null);
        closeModal();
        toast('等待 ' + (bp ? bp.name : '对方') + ' 决定建房/拆房…');
      }
      break;
    case 'stock':
      if (isMe && !stockAutoShown) {
        stockAutoShown = true;
        closeModal(); // 关闭机会卡等上一弹窗，避免残留
        renderStock();
        showOverlay('stockModal');
      }
      break;
    case 'flight':
      if (isMe) {
        const opts = game.board.filter((s) => s.type === 'airport' && s.airportId !== game.pending.fromAirportId);
        body.innerHTML = renderFlightCosts(game)+'<p>选择飞往的机场（基础机票 = 最短格数 × 500' + (game.pending.free ? '，本次免费' : '') + '）：</p><div class="row">'
          + opts.map((o) => {const q=game.self?.quotes.flight[o.airportId],owner=playerById(game.airports[o.airportId].ownerId);return '<article class="flight-option"><strong>'+o.airportId+'</strong><p>目的机场归属：'+escapeHTML(owner?.name||'无主')+'</p>'+(q?quoteExplanation(q):'')+'<button class="secondary" onclick="emitAct({type:\'flight\',target:\''+o.airportId+'\'})">'+(q?fmt(q.finalAmount)+' 飞往':'飞往 ')+o.airportId+'</button></article>';}).join('')
          + '<button class="textbtn" onclick="emitAct({type:\'flight\',target:null})">不飞</button></div>';
        openModal('机场飞行');
      }
      break;
    case 'auction_bid':
      if (isMe) {
        const city = game.cities[game.pending.cityId];
        const min = game.pending.currentBid ? game.pending.currentBid + 1000 : Math.round(cityTotalValue(city) * 0.75);
        const iAmTop = game.pending.currentBidder === me.gameId;
        body.innerHTML = '<div class="card-tag">AUCTION</div>'
          + kv('竞拍标的', (city.country ? city.country + '·' : '') + game.pending.cityId)
          + kv('当前最高', game.pending.currentBid ? fmt(game.pending.currentBid) : '—')
          + kv('最低出价', fmt(min), 'g')
          + (iAmTop
            ? '<p class="hint">你是当前最高出价者（出价 ' + fmt(game.pending.currentBid) + '）。可以按当前价格结束拍卖成交。</p>'
              + '<div class="row"><button class="primary" onclick="emitAct({type:\'auction_respond\',decision:\'end\'})">结束拍卖</button></div>'
            : '<div class="row"><input id="bidAmt" type="number" class="mono" value="' + min + '" min="' + min + '" style="flex:1" />'
              + '<button class="primary" onclick="emitAct({type:\'auction_respond\',decision:\'bid\',amount:+$(\'bidAmt\').value})">出价</button>'
              + '<button class="secondary" onclick="emitAct({type:\'auction_respond\',decision:\'pass\'})">放弃</button></div>');
        openModal('拍卖');
      } else {
        const bidder = playerById(game.pending.awaiting);
        closeModal();
        const ac = game.cities[game.pending.cityId];
        toast('等待 ' + (bidder ? bidder.name : '对方') + ' 出价（' + (ac && ac.country ? ac.country + '·' : '') + game.pending.cityId + '）…');
      }
      break;
    case 'direct_sale_ask':
      if (isMe) {
        const city = game.cities[game.pending.cityId];
        const seller = playerById(game.pending.sellerId);
        body.innerHTML = '<div class="card-tag">DIRECT SALE</div>'
          + kv('出售标的', (city.country ? city.country + '·' : '') + game.pending.cityId)
          + kv('出售方', seller ? escapeHTML(seller.name) : '—')
          + kv('成交价格', fmt(cityTotalValue(city)), 'g')
          + '<div class="row"><button class="primary" onclick="emitAct({type:\'direct_sale_respond\',decision:\'buy\'})">购买</button><button class="secondary" onclick="emitAct({type:\'direct_sale_respond\',decision:\'pass\'})">放弃</button></div>';
        openModal('直接出售');
      } else {
        const buyer = playerById(game.pending.awaiting);
        closeModal();
        const dcity = game.cities[game.pending.cityId];
        toast('等待 ' + (buyer ? buyer.name : '对方') + ' 决定是否购买 ' + (dcity && dcity.country ? dcity.country + '·' : '') + game.pending.cityId + '…');
      }
      break;
    case 'self_rescue':
      if (isMe) {
        const pend = game.pending;
        const owned = meP.cities.filter((id) => !game.cities[id].mortgaged);
        const mgCap = meP.cities.filter((x) => game.cities[x].mortgaged).length >= 2;
        body.innerHTML = '<div class="card-tag">SELF RESCUE</div><p>资金不足（欠 ' + fmt(pend.due) + '），选择自救：</p>';
        if(pend.reason){const reason=document.createElement('p');reason.className='hint';reason.textContent='债务来源：'+pend.reason;body.append(reason);}
        body.innerHTML += '<p class="hint">金额：抵押 = 总价值 × 50%；直接出售 = 总价值 × 80%；拍卖流拍保底 = 总价值 × 50%。</p>';
        owned.forEach((id) => {
          const c = game.cities[id];
          const tv = cityTotalValue(c);
          const sellAmt = Math.round(tv * 0.8);
          const floorAmt = Math.round(tv * 0.5);
          body.innerHTML += '<div class="lrow" style="cursor:default;flex-wrap:wrap"><span class="nm">' + (c.country ? c.country + '·' : '') + id + '（价值 ' + fmt(tv) + '，房 ' + (c.houseLevel || 0) + '）</span>'
            + '<button class="secondary" ' + (mgCap ? 'disabled title="已达抵押上限（最多抵押 2 座城市）"' : '') + ' onclick="emitAct({type:\'rescue_mortgage\',cityId:\'' + id + '\'})">抵押 +' + fmt(mortgageValue(c)) + '</button>'
            + (c.houseLevel > 0 ? '<button onclick="emitAct({type:\'rescue_demolish\',cityId:\'' + id + '\'})">拆房 +' + fmt(demolitionRefund(id)) + '</button>' : '')
            + '<button class="risk" onclick="emitAct({type:\'sell_city\',cityId:\'' + id + '\',mode:\'direct\',context:{type:\'self_rescue\',playerId:\'' + me.gameId + '\',due:' + pend.due + '}})">出售 +' + fmt(sellAmt) + '</button>'
            + '<button class="risk" onclick="emitAct({type:\'sell_city\',cityId:\'' + id + '\',mode:\'auction\',context:{type:\'self_rescue\',playerId:\'' + me.gameId + '\',due:' + pend.due + '}})">拍卖保底 +' + fmt(floorAmt) + '</button></div>';
        });
        const heldStocks = Object.entries(meP.stocks || {}).filter(([, n]) => n > 0);
        body.innerHTML += '<div class="rule"></div><p class="hint">卖出股票自救（按当前股价，卖出的现金即时到账）：</p>';
        if (heldStocks.length) {
          heldStocks.forEach(([cid, n]) => {
            const st = game.stocks[cid];
            body.innerHTML += '<div class="lrow" style="cursor:default"><span class="nm">' + (game.cities[cid].country ? game.cities[cid].country + '·' : '') + cid + ' ×' + n + ' 股（股价 ' + st.price + '）</span>'
              + '<button class="secondary" onclick="emitAct({type:\'rescue_sell_stock\',cityId:\'' + cid + '\'})">卖出 +' + fmt(n * st.price) + '</button></div>';
          });
        } else {
          body.innerHTML += '<p class="hint">没有可卖出的股票。</p>';
        }
        body.innerHTML += '<div class="row"><button class="risk solid" onclick="emitAct({type:\'rescue_done\'})">放弃（破产）</button></div>';
        openModal('自救');
      }
      break;
  }
}


// ---------- 出售选择 ----------
function sellChoice(cityId) {
  const body = $('modalBody');
  body.innerHTML = '<div class="card-tag">LIQUIDATE</div>'
    + kv('出售标的', (game.cities[cityId].country ? game.cities[cityId].country + '·' : '') + cityId)
    + kv('总价值', fmt(cityTotalValue(game.cities[cityId])))
    + '<div class="row"><button class="secondary" onclick="emitAct({type:\'sell_city\',cityId:\'' + cityId + '\',mode:\'direct\'})">直接出售</button>'
    + '<button class="risk" onclick="emitAct({type:\'sell_city\',cityId:\'' + cityId + '\',mode:\'auction\'})">拍卖</button>'
    + '<button class="textbtn" onclick="closeModal()">取消</button></div>';
  openModal('出售城市');
}

// ---------- 资产总览 ----------
function openAssetOverview() {
  const meP = game.players.find((p) => p.id === me.gameId);
  if (!meP) return;
  if (stockReady()) hideOverlay('stockModal');
  const body = $('modalBody');
  body.innerHTML = '<div class="card-tag">MY ASSETS</div>'
    + (quickGame()?kv('当前净资产（用于排名）',fmt(meP.netAssetSummary.netAssets),'g'):'')
    + kv('总资产', fmt(totalAssetsFor(meP)), 'g')
    + kv('当前现金', fmt(meP.cash))
    + kv('城市 / 抵押', meP.cities.length + ' / ' + meP.cities.filter((id) => game.cities[id].mortgaged).length)
    + kv('机场', (meP.airports || []).length);
  if(meP.assetSummary){const a=meP.assetSummary;body.insertAdjacentHTML('beforeend',kv('地产价值',fmt(a.propertyValue))+kv('股票价值（含待分红）',fmt(a.stockValue))+kv('待结算经营收益',fmt(a.retainedPending))+'<p class="hint">待结算收益计入总资产，派发后才能使用现金；名下持股计入股票价值。</p>');}
  if(quickGame())body.insertAdjacentHTML('beforeend','<details class="net-details"><summary>净资产组成与抵押债务</summary>'+netSummaryHTML(meP.netAssetSummary)+'<p class="hint">净资产用于排名，不是可支付现金。封盘先派息，再按除息后的报价计值。</p></details>');
  appendSelectedOpportunities(body);
  if (meP.cities.length) {
    const wrap = document.createElement('div');
    wrap.className = 'ledger-list';
    for (const id of meP.cities) wrap.appendChild(ledgerCityRow(meP, id, true));
    body.appendChild(wrap);
  } else body.insertAdjacentHTML('beforeend', '<p class="hint">暂无城市资产</p>');
  body.insertAdjacentHTML('beforeend', '<p class="hint">抵押时机：轮到你行动时可随时抵押（竞拍、交易确认期间除外）；每名玩家最多同时抵押 2 座城市；赎回需先落到该城市，本界面不提供赎回。</p>');
  body.insertAdjacentHTML('beforeend', '<div class="row"><button class="secondary" onclick="clickTransferEntry()">股票转让</button>'
    + (stockReady() ? '<button class="primary" onclick="resumeStockView()">继续买卖股票</button>' : '')
    + '<button class="primary" onclick="closeModal()">关闭</button></div>');
  openModal('资产总览');
}


// ---------- 大厅 / 房间 ----------
function syncLobbyControls() {
  const ready = socket.connected && !lobbyRequest && !restoringSession;
  $('nickname').disabled = !!lobbyRequest || restoringSession;
  $('joinCode').disabled = !!lobbyRequest || restoringSession;
  $('btnCreate').disabled = !ready || !$('nickname').value.trim();
  $('btnJoin').disabled = !ready || !($('nickname').value.trim() && $('joinCode').value.trim().length === 6);
  const running=lastRoomState?.started && latestState?.phase!=='game_over';
  $('btnStart').disabled = !ready || !lastRoomState || lastRoomState.hostId !== socket.id || lastRoomState.players.length < 2 || running;
  $('roomMode').disabled=!ready || !lastRoomState || lastRoomState.hostId!==socket.id || running;
  $('roomMode').value=lastRoomState?.gameMode||'normal';
  $('modeDescription').textContent=$('roomMode').value==='quick'?'快速模式：从正式开局起计时30分钟；到时停止新操作，结清分红，按资产减抵押本金和利息后的净资产排名。':'普通模式：保持原回合节奏，最后存活者获胜。';
  for (const [id, event, label, waiting] of [
    ['btnCreate', 'createRoom', '创建房间', '正在创建…'],
    ['btnJoin', 'joinRoom', '加入房间', '正在加入…'],
    ['btnStart', 'startGame', '开始游戏', '正在开始…'],
  ]) {
    $(id).textContent = lobbyRequest?.event === event ? waiting : label;
    $(id).setAttribute('aria-busy', String(lobbyRequest?.event === event));
  }
  const status = $('connectionStatus');
  status.textContent = !socket.connected
    ? (navigator.onLine === false ? '网络已断开，请恢复网络；连接成功后再操作。' : '正在连接服务器…首次访问或服务唤醒可能较慢，请稍候。')
    : restoringSession ? '正在恢复房间身份，请稍候…' : lobbyFeedback;
  status.classList.toggle('hidden', !status.textContent);
}
function sendLobbyRequest(event, data, onSuccess) {
  if (!socket.connected || lobbyRequest || restoringSession) { syncLobbyControls(); return; }
  const request = { event, socketId: socket.id, roomCode: data.roomCode || null,gameMode:data.gameMode };
  lobbyRequest = request;
  lobbyFeedback = event === 'setRoomMode' ? '正在确认模式…' : event === 'startGame' ? '正在开始对局…' : event === 'createRoom' ? '正在创建房间…' : '正在加入房间…';
  syncLobbyControls();
  socket.timeout(10000).emit(event, data, (err, res) => {
    if (lobbyRequest !== request || socket.id !== request.socketId) return;
    lobbyRequest = null;
    if (err || !res?.ok) {
      lobbyFeedback = err ? '请求结果尚未确认，请先核对房间状态或刷新重连；不要连续重复点击。' : res?.error || '操作失败，请重试。';
      toast(lobbyFeedback);
    } else {
      lobbyFeedback = '';
      onSuccess?.(res);
    }
    syncLobbyControls();
  });
}
function setupLobby() {
  const nick = $('nickname'), code = $('joinCode');
  nick.addEventListener('input', syncLobbyControls);
  code.addEventListener('input', syncLobbyControls);
  $('btnCreate').onclick = () => {
    me.name = nick.value.trim();
    sendLobbyRequest('createRoom', { name: me.name }, (res) => {
      if (res.ok) { me.roomCode = res.roomCode; if (pendingToken) { saveReconnect({ roomCode: me.roomCode, name: me.name, token: pendingToken }); pendingToken = null; } else saveReconnect({ roomCode: me.roomCode, name: me.name }); }
    });
  };
  $('btnJoin').onclick = () => {
    me.name = nick.value.trim();
    sendLobbyRequest('joinRoom', { roomCode: code.value.trim(), name: me.name }, (res) => {
      me.roomCode = res.roomCode;
      if (pendingToken) { saveReconnect({ roomCode: me.roomCode, name: me.name, token: pendingToken }); pendingToken = null; } else saveReconnect({ roomCode: me.roomCode, name: me.name });
    });
  };
  $('btnStart').onclick = startSelectedGame;
  $('roomMode').onchange=()=>sendLobbyRequest('setRoomMode',{gameMode:$('roomMode').value});
  $('btnCopyCode').onclick = () => {
    if (navigator.clipboard) navigator.clipboard.writeText($('roomCode').textContent).then(() => toast('房间码已复制')).catch(() => toast('复制失败'));
    else toast('房间码已复制');
  };
  $('btnLeave').onclick = () => {
    if (confirm('确定要退出房间吗？')) { clearReconnect(); location.reload(); }
  };
  $('btnSurrender').onclick = () => { if (confirm('确认认输？')) sendAction({ type: 'surrender' }); };
  $('btnDisband').onclick = () => { if (confirm('解散房间？')) socket.emit('disbandRoom'); };
  $('btnStock').onclick = () => { if (game && game.phase !== 'stock') { toast('仅经过起点时可交易（跨过/停在起点会自动弹出）'); return; } renderStock(); showOverlay('stockModal'); };
  $('btnStockSkip').onclick = finishStockWindow;
  $('btnStockConfirm').onclick = submitStock;
  $('btnStockTransfer').onclick=()=>openTransferPanel('stock');
  $('btnStockAssets').onclick = openAssetOverview;
  $('btnResumeStock').onclick = resumeStockView;
  $('btnRules').onclick = () => { buildRules();showOverlay('rulesModal'); };
  $('btnModalRules').onclick = $('btnStockRules').onclick = $('btnRules').onclick;
  $('btnRulesClose').onclick = () => hideOverlay('rulesModal');
  $('btnRoll').onclick = () => { if (sendAction({ type: 'roll_dice' })) playDiceAnim(); };
  $('btnEndTurn').onclick = $('btnRoll').onclick;
  $('btnAssets').onclick = openAssetOverview;
  $('btnBank').onclick = openBank;
  // 股票买入/卖出与转让步进：事件委托（不依赖内联 onclick）
  const stockListEl = $('stockList');
  if (stockListEl) stockListEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-city]');
    if (!b) return;
    adjStock(b.dataset.city, b.dataset.kind, parseInt(b.dataset.delta, 10));
  });
  const transferListEl = $('transferList');
  if (transferListEl) transferListEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-city]');
    if (!b) return;
    adjTransfer(b.dataset.city, parseInt(b.dataset.delta, 10));
  });
  // 侧栏卡片点击标题折叠/展开（手机可折叠面板）
  const sideEl = $('side');
  const toggleSidePanel = (heading) => {
    heading.parentElement.classList.toggle('closed');
    heading.setAttribute('aria-expanded', String(!heading.parentElement.classList.contains('closed')));
  };
  if (sideEl) sideEl.addEventListener('click', (e) => {
    const h = e.target.closest('.panel h3');
    if (h) toggleSidePanel(h);
  });
  if (sideEl) sideEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const h = e.target.closest('.panel h3');
    if (h) { e.preventDefault(); toggleSidePanel(h); }
  });
  syncLobbyControls();
}

// ---------- Socket ----------
socket.on('roomState', (rs) => {
  const matchingRoomRequest = lobbyRequest?.event === 'createRoom' ? rs.hostId === socket.id : lobbyRequest?.event === 'joinRoom' && rs.roomCode === lobbyRequest.roomCode;
  if (matchingRoomRequest && rs.players.some(p => p.connected && p.name === me.name)) {
    me.roomCode = rs.roomCode;
    if (pendingToken) { saveReconnect({roomCode:me.roomCode,name:me.name,token:pendingToken}); pendingToken=null; }
    lobbyRequest=null; lobbyFeedback='';
  }
  if (!me.roomCode || rs.roomCode !== me.roomCode) return;
  if(lobbyRequest?.event==='setRoomMode' && rs.gameMode===lobbyRequest.gameMode){lobbyRequest=null;lobbyFeedback='';}
  lastRoomState = rs;
  restoringSession = false;
  disconnectedNames = rs.players.filter((p) => !p.connected).map((p) => p.name);
  updateWaitBanner();
  roomHostId = rs.hostId;
  $('roomCode').textContent = rs.roomCode;
  $('playerList').innerHTML = rs.players.map((p) => {
    let badge = '';
    if (p.id === rs.hostId) badge += ' <span class="badge host">房主</span>';
    else if (!p.connected) badge += ' <span class="badge off">已离线</span>';
    else badge += ' <span class="dot on"></span>';
    return '<li>' + escapeHTML(p.name) + badge + '</li>';
  }).join('') + '<li class="slot">等待玩家加入…</li>';
  syncLobbyControls();
  $('roomHint').textContent = rs.started ? '' : rs.players.length < 2 ? '至少 2 名玩家才可开始游戏' : rs.hostId !== socket.id ? '等待房主开始游戏' : '玩家已加入，可以开始游戏';
  if (!rs.started) show('view-room');
});

socket.on('gameState', (state) => {
  if (state.gameId === latestState?.gameId && state.revision < latestState.revision) return;
  if(state.gameId===latestState?.gameId && latestState?.phase==='game_over' && state.phase!=='game_over')return;
  if (state.gameId && state.gameId !== latestState?.gameId) { stopVisualAnimations();for(const el of document.querySelectorAll('.overlay:not(.hidden)'))hideOverlay(el.id);lastPos={};lastEventId=-1;clientLog=[];lastGameJson='';lastRecord=null;stockDraft={};choiceRenderKey='';receiptPending=false;quickTimeAnchor=null; }
  latestState = state;
  updateQuickTime(state.quickTime);
  if (lobbyRequest?.event === 'startGame') { lobbyRequest=null; lobbyFeedback=''; }
  restoringSession = false;
  syncLobbyControls();
  let meP = state.players.find((p) => p.id === state.self?.playerId || p.socketId === socket.id);
  if (!meP) meP = state.players.find((p) => p.name === me.name);
  me.gameId = meP ? meP.id : null;
  syncStockContext(state);
  if (!meP) { console.warn('身份校验失败：昵称=' + me.name + ' socketId=' + socket.id); toast('身份校验失败，请刷新页面重新连接'); }
  if (state.decision) displayTimer({...state.decision,seconds:state.decision.secondsRemaining});
  show('view-game');
  if(state.phase==='game_over'){
    stopVisualAnimations();clearInterval(timerIv);timerIv=null;receiptPending=false;routeDraft=null;
    activeRequest=null;actionPending=false;document.body.classList.remove('action-pending');
    for(const el of document.querySelectorAll('.overlay:not(.hidden)'))hideOverlay(el.id);
    for(const p of state.players)lastPos[p.id]=p.position;
    finishRender(state);return;
  }
  if (diceAnimating || animBusy) { animQueued = state; return; }
  processState(state);
});
socket.on('quickTimeUpdate',updateQuickTime);

socket.on('timerStarted', (t) => {
  if(latestState?.phase==='game_over')return;
  if (t.gameId && latestState?.gameId && (t.gameId !== latestState.gameId || t.decisionId < latestState.decision?.decisionId)) return;
  displayTimer(t);
});
function displayTimer(t) {
  if (timerIv) clearInterval(timerIv); // 防止旧定时器叠加导致跳动
  let remain = t.seconds;
  if (t.paused) {
    $('timer').textContent = '⏸ ' + remain + 's';
    $('choiceTimer').textContent = '已暂停 · '+remain+' 秒';
    $('routeTimer').textContent = '已暂停 · '+remain+' 秒';
    timerIv = null;
    return;
  }
  $('timer').textContent = '⏱ ' + remain + 's';
  $('choiceTimer').textContent = '剩余 '+remain+' 秒';
  $('routeTimer').textContent = '剩余 '+remain+' 秒';
  timerIv = setInterval(() => {
    remain -= 1;
    if (remain <= 0) { clearInterval(timerIv); timerIv = null; }
    $('timer').textContent = remain > 0 ? '⏱ ' + remain + 's' : '';
    $('choiceTimer').textContent = '剩余 '+Math.max(0,remain)+' 秒';
    $('routeTimer').textContent = '剩余 '+Math.max(0,remain)+' 秒';
  }, 1000);
}

socket.on('error', (e) => toast(e.message || '操作失败'));

socket.on('gameRecord', (rec) => {
  if(latestState?.gameId && rec.gameId && latestState.gameId!==rec.gameId)return;
  lastRecord=rec;
  if(game?.phase==='game_over' && $('modalTitle').textContent==='对局结束' && !$('modal').classList.contains('hidden'))renderGameOver();
});

socket.on('reconnectToken', (d) => {
  pendingToken = d.token;
  if (me.roomCode && me.name) saveReconnect({ roomCode: me.roomCode, name: me.name, token: d.token });
});

socket.on('connect', () => {
  lobbyFeedback = '';
  syncLobbyControls();
  const saved = loadReconnect();
  if (saved && saved.roomCode && saved.name && saved.token) {
    if (!confirm('检测到本浏览器保存的对局身份：' + saved.name + '（房间 ' + saved.roomCode + '）。\n是否以该身份重连？')) {
      clearReconnect();
      return;
    }
    me.name = saved.name;
    me.roomCode = saved.roomCode;
    restoringSession = true;
    syncLobbyControls();
    const reconnectSocketId = socket.id;
    socket.timeout(10000).emit('reconnect', { roomCode: saved.roomCode, name: saved.name, token: saved.token }, (err, res) => {
      if (socket.id !== reconnectSocketId || (err && !restoringSession)) return;
      restoringSession = false;
      if (err) lobbyFeedback = '重连结果未确认，请核对房间状态或刷新后重试。';
      else if (!res?.ok) { clearReconnect(); me.roomCode = null; lastRoomState = null; lobbyFeedback = res?.error || '重连失败，请重新加入房间'; show('view-lobby'); }
      syncLobbyControls();
    });
  }
});
socket.on('connect_error', () => { syncLobbyControls(); });
socket.on('disconnect', () => {
  lobbyRequest = null;
  restoringSession = false;
  syncLobbyControls();
});

// ---------- 结算 ----------
function startSelectedGame(){sendLobbyRequest('startGame',{gameMode:lastRoomState?.gameMode||'normal'});}
function returnToRoom(){closeModal();show('view-room');syncLobbyControls();}
function renderGameOver() {
  if(quickGame()&&game.quickResult){renderQuickGameOver();return;}
  const body = $('modalBody');
  const winner = playerById(game.winner);
  const rank = game.rank && game.rank.length ? game.rank : game.players.filter((p) => p.alive).map((p) => p.id);
  let rows = '';
  rank.forEach((id, i) => {
    const p = playerById(id);
    const cls = i === 0 ? 'r1' : (i === 1 ? 'r2' : (i === 2 ? 'r3' : (p && !p.alive ? 'rb' : '')));
    rows += '<tr class="' + cls + '"><td>' + (i + 1) + '</td><td>' + (p ? escapeHTML(p.name) : '—') + (p && !p.alive ? '（已破产）' : '') + (p?.opportunities?'<small class="public-opportunities">'+p.opportunities.selectedIds.map(id=>game.opportunityCatalog[id].name).join(' · ')+'</small>':'') + '</td><td class="mono">' + (p ? fmt(totalAssetsFor(p)) : '—') + '</td></tr>';
  });
  body.innerHTML = '<div class="winner-box">'
    + '<div class="cap">Capital Winner</div>'
    + '<div class="name">' + (winner ? escapeHTML(winner.name) : '—') + '</div>'
    + '<div class="total">最终总资产 ' + (winner ? fmt(totalAssetsFor(winner)) : '—') + '</div>'
    + '<span class="stamp">资本赢家</span></div>'
    + '<div class="rule"></div>'
    + '<table class="rank"><tr><th>名次</th><th>玩家</th><th>总资产</th></tr>' + rows + '</table>'
    + recordEconomySummary(lastRecord)
    + '<div class="btnrow"><button class="secondary" onclick="returnToRoom()">返回房间页</button>'
    + (lastRecord ? '<button class="secondary" onclick="openReplay()">回放对局</button>' : '')
    + (roomHostId === socket.id ? '<button class="secondary" onclick="downloadRecord()">下载对局数据</button>' : '')
    + (roomHostId === socket.id ? '<button class="primary" onclick="startSelectedGame()">重新开始新对局</button>' : '') + '</div>';
  openModal('对局结束');
}
function renderQuickGameOver(){
  const result=game.quickResult,reason={time_limit:'30分钟到时封盘',normal:'最后存活者获胜',disband:'房主提前解散',idle_timeout:'无人在线，房间清理'}[result.reason]||'对局结束';
  const winners=result.winnerIds.map(id=>escapeHTML(playerById(id)?.name||id)).join('、');
  $('modalBody').innerHTML='<div class="winner-box"><div class="cap">快速模式 · '+reason+'</div><div class="name">'+(winners||'无存活玩家')+'</div><p>'+(result.winnerIds.length>1?'并列第一 · ':'')+'用时 '+Math.floor(result.elapsedMs/60000)+'分'+Math.floor(result.elapsedMs/1000%60)+'秒</p></div>'
    +'<table class="rank"><tr><th>名次</th><th>玩家</th><th>最终净资产</th></tr>'+result.ranking.map(p=>'<tr><td>'+p.rank+'</td><td>'+escapeHTML(playerById(p.playerId)?.name||p.playerId)+(p.alive?'':'（已出局）')+'</td><td>'+fmt(p.netAssets)+'</td></tr>').join('')+'</table>'
    +result.ranking.map(p=>'<details class="net-details"><summary>'+escapeHTML(playerById(p.playerId)?.name||p.playerId)+' · 资产与负债明细</summary>'+netSummaryHTML(p.summary)+'</details>').join('')
    +'<details class="net-details"><summary>未成交事项与清算</summary><p>已成立费用及成交保留；未确认事项取消。</p>'+result.cancelled.map(c=>'<p>'+escapeHTML(c.type)+(c.cityId?' · '+escapeHTML(c.cityId):'')+'：已取消</p>').join('')+'<p>已破产城市归银行：'+escapeHTML(result.clearedCityIds.join('、')||'无')+'</p></details>'
    +recordEconomySummary(lastRecord)+'<div class="btnrow"><button class="secondary" onclick="returnToRoom()">返回房间页</button>'+(lastRecord?'<button class="secondary" onclick="openReplay()">回放对局</button><button class="secondary" onclick="downloadRecord()">下载对局数据</button>':'<span class="hint">等待对局记录…</span>')+(roomHostId===socket.id?'<button class="primary" onclick="startSelectedGame()">重新开始新对局</button>':'')+'</div>';
  openModal('对局结束');
}

function downloadRecord() {
  if (!lastRecord) { toast('暂无对局数据'); return; }
  const blob = new Blob([JSON.stringify(lastRecord, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date(lastRecord.endedAt || Date.now()).toISOString().replace(/[:T]/g, '-').slice(0, 19);
  a.download = '环球大亨-' + (lastRecord.roomCode || 'game') + '-' + stamp + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

let replayIndex = 0;
let replayTimer = null;
function recordEconomySummary(record) {
  const values=record?.stats?.economy;
  const note=record&&!record.quick?'<p class="hint">此记录没有快速封盘债务快照，不据此重新计算净资产或排名。</p>':'';
  const quickInfo=record?.quick?'<p class="hint">快速模式 · '+Math.floor(record.quick.elapsedMs/60000)+'分钟 · '+escapeHTML(record.quick.reason)+' · 排名以冻结净资产为准</p>':'';
  if(!values)return note+quickInfo;
  return note+quickInfo+'<details class="record-economy"><summary>实际收益与费用记录</summary>'+kv('基础股息',fmt(values.baseDividends))+kv('机遇奖励',fmt(values.bankBonuses))+kv('保留经营收益',fmt(values.retainedIncome))+kv('股票清算',fmt(values.stockLiquidation))+kv('银行租金补足',fmt(values.bankRentSupplement))+kv('建房节省',fmt(values.buildSavings||0))+kv('机票节省',fmt(values.flightSavings||0))+kv('远航开支（支出）',fmt(values.travelExpenses||0))+'</details>';
}

function openReplay() {
  if (!lastRecord || !lastRecord.events || !lastRecord.events.length) { toast('暂无回放数据'); return; }
  replayIndex = 0;
  replayTimer = null;
  renderReplay();
}
function renderReplay() {
  const evs = lastRecord.events;
  const e = evs[replayIndex];
  const t = (e && e.text ? e.text : '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  $('modalBody').innerHTML = '<div class="replay-head">事件回放 · 第 ' + (replayIndex + 1) + ' / ' + evs.length + ' 条</div>'
    + '<div class="replay-box">' + t + '</div>'
    + recordEconomySummary(lastRecord)
    + '<div class="btnrow"><button class="secondary" onclick="replayPrev()">上一条</button>'
    + '<button class="secondary" onclick="replayPlay()">' + (replayTimer ? '暂停' : '自动播放') + '</button>'
    + '<button class="secondary" onclick="replayNext()">下一条</button>'
    + '<button class="primary" onclick="replayClose()">关闭</button></div>';
  openModal('回放对局');
}
function replayPrev() {
  if (replayIndex > 0) { replayIndex--; renderReplay(); }
}
function replayNext() {
  if (replayIndex < lastRecord.events.length - 1) { replayIndex++; renderReplay(); }
}
function replayPlay() {
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
    renderReplay();
    return;
  }
  replayTimer = setInterval(() => {
    if (replayIndex >= lastRecord.events.length - 1) {
      clearInterval(replayTimer);
      replayTimer = null;
      renderReplay();
      return;
    }
    replayIndex++;
    renderReplay();
  }, 1200);
}
function replayClose() {
  if (replayTimer) { clearInterval(replayTimer); replayTimer = null; }
  closeModal();
  renderGameOver();
}


// ---------- 规则速查 ----------
function rulesContext(state) {
  return {modern:!state||state.ruleVersion===2,expensesEnabled:state?!!state.travelExpense?.enabled:document.body.dataset.economyRevision==='travel-expense-v1'};
}
function organizeRules() {
  const root=$('rulesBody'),context=rulesContext(game);
  const topics=[['turn','回合与起点'],['property','地产经营'],['bank','银行与交易'],['airport','机场飞行'],['stocks','股票'],['opportunities','资讯与经营机遇'],['connection','自救与联机'],['faq','常见疑问']];
  const content=Object.fromEntries(topics.map(([id,title])=>{const section=document.createElement('details');section.className='rules-topic';section.id='rules-topic-'+id;section.open=id==='turn';const heading=document.createElement('summary');heading.textContent=title;section.append(heading);return [id,section];}));
  let group='turn';
  for(const node of [...root.children]){
    const text=node.textContent;
    if(node.tagName==='P'){
      group=/地产与收租|建房与拆房/.test(text)?'property':/抵押与赎回|城市交易/.test(text)?'bank':/^机场/.test(text)?'airport':/^股票/.test(text)?'stocks':/^环球资讯|^经营机遇/.test(text)?'opportunities':/^自救与破产|^事件记录/.test(text)?'connection':'turn';
    }else if(node.tagName==='H4')group=text.includes('城市')?'property':'turn';
    content[group].append(node);
  }
  const add=(id,html)=>{const body=document.createElement('div');body.innerHTML=html;content[id].append(body);};
  add('turn','<p>个人回合是一次轮到本人行动；个人圈是本人实际完成起点结算到下一次起点结算；完整轮是该轮参与的存活玩家各完成个人回合，监狱和极地跳过也算。股票、拍卖和自救等待不提前推进完整轮。首圈购置限制要求所有存活玩家完成一次环球行程。</p>');
  add('bank','<p>购买缺现金时可进入募资，抵押或拆房等操作凑足后确认购买；取消城市购买会拍卖，取消机场购买结束回合。抵押利息按原座位轮转计算，和资讯完整轮次独立。</p>');
  add('connection','<p>任一存活玩家掉线会暂停对局和决定时钟；使用原身份重连恢复实际状态和剩余时间，不能刷新额度。新决定给完整时限，同一决定的无效操作和只读查询不延时。经营机遇共享30秒，超时选当时最左项；交易确认超时拒绝，股票超时结束窗口，飞行超时不飞，购买/建设超时放弃。</p><p>已经扣过的债务不重复扣款。自救补足现金后继续原流程，仍不足可继续处理资产或放弃；无资产则按原破产流程。终局先结算待分红，再按实际总资产记录排名。</p>');
  if(context.modern){
    const catalog=game?.opportunityCatalog||Object.fromEntries((window.RULES_CATALOG?.opportunities||[]).map(o=>[o.id,o]));
    add('opportunities','<h4>十二项经营机遇</h4>'+Object.values(catalog).map(o=>'<article class="rules-opportunity"><h4>'+escapeHTML(o.name)+'</h4><p>'+escapeHTML(game?.routeRevision==='opportunity-routes-v1'?opportunityDescription(o.id):o.description)+'</p></article>').join(''));
    add('stocks','<p>股票是分红权，不是城市产权。每个新起点窗口重新获得买入额度；同一窗口转让、重连或卖出不刷新累计买入。本人城市最多持有4股；他人城市不受个人4股限制，但全城共20股。报价变化先更新显示，再重新确认；连接未确认时获取原操作结果，不能重复下单。</p>');
  }else{
    content.stocks.querySelectorAll('p').forEach(p=>p.remove());
    add('stocks','<p>本局使用历史股票规则：每城20股、本人城市最多4股，每批买入至多3城6股、单城2股，抵押城市不可交易；股价及股息按本局原规则执行，不使用现代经营分红池或累计窗口协议。未确认订单不自动补发，请先核对实际持股和现金。</p>');
    content.opportunities.replaceChildren(content.opportunities.firstChild);
    add('opportunities','<p>本局为历史玩法，不启用现代资讯与经营机遇。</p>');
  }
  add('faq','<h4>为什么飞到自家机场仍扣钱？</h4><p>免费取决于出发机场。例：落在他人唯一的开罗机场先付3000，再飞到自家希思罗机场，无优惠机票5000，目的地不再收通行费。回合结束远航开支另列。</p><h4>下一圈股票额度如何恢复？</h4><p>再次实际经过起点后形成新窗口，已买累计为0；现金、城市资格和20股供给仍须满足。同窗口重连或卖出不会补额度。</p><h4>本人城市4股和窗口2股有什么区别？</h4><p>4股是本人作为城主的持有上限；2股是本窗口该城累计买入上限。其他玩家城市可以持有超过4股。</p><h4>每股分红是多少？</h4><p>现代规则中城市收入10000，20%即2000进入分红池；20股每股100，持2股基础分红200。实际按累计池除20向下取整，机遇额外奖励另算，未售股份和零头归城主；基础分红在城主经过起点等实际派息时到账。旧局使用其原规则。</p><h4>免费机票为什么还有回合结束开支？</h4><p>机票与远航开支是两项费用。启用该修订的新局第81–120完整轮每回合1500，第121轮起3000；免费飞行仍适用，旧局不收费。</p>');
  const nav=document.createElement('nav');nav.className='rules-nav';nav.setAttribute('aria-label','规则主题');
  for(const [id,title]of topics){const a=document.createElement('a');a.href='#rules-topic-'+id;a.textContent=title;a.onclick=e=>{e.preventDefault();content[id].open=true;content[id].scrollIntoView({block:'start'});content[id].firstChild.focus();};nav.append(a);}
  root.replaceChildren(nav,...topics.map(([id])=>content[id]));
}
function buildRules() {
  const expensesEnabled=rulesContext(game).expensesEnabled;
  const expenseRules=expensesEnabled
    ? '<p><b>远航开支：</b>第1–80完整轮不收费，第81–120完整轮每个存活玩家回合结束支付1500，第121完整轮起支付3000；下一档提前2完整轮预告。监狱/极地跳过也计一次，回合内操作与自救不重复收取。现金不足沿用资产自救，凑足后结束原回合。</p>'
    : '<p><b>远航开支：</b>当前适用原经济规则，无新增回合开支。</p>';
  const groups = [
    { title: '奖励（15 张）', items: [
      '环球市长奖 +8000',
      '世博中奖 +6000、最佳城市投资奖 +6000',
      '投资分红 +4000、遗产继承 +4000、慈善拍卖收益 +4000、房产升值 +4000',
      '街头艺演 +2000、彩票小奖 +2000、亲友红包 +2000、退税返还 +2000',
      '捡到钱包 +2000、兼职导游 +2000、广告代言 +2000、发现宝藏 +2000',
    ]},
    { title: '罚款（15 张，上限 8000）', items: [
      '税务稽查 -8000',
      '古迹修缮 -6000、违规施工 -6000',
      '超速罚款 -4000、噪音扰民 -4000、违章改建 -4000、拖欠物业费 -4000',
      '停车费 -2000、乱扔垃圾 -2000、违规摆摊 -2000、宠物随地便溺 -2000',
      '破坏公共设施 -2000、逾期交通罚单 -2000、违规鸣笛 -2000、遗失证照补办 -2000',
    ]},
    { title: '位移（9 张）', items: ['前进 3 格 ×3、后退 3 格 ×3、移动到起点 ×3（照常结算落点）'] },
    { title: '入狱（1 张）', items: ['直接进入最近的上一个监狱'] },
  ];
  $('rulesBody').innerHTML = expenseRules
    + '<p><b>目标：</b>初始资金 150000；购买地产、建设城市、投资股票，坚持到最后获胜。货币为纯数字、无面额。</p>'
    + '<p><b>回合：</b>掷单个骰子（1–10，洗牌袋机制：1–10 各一张洗乱入袋，每 10 次掷骰各点数恰好出现一次、顺序随机，避免连出重复点数）。落点按格触发事件；主行动 90 秒、子流程 60 秒，超时自动执行默认动作。</p>'
    + '<p><b>起点结算：</b>跨过/停在起点按顺序：① 获得 10000 并计算名下城市股息 ② 开放一次股票交易窗口 ③ 若为跨过则继续结算落点事件。</p>'
    + '<p><b>地产与收租：</b>20 城分五大洲（非洲/大洋洲/欧洲/美洲/亚洲）。租金 = 地价 ×（30% + 30%×房屋等级）：0 级 30%、每级 +30%、4 级 150%；地价 ≥15000 的城市满级租金再 +10%（165%）。经过无主城可购买（支付地价）或放弃（进入拍卖）。第一轮（每个玩家从起点出发后回到起点一次）结束前不能购买房产与机场；每圈（起点到起点）限购 4 座城市（机场不限；购买、拍卖与直接出售所得均计入）。购买/获得城市后需再次到达该城市才能建房；经过自有城可建/拆 1 级；抵押中的城市不收租。</p>'
    + '<p><b>建房与拆房：</b>标准建房费用为地价 × 60%，最高 4 级。建设优惠、标准化施工与连锁经营按原费用计算、依次截取，总减免最多 30%。拆房返还最后一级实际建房费用的 60%，转手后仍沿用原实付成本。地产估值与抵押额度按标准价值计算。</p>'
    + '<p><b>抵押与赎回：</b>抵押金 = 城市总价值 × 50%，最多同时抵押 2 座；每轮 5% 利息；抵押可随时进行（竞拍中除外）；赎回需落到该城市（站在城市上）后才能执行，银行/资产总览不提供赎回；破产时未赎回的抵押城市归银行。</p>'
    + '<p><b>城市交易：</b>直接出售——成交价 = 城市总价值，整城售予一名玩家，卖家得 80%、银行提成 20%。拍卖——起拍价 = 总价值 × 75%，每次加价至少 1000，参与玩家掷骰定顺序、轮流加价，最高出价者可随时结束拍卖按当前价成交；其余全放弃时最高出价者获得城市及全部房产；拍卖与直接出售所得均计入每圈 4 座上限，已达上限的玩家不能出价/购买；破产拍卖所得归银行、流拍归银行；自愿出售仅在起点执行（资金不足自救除外）；多城同时拍卖按棋盘格号从小到大。</p>'
    + '<p><b>机场：</b>15000购买，不计入城市圈限购，首圈结束前不可购买。从自己的机场出发，通行费与机票均为0；落到他人机场先付3000×该城主拥有机场数，再选择按最短距离×500及实际优惠付机票。免费条件取决于出发机场，飞往自己的目的机场也不免票。飞抵不再收目的机场通行费、不购买无主机场、不触发起点；飞行或不飞后按原规则结束回合，后期远航开支另计。</p>'
    + '<p><b>极地与监狱：</b>极地（南极 14 / 北极 34）冰冻 1 回合，付 5000 解除或跳过。监狱：21 号最多 3 回合——第 1–3 回合可付 15000 或掷出 1/10 提前出狱，一直放弃则关满 3 回合、第 4 回合自动释放（80 轮前免费，80 轮后缴 30% 出狱费 4500）；11/32 号关押 1 回合——下一回合直接跳过、再下一回合自动释放；关押期间仍可收租、参与拍卖。</p>'
    + '<p><b>机会卡：</b>40 张：奖励 15、罚款 15（四档 1:2:4:8、罚款上限 8000）、位移 9、入狱 1；抽取后放回并重新洗牌（避免同一张连续出现）；位移卡照常结算落点；入狱卡送入最近的上一个监狱；移动到起点同样触发 +10000/股息/股票窗口。</p>'
    + '<p><b>股票交易：</b>每城 20 股，城主最多持有 4 股。初始经营报价为地价的 20%；有主城市可交易，抵押城市股票仍可买卖。每个起点交易窗口累计最多买入 3 城、6 股、单城 2 股；卖出或转让返回不会刷新额度。同一订单同城只能买或卖，卖出其他城市的资金可用于买入。买股金额支付银行。协商转让每回合一笔、最多 3 城、每城 1 股，现金由接收方支付给发起方。</p>'
    + '<p><b>股息与报价：</b>城市实际租金收入的 20% 留作待分红，其余给城主。城主经过起点、产权成功转移前及终局时派息；每股为待分红总额除以 20 向下取整，无主股份与零头归经营者，无租金收入就没有基础股息。股价 = 经营报价 + 每股待分红，派息后自然扣除待分红部分。经营报价按建设、抵押与最近 3 个完整轮次的租金变化，每轮涨跌不超过上一报价的 10%，范围为初始的 50%–200%。普通持股不减租；经营机遇带来的优惠由银行补足，不减少城市入账。</p>'
    + '<p><b>股票清算与资产：</b>产权正常转移保留存活玩家股份，新城主超出四股的部分按派息后报价卖出。城市归银行时先派基础股息，再按经营报价的 50% 清算存活玩家股份；重新经营从初始报价与 20 股开始。派息、清算与重新经营使该城市旧订单失效，需看新报价重新确认。股票含待分红价值，经营者待结算收益另计入总资产，到账前不可花费。</p>'
    + '<p><b>环球资讯：</b>全员完成首次环球行程后，在完整轮次边界发布。每条持续 3 轮，最后一轮预告下一条。地区旺季/淡季使对应大洲城市租金增加/减少 15%，每次最多 3000；建设优惠每人每轮首笔成功建房减原费用 15%，最多 2000；航空促销付费机票减 30%；市场平稳无额外费用变化。地区按城市所属大洲识别，房产颜色仅影响连锁经营。监狱与冰冻跳过也计入完整轮次，拍卖、自救和股票窗口完成前不推进资讯。</p>'
    + '<p><b>经营机遇：</b>开局、首条资讯发布及资讯运行 6 轮后，各进行一次全员三选一。共享 30 秒，到时默认选当前最左项；全局每人只可换一组选项，换组不延时，提交后锁定。所有人完成后一起公开并生效。个人每圈额度仅在本人实际起点结算刷新，重连和完整轮次不刷新；永久机场奖励与换组次数不刷新。租金先算资讯，再算股东礼遇，再算风险准备金；机票资讯与飞行常客按原费相加，总减免最多 50%。</p>'
    + '<p><b>自救与破产：</b>资金不足时可反复抵押/出售/拍卖/拆房/卖出股票凑钱，凑够或主动放弃才破产；破产时发放 15000 救济金，分给资产未达最高的存活玩家（资产最高者不发放）；认输按破产处理（资产归银行、不进入拍卖、不发放救济金）。</p>'
    + '<p><b>事件记录：</b>全局日志，所有玩家的事件可见（保留 500 条、显示 30 条）。</p>'
    + '<h4>城市地皮价格（20 城）</h4>'
    + '<div class="rules-group"><ul>'
    + '<li>黄·非洲：内罗毕（肯尼亚）3600 / 卡萨布兰卡（摩洛哥）4800 / 开罗（埃及）6000 / 开普敦（南非）7200</li>'
    + '<li>紫：奥克兰（新西兰）8400 / 阿姆斯特丹（荷兰）10000 / 悉尼（澳大利亚）10800 / 罗马（意大利）12000</li>'
    + '<li>绿·欧洲：莫斯科（俄罗斯）11000 / 巴黎（法国）13000 / 伦敦（英国）14000 / 柏林（德国）15000</li>'
    + '<li>蓝·美洲：墨西哥城（墨西哥）12000 / 里约热内卢（巴西）13000 / 多伦多（加拿大）14000 / 纽约（美国）19000</li>'
    + '<li>红·亚洲：新加坡（新加坡）14000 / 迪拜（阿联酋）15000 / 东京（日本）17000 / 上海（中国）20000</li>'
    + '</ul></div>'
    + '<h4>机会卡图鉴（40 张）</h4>'
    + groups.map((g) => '<div class="rules-group"><b>' + g.title + '</b><ul>' + g.items.map((i) => '<li>' + i + '</li>').join('') + '</ul></div>').join('');
  if(game?.routeRevision==='opportunity-routes-v1')$('rulesBody').innerHTML+='<p><b>经营机遇 · 调整路线：</b>'+(game.gameMode==='normal'?'原三次初始同步机遇完成后，以本人真实起点结算为基准，每完成3圈获得一次后续机会。等待中的机会合并，不补领旧门槛。':'初始机遇按正式开局第0、5、10分钟依序进入；后续第15、22分钟各一份，等待安全交接。第28分钟取消未打开机会，第30分钟由快速核心封盘。')+'在本人掷骰前处理，一回合最多一次。三选一，满三项须选旧项替换；可以主动跳过，后续不提供换组。'+(game.gameMode==='normal'?'个人30秒':'个人20秒')+'，到时保留原路线并消耗机会。新项只影响之后，本圈已用额度、机场领奖、应急资金领取和实际建房成本保留；初始仍共享30秒、超时选择最左项。应急资金本局仅领一次6000，初始全员结算、后续本人确认成功后到账。</p>';
  organizeRules();
}

setupLobby();
buildRules();



// ===== 规则符合性补充：股票卖出/转让、按城利息、详情条件、票据金额 =====
function redeemCost(p, city) { return mortgageValue(city) + (city.mortgageInterest || 0); }

function stockPreview(state, playerId, draft) {
  const p=state.players.find(x=>x.id===playerId),w=state.self?.stockWindow;
  const used=w?.boughtByCity||{},usedTotal=w?.boughtTotal||0;
  const buys=Object.keys(draft).filter(id=>draft[id].buy>0);
  const selectedTotal=buys.reduce((n,id)=>n+draft[id].buy,0);
  const cities=new Set([...Object.keys(used).filter(id=>used[id]>0),...buys]);
  let cost=0,proceeds=0;
  for(const [id,d] of Object.entries(draft)){const price=state.stocks[id]?.price||0;cost+=(d.buy||0)*price;proceeds+=(d.sell||0)*price;}
  const rows={},errors=[];let quoteChanged=false;
  for(const [id,st] of Object.entries(state.stocks)){
    const c=state.cities[id],d=draft[id]||{buy:0,sell:0},held=p?.stocks[id]||0;
    const supply=20-Object.values(st.holders).reduce((n,v)=>n+v,0);
    const qualified=!!c.ownerId&&!(state.ruleVersion===2?st.clearing:c.mortgaged);
    const ownCap=c.ownerId===playerId?Math.max(0,4-held+(state.ruleVersion===2?0:d.sell)):20;
    const cityRoom=Math.max(0,2-(used[id]||0));
    const totalRoom=Math.max(0,6-usedTotal-selectedTotal+(d.buy||0));
    const otherCities=new Set([...Object.keys(used).filter(cid=>used[cid]>0),...buys.filter(cid=>cid!==id)]);
    const citySlots=otherCities.has(id)||otherCities.size<3;
    const cashRoom=Math.max(0,Math.floor(((p?.cash||0)+proceeds-cost+(d.buy||0)*st.price)/st.price));
    const maxBuy=qualified&&citySlots?Math.max(0,Math.min(cityRoom,totalRoom,supply,ownCap,cashRoom)):0;
    const reasons=[];
    if(!qualified)reasons.push(!c.ownerId?'城市尚未开始经营':'该城市正在清算或旧规则下已抵押');
    if(cityRoom<=d.buy)reasons.push('本窗口单城最多买2股');
    if(totalRoom<=d.buy)reasons.push('本窗口合计最多买6股');
    if(!citySlots)reasons.push('本窗口最多买3座城市');
    if(supply<=d.buy)reasons.push('全城20股供给不足');
    if(ownCap<=d.buy&&c.ownerId===playerId)reasons.push('本人城市最多持有4股');
    if(cashRoom<=d.buy)reasons.push('现金不足（可先选择卖出其他城市股票）');
    const changed=!!(d.buy||d.sell)&&!!d.basis&&(d.basis.price!==st.price||(state.ruleVersion===2&&(d.basis.quoteVersion!==st.quoteVersion||d.basis.listingEpoch!==st.listingEpoch)));
    quoteChanged ||= changed;
    if((d.buy||d.sell)&&(!qualified||d.buy>maxBuy||d.sell>held||!Number.isSafeInteger(d.buy)||!Number.isSafeInteger(d.sell)))errors.push(id+'：'+(reasons.join('；')||'订单数量或持股已变化'));
    rows[id]={held,supply,cityRoom,maxBuy,reasons,qualified,changed,canIncrementBuy:stockReady()&&!actionPending&&!stockContext?.pendingRequest&&stockContext?.status!=='awaiting_state'&&d.buy<maxBuy,canIncrementSell:stockReady()&&!actionPending&&!stockContext?.pendingRequest&&stockContext?.status!=='awaiting_state'&&qualified&&d.sell<held};
  }
  if(cities.size>3||usedTotal+selectedTotal>6)errors.push('超过本窗口累计买入额度');
  if(cost>(p?.cash||0)+proceeds)errors.push('现金不足');
  return {rows,cost,proceeds,netCash:(p?.cash||0)+proceeds-cost,errors,quoteChanged,usedTotal,usedCities:Object.keys(used).filter(id=>used[id]>0).length,selectedTotal,remaining:Math.max(0,6-usedTotal-selectedTotal),cityRemaining:Math.max(0,3-cities.size)};
}
function renderStock() {
  if(!game)return;
  const p=game.players.find(x=>x.id===me.gameId),preview=stockPreview(game,me.gameId,stockDraft);
  const list=$('stockList');list.replaceChildren();
  for(const [id,st] of Object.entries(game.stocks)){
    const row=preview.rows[id],c=game.cities[id],d=stockDraft[id]||{buy:0,sell:0};
    const article=document.createElement('div');article.className='stock-item';article.dataset.stockCity=id;
    const owner=playerById(c.ownerId);
    article.innerHTML='<b>'+escapeHTML((c.country?c.country+'·':'')+id)+'</b><span class="mono">股价 '+fmt(st.price)+'</span><span>所有者：'+escapeHTML(owner?.name||'无主')+'</span><span>持有 '+row.held+' 股 · 市场剩余 '+row.supply+' / 20 股</span><small class="stock-quota">本窗口单城累计剩余 '+row.cityRoom+' 股 · 草稿 '+d.buy+' 股 · 还可选 '+Math.max(0,row.cityRoom-d.buy)+' 股</small>';
    if(game.phase==='stock'&&isMyTurn()){
      const frozen=actionPending||!!stockContext?.pendingRequest||stockContext?.status==='awaiting_state'||!stockReady();
      article.innerHTML+='<div class="stepper"><div class="srow"><span class="lbl">买</span><button '+(frozen||!d.buy?'disabled':'')+' data-city="'+id+'" data-kind="buy" data-delta="-1">−</button><span data-quantity="buy">'+d.buy+'</span><button '+(!row.canIncrementBuy?'disabled':'')+' data-city="'+id+'" data-kind="buy" data-delta="1">+</button></div><div class="srow"><span class="lbl">卖</span><button '+(frozen||!d.sell?'disabled':'')+' data-city="'+id+'" data-kind="sell" data-delta="-1">−</button><span data-quantity="sell">'+d.sell+'</span><button '+(!row.canIncrementSell?'disabled':'')+' data-city="'+id+'" data-kind="sell" data-delta="1">+</button></div></div>';
    }
    const reason=document.createElement('small');reason.className='stock-reasons';reason.textContent=row.reasons.join('；');article.append(reason);
    if(game.ruleVersion===2){
      const note=document.createElement('small');note.className='stock-basis';note.textContent='经营报价 '+fmt(st.operatingPrice)+' + 待分红 '+fmt(Math.floor(st.dividendFund/20))+' / 股。'+(st.priceChange?.reason||'初始报价')+'。上次每股分红 '+fmt(st.lastDividendPerShare||0)+(c.mortgaged?' · 抵押中，股票仍可交易':'');article.append(note);
      const details=document.createElement('details'),summary=document.createElement('summary'),explain=document.createElement('p');summary.textContent='查看报价依据';explain.textContent='初始参考 '+fmt(Math.round(c.price*.2))+'；当前 '+c.houseLevel+' 级房；近三轮实际租金 '+(st.rentHistory||[]).map(fmt).join('、')+(st.priceChange?.target?'；经营目标 '+fmt(st.priceChange.target):'')+'。历史股息仅记录已发收益。';details.append(summary,explain);article.append(details);
    }
    if(row.changed){const change=document.createElement('p');change.className='stock-reasons';change.textContent='报价已变化：原 '+fmt(d.basis.price)+' → 当前 '+fmt(st.price)+(game.ruleVersion===2?'；报价版本 '+d.basis.quoteVersion+' → '+st.quoteVersion+'，经营批次 '+d.basis.listingEpoch+' → '+st.listingEpoch:'')+'。请更新报价后重新确认。';article.append(change);}
    list.append(article);
  }
  $('stockHint').textContent='当前现金 '+fmt(p?.cash||0)+'；'+(game.self?.stockWindow?'本窗口已买 '+preview.usedTotal+'/6 股、'+preview.usedCities+'/3 城；草稿 '+preview.selectedTotal+' 股；剩余可选 '+preview.remaining+' 股、'+preview.cityRemaining+' 城。':'本次订单最多6股、3城、单城2股；仅经过起点时交易。');
  $('stockSummary').textContent='本次买入 '+fmt(preview.cost)+' · 卖出收入 '+fmt(preview.proceeds)+' · 净现金变化 '+fmt(preview.proceeds-preview.cost)+' · 交易后现金 '+fmt(preview.netCash)+(stockContext?.error?'。'+stockContext.error:'')+(preview.errors.length?'。'+preview.errors.join('；'):'');
  const uncertain=stockContext?.status==='unconfirmed',endFailed=stockContext?.status==='end_failed';
  $('btnStockConfirm').textContent=uncertain?'重试获取结果':endFailed?'结束窗口':preview.quoteChanged?'更新报价':'确认交易';
  $('btnStockConfirm').disabled=!stockReady()||actionPending||stockContext?.status==='awaiting_state'||(uncertain&&game.ruleVersion!==2)||(!uncertain&&!endFailed&&!preview.quoteChanged&&(!Object.values(stockDraft).some(d=>d.buy||d.sell)||preview.errors.length>0));
  $('btnStockSkip').disabled=!stockReady()||actionPending||!!stockContext?.pendingRequest||stockContext?.status==='awaiting_state';
  $('btnStockTransfer').disabled=!stockReady()||actionPending||!!stockContext?.pendingRequest||stockContext?.status==='awaiting_state';
}
function adjStock(cityId,kind,delta) {
  if(!stockReady()||actionPending||stockContext.pendingRequest||stockContext.status==='awaiting_state')return;
  const current=stockDraft[cityId]||{buy:0,sell:0};
  const d={...current};
  if(kind==='buy')d.buy=Math.max(0,d.buy+delta);else d.sell=Math.max(0,d.sell+delta);
  if(game.ruleVersion===2&&delta>0){if(kind==='buy')d.sell=0;else d.buy=0;}
  const next={...stockDraft,[cityId]:d},preview=stockPreview(game,me.gameId,next);
  if(delta>0&&preview.errors.length){toast(preview.errors[0]);return;}
  if(!d.basis){const st=game.stocks[cityId];d.basis={price:st.price,quoteVersion:st.quoteVersion,listingEpoch:st.listingEpoch};}
  stockDraft=next;stockContext.error='';renderStock();
}
function finishStockWindow() {
  if(!stockReady()||actionPending||stockContext.pendingRequest)return;
  const context=captureStockContext();stockContext.status='ending';
  sendAction({type:'stock_done'},res=>{
    if(!res.ok){stockContext.status=res.unconfirmed?'unconfirmed':'end_failed';stockContext.error=(stockContext.error.startsWith('交易已成交')?'交易已成交，':'')+'窗口结束'+(res.unconfirmed?'未确认':'失败')+'，请核对当前状态。';}
    else {hideOverlay('stockModal');stockDraft={};}
  },{context});
}
function finishStockAfterReceipt() {
  const receipt=stockContext?.receipt;
  if(!receipt||!stockReady()||actionPending)return;
  if(game.ruleVersion===2&&game.revision<receipt.revision)return;
  stockDraft={};stockContext.receipt=null;stockContext.error='交易已成交。';finishStockWindow();
}
function submitStock() {
  if(!stockReady()||actionPending||stockContext.status==='awaiting_state')return;
  if(stockContext.status==='unconfirmed'){stockContext.pendingRequest?.retrieve();return;}
  if(stockContext.status==='end_failed'){finishStockWindow();return;}
  const preview=stockPreview(game,me.gameId,stockDraft);
  if(preview.quoteChanged){refreshStockDraftQuotes();return;}
  if(preview.errors.length){stockContext.error=preview.errors.join('；');renderStock();return;}
  const orders=[];
  for(const [cityId,d]of Object.entries(stockDraft))for(const side of ['buy','sell'])if(d[side]>0)orders.push({cityId,side,shares:d[side],...(game.ruleVersion===2?{quoteVersion:d.basis.quoteVersion,listingEpoch:d.basis.listingEpoch}:{})});
  if(!orders.length){toast('请先选择交易');return;}
  const context=captureStockContext();stockContext.error='';
  sendAction({type:'stock_trade',orders},res=>{
    if(!res.ok){stockContext.error=res.error||'交易失败，请查看当前状态';stockContext.status=res.unconfirmed?'unconfirmed':'editing';return;}
    stockContext.status='awaiting_state';stockContext.receipt=res;stockContext.error='成交已确认，正在同步状态。';finishStockAfterReceipt();
  },{context});
}
function renderTransferPanel() {
  if (!stockReady() || stockContext?.pendingRequest || actionPending) return;
  const meP = game.players.find((p) => p.id === me.gameId);
  if (!meP || !game || game.phase !== 'stock' || !isMyTurn()) { toast('仅经过起点（股票窗口）时可发起转让'); return; }
  const body = $('modalBody');
  const opts = game.players.filter((p) => p.alive && p.id !== me.gameId).map((p) => '<option value="' + p.id + '">' + escapeHTML(p.name) + '</option>').join('');
  let rows = '';
  let any = false;
  for (const cityId of Object.keys(meP.stocks || {})) {
    const held = meP.stocks[cityId] || 0;
    if (held <= 0) continue;
    any = true;
    const c = game.cities[cityId];
    const n = transferDraft[cityId] || 0;
    rows += '<div class="trow"><span class="nm">' + (c && c.country ? c.country + '·' : '') + cityId + '（持有 ' + held + ' 股）</span>'
      + '<div class="stepper"><button data-city="' + cityId + '" data-delta="-1">−</button><span>' + n + '</span><button data-city="' + cityId + '" data-delta="1">+</button></div></div>';
  }
  if (!any) rows = '<p class="hint">你暂无持有股票可转让（可先经过起点买入）</p>';
  body.innerHTML = '<div class="card-tag">STOCK TRANSFER</div>'
    + '<label>转让给</label><select id="transferTarget" class="mono">' + opts + '</select>'
    + '<div id="transferList">' + rows + '</div>'
    + '<label>附带现金</label><input id="transferCash" type="number" min="0" value="0" class="mono" />'
    + '<div class="btnrow"><button class="primary" onclick="submitTransfer()">发起转让</button>'
    + '<button class="secondary" onclick="returnFromTransfer()">返回</button></div>';
  openModal('股票转让');
  const listEl = $('transferList');
  if (listEl) listEl.onclick = (e) => {
    const b = e.target.closest('button[data-city]');
    if (b) adjTransfer(b.dataset.city, parseInt(b.dataset.delta, 10));
  };
}
function clickTransferEntry() {
  if (!game || game.phase !== 'stock' || !isMyTurn()) { toast('仅经过起点（股票窗口）时可发起转让'); return; }
  openTransferPanel('assets');
}
function openTransferPanel(origin) {
  if (!stockReady() || stockContext?.pendingRequest || actionPending) return;
  transferReturn = { origin, context: captureStockContext() };
  hideOverlay('stockModal');
  renderTransferPanel();
}
function returnFromTransfer() {
  const destination = transferReturn;
  transferReturn = null;
  if (!destination || !isCurrentStockContext(destination.context) || !stockReady()) {
    if ($('modalTitle').textContent === '股票转让') closeModal();
    toast('当前股票窗口已变更，请按最新回合操作。');
    return;
  }
  if (destination.origin === 'stock') {
    closeModal();
    renderStock();
    showOverlay('stockModal');
  } else openAssetOverview();
}
function resumeStockView() {
  if (!stockReady()) return;
  closeModal();
  renderStock();
  showOverlay('stockModal');
}
function adjTransfer(cityId, delta) {
  const next = Math.max(0, (transferDraft[cityId] || 0) + delta);
  if (next > 1) { toast('每座城市最多转让 1 股'); return; }
  const after = Object.assign({}, transferDraft);
  if (next > 0) after[cityId] = next; else delete after[cityId];
  if (Object.keys(after).length > 3) { toast('每笔最多 3 座城市'); return; }
  transferDraft[cityId] = next;
  renderTransferPanel();
}
function submitTransfer() {
  if (!stockReady() || stockContext?.pendingRequest || actionPending) return;
  const targetId = $('transferTarget').value;
  if (!targetId) { toast('请选择转让对象'); return; }
  const items = Object.entries(transferDraft).filter(([, n]) => n > 0).map(([cityId, n]) => ({ cityId, shares: n }));
  if (!items.length) { toast('请选择要转让的股票'); return; }
  const cash = Math.max(0, parseInt($('transferCash').value || '0', 10) || 0);
  sendAction({ type: 'stock_transfer', targetId, items, cash }, (res) => {
    if (!res || !res.ok) {
      toast((res && res.error) || '转让发起失败');
      return;
    }
    Object.keys(transferDraft).forEach((key) => delete transferDraft[key]);
    closeModal();
    toast('已发起转让，等待对方确认');
  });
}
function handleTradeConfirm() {
  const meP = game.players.find((p) => p.id === me.gameId);
  const pend = game && game.pending;
  if (!meP || !pend || pend.type !== 'trade_confirm' || pend.targetId !== me.gameId) return;
  const from = playerById(pend.fromId);
  const items = (pend.items || []).map((it) => it.cityId + ' ×' + it.shares + ' 股').join('、');
  $('modalBody').innerHTML = '<div class="card-tag">TRANSFER</div>'
    + kv('转让方', from ? escapeHTML(from.name) : '—')
    + kv('股票', items)
    + kv('附带现金', fmt(pend.cash || 0), 'g')
    + '<div class="row"><button class="primary" onclick="emitAct({type:\'stock_transfer\',targetId:\'' + me.gameId + '\',accept:true})">接受</button>'
    + '<button class="secondary" onclick="emitAct({type:\'stock_transfer\',targetId:\'' + me.gameId + '\',accept:false})">拒绝</button></div>';
  openModal('股票转让确认');
}
function openBank() {
  const meP = game.players.find((p) => p.id === me.gameId);
  if (!meP) return;
  const body = $('modalBody');
  const un = meP.cities.filter((id) => !game.cities[id].mortgaged);
  const md = meP.cities.filter((id) => game.cities[id].mortgaged);
  const limit = un.reduce((s, id) => s + mortgageValue(game.cities[id]), 0);
  const debt = md.reduce((s, id) => s + mortgageValue(game.cities[id]) + (game.cities[id].mortgageInterest || 0), 0);
  const myTurn = isMyTurn();
  const canOps = myTurn && !['auction_bid', 'direct_sale_ask', 'trade_confirm'].includes(game.phase);
  body.innerHTML = '<div class="card-tag">BANK</div>'
    + kv('当前现金', fmt(meP.cash), 'g')
    + kv('可抵押额度', fmt(limit))
    + kv('当前负债', fmt(debt), 'r')
    + '<div style="margin-top:8px"><label>抵押（自有未抵押城市，上限 2 座）</label>';
  if (un.length) {
    const wrap = document.createElement('div');
    wrap.className = 'ledger-list';
    for (const id of un) {
      const r = document.createElement('div');
      r.className = 'lrow';
      r.innerHTML = '<span class="nm">' + (game.cities[id].country ? game.cities[id].country + '·' : '') + id + '</span><span class="info">可抵押 <b>' + fmt(mortgageValue(game.cities[id])) + '</b></span>';
      const b = document.createElement('button');
      b.className = 'secondary';
      b.textContent = '抵押';
      const atLimit = meP.cities.filter((x) => game.cities[x].mortgaged).length >= 2;
      b.disabled = !canOps || atLimit;
      b.title = !canOps ? '当前阶段无法操作（需轮到你在掷骰阶段）' : (atLimit ? '已达抵押上限（最多抵押 2 座城市）' : '');
      b.onclick = () => { sendAction({ type: 'mortgage', cityId: id }); };
      r.appendChild(b);
      wrap.appendChild(r);
    }
    body.appendChild(wrap);
  } else body.insertAdjacentHTML('beforeend', '<p class="hint">没有可抵押的城市</p>');
  body.insertAdjacentHTML('beforeend', '<p class="hint">赎回需落到对应城市后才能进行（在银行/资产界面不提供，抵押可随时进行）。</p>');
  body.insertAdjacentHTML('beforeend', '<div class="row"><button class="textbtn" onclick="closeModal()">关闭</button></div>');
  openModal('银行交易');
}
function openCityDetail(cityId) {
  const c = game.cities[cityId];
  if (!c) return;
  const owner = playerById(c.ownerId);
  const mine = c.ownerId === me.gameId && isMyTurn();
  const body = $('modalBody');
  const meP = playerById(me.gameId);
  const sq = game.board.find((s) => s.cityId === cityId);
  const onCity = !!(meP && sq && meP.position === sq.id && game.phase === 'waiting_roll');
  const mgCount = meP ? meP.cities.filter((id) => game.cities[id].mortgaged).length : 0;
  const rq=game.self?.quotes.rent[cityId],bq=game.self?.quotes.build[cityId];
  body.innerHTML = '<div class="card-tag">PROPERTY DETAIL</div>'
    + kv('地产名称', (c.country ? c.country + '·' : '') + cityId)
    + kv('地皮价格', fmt(c.price), 'g')
    + kv('持有者', owner ? escapeHTML(owner.name) : '无')
    + kv('房屋等级', (c.houseLevel || 0) + ' 级')
    + kv('标准租金', fmt(c.standardRent ?? rentFor(c)))
    + (rq?.ok ? kv('资讯调整后租金',fmt(rq.income))+(c.ownerId!==me.gameId?quoteExplanation(rq)+'<p class="hint">个人租金减免由银行补足，城市仍按资讯调整后的租金入账。</p>':'') : '')
    + kv('标准升级费用', fmt(Math.round(c.price * 0.6)))
    + (bq?quoteExplanation(bq):'')
    + kv('抵押价值', fmt(mortgageValue(c)))
    + (c.mortgaged ? kv('累计利息', fmt(c.mortgageInterest || 0), 'r') : '')
    + kv('状态', c.mortgaged ? '<span class="mg">已抵押</span>' : '正常')
    + '<div class="row">'
    + (mine && !c.mortgaged && (c.houseLevel || 0) < 4 && onCity && c.buildReady !== false ? '<button class="secondary" '+(bq&&!bq.ok?'disabled':'')+' onclick="emitAct({type:\'build_house\',cityId:\'' + cityId + '\'})">升级</button>' : '')
    + (mine && !c.mortgaged && (c.houseLevel || 0) > 0 && onCity ? '<button class="secondary" onclick="emitAct({type:\'demolish_house\',cityId:\'' + cityId + '\'})">拆房</button>' : '')
    + (mine && !c.mortgaged ? '<button class="secondary" ' + (mgCount >= 2 ? 'disabled title="已达抵押上限（最多抵押 2 座城市）"' : '') + ' onclick="emitAct({type:\'mortgage\',cityId:\'' + cityId + '\'})">抵押</button>' : '')
    + (mine && c.mortgaged && onCity ? '<button class="secondary" ' + (meP && meP.cash < redeemCost(meP, c) ? 'disabled title="现金不足，无法赎回"' : '') + ' onclick="emitAct({type:\'redeem\',cityId:\'' + cityId + '\'})">赎回</button>' : '')
    + (mine && !c.mortgaged && meP && meP.position === 0 ? '<button class="risk" onclick="sellChoice(\'' + cityId + '\')">出售</button>' : '')
    + '<button class="textbtn" onclick="closeModal()">关闭</button></div>';
  openModal('地产详情');
}
function openSquareDetail(squareId) {
  const sq = game && game.board.find((item) => item.id === squareId);
  if (!sq) return;
  if (sq.type === 'city') { openCityDetail(sq.cityId); return; }
  const labels = { start: '起点', airport: '机场', chance: '机会', rest: '休闲', jail: '监狱', pole: '极地' };
  const descriptions = {
    start: '经过或停在起点时按当前规则领取奖励与股息，并开放股票窗口。',
    chance: '落在此格时抽取机会卡，按实际卡面效果结算。',
    rest: '休闲地块不可购买；落点效果以当前对局状态为准。',
    jail: '落在此格时按对应监狱规则处理，具体选项以当次对局提示为准。',
    pole: '落在此格时按极地冰冻规则处理，具体选项以当次对局提示为准。',
    airport: '机场可按当前对局阶段购买或使用，具体操作以落点提示为准。'
  };
  const body = $('modalBody');
  body.innerHTML = '<div class="card-tag">BOARD SQUARE</div>';
  const addRow = (label, value) => {
    const row = document.createElement('div');
    row.className = 'kv';
    const key = document.createElement('span');
    key.textContent = label;
    const val = document.createElement('b');
    val.textContent = value;
    row.append(key, val);
    body.appendChild(row);
  };
  addRow('地块编号', String(sq.id));
  addRow('地块名称', sqLabel(sq));
  addRow('地块类别', labels[sq.type] || '特殊地块');
  if (sq.type === 'airport') {
    const airport = game.airports[sq.airportId];
    const owner = airport && playerById(airport.ownerId);
    addRow('持有者', owner ? owner.name : '无');
    addRow('购买价格', fmt(15000));
    if (owner) addRow('当前机场费', fmt(3000 * owner.airports.length));
  }
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = descriptions[sq.type] || '落点效果以当前对局状态为准。';
  body.appendChild(note);
  const actions = document.createElement('div');
  actions.className = 'row';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'primary';
  close.textContent = '关闭';
  close.onclick = closeModal;
  actions.appendChild(close);
  body.appendChild(actions);
  openModal('地块详情');
}
function openReceipt(ev) {
  const body = $('modalBody');
  const m = /抽到机会卡「(.+?)」([（(]([+-]?\d+)[）)])?/.exec(ev.text || '');
  const name = m ? m[1] : '机会卡';
  const amt = m && m[3] ? parseInt(m[3], 10) : null;
  body.innerHTML = '<div class="receipt">'
    + '<div class="rt">Opportunity</div>'
    + '<div class="rn">' + escapeHTML(name) + '</div>'
    + (amt !== null ? '<div class="ra' + (amt < 0 ? ' neg' : '') + '">' + (amt >= 0 ? '+' : '') + fmt(amt) + '</div>' : '')
    + '<div class="rd">卡面效果已结算，详见右侧事件记录。</div>'
    + '<span class="stamp">机会 · 资本</span></div>'
    + '<div class="row"><button class="primary" onclick="afterReceipt()">确认</button></div>';
  openModal('机会卡');
}
const btnTransfer = document.getElementById('btnTransfer');
if (btnTransfer) btnTransfer.onclick = submitTransfer;
socket.on('gameState', (state) => { if (state && state.phase === 'trade_confirm') handleTradeConfirm(); });
