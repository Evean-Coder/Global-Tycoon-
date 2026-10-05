'use strict';
/* global game, latestState, sendAction, lastRecord, openReplay */
const test=require('node:test'),assert=require('node:assert/strict');
const {boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures'),st=require('../src/stocks');
const {fixture}=require('../scripts/light-balance/cases');
let h;
test.before(async()=>{h=await boot();for(const page of h.pages)await page.evaluate(()=>{window.__fixtureRevision=latestState.revision;const handler=()=>{window.__fixtureRevision=latestState.revision;};setInterval(handler,10);});});
test.after(async()=>{if(h)await h.close();});
test('统一动作封装 / 同步机遇选择与重选 / 自然规则说明 / 资讯当前与预告',async()=>{
 const [a,b]=h.pages;
 const before=await a.locator('#choiceCards button').evaluateAll(bs=>bs.map(x=>x.dataset.opportunityId));
 await a.click('#btnReroll');await a.waitForFunction(()=>game.self.choice.candidateVersion===2);
 const after=await a.locator('#choiceCards button').evaluateAll(bs=>bs.map(x=>x.dataset.opportunityId));assert.ok(after.every(x=>!before.includes(x)));
 await a.locator('#choiceCards button').first().focus();await a.keyboard.press('Enter');await a.waitForFunction(()=>game.self.choice.submitted);
 assert.equal(await a.evaluate(()=>document.activeElement.closest('#choiceModal')!==null),true,'提交后焦点留在强制选择框');
 await b.locator('#choiceCards button').last().focus();await b.keyboard.press('Tab');await b.keyboard.press('Shift+Tab');
 assert.equal(await b.evaluate(()=>document.activeElement.closest('#choiceModal')!==null),true,'旁人状态更新后键盘仍可操作本人候选');
 assert.equal(await a.locator('#btnReroll').isDisabled(),true);assert.equal(await b.evaluate(()=>game.players[0].opportunities.selectedIds.length),0);
 await b.locator('#choiceCards button').last().click();await a.waitForSelector('#choiceModal',{state:'hidden'});assert.equal(await a.locator('#btnRoll').isEnabled(),true);
 await a.click('#btnRules');const rules=await a.textContent('#rulesBody');assert.ok(rules.includes('派息后自然扣除'));assert.equal(/海克斯|世界局势|世界事件|强化池|扩展模式|经典模式/.test(rules),false);await a.click('#btnRulesClose');
});
test('已选机遇与主动入口 / 城市租金与资讯明细 / 建拆房最终费用 / 服务端资产摘要 / 机票与机场费用边界',async()=>{
 const a=h.pages[0],s=f.game(2);f.own(s,'p0','上海','东京');f.selected(s,'p0','H1','H2','H3');s.players[0].cash=8500;s.world.active={type:'construction',name:'建设优惠季',description:'首次建设优惠',remaining:3};
 await h.fixture(s);await a.click('#btnAssets');assert.ok((await a.textContent('#modalBody')).includes('股票价值（含待分红）'));await a.getByRole('button',{name:'远程施工',exact:true}).click();
 assert.ok((await a.textContent('#modalBody')).includes('8,400'));await a.locator('.remote-city').filter({hasText:'上海'}).getByRole('button',{name:'施工 ￥8,400'}).click();await a.waitForFunction(()=>game.cities['上海'].houseLevel===1);assert.equal(h.room.state.players[0].cash,100);assert.equal(h.room.state.phase,'waiting_roll');
 await a.locator('#board [data-square-id="36"]').click();assert.ok((await a.textContent('#modalBody')).includes('上海'));await a.getByRole('button',{name:'关闭',exact:true}).last().click();
 const rent=f.game(2);f.own(rent,'p1','上海');f.selected(rent,'p0','H6','H11');rent.stocks['上海'].holders.p0=1;st.syncHolders(rent);await h.fixture(rent);await a.locator('#board [data-square-id="36"]').click();assert.ok((await a.textContent('#modalBody')).includes('4,320'));await a.getByRole('button',{name:'关闭',exact:true}).last().click();
 const flight=f.game(2);f.selected(flight,'p0','H7');flight.phase='flight';flight.pending={playerId:'p0',fromAirportId:'开罗国际机场',free:false};flight.world.active={type:'aviation',name:'航空促销',description:'付费机票优惠30%',remaining:3};await h.fixture(flight);assert.ok((await a.textContent('#modalBody')).includes('2,500'));await a.getByRole('button',{name:'￥2,500 飞往伦敦希思罗国际机场',exact:true}).click();await a.waitForFunction(()=>game.turnIndex===1);assert.equal(h.room.state.players[0].cash,147500);
});
test('股票成交回执 / 股票转让回执 / 报价原因与实际历史股息 / 失败订单保留草稿',async()=>{
 const [a,b]=h.pages,s=f.game(2);f.own(s,'p1','上海');s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};st.openStockWindow(s,'p0');s.stocks['上海'].operatingPrice=4400;s.stocks['上海'].dividendFund=2000;s.stocks['上海'].lastDividendPerShare=100;st.refreshPrice(s,'上海','待分红增加');await h.fixture(s);
 await a.waitForSelector('#stockModal:not(.hidden)');await a.locator('button[data-city="上海"][data-kind="buy"][data-delta="1"]').click();
 assert.ok((await a.textContent('#stockList')).includes('经营报价 ￥4,400'));
 await a.evaluate(()=>sendAction({type:'stock_trade',orders:[{cityId:'上海',side:'buy',shares:3,quoteVersion:game.stocks['上海'].quoteVersion,listingEpoch:game.stocks['上海'].listingEpoch}]}));await a.waitForSelector('#toast:not(.hidden)');assert.equal(h.room.state.phase,'stock');assert.equal(await a.locator('#stockModal').isVisible(),true);
 await a.click('#btnStockConfirm');await a.waitForFunction(()=>game.phase!=='stock');assert.equal(h.room.state.players[0].cash,145500);assert.equal(h.room.state.players[1].cash,150000);
 const t=f.game(2);f.own(t,'p1','上海');t.stocks['上海'].holders.p0=1;st.syncHolders(t);t.phase='stock';t.pending={playerId:'p0',kind:'go_stock',after:'end'};st.openStockWindow(t,'p0');await h.fixture(t);await a.click('#btnStockTransfer');await a.locator('#transferList button[data-city="上海"][data-delta="1"]').click();await a.fill('#transferCash','500');await a.getByRole('button',{name:'发起转让',exact:true}).click();await b.waitForSelector('#modal:not(.hidden)');await b.getByRole('button',{name:'接受',exact:true}).click();await a.waitForFunction(()=>game.phase==='stock');assert.equal(h.room.state.players[0].cash,150500);assert.equal(h.room.state.players[1].cash,149500);assert.equal(h.room.state.stocks['上海'].holders.p1,1);
});
test('结构化收益和旧记录 / 普通流程回归',async()=>{
 const terminal=f.game(2);terminal.status='over';terminal.phase='game_over';terminal.winner='p0';terminal.rank=['p0','p1'];await h.fixture(terminal);
 h.room.lastEvents=[{type:'chance',text:terminal.players[0].name+' 抽到机会卡：奖励'}];h.room.lastEventBase=99999;h.api.emitGame(h.room);
 await h.pages[0].waitForFunction(()=>game.events.some(e=>e.id===99999));
 assert.ok((await h.pages[0].textContent('#modalBody')).includes('最终总资产'),'终局优先，机会卡不会覆盖结算');
 const a=h.pages[0];assert.equal(await a.evaluate(()=>{lastRecord={schema:'global-tycoon.game-record.v1',events:[{text:'旧记录：甲购买上海'}]};openReplay();return lastRecord.schema;}),'global-tycoon.game-record.v1');assert.ok((await a.textContent('#modalBody')).includes('旧记录'));assert.equal((await a.textContent('#modalBody')).includes('机遇奖励'),false);
 assert.deepEqual(h.errors,[]);
});

