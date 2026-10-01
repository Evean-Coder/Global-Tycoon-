'use strict';

/* exported afterReceipt, emitAct, downloadRecord, openReplay, replayPrev, replayNext, replayPlay, replayClose, clickTransferEntry, submitTransfer */

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
    document.documentElement.style.setProperty('--board-available', 'calc(100dvh - ' + occupied + 'px)');
  }
}
window.addEventListener('load', fitActionBarPadding);
window.addEventListener('resize', fitActionBarPadding);

const socket = io();
let me = { name: '', roomCode: null };
let game = null;
let awaitingPlayerId = null;
let stockDraft = {};
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
let requestSequence = 0;

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
  for (const id of ['newsBar', 'waitBanner', 'actionBar']) chromeLayout.observe($(id));
}
window.addEventListener('resize', requestPieceLayout);

function show(id) {
  ['view-lobby', 'view-room', 'view-game'].forEach((v) => $(v).classList.toggle('hidden', v !== id));
  fitActionBarPadding();
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2600);
}

const fmt = (n) => '￥' + Math.round(n).toLocaleString('zh-CN');

function saveReconnect(data) { localStorage.setItem('gt_reconnect', JSON.stringify(data)); }
function loadReconnect() { try { return JSON.parse(localStorage.getItem('gt_reconnect') || 'null'); } catch { return null; } }
function clearReconnect() { localStorage.removeItem('gt_reconnect'); }

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
function isMyTurn() { return game?.phase !== 'opportunity_choose' && !game?.decision?.paused && awaitingPlayerId === me.gameId; }
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
      + (owner ? '<span class="own">' + owner + '</span>' : '');
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
  const iv = setInterval(() => {
    i++;
    for (const st of steps) lastPos[st.id] = st.path[Math.min(i, st.path.length) - 1];
    renderPieces();
    if (i >= maxLen) { clearInterval(iv); done(); }
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
  const iv = setInterval(() => {
    el.textContent = '骰子 ' + (1 + Math.floor(Math.random() * 10));
  }, 90);
  setTimeout(() => {
    clearInterval(iv);
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
    + '<div class="pinfo"><span class="pdot" style="background:' + cur.color + '"></span><b>' + cur.name + '</b>' + (isHost ? ' <span class="badge host">房主</span>' : '') + state + '</div>'
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
        return '<div class="pinfo"><span class="pdot" style="background:' + p.color + '"></span><b>' + p.name + '</b>' + ost + '</div>'
          + (p.opportunities?'<div class="public-opportunities">'+p.opportunities.selectedIds.map(id=>game.opportunityCatalog[id].name).join(' · ')+'</div>':'')
          + '<div class="assets">'
          + '<div class="asset-row"><span>总资产</span><b class="total">' + fmt(totalAssetsFor(p)) + '</b></div>'
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
    + '<div class="ledger-total"><span>总资产</span><strong>' + fmt(totalAssetsFor(meP)) + '</strong></div>'
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
  $('btnEndTurn').title = canRoll ? '掷骰并推进本回合' : '当前阶段由系统自动推进';
  if (game.phase === 'opportunity_choose') $('turnInfo').textContent = '经营机遇 · 等待全员选择';
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
  $('btnChoiceRules').onclick=()=>showOverlay('rulesModal');
  $('btnChoiceDisband').hidden=roomHostId!==socket.id;
  $('btnChoiceDisband').onclick=()=>{if(confirm('解散房间并结算当前资产？'))socket.emit('disbandRoom');};
  closeModal();hideOverlay('stockModal');showOverlay('choiceModal');
  if(hadFocus&&(!$('choiceModal').contains(document.activeElement)||document.activeElement.disabled)){
    const target=c.submitted?$('choiceTitle'):$('choiceCards').querySelector('button:not(:disabled)');
    target?.focus({preventScroll:true});
  }
}
function appendSelectedOpportunities(container) {
  if (!game?.self?.opportunities) return;
  const personal=game.self.opportunities,wrap=document.createElement('section');wrap.className='selected-opportunities';
  const heading=document.createElement('h4');heading.textContent='已选机遇';wrap.append(heading);
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
    summary.textContent=item.name+(note?' · '+note:'');p.textContent=item.description;details.append(summary,p);wrap.append(details);
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
  const target = previous?.element?.isConnected && !previous.element.closest('.overlay.hidden')
    ? previous.element
    : (previous?.squareId ? document.querySelector('#board [data-square-id="' + previous.squareId + '"]') : null);
  if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
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
function sendAction(action, callback) {
  if (!game || actionPending) return;
  let payload = {...action};
  if (game.ruleVersion === 2) {
    const q = actionQuote(action);
    if (q) payload.quoteVersion = action.quoteVersion || q.quoteVersion;
    if (action.type === 'rescue_sell_stock') payload.quoteVersion = game.stocks[action.cityId].quoteVersion;
    if (['stock_trade','stock_transfer'].includes(action.type) && game.phase === 'stock') payload.windowId = game.self.stockWindow?.windowId;
    payload = {...payload,gameId:game.gameId,actionId:window.crypto?.randomUUID?.() || socket.id+':'+Date.now()+':'+(++requestSequence),decisionId:game.decision.decisionId,actorRevision:game.self.actorRevision};
  }
  actionPending = true; document.body.classList.add('action-pending');
  const finish = (res) => {
    actionPending = false; document.body.classList.remove('action-pending');
    if (!res?.ok) { toast(res?.error || '操作未确认，请重试'); if (game.phase==='opportunity_choose') $('choiceError').textContent=res?.error || '操作未确认，请重试'; }
    callback?.(res || {ok:false});
  };
  const transmit = (retry) => socket.timeout(5000).emit('action', payload, (err,res) => {
    if (err && !retry && socket.connected) { transmit(true); return; }
    finish(err ? {ok:false,error:'连接未返回结果，请查看当前状态后重试'} : res);
  });
  transmit(false);
}
function emitAct(action) { sendAction(action); }
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const overlay = ['rulesModal', 'choiceModal', 'stockModal', 'modal'].map($).find((el) => !el.classList.contains('hidden'));
  if (!overlay) return;
  const items = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')]
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
        body.innerHTML = '<p>选择飞往的机场（机票 = 距离 × 500' + (game.pending.free ? '，免费' : '') + '）：</p><div class="row">'
          + opts.map((o) => {const q=game.self?.quotes.flight[o.airportId];return '<article class="flight-option"><strong>'+o.airportId+'</strong>'+(q?quoteExplanation(q):'')+'<button class="secondary" onclick="emitAct({type:\'flight\',target:\''+o.airportId+'\'})">'+(q?fmt(q.finalAmount)+' 飞往':'飞往 ')+o.airportId+'</button></article>';}).join('')
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
          + kv('出售方', seller ? seller.name : '—')
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
  const body = $('modalBody');
  body.innerHTML = '<div class="card-tag">MY ASSETS</div>'
    + kv('总资产', fmt(totalAssetsFor(meP)), 'g')
    + kv('当前现金', fmt(meP.cash))
    + kv('城市 / 抵押', meP.cities.length + ' / ' + meP.cities.filter((id) => game.cities[id].mortgaged).length)
    + kv('机场', (meP.airports || []).length);
  if(meP.assetSummary){const a=meP.assetSummary;body.insertAdjacentHTML('beforeend',kv('地产价值',fmt(a.propertyValue))+kv('股票价值（含待分红）',fmt(a.stockValue))+kv('待结算经营收益',fmt(a.retainedPending))+'<p class="hint">待结算收益计入总资产，派发后才能使用现金；名下持股计入股票价值。</p>');}
  appendSelectedOpportunities(body);
  if (meP.cities.length) {
    const wrap = document.createElement('div');
    wrap.className = 'ledger-list';
    for (const id of meP.cities) wrap.appendChild(ledgerCityRow(meP, id, true));
    body.appendChild(wrap);
  } else body.insertAdjacentHTML('beforeend', '<p class="hint">暂无城市资产</p>');
  body.insertAdjacentHTML('beforeend', '<p class="hint">抵押时机：轮到你行动时可随时抵押（竞拍、交易确认期间除外）；每名玩家最多同时抵押 2 座城市；赎回需先落到该城市，本界面不提供赎回。</p>');
  body.insertAdjacentHTML('beforeend', '<div class="row"><button class="secondary" onclick="clickTransferEntry()">股票转让</button><button class="primary" onclick="closeModal()">关闭</button></div>');
  openModal('资产总览');
}


// ---------- 大厅 / 房间 ----------
function setupLobby() {
  const nick = $('nickname'), code = $('joinCode');
  const sync = () => {
    $('btnCreate').disabled = !nick.value.trim();
    $('btnJoin').disabled = !(nick.value.trim() && code.value.trim().length === 6);
  };
  nick.addEventListener('input', sync);
  code.addEventListener('input', sync);
  $('btnCreate').onclick = () => {
    me.name = nick.value.trim();
    socket.emit('createRoom', { name: me.name }, (res) => {
      if (res.ok) { me.roomCode = res.roomCode; if (pendingToken) { saveReconnect({ roomCode: me.roomCode, name: me.name, token: pendingToken }); pendingToken = null; } else saveReconnect({ roomCode: me.roomCode, name: me.name }); }
    });
  };
  $('btnJoin').onclick = () => {
    me.name = nick.value.trim();
    socket.emit('joinRoom', { roomCode: code.value.trim(), name: me.name }, (res) => {
      if (!res.ok) { toast(res.error || '加入失败'); return; }
      me.roomCode = res.roomCode;
      if (pendingToken) { saveReconnect({ roomCode: me.roomCode, name: me.name, token: pendingToken }); pendingToken = null; } else saveReconnect({ roomCode: me.roomCode, name: me.name });
    });
  };
  $('btnStart').onclick = () => socket.emit('startGame');
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
  $('btnStockSkip').onclick = () => { sendAction({ type: 'stock_done' },res=>{if(res.ok){hideOverlay('stockModal');stockDraft={};}}); };
  $('btnStockConfirm').onclick = submitStock;
  $('btnStockTransfer').onclick=()=>{hideOverlay('stockModal');renderTransferPanel();};
  $('btnRules').onclick = () => { showOverlay('rulesModal'); };
  $('btnRulesClose').onclick = () => hideOverlay('rulesModal');
  $('btnRoll').onclick = () => { playDiceAnim(); sendAction({ type: 'roll_dice' }); };
  $('btnEndTurn').onclick = () => { playDiceAnim(); sendAction({ type: 'roll_dice' }); };
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
}

// ---------- Socket ----------
socket.on('roomState', (rs) => {
  if (!me.roomCode || rs.roomCode !== me.roomCode) return;
  disconnectedNames = rs.players.filter((p) => !p.connected).map((p) => p.name);
  updateWaitBanner();
  roomHostId = rs.hostId;
  $('roomCode').textContent = rs.roomCode;
  $('playerList').innerHTML = rs.players.map((p) => {
    let badge = '';
    if (p.id === rs.hostId) badge += ' <span class="badge host">房主</span>';
    else if (!p.connected) badge += ' <span class="badge off">已离线</span>';
    else badge += ' <span class="dot on"></span>';
    return '<li>' + p.name + badge + '</li>';
  }).join('') + '<li class="slot">等待玩家加入…</li>';
  $('btnStart').disabled = rs.hostId !== socket.id || rs.players.length < 2;
  $('roomHint').textContent = rs.started ? '' : '至少 2 名玩家才可开始游戏';
  show('view-room');
});

socket.on('gameState', (state) => {
  if (state.gameId === latestState?.gameId && state.revision < latestState.revision) return;
  if (state.gameId && state.gameId !== latestState?.gameId) { lastPos={};lastEventId=-1;clientLog=[];lastGameJson='';lastRecord=null;stockDraft={};choiceRenderKey='';receiptPending=false; }
  latestState = state;
  let meP = state.players.find((p) => p.id === state.self?.playerId || p.socketId === socket.id);
  if (!meP) meP = state.players.find((p) => p.name === me.name);
  me.gameId = meP ? meP.id : null;
  if (!meP) { console.warn('身份校验失败：昵称=' + me.name + ' socketId=' + socket.id); toast('身份校验失败，请刷新页面重新连接'); }
  if (state.decision) displayTimer({...state.decision,seconds:state.decision.secondsRemaining});
  show('view-game');
  if (diceAnimating || animBusy) { animQueued = state; return; }
  processState(state);
});

socket.on('timerStarted', (t) => {
  if (t.gameId && latestState?.gameId && (t.gameId !== latestState.gameId || t.decisionId < latestState.decision?.decisionId)) return;
  displayTimer(t);
});
function displayTimer(t) {
  if (timerIv) clearInterval(timerIv); // 防止旧定时器叠加导致跳动
  let remain = t.seconds;
  if (t.paused) {
    $('timer').textContent = '⏸ ' + remain + 's';
    $('choiceTimer').textContent = '已暂停 · '+remain+' 秒';
    timerIv = null;
    return;
  }
  $('timer').textContent = '⏱ ' + remain + 's';
  $('choiceTimer').textContent = '剩余 '+remain+' 秒';
  timerIv = setInterval(() => {
    remain -= 1;
    if (remain <= 0) { clearInterval(timerIv); timerIv = null; }
    $('timer').textContent = remain > 0 ? '⏱ ' + remain + 's' : '';
    $('choiceTimer').textContent = '剩余 '+Math.max(0,remain)+' 秒';
  }, 1000);
}

socket.on('error', (e) => toast(e.message || '操作失败'));

socket.on('gameRecord', (rec) => { lastRecord = rec; });

socket.on('reconnectToken', (d) => {
  pendingToken = d.token;
  if (me.roomCode && me.name) saveReconnect({ roomCode: me.roomCode, name: me.name, token: d.token });
});

socket.on('connect', () => {
  const saved = loadReconnect();
  if (saved && saved.roomCode && saved.name && saved.token) {
    if (!confirm('检测到本浏览器保存的对局身份：' + saved.name + '（房间 ' + saved.roomCode + '）。\n是否以该身份重连？')) {
      clearReconnect();
      return;
    }
    me.name = saved.name;
    me.roomCode = saved.roomCode;
    socket.emit('reconnect', { roomCode: saved.roomCode, name: saved.name, token: saved.token }, (res) => {
      if (!res || !res.ok) { clearReconnect(); me.roomCode = null; toast('重连失败，请重新加入房间'); }
    });
  }
});

// ---------- 结算 ----------
function renderGameOver() {
  const body = $('modalBody');
  const winner = playerById(game.winner);
  const rank = game.rank && game.rank.length ? game.rank : game.players.filter((p) => p.alive).map((p) => p.id);
  let rows = '';
  rank.forEach((id, i) => {
    const p = playerById(id);
    const cls = i === 0 ? 'r1' : (i === 1 ? 'r2' : (i === 2 ? 'r3' : (p && !p.alive ? 'rb' : '')));
    rows += '<tr class="' + cls + '"><td>' + (i + 1) + '</td><td>' + (p ? p.name : '—') + (p && !p.alive ? '（已破产）' : '') + (p?.opportunities?'<small class="public-opportunities">'+p.opportunities.selectedIds.map(id=>game.opportunityCatalog[id].name).join(' · ')+'</small>':'') + '</td><td class="mono">' + (p ? fmt(totalAssetsFor(p)) : '—') + '</td></tr>';
  });
  body.innerHTML = '<div class="winner-box">'
    + '<div class="cap">Capital Winner</div>'
    + '<div class="name">' + (winner ? winner.name : '—') + '</div>'
    + '<div class="total">最终总资产 ' + (winner ? fmt(totalAssetsFor(winner)) : '—') + '</div>'
    + '<span class="stamp">资本赢家</span></div>'
    + '<div class="rule"></div>'
    + '<table class="rank"><tr><th>名次</th><th>玩家</th><th>总资产</th></tr>' + rows + '</table>'
    + recordEconomySummary(lastRecord)
    + '<div class="btnrow"><button class="secondary" onclick="closeModal()">返回房间页</button>'
    + (lastRecord ? '<button class="secondary" onclick="openReplay()">回放对局</button>' : '')
    + (roomHostId === socket.id ? '<button class="secondary" onclick="downloadRecord()">下载对局数据</button>' : '')
    + (roomHostId === socket.id ? '<button class="primary" onclick="socket.emit(\'startGame\')">重新开始新对局</button>' : '') + '</div>';
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
  if(!values)return '';
  return '<details class="record-economy"><summary>实际收益与费用记录</summary>'+kv('基础股息',fmt(values.baseDividends))+kv('机遇奖励',fmt(values.bankBonuses))+kv('保留经营收益',fmt(values.retainedIncome))+kv('股票清算',fmt(values.stockLiquidation))+kv('银行租金补足',fmt(values.bankRentSupplement))+kv('建房节省',fmt(values.buildSavings||0))+kv('机票节省',fmt(values.flightSavings||0))+'</details>';
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
function buildRules() {
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
  $('rulesBody').innerHTML = ''
    + '<p><b>目标：</b>初始资金 150000；购买地产、建设城市、投资股票，坚持到最后获胜。货币为纯数字、无面额。</p>'
    + '<p><b>回合：</b>掷单个骰子（1–10，洗牌袋机制：1–10 各一张洗乱入袋，每 10 次掷骰各点数恰好出现一次、顺序随机，避免连出重复点数）。落点按格触发事件；主行动 90 秒、子流程 60 秒，超时自动执行默认动作。</p>'
    + '<p><b>起点结算：</b>跨过/停在起点按顺序：① 获得 10000 并计算名下城市股息 ② 开放一次股票交易窗口 ③ 若为跨过则继续结算落点事件。</p>'
    + '<p><b>地产与收租：</b>20 城分五大洲（非洲/大洋洲/欧洲/美洲/亚洲）。租金 = 地价 ×（30% + 30%×房屋等级）：0 级 30%、每级 +30%、4 级 150%；地价 ≥15000 的城市满级租金再 +10%（165%）。经过无主城可购买（支付地价）或放弃（进入拍卖）。第一轮（每个玩家从起点出发后回到起点一次）结束前不能购买房产与机场；每圈（起点到起点）限购 4 座城市（机场不限；购买、拍卖与直接出售所得均计入）。购买/获得城市后需再次到达该城市才能建房；经过自有城可建/拆 1 级；抵押中的城市不收租。</p>'
    + '<p><b>建房与拆房：</b>标准建房费用为地价 × 60%，最高 4 级。建设优惠、标准化施工与连锁经营按原费用计算、依次截取，总减免最多 30%。拆房返还最后一级实际建房费用的 60%，转手后仍沿用原实付成本。地产估值与抵押额度按标准价值计算。</p>'
    + '<p><b>抵押与赎回：</b>抵押金 = 城市总价值 × 50%，最多同时抵押 2 座；每轮 5% 利息；抵押可随时进行（竞拍中除外）；赎回需落到该城市（站在城市上）后才能执行，银行/资产总览不提供赎回；破产时未赎回的抵押城市归银行。</p>'
    + '<p><b>城市交易：</b>直接出售——成交价 = 城市总价值，整城售予一名玩家，卖家得 80%、银行提成 20%。拍卖——起拍价 = 总价值 × 75%，每次加价至少 1000，参与玩家掷骰定顺序、轮流加价，最高出价者可随时结束拍卖按当前价成交；其余全放弃时最高出价者获得城市及全部房产；拍卖与直接出售所得均计入每圈 4 座上限，已达上限的玩家不能出价/购买；破产拍卖所得归银行、流拍归银行；自愿出售仅在起点执行（资金不足自救除外）；多城同时拍卖按棋盘格号从小到大。</p>'
    + '<p><b>机场：</b>15000 购买（不计入圈限购；第一轮结束前不可购买）；经过他人机场付机场费 = 3000 × 拥有机场数；可再付机票费飞行（每格 500）；飞行到达的机场不再弹出购买。</p>'
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
}

setupLobby();
buildRules();



// ===== 规则符合性补充：股票卖出/转让、按城利息、详情条件、票据金额 =====
const transferDraft = {};

function redeemCost(p, city) { return mortgageValue(city) + (city.mortgageInterest || 0); }

function renderStock() {
  if (!game) return;
  const list = $('stockList');
  list.innerHTML = '';
  const meP = game.players.find((p) => p.id === me.gameId);
  for (const cityId of Object.keys(game.stocks)) {
    const st = game.stocks[cityId];
    const city = game.cities[cityId];
    const owner = playerById(city.ownerId);
    const locked = !city.ownerId || (game.ruleVersion===2?st.clearing:city.mortgaged);
    const div = document.createElement('div');
    div.className = 'stock-item';
    const held = meP ? (meP.stocks[cityId] || 0) : 0;
    const myCityCap = city.ownerId === me.gameId && held >= 4;
    div.innerHTML = '<b>' + (city.country ? city.country + '·' : '') + cityId + '</b><span class="mono">股价 ' + st.price + '</span><span>所有者：' + (owner ? owner.name : '无主') + '</span><span>持有 ' + held + ' 股' + (locked || myCityCap ? '（锁定' + (myCityCap ? '：本城最多持有 4 股（20%）' : '') + '）' : '') + '</span>';
    if (!locked && game.phase === 'stock' && isMyTurn()) {
      const d = stockDraft[cityId] || { buy: 0, sell: 0 };
      const stp = document.createElement('div');
      stp.className = 'stepper';
      stp.innerHTML = '<div class="srow"><span class="lbl">买</span><button data-city="' + cityId + '" data-kind="buy" data-delta="-1">−</button><span>' + d.buy + '</span><button '+(myCityCap?'disabled':'')+' data-city="' + cityId + '" data-kind="buy" data-delta="1">+</button></div>'
        + '<div class="srow"><span class="lbl">卖</span><button data-city="' + cityId + '" data-kind="sell" data-delta="-1">−</button><span>' + d.sell + '</span><button data-city="' + cityId + '" data-kind="sell" data-delta="1">+</button></div>';
      div.appendChild(stp);
    }
    if(game.ruleVersion===2){
      const note=document.createElement('small');note.className='stock-basis';note.textContent='经营报价 '+fmt(st.operatingPrice)+' + 待分红 '+fmt(Math.floor(st.dividendFund/20))+' / 股。'+(st.priceChange?.reason||'初始报价')+'。上次每股分红 '+fmt(st.lastDividendPerShare||0)+(city.mortgaged?' · 抵押中，股票仍可交易':'');div.append(note);
      const details=document.createElement('details'),summary=document.createElement('summary'),explain=document.createElement('p');summary.textContent='查看报价依据';explain.textContent='初始参考 '+fmt(Math.round(city.price*.2))+'；当前 '+city.houseLevel+' 级房；近三轮实际租金 '+(st.rentHistory||[]).map(fmt).join('、')+(st.priceChange?.target?'；经营目标 '+fmt(st.priceChange.target):'')+'。历史股息仅记录已发收益。';details.append(summary,explain);div.append(details);
    }
    list.appendChild(div);
  }
  $('stockHint').textContent = '当前现金：' + fmt(meP ? meP.cash : 0) + '；' + ((game.phase === 'stock' && isMyTurn()) ? '买入最多 6 股（3 城；单城 2 股），卖出不限' : '仅经过起点时可交易');
  if(game.self?.stockWindow){const w=game.self.stockWindow;$('stockHint').textContent+='；本窗口已买 '+w.boughtTotal+' / 6 股、'+Object.keys(w.boughtByCity).length+' / 3 城。派息、清算或重新经营后需按新报价确认。';}
  let cost=0,proceeds=0;for(const [id,d]of Object.entries(stockDraft)){cost+=(d.buy||0)*game.stocks[id].price;proceeds+=(d.sell||0)*game.stocks[id].price;}
  $('stockSummary').textContent='本次买入 '+fmt(cost)+' · 卖出收入 '+fmt(proceeds)+' · '+(cost>=proceeds?'净支出 '+fmt(cost-proceeds):'净收入 '+fmt(proceeds-cost));
}
function adjStock(cityId, kind, delta) {
  const d = stockDraft[cityId] || { buy: 0, sell: 0 };
  if(game.ruleVersion===2){d.quoteVersion=game.stocks[cityId].quoteVersion;d.listingEpoch=game.stocks[cityId].listingEpoch;}
  const meP = game.players.find((p) => p.id === me.gameId);
  const held = meP ? (meP.stocks[cityId] || 0) : 0;
  if (kind === 'sell') {d.sell = Math.max(0, Math.min(held, d.sell + delta));if(game.ruleVersion===2&&d.sell)d.buy=0;}
  else {
    let cap = 2;
    if(game.self?.stockWindow)cap=Math.max(0,2-(game.self.stockWindow.boughtByCity[cityId]||0));
    const c2 = game.cities[cityId];
    if (c2 && c2.ownerId === me.gameId) cap = Math.min(cap, 4 - held);
    d.buy = Math.max(0, Math.min(d.buy + delta, cap));
    if(game.ruleVersion===2&&d.buy)d.sell=0;
  }
  stockDraft[cityId] = d;
  renderStock();
}
function submitStock() {
  const orders = [];
  for (const cityId of Object.keys(stockDraft)) {
    const d = stockDraft[cityId];
    if (d.buy > 0) orders.push({ cityId, side: 'buy', shares: d.buy });
    if (d.sell > 0) orders.push({ cityId, side: 'sell', shares: d.sell });
  }
  if (!orders.length) { toast('请先选择交易'); return; }
  const buys = orders.filter((o) => o.side === 'buy');
  const total = buys.reduce((s, o) => s + o.shares, 0);
  if (buys.length > 3 || total > 6) { toast('买入最多 3 城、合计 6 股、单城 2 股'); return; }
  for (const o of buys) {
    if (o.shares > 2) { toast('单城最多买 2 股'); return; }
  }
  const meP = game.players.find((p) => p.id === me.gameId);
  if (meP) {
    let cost = 0, proceeds = 0;
    for (const o of orders) {
      const st = game.stocks[o.cityId];
      const shares = Math.abs(o.shares);
      if (o.side === 'buy') cost += shares * st.price;
      else proceeds += Math.min(shares, meP.stocks[o.cityId] || 0) * st.price;
    }
    if (cost > meP.cash + proceeds) { toast('现金不足，无法完成购买'); return; }
  }
  if(game.ruleVersion===2)for(const order of orders){order.quoteVersion=stockDraft[order.cityId].quoteVersion;order.listingEpoch=stockDraft[order.cityId].listingEpoch;}
  sendAction({ type: 'stock_trade', orders },res=>{
    if(!res.ok){renderStock();if(game.ruleVersion===2)for(const [id,d]of Object.entries(stockDraft)){d.quoteVersion=game.stocks[id].quoteVersion;d.listingEpoch=game.stocks[id].listingEpoch;}$('btnStockConfirm').textContent='查看报价后重新确认';return;}
    stockDraft={};
    $('btnStockConfirm').textContent='确认交易';
    // 成交回执到达后再结束窗口，失败时保留草稿供修正。
    sendAction({type:'stock_done'},done=>{if(done.ok)hideOverlay('stockModal');});
  });
}
function renderTransferPanel() {
  const meP = game.players.find((p) => p.id === me.gameId);
  if (!meP || !game || game.phase !== 'stock' || !isMyTurn()) { toast('仅经过起点（股票窗口）时可发起转让'); return; }
  const body = $('modalBody');
  const opts = game.players.filter((p) => p.alive && p.id !== me.gameId).map((p) => '<option value="' + p.id + '">' + p.name + '</option>').join('');
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
    + '<button class="secondary" onclick="openAssetOverview()">返回</button></div>';
  openModal('股票转让');
  const listEl = $('transferList');
  if (listEl) listEl.onclick = (e) => {
    const b = e.target.closest('button[data-city]');
    if (b) adjTransfer(b.dataset.city, parseInt(b.dataset.delta, 10));
  };
}
function clickTransferEntry() {
  if (!game || game.phase !== 'stock' || !isMyTurn()) { toast('仅经过起点（股票窗口）时可发起转让'); return; }
  renderTransferPanel();
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
    + kv('转让方', from ? from.name : '—')
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
    + kv('持有者', owner ? owner.name : '无')
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
    + '<div class="rn">' + name + '</div>'
    + (amt !== null ? '<div class="ra' + (amt < 0 ? ' neg' : '') + '">' + (amt >= 0 ? '+' : '') + fmt(amt) + '</div>' : '')
    + '<div class="rd">卡面效果已结算，详见右侧事件记录。</div>'
    + '<span class="stamp">机会 · 资本</span></div>'
    + '<div class="row"><button class="primary" onclick="afterReceipt()">确认</button></div>';
  openModal('机会卡');
}
const btnTransfer = document.getElementById('btnTransfer');
if (btnTransfer) btnTransfer.onclick = submitTransfer;
socket.on('gameState', (state) => { if (state && state.phase === 'trade_confirm') handleTradeConfirm(); });
