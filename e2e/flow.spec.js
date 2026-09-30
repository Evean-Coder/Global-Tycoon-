'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const spawnedChildren = [];
const spawnedBrowsers = [];

test.afterEach(() => {
  for (const b of spawnedBrowsers) { try { b.close(); } catch {} }
  spawnedBrowsers.length = 0;
  for (const c of spawnedChildren) { try { c.kill(); } catch {} }
  spawnedChildren.length = 0;
});

test('端到端：创建→加入→开局→掷骰→解散→结算→回放', async () => {
  const port = 11000 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  spawnedChildren.push(child);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('服务器启动超时')), 15000);
    child.stdout.on('data', (d) => { if (String(d).includes('运行于')) { clearTimeout(t); resolve(); } });
    child.on('exit', (code) => reject(new Error('服务器退出 code=' + code)));
  });
  const url = 'http://localhost:' + port;
  const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge', headless: true });
  spawnedBrowsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const p1 = await ctx.newPage();
  const socketFrames = [];
  p1.on('websocket', (ws) => {
    ws.on('framereceived', ({ payload }) => socketFrames.push(String(payload)));
  });
  await p1.goto(url, { waitUntil: 'networkidle' });
  await p1.fill('#nickname', '甲');
  await Promise.all([p1.waitForSelector('#roomCode'), p1.click('#btnCreate')]);
  const code = (await p1.textContent('#roomCode')).trim();
  assert.ok(/^\d{6}$/.test(code), '房间码应为 6 位数字');

  const p2 = await ctx.newPage();
  await p2.goto(url, { waitUntil: 'networkidle' });
  await p2.fill('#nickname', '乙');
  await p2.fill('#joinCode', code);
  await p2.click('#btnJoin');
  await p1.waitForTimeout(400);
  await p1.click('#btnStart');
  await p1.waitForSelector('#board .sq', { timeout: 8000 });
  await p1.waitForTimeout(400);
  // 保留原有资产、银行、规则与股票入口及可用条件。
  await p1.click('#btnAssets');
  assert.ok((await p1.textContent('#modalBody')).includes('总资产'), '资产入口应打开资产总览');
  await p1.locator('#modalBody button').last().click();
  await p1.click('#btnBank');
  assert.ok((await p1.textContent('#modalBody')).includes('当前现金'), '银行入口应打开银行交易');
  await p1.locator('#modalBody button').last().click();
  await p1.click('#btnRules');
  assert.equal(await p1.locator('#rulesModal').isVisible(), true, '规则入口应打开规则速查');
  await p1.click('#btnRulesClose');
  assert.equal(await p1.locator('#rulesModal').isVisible(), false, '规则速查应可关闭');
  const beforeStock = socketFrames.length;
  await p1.click('#btnStock');
  assert.equal(await p1.locator('#stockModal').isVisible(), false, '非股票阶段不应打开交易弹窗');
  assert.equal(socketFrames.length, beforeStock, '非股票阶段查看入口不应改变游戏状态');

  // 掷骰（当前行动玩家为甲）
  await p1.emulateMedia({ reducedMotion: 'reduce' });
  const rollBtn = p1.locator('#btnRoll');
  if (await rollBtn.isEnabled()) {
    await rollBtn.click();
    await p1.waitForTimeout(600);
  }
  const logText = await p1.evaluate(() => (document.getElementById('log').textContent || '').trim());
  assert.ok(logText.length > 0, '事件记录应有内容');

  // 房主解散房间（处理 confirm 弹窗）
  p1.on('dialog', (d) => d.accept());
  if (await p1.locator('#modal').isVisible()) {
    // 随机落点可能弹出强制操作窗；仍调用原按钮处理函数验证房主解散流程。
    await p1.evaluate(() => document.getElementById('btnDisband').click());
  } else await p1.click('#btnDisband');
  await p1.waitForSelector('#modal:not(.hidden)', { timeout: 6000 });
  const modalVisible = await p1.evaluate(() => !document.getElementById('modal').classList.contains('hidden'));
  assert.strictEqual(modalVisible, true, '应弹出结算弹窗');
  const bodyText = await p1.evaluate(() => document.getElementById('modalBody').textContent || '');
  assert.ok(bodyText.includes('总资产') || bodyText.includes('排名'), '结算弹窗应含排名/总资产');

  // 回放对局
  const replayBtn = p1.locator('text=回放对局');
  await replayBtn.waitFor({ timeout: 6000 });
  await replayBtn.click();
  await p1.waitForFunction(() => (document.getElementById('modalBody').textContent || '').includes('事件回放'), null, { timeout: 6000 });
  const replayText = await p1.evaluate(() => document.getElementById('modalBody').textContent || '');
  assert.ok(replayText.includes('事件回放'), '回放应显示事件时间线');
  assert.ok(await p1.locator('text=下一条').count() > 0, '回放应有下一条按钮');
  await p1.click('text=关闭');
}, { timeout: 60000 });