test('远航预告→收费不足→抵押自救→换人→自然终局记录与回放',async()=>{
 h.room.gameRecord=null;h.room.events=[];h.room.eventSeq=0;
 const [a,b]=h.pages,s=fixture();s.economyRevision='travel-expense-v1';s.travelExpenseReceipts={};s.roundFlow.index=79;f.own(s,'p0','上海');
 await h.fixture(s);assert.ok((await a.textContent('#newsBar')).includes('2 个完整轮后'));
 await a.click('#btnRules');assert.ok((await a.textContent('#rulesBody')).includes('第81–120完整轮'));await a.click('#btnRulesClose');
 const ending=fixture();ending.economyRevision='travel-expense-v1';ending.travelExpenseReceipts={};ending.roundFlow.index=81;f.own(ending,'p0','上海');ending.players[0].cash=0;
 ending.phase='stock';ending.pending={playerId:'p0',after:'end'};st.openStockWindow(ending,'p0');await h.fixture(ending);
 await a.click('#btnStockSkip');await a.waitForFunction(()=>game.phase==='self_rescue');
 assert.equal(h.room.state.players[0].cash,-1500);assert.ok((await a.textContent('#modalBody')).includes('1,500'));
 await a.getByRole('button',{name:'抵押 +￥10,000',exact:true}).click();await a.waitForFunction(()=>game.turnIndex===1);
 assert.equal(h.room.state.players[0].cash,8500);assert.equal(h.room.events.filter(e=>e.kind==='travel_expense').length,1);
 await b.evaluate(()=>sendAction({type:'surrender'}));await a.waitForFunction(()=>game.status==='over');
 assert.equal(h.room.gameRecord.stats.economy.travelExpenses,1500);
 await a.evaluate(record=>{lastRecord=record;openReplay();},h.room.gameRecord);
 await a.locator('.record-economy summary').click();assert.ok((await a.textContent('.record-economy')).includes('远航开支（支出）'));
 assert.ok((await a.textContent('.record-economy')).includes('1,500'));assert.equal(h.room.gameRecord.winner,'p0');
 assert.deepEqual(h.errors,[]);
});
