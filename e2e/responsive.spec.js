'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { writeFile } = require('node:fs/promises');
const { chromium } = require('playwright');

test('三端对局：完整棋盘、真实地图、资产和只读地块详情', { timeout: 120000 }, async () => {
  const port = 12000 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('服务器启动超时')), 15000);
      child.stdout.on('data', (data) => {
        if (String(data).includes('运行于')) { clearTimeout(timeout); resolve(); }
      });
      child.on('exit', (code) => { clearTimeout(timeout); reject(new Error('服务器退出 code=' + code)); });
    });
    const url = `http://127.0.0.1:${port}`;
    browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const host = await context.newPage();
    const sentActions = [];
    host.on('websocket', (ws) => ws.on('framesent', ({ payload }) => {
      if (String(payload).includes('"action"')) sentActions.push(String(payload));
    }));
    await host.goto(url);
    if (process.env.FRONTEND_EVIDENCE) await host.screenshot({ path: 'docs/frontend-redesign/final-lobby-1440.png', fullPage: true });
    await host.setViewportSize({ width: 320, height: 800 });
    assert.ok(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '320px 大厅不应横向溢出');
    if (process.env.FRONTEND_EVIDENCE) await host.screenshot({ path: 'docs/frontend-redesign/final-lobby-320.png', fullPage: true });
    assert.equal(await host.locator('#btnCreate').isEnabled(), false, '空昵称时创建入口应禁用');
    assert.equal(await host.locator('#btnJoin').isEnabled(), false, '空房间码时加入入口应禁用');
    await host.fill('#nickname', '甲');
    assert.equal(await host.locator('#btnCreate').isEnabled(), true, '填写昵称后创建入口应启用');
    await host.locator('#btnCreate').press('Enter');
    await host.waitForFunction(() => document.getElementById('roomCode').textContent.trim().length === 6);
    const roomCode = (await host.textContent('#roomCode')).trim();
    const guestContext = await browser.newContext({ viewport: { width: 375, height: 800 }, serviceWorkers: 'block' });
    const guest = await guestContext.newPage();
    await guest.goto(url);
    await guest.fill('#nickname', '乙');
    await guest.fill('#joinCode', roomCode);
    assert.equal(await guest.locator('#btnJoin').isEnabled(), true, '填写六位房间码后加入入口应启用');
    await guest.click('#btnJoin');
    await host.waitForFunction(() => document.getElementById('playerList').textContent.includes('乙'));
    await host.setViewportSize({ width: 320, height: 800 });
    const roomLayout = await host.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      code: document.getElementById('roomCode').textContent.trim(),
      players: document.getElementById('playerList').textContent,
      startVisible: document.getElementById('btnStart').getClientRects().length > 0,
    }));
    assert.ok(roomLayout.overflow <= 1, '320px 房间页不应横向溢出');
    assert.equal(roomLayout.code, roomCode, '手机房间页应显示房间码');
    assert.ok(roomLayout.players.includes('乙'), '手机房间页应显示加入玩家');
    assert.equal(roomLayout.startVisible, true, '手机房间页应保留开始入口');
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
    await host.bringToFront();
    await host.click('#btnCopyCode');
    assert.equal(await host.evaluate(() => navigator.clipboard.readText()), roomCode, '复制房间码应沿用原入口');
    if (process.env.FRONTEND_EVIDENCE) await host.screenshot({ path: 'docs/frontend-redesign/final-room-320.png', fullPage: true });
    for (const name of ['丙', '丁']) {
      const extraContext = await browser.newContext({ serviceWorkers: 'block' });
      const extra = await extraContext.newPage();
      await extra.goto(url);
      await extra.fill('#nickname', name);
      await extra.fill('#joinCode', roomCode);
      await extra.click('#btnJoin');
      await host.waitForFunction((name) => document.getElementById('playerList').textContent.includes(name), name);
    }
    await host.setViewportSize({ width: 1440, height: 900 });
    if (process.env.FRONTEND_EVIDENCE) await host.waitForSelector('#toast', { state: 'hidden' });
    await host.click('#btnStart');
    await host.waitForSelector('#board button.sq');

    const imagesLoaded = await host.evaluate(async () => {
      const paths = ['assets/world-map-ocean.png', 'assets/ocean-surface.png'];
      return Promise.all(paths.map((path) => new Promise((resolve) => {
        const image = new window.Image();
        image.onload = () => resolve(image.naturalWidth > 0);
        image.onerror = () => resolve(false);
        image.src = path;
      })));
    });
    assert.deepEqual(imagesLoaded, [true, true], '世界地图与海面纹理应可解码');

    const measurements = [];
    for (const [width, height] of [[1440, 900], [1366, 768], [1024, 768], [768, 1024], [430, 800], [375, 800], [320, 800]]) {
      await host.setViewportSize({ width, height });
      let baselineTile;
      if (width >= 1366) {
        const legacyStyle = await host.addStyleTag({ content: '#board { grid-template-columns: repeat(12, minmax(0,1fr)); grid-template-rows: repeat(11,minmax(0,1fr)); height: auto; aspect-ratio: 1320 / 840; padding: 12px; gap: 4px; }' });
        baselineTile = await host.locator('#board [data-square-id="1"]').evaluate((tile) => {
          const { width, height } = tile.getBoundingClientRect();
          return { width, height };
        });
        await legacyStyle.evaluate((style) => style.remove());
      }
      await host.evaluate(() => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
      const layout = await host.evaluate(() => {
        const rect = (el) => el.getBoundingClientRect();
        const board = rect(document.getElementById('board'));
        const ledger = rect(document.getElementById('ledger'));
        const dock = rect(document.getElementById('actionBar'));
        const sideOps = rect(document.querySelector('#side .side-ops'));
        const tiles = [...document.querySelectorAll('#board button.sq')].map(rect);
        const start = rect(document.querySelector('#board [data-square-id="0"]'));
        const pieces = [...document.querySelectorAll('#pieces .piece')].map(rect);
        const intersects = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          tileCount: tiles.length,
          boardWithinViewport: board.left >= -1 && board.right <= window.innerWidth + 1,
          ledgerOverTile: tiles.some((tile) => intersects(tile, ledger)),
          dockOverBoard: intersects(board, dock),
          dockOverSideOps: intersects(sideOps, dock),
          piecesOnStart: pieces.length === 4 && pieces.every((piece) => piece.left >= start.left && piece.right <= start.right && piece.top >= start.top && piece.bottom <= start.bottom),
          mapBackground: window.getComputedStyle(document.getElementById('board'), '::before').backgroundImage,
          ledgerText: document.getElementById('ledger').textContent,
          otherPlayer: document.getElementById('sideOthers').textContent,
          events: document.getElementById('log').textContent,
          tileWidth: tiles[1].width,
          tileHeight: tiles[1].height,
        };
      });
      assert.equal(layout.overflow <= 1, true, `${width}px 页面不应横向溢出`);
      assert.equal(layout.tileCount, 42, `${width}px 应显示 42 格`);
      assert.equal(layout.boardWithinViewport, true, `${width}px 棋盘应完整处于视口宽度内`);
      assert.equal(layout.ledgerOverTile, false, `${width}px 资产卡不应遮挡外围地块`);
      assert.equal(layout.dockOverBoard, false, `${width}px 操作栏不应遮挡棋盘`);
      if (width > 1080) assert.equal(layout.dockOverSideOps, false, `${width}px 四人对局侧栏操作应与棋盘同屏可达`);
      assert.equal(layout.piecesOnStart, true, `${width}px 棋子应随棋盘尺寸对齐起点`);
      assert.ok(layout.mapBackground.includes('world-map-ocean.png'), `${width}px 应使用世界地图背景`);
      assert.ok(layout.ledgerText.includes('￥150,000'), `${width}px 资产卡应显示真实初始资产`);
      assert.ok(layout.otherPlayer.includes('乙'), `${width}px 应可查看其他玩家`);
      assert.ok(layout.events.trim().length > 0, `${width}px 应可查看事件区`);
      if (baselineTile) assert.ok(layout.tileWidth * layout.tileHeight > baselineTile.width * baselineTile.height, `${width}px 地块面积应大于旧网格尺寸`);
      measurements.push({ width, height, baselineTile, ...layout });
      if (process.env.FRONTEND_EVIDENCE) await host.screenshot({ path: `docs/frontend-redesign/final-game-${width}.png`, fullPage: true });
    }

    const heading = host.locator('#sideOthers h3');
    await heading.press('Enter');
    assert.equal(await heading.getAttribute('aria-expanded'), 'false', '手机信息卡应能用键盘折叠');
    await heading.press('Space');
    assert.equal(await heading.getAttribute('aria-expanded'), 'true', '手机信息卡应能用键盘展开');
    await host.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bottomClearance = await host.evaluate(() => document.getElementById('actionBar').getBoundingClientRect().top - document.querySelector('#side .side-ops').getBoundingClientRect().bottom);
    assert.ok(bottomClearance >= 0, '滚动到底后侧栏末尾按钮不应被操作栏挡住');
    await host.evaluate(() => window.scrollTo(0, 0));
    await host.setViewportSize({ width: 375, height: 800 });
    const beforeDetails = sentActions.length;
    for (const id of [0, 1, 3, 6, 10, 11, 14]) {
      await host.locator(`#board [data-square-id="${id}"]`).click();
      assert.equal(await host.locator('#modal').isVisible(), true, `${id} 号地块应打开详情`);
      assert.ok((await host.textContent('#modalBody')).trim().length > 0, `${id} 号地块详情不应为空`);
      await host.locator('#modalBody button').last().click();
      assert.equal(await host.locator('#modal').isVisible(), false, `${id} 号地块详情应可关闭`);
    }
    assert.equal(sentActions.length, beforeDetails, '查看地块不得发送游戏动作');
    const cityTile = host.locator('#board [data-square-id="1"]');
    await cityTile.focus();
    await cityTile.press('Enter');
    assert.equal(await host.locator('#modal').isVisible(), true, 'Enter 应打开城市详情');
    await host.locator('#modalBody button').last().click();
    assert.equal(await cityTile.evaluate((el) => document.activeElement === el), true, '关闭详情后应回到地块焦点');
    await cityTile.press('Space');
    assert.equal(await host.locator('#modal').isVisible(), true, 'Space 应打开城市详情');
    await host.locator('#modalBody button').last().click();
    await host.locator('.ledger-open').click();
    assert.ok((await host.textContent('#modalBody')).includes('总资产'), '资产卡应打开完整资产视图');
    await host.keyboard.press('Shift+Tab');
    assert.equal(await host.locator('#modalBody button').last().evaluate((el) => document.activeElement === el), true, '从弹窗标题反向 Tab 应留在弹窗末尾');
    await host.keyboard.press('Tab');
    assert.equal(await host.locator('#modalBody button').first().evaluate((el) => document.activeElement === el), true, '弹窗末尾 Tab 应回到首个操作');
    await host.locator('#modalBody button').last().click();

    await host.route('**/assets/*.png', (route) => route.abort());
    host.once('dialog', (dialog) => dialog.accept());
    await host.reload();
    await host.waitForSelector('#board button.sq');
    const fallback = await host.evaluate(() => ({
      color: window.getComputedStyle(document.getElementById('board'), '::before').backgroundColor,
      pageColor: window.getComputedStyle(document.body).backgroundColor,
      tiles: document.querySelectorAll('#board button.sq').length,
      assets: document.querySelector('#ledger .ledger-open')?.textContent,
    }));
    assert.equal(fallback.tiles, 42, '图片失败后仍应显示棋盘');
    assert.ok(fallback.color && fallback.color !== 'rgba(0, 0, 0, 0)', '地图应有纯色后备');
    assert.ok(fallback.pageColor && fallback.pageColor !== 'rgba(0, 0, 0, 0)', '页面应有纯色后备');
    assert.ok(fallback.assets.includes('查看完整资产'), '图片失败后资产入口仍可用');
    if (process.env.FRONTEND_EVIDENCE) await host.screenshot({ path: 'docs/frontend-redesign/final-fallback-375.png', fullPage: true });
    await host.locator('.ledger-open').click();
    assert.ok((await host.textContent('#modalBody')).includes('总资产'), '图片失败后资产入口仍应打开详情');
    await host.locator('#modalBody button').last().click();

    const offlineContext = await browser.newContext({ serviceWorkers: 'allow' });
    await offlineContext.addInitScript(() => {
      const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
      navigator.serviceWorker.register = async (...args) => {
        if (!navigator.serviceWorker.controller) {
          const oldCache = await window.caches.open('global-tycoon-v2');
          await oldCache.put('legacy-marker', new window.Response('previous-version'));
        }
        return register(...args);
      };
    });
    const offlinePage = await offlineContext.newPage();
    await offlinePage.goto(url);
    await offlinePage.evaluate(() => navigator.serviceWorker.ready);
    await offlinePage.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const cacheNames = await offlinePage.evaluate(() => window.caches.keys());
    assert.equal(cacheNames.includes('global-tycoon-v2'), false, '新版 PWA 激活后应清理旧缓存');
    const cached = await offlinePage.evaluate(async () => {
      const cache = await window.caches.open('global-tycoon-v3-ocean');
      return Promise.all(['assets/world-map-ocean.png', 'assets/ocean-surface.png'].map(async (path) => {
        const response = await cache.match(path);
        return response?.ok && response.headers.get('content-type')?.includes('image/png');
      }));
    });
    assert.deepEqual(cached, [true, true], '两张正式图片应进入 PWA 缓存');
    await offlineContext.setOffline(true);
    await offlinePage.reload();
    assert.ok(await offlinePage.locator('#btnCreate').count(), '断网后应可从缓存加载页面');
    const offlineImages = await offlinePage.evaluate(async () => Promise.all(
      ['assets/world-map-ocean.png', 'assets/ocean-surface.png'].map(async (path) => {
        const response = await window.fetch(path);
        return response.ok && (await response.blob()).type === 'image/png';
      })
    ));
    assert.deepEqual(offlineImages, [true, true], '断网后应从缓存取得地图与海面素材');
    await offlineContext.close();
    if (process.env.FRONTEND_EVIDENCE) await writeFile('docs/frontend-redesign/layout-measurements.json', JSON.stringify({ measurements, bottomClearance, fallback, cacheNames, cached, offlineImages }, null, 2));
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
});

