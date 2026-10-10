'use strict';
/* global stockDraft, game, closeModal */
const test=require('node:test'),assert=require('node:assert/strict'),{boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures'),stocks=require('../src/stocks');
let h;test.before(async()=>{h=await boot();await h.choose();});test.after(async()=>{if(h)await h.close();});
test('股票身份常显，规则帮助返回保留草稿及决定期限',{timeout:30000},async()=>{
 const s=f.game(2);f.own(s,'p0','上海');s.stocks['上海'].holders.p0=3;stocks.syncHolders(s);s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};stocks.openStockWindow(s,'p0');
 const p=h.pages[0];p.setDefaultTimeout(5000);await h.fixture(s);await p.waitForSelector('#stockModal:not(.hidden)');assert.match(await p.locator('.stock-item').filter({has:p.locator('button[data-city="上海"]')}).locator('.stock-identity').textContent(),/3\/4/);
 await p.locator('button[data-city="上海"][data-kind="buy"][data-delta="1"]').click();const draft=await p.evaluate(()=>JSON.stringify(stockDraft)),decision=h.room.actionClock.decisionId,deadline=h.room.actionClock.deadlineMs,state=JSON.stringify(h.room.state);
 await p.locator('.stock-item').filter({has:p.locator('button[data-city="上海"]')}).getByRole('button',{name:'持股与额度说明'}).click();await p.waitForSelector('#rulesModal:not(.hidden)');assert.equal(await p.locator('#rules-topic-stocks').evaluate(el=>el.open),true);await p.click('#btnRulesClose');
 assert.equal(await p.evaluate(()=>JSON.stringify(stockDraft)),draft);assert.equal(h.room.actionClock.decisionId,decision);assert.equal(h.room.actionClock.deadlineMs,deadline);assert.equal(JSON.stringify(h.room.state),state);assert.deepEqual(h.errors,[]);
});

test('有限双人股票帮助与转让返回后成交，再查看资产银行规则',{timeout:30000},async()=>{
 const s=f.game(2);f.own(s,'p1','上海');s.stocks['上海'].holders.p0=1;stocks.syncHolders(s);s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};stocks.openStockWindow(s,'p0');await h.fixture(s);const p=h.pages[0];
 await p.locator('button[data-city="上海"][data-kind="buy"][data-delta="1"]').click();const draft=await p.evaluate(()=>JSON.stringify(stockDraft)),deadline=h.room.actionClock.deadlineMs;await p.locator('[data-stock-city="上海"]').getByRole('button',{name:'持股与额度说明'}).click();await p.click('#btnRulesClose');await p.click('#btnStockTransfer');await p.getByRole('button',{name:'返回',exact:true}).click();assert.equal(await p.evaluate(()=>JSON.stringify(stockDraft)),draft);assert.equal(h.room.actionClock.deadlineMs,deadline);
 await p.click('#btnStockConfirm');await p.waitForFunction(()=>game.players[0].stocks['上海']===2);const before=JSON.stringify(h.room.state),afterDeadline=h.room.actionClock.deadlineMs;
 await p.click('#btnAssets');assert.match(await p.locator('#modalBody').textContent(),/当前现金|股票价值/);await p.evaluate(()=>closeModal());await p.click('#btnBank');assert.equal(await p.locator('#modal').isVisible(),true);await p.evaluate(()=>closeModal());await p.click('#btnRules');assert.ok((await p.locator('#rulesBody').textContent()).includes('城主'));await p.click('#btnRulesClose');assert.equal(JSON.stringify(h.room.state),before);assert.equal(h.room.actionClock.deadlineMs,afterDeadline);assert.deepEqual(h.errors,[]);
});

test('旧局不展示新经营费率与扶持入口',{timeout:30000},async()=>{
 const s=f.game(2);await h.fixture(s);const p=h.pages[0];assert.equal(await p.getByRole('button',{name:'主动经营 · 促销 / 买股 / 建设',exact:true}).count(),0);assert.equal(await p.getByRole('button',{name:'置业扶持 · 查看原价购地机会',exact:true}).count(),0);await p.click('#btnRules');assert.equal(/标准建房费145%|连续6个正常掷骰回合/.test(await p.locator('#rulesBody').textContent()),false);await p.click('#btnRulesClose');
});

test('城主0/2/3/4股身份常显，现金与供给限制使用原结果',{timeout:30000},async()=>{
 const p=h.pages[0];
 for(const held of [0,2,3,4]){
  const s=f.game(2);f.own(s,'p0','上海');s.stocks['上海'].holders.p0=held;stocks.syncHolders(s);s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};stocks.openStockWindow(s,'p0');await h.fixture(s);
  const row=p.locator('[data-stock-city="上海"]');assert.match(await row.locator('.stock-identity').textContent(),new RegExp(held+'/4'));assert.equal(await row.locator('button[data-kind="buy"][data-delta="1"]').isDisabled(),held===4);assert.equal(await row.locator('button[data-kind="sell"][data-delta="1"]').isDisabled(),held===0);assert.ok((await p.locator('#stockHint').textContent()).includes('6'));
 }
 const s=f.game(2);f.own(s,'p1','上海');s.players[0].cash=0;s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};stocks.openStockWindow(s,'p0');await h.fixture(s);const row=p.locator('[data-stock-city="上海"]');assert.equal(await row.locator('button[data-kind="buy"][data-delta="1"]').isDisabled(),true);assert.match(await row.textContent(),/现金/);
 s.players[0].cash=150000;s.stocks['上海'].holders.p1=20;stocks.syncHolders(s);await h.fixture(s);assert.equal(await row.locator('button[data-kind="buy"][data-delta="1"]').isDisabled(),true);assert.match(await row.textContent(),/供给|20/);assert.deepEqual(h.errors,[]);
});
