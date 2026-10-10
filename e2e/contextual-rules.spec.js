'use strict';
/* global stockDraft */
const test=require('node:test'),assert=require('node:assert/strict'),{boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures'),stocks=require('../src/stocks');
let h;test.before(async()=>{h=await boot();await h.choose();});test.after(async()=>{if(h)await h.close();});
test('股票身份常显，规则帮助返回保留草稿及决定期限',{timeout:30000},async()=>{
 const s=f.game(2);f.own(s,'p0','上海');s.stocks['上海'].holders.p0=3;stocks.syncHolders(s);s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};stocks.openStockWindow(s,'p0');
 const p=h.pages[0];p.setDefaultTimeout(5000);await h.fixture(s);await p.waitForSelector('#stockModal:not(.hidden)');assert.match(await p.locator('.stock-item').filter({has:p.locator('button[data-city="上海"]')}).locator('.stock-identity').textContent(),/3\/4/);
 await p.locator('button[data-city="上海"][data-kind="buy"][data-delta="1"]').click();const draft=await p.evaluate(()=>JSON.stringify(stockDraft)),decision=h.room.actionClock.decisionId,deadline=h.room.actionClock.deadlineMs,state=JSON.stringify(h.room.state);
 await p.locator('.stock-item').filter({has:p.locator('button[data-city="上海"]')}).getByRole('button',{name:'持股与额度说明'}).click();await p.waitForSelector('#rulesModal:not(.hidden)');assert.equal(await p.locator('#rules-topic-stocks').evaluate(el=>el.open),true);await p.click('#btnRulesClose');
 assert.equal(await p.evaluate(()=>JSON.stringify(stockDraft)),draft);assert.equal(h.room.actionClock.decisionId,decision);assert.equal(h.room.actionClock.deadlineMs,deadline);assert.equal(JSON.stringify(h.room.state),state);assert.deepEqual(h.errors,[]);
});