test('三端原操作：真实资产、抵押、股票、强制弹窗、掉线与结算', { timeout: 120000 }, async () => {
  const { server, io, rooms, totalAssets } = require('../server');
  const { snapshot } = require('../src/state');
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge', headless: true });
    const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const guestContext = await browser.newContext({ viewport: { width: 375, height: 800 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    await host.goto(url);
    await host.fill('#nickname', '甲');
    await host.click('#btnCreate');
    await host.waitForFunction(() => document.getElementById('roomCode').textContent.trim().length === 6);
    const code = (await host.textContent('#roomCode')).trim();
    await guest.goto(url);
    await guest.fill('#nickname', '乙');
    await guest.fill('#joinCode', code);
    await guest.click('#btnJoin');
    await host.waitForFunction(() => document.getElementById('playerList').textContent.includes('乙'));
    await host.evaluate('socket.on("gameState", state => { window.e2eState = state; })');
    await host.click('#btnStart');
    await host.waitForSelector('#board button.sq');
    const room = rooms.get(code);
    const cityIds = room.state.board.filter((sq) => sq.type === 'city').slice(0, 3).map((sq) => sq.cityId);
    // 在测试服务中布置稀有状态，随后通过正式按钮、Socket 和规则引擎完成操作。
    room.state.firstRoundDone = true;
    const player = room.state.players[0];
    player.cities = cityIds.slice(0, 2);
    for (const id of player.cities) room.state.cities[id].ownerId = player.id;
    player.airports = [room.state.board.find((sq) => sq.type === 'airport').airportId];
    room.state.airports[player.airports[0]].ownerId = player.id;
    player.stocks[cityIds[2]] = 2;
    room.state.stocks[cityIds[2]].holders[player.id] = 2;
    const publish = () => io.to(`room:${code}`).emit('gameState', { ...snapshot(room.state), events: [] });
    const expectedTotal = '￥' + totalAssets(room.state, player).toLocaleString('zh-CN');
    publish();
    await host.waitForFunction((amount) => document.querySelector('.ledger-total strong').textContent === amount, expectedTotal);
    if (process.env.FRONTEND_EVIDENCE) await host.screenshot({ path: 'docs/frontend-redesign/final-owned-assets-1440.png', fullPage: true });
    assert.ok((await host.textContent('#ledger')).includes('2 座'), '资产卡应显示真实城市数');
    assert.ok((await host.textContent('#ledger')).includes('1 座'), '资产卡应显示真实机场数');
    assert.ok((await host.textContent('#ledger')).includes('2 股'), '资产卡应显示真实持股数');
    const checkDialog = async (selector, label) => {
      const bounds = await host.locator(`${selector} .modal`).boundingBox();
      const viewport = host.viewportSize();
      assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y >= -1 && bounds.y + bounds.height <= viewport.height + 1, `${viewport.width}px ${label}应处于屏幕内`);
    };
    for (const [width, height] of [[1440, 900], [768, 1024], [320, 800]]) {
      await host.setViewportSize({ width, height });
      await host.click('#btnAssets');
      await checkDialog('#modal', '资产弹窗');
      assert.ok((await host.textContent('#modalBody')).includes(expectedTotal), `${width}px 资产总览应与真实状态一致`);
      await host.locator('#modalBody button').last().click();
      await host.click('#btnBank');
      await checkDialog('#modal', '银行弹窗');
      await host.locator('#modalBody button').last().click();
    }
    await host.setViewportSize({ width: 1440, height: 900 });

    await host.locator('.ledger-open').click();
    await host.locator('#modalBody .lrow .nm').first().click();
    assert.equal(await host.textContent('#modalTitle'), '地产详情', '完整资产中城市行应保留详情处理函数');
    await host.locator('#modalBody button').filter({ hasText: /^抵押$/ }).click();
    await host.waitForFunction((id) => window.e2eState.cities[id].mortgaged, cityIds[0]);
    await host.waitForFunction(() => document.getElementById('modal').classList.contains('hidden'));
    assert.equal(room.state.cities[cityIds[0]].mortgaged, true, '城市详情抵押应通过服务端生效');
    await host.click('#btnBank');
    await host.locator('#modalBody button').filter({ hasText: /^抵押$/ }).click();
    await host.waitForFunction((id) => window.e2eState.cities[id].mortgaged, cityIds[1]);
    await host.waitForFunction(() => document.getElementById('modal').classList.contains('hidden'));
    assert.equal(room.state.cities[cityIds[1]].mortgaged, true, '银行抵押按钮应保留处理函数');
    const cashAfterMortgage = '￥' + room.state.players[0].cash.toLocaleString('zh-CN');
    await host.waitForFunction((amount) => document.getElementById('ledger').textContent.includes(amount), cashAfterMortgage);
    assert.ok((await host.textContent('#ledger')).includes(cashAfterMortgage), '抵押后地图资产卡应同步真实现金');

    room.state.phase = 'stock';
    room.state.pending = { playerId: player.id, kind: 'go_stock', after: 'end' };
    publish();
    await host.waitForSelector('#stockModal:not(.hidden)');
    for (const [width, height] of [[1440, 900], [768, 1024], [320, 800]]) {
      await host.setViewportSize({ width, height });
      await host.evaluate(() => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
      const stockLayout = await host.evaluate(() => {
        const button = document.getElementById('btnStockConfirm').getBoundingClientRect();
        const list = document.getElementById('stockList');
        list.scrollTop = list.scrollHeight;
        return { overflow: document.documentElement.scrollWidth - window.innerWidth, buttonWithin: button.left >= -1 && button.right <= window.innerWidth + 1 && button.top >= -1 && button.bottom <= window.innerHeight + 1, scrolled: list.scrollTop > 0 };
      });
      assert.ok(stockLayout.overflow <= 1 && stockLayout.buttonWithin, `${width}px 股票弹窗与确认按钮应处于屏幕内：${JSON.stringify(stockLayout)}`);
      assert.equal(stockLayout.scrolled, true, `${width}px 股票列表应能滚动到末尾`);
      if (process.env.FRONTEND_EVIDENCE && width === 320) await host.screenshot({ path: 'docs/frontend-redesign/final-stock-320.png' });
    }
    await host.click('#btnStockSkip');
    await host.waitForFunction(() => window.e2eState.phase === 'waiting_roll');
    await host.waitForSelector('#stockModal', { state: 'hidden' });
    assert.equal(room.state.phase, 'waiting_roll', '放弃股票交易应沿用原流程推进');

    room.state.turnIndex = 0;
    room.state.phase = 'buy';
    room.state.players[0].position = room.state.board.find((sq) => sq.cityId === cityIds[2]).id;
    room.state.pending = { playerId: player.id, cityId: cityIds[2], context: null };
    publish();
    await host.waitForFunction(() => document.getElementById('modalTitle').textContent === '地产购买' && !document.getElementById('modal').classList.contains('hidden'));
    await host.locator('#modalBody button').filter({ hasText: '确认购买' }).click();
    await host.waitForFunction(({ id, owner }) => window.e2eState.cities[id].ownerId === owner, { id: cityIds[2], owner: player.id });
    await host.waitForFunction(() => document.getElementById('modal').classList.contains('hidden'));
    assert.equal(room.state.cities[cityIds[2]].ownerId, player.id, '手机购买弹窗应通过原动作取得城市');

    room.state.turnIndex = 0;
    room.state.players[0].cash = -500;
    room.state.cities[cityIds[2]].houseLevel = 1;
    room.state.phase = 'self_rescue';
    room.state.pending = { playerId: player.id, kind: 'self_rescue', due: 500, reason: '测试债务' };
    publish();
    await host.waitForFunction(() => document.getElementById('modalTitle').textContent === '自救' && !document.getElementById('modal').classList.contains('hidden'));
    if (process.env.FRONTEND_EVIDENCE) await host.screenshot({ path: 'docs/frontend-redesign/final-rescue-320.png' });
    await host.locator('#modalBody button').filter({ hasText: /^拆房/ }).click();
    await host.waitForFunction((id) => window.e2eState.cities[id].houseLevel === 0 && window.e2eState.players[0].cash >= 0, cityIds[2]);
    await host.waitForFunction(() => document.getElementById('modal').classList.contains('hidden'));
    assert.equal(room.state.cities[cityIds[2]].houseLevel, 0, '手机自救弹窗应保留拆房操作');
    assert.ok(room.state.players[0].cash >= 0, '自救完成后对局应继续');

    for (const [width, height] of [[1440, 900], [768, 1024], [320, 800]]) {
      await host.setViewportSize({ width, height });
      await host.click('#btnRules');
      await checkDialog('#rulesModal', '规则弹窗');
      await host.evaluate(() => { const rules = document.getElementById('rulesBody'); rules.scrollTop = rules.scrollHeight; });
      assert.ok(await host.locator('#rulesBody').evaluate((el) => el.scrollTop > 0), `${width}px 长规则应可滚动`);
      await host.click('#btnRulesClose');
    }
    await guest.evaluate('socket.disconnect()');
    await host.waitForSelector('#waitBanner:not(.hidden)');
    assert.ok((await host.textContent('#timer')).includes('⏸'), '掉线后倒计时应暂停');
    for (const [width, height] of [[1440, 900], [768, 1024], [320, 800]]) {
      await host.setViewportSize({ width, height });
      assert.equal(await host.locator('#waitBanner').isVisible(), true, `${width}px 掉线提示应可见`);
    }
    if (process.env.FRONTEND_EVIDENCE) await host.screenshot({ path: 'docs/frontend-redesign/final-disconnected-320.png' });
    guest.once('dialog', (dialog) => dialog.accept());
    await guest.reload();
    await host.waitForSelector('#waitBanner', { state: 'hidden' });
    await guest.waitForSelector('#board button.sq');
    assert.equal(room.players[1].connected, true, '手机重连应恢复原身份');
    for (const [width, height] of [[1440, 900], [768, 1024], [375, 800]]) {
      await guest.setViewportSize({ width, height });
      await guest.evaluate('socket.emit("action", { type: "unknown" })');
      await guest.waitForSelector('#toast:not(.hidden)');
      const feedback = await guest.locator('#toast').boundingBox();
      assert.ok(feedback && feedback.x >= -1 && feedback.x + feedback.width <= width + 1 && feedback.y >= 0 && feedback.y + feedback.height <= height, `${width}px 错误反馈应清楚可见`);
    }

    // 200% 桌面缩放对应的 CSS 视口，仍能滚动并触达关键操作。
    await host.setViewportSize({ width: 683, height: 384 });
    await host.locator('#btnAssets').click();
    assert.ok((await host.textContent('#modalBody')).includes('总资产'), '200% 缩放对应的视口应可打开资产');
    await host.locator('#modalBody button').last().click();
    await host.locator('#btnBank').click();
    await host.locator('#modalBody button').last().click();
    await host.setViewportSize({ width: 320, height: 800 });
    host.once('dialog', (dialog) => dialog.accept());
    await host.click('#btnDisband');
    await host.waitForFunction(() => document.getElementById('modalTitle').textContent === '对局结束' && !document.getElementById('modal').classList.contains('hidden'));
    assert.ok((await host.textContent('#modalBody')).includes('总资产'), '手机结算应包含真实资产');
    for (const [width, height] of [[1440, 900], [768, 1024], [320, 800]]) {
      await host.setViewportSize({ width, height });
      await checkDialog('#modal', '结算弹窗');
      if (process.env.FRONTEND_EVIDENCE) await host.screenshot({ path: `docs/frontend-redesign/final-settlement-${width}.png` });
    }
  } finally {
    if (browser) await browser.close();
    for (const room of rooms.values()) room.actionClock?.clear();
    rooms.clear();
    await new Promise((resolve) => io.close(resolve));
  }
});
