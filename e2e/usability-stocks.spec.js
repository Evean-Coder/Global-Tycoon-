'use strict';
/* global latestState, game, socket, sendAction, actionPending, stockDraft, finishRender */
const test=require('node:test'),assert=require('node:assert/strict');
const {boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures'),st=require('../src/stocks');
let h;const timeout=60000;
test.before(async()=>{h=await boot();await h.choose();for(const p of h.pages)await p.evaluate(()=>setInterval(()=>{window.__fixtureRevision=latestState?.revision||0;},10));});
test.after(async()=>{if(h)await h.close();});
function stock(){const s=f.game(2);f.own(s,'p1','上海','东京','巴黎','伦敦');s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};st.openStockWindow(s,'p0');return s;}
const plus=(p,id)=>p.locator('button[data-city="'+id+'"][data-kind="buy"][data-delta="1"]');
async function fixture(s){await h.fixture(s);await h.pages[0].waitForSelector('#stockModal:not(.hidden)');}
async function intercept(page,mode){await page.evaluate(mode=>{
 window.__savedTimeout=socket.timeout.bind(socket);window.__acks=[];window.__sent=[];
 socket.timeout=ms=>({emit(event,payload,cb){window.__sent.push(JSON.parse(JSON.stringify(payload)));return window.__savedTimeout(ms).emit(event,payload,(err,res)=>{
  if(event==='action'&&payload.type==='stock_trade'){
   if(mode==='hold')window.__acks.push(()=>cb(err,res));else cb(new Error('模拟丢失回执'));
  }else cb(err,res);
 });}});
 },mode);}
async function restore(page){await page.evaluate(()=>{socket.timeout=window.__savedTimeout;});}
test('连续实际起点两次买入3城各2股', {timeout},async()=>{
 const p=h.pages[0];const s=stock();s.phase='waiting_roll';s.pending=null;s.firstRoundDone=true;s.players[0].position=41;s.diceBag=[1];s.stockWindow=null;
 await h.fixture(s);await p.click('#btnRoll');await p.waitForSelector('#stockModal:not(.hidden)');
 for(const id of ['上海','东京','巴黎']){await plus(p,id).click();await plus(p,id).click();}await p.click('#btnStockConfirm');await p.waitForFunction(()=>latestState.phase!=='stock');
 const next=globalThis.structuredClone(h.room.state);next.turnIndex=0;next.turnId++;next.phase='waiting_roll';next.pending=null;next.players[0].position=41;next.diceBag=[1];await h.fixture(next);await p.click('#btnRoll');await p.waitForSelector('#stockModal:not(.hidden)');
 assert.equal(h.room.state.stockWindow.boughtTotal,0);assert.deepEqual(await p.evaluate(()=>stockDraft),{});
 for(const id of ['上海','东京','巴黎']){await plus(p,id).click();await plus(p,id).click();}await p.click('#btnStockConfirm');await p.waitForFunction(()=>latestState.phase!=='stock');
 for(const id of ['上海','东京','巴黎'])assert.equal(h.room.state.players[0].stocks[id],4);assert.equal(h.room.state.players[0].cash,130000);
});
test('失败、未提交、超时草稿不带入新窗口', {timeout},async()=>{
 const p=h.pages[0];
 for(const mode of ['未提交','失败','超时']){
  await fixture(stock());await plus(p,'上海').click();
  if(mode==='失败')await p.evaluate(()=>sendAction({type:'stock_trade',orders:[{cityId:'上海',side:'buy',shares:1,quoteVersion:game.stocks['上海'].quoteVersion-1,listingEpoch:game.stocks['上海'].listingEpoch}]}));
  if(mode==='超时'){h.room.actionClock.remainingMs=0;h.api.runAction(h.room,null,{type:'stock_done'},'timeout');}
  await fixture(stock());assert.deepEqual(await p.evaluate(()=>stockDraft),{});assert.equal(await p.locator('[data-stock-city="上海"] [data-quantity="buy"]').textContent(),'0');
 }
});
test('迟到成功或失败不能污染新草稿或解除新请求锁', {timeout},async()=>{
 const p=h.pages[0];await fixture(stock());await intercept(p,'hold');await plus(p,'上海').click();await p.click('#btnStockConfirm');await p.waitForFunction(()=>window.__acks.length===1);
 await fixture(stock());await plus(p,'东京').click();await p.click('#btnStockConfirm');await p.waitForFunction(()=>window.__acks.length===2);
 await p.evaluate(()=>window.__acks[0]());assert.equal(await p.evaluate(()=>actionPending),true);assert.equal(await p.evaluate(()=>stockDraft['东京'].buy),1);assert.equal(await p.locator('#stockModal').isVisible(),true);
 await p.evaluate(()=>window.__acks[1]());await p.waitForFunction(()=>latestState.phase!=='stock');await restore(p);
 await fixture(stock());await intercept(p,'hold');await p.evaluate(()=>sendAction({type:'stock_trade',orders:[{cityId:'上海',side:'buy',shares:3}]}));await p.waitForFunction(()=>window.__acks.length===1);
 await fixture(stock());await plus(p,'东京').click();await p.evaluate(()=>window.__acks[0]());assert.equal(await p.evaluate(()=>stockDraft['东京'].buy),1);await restore(p);
});
test('限额、供给、城主4股与卖A买B', {timeout},async()=>{
 const p=h.pages[0],s=stock();s.cities['上海'].ownerId='p0';s.players[1].cities=s.players[1].cities.filter(id=>id!=='上海');s.players[0].cities.push('上海');s.stocks['上海'].holders.p0=4;s.stocks['东京'].holders.p1=20;s.stocks['巴黎'].holders.p0=4;st.syncHolders(s);await fixture(s);
 assert.equal(await plus(p,'上海').isDisabled(),true);assert.equal(await plus(p,'东京').isDisabled(),true);assert.equal(await plus(p,'巴黎').isEnabled(),true);
 await plus(p,'巴黎').click();await p.click('#btnStockConfirm');await p.waitForFunction(()=>game.phase!=='stock');assert.equal(h.room.state.players[0].stocks['巴黎'],5);
 await fixture(stock());for(const id of ['上海','东京','巴黎'])await plus(p,id).click();assert.equal(await plus(p,'伦敦').isDisabled(),true);assert.ok((await p.textContent('[data-stock-city="伦敦"]')).includes('最多买3座城市'));for(const id of ['上海','东京','巴黎'])await plus(p,id).click();assert.ok((await p.textContent('#stockHint')).includes('剩余可选 0 股'));assert.ok((await p.textContent('[data-stock-city="伦敦"]')).includes('最多买6股'));
 const used=stock();used.stockWindow.boughtByCity={'上海':2};used.stockWindow.boughtTotal=2;used.stocks['上海'].holders.p0=2;st.syncHolders(used);await fixture(used);await p.locator('button[data-city="上海"][data-kind="sell"][data-delta="1"]').click();assert.equal(await plus(p,'上海').isDisabled(),true);assert.equal(h.room.state.stockWindow.boughtTotal,2);
 const t=stock();t.players[0].cash=0;t.stocks['上海'].holders.p0=2;st.syncHolders(t);await fixture(t);
 assert.equal(await plus(p,'东京').isDisabled(),true);await p.locator('button[data-city="上海"][data-kind="sell"][data-delta="1"]').click();await plus(p,'东京').click();
 assert.ok((await p.textContent('#stockSummary')).includes('卖出收入 ￥4,000'));await p.click('#btnStockConfirm');await p.waitForFunction(()=>latestState.phase!=='stock');assert.equal(h.room.state.players[0].cash,600);assert.equal(h.room.state.players[0].stocks['东京'],1);
});
test('报价变化更新展示后再次确认，拒绝无副作用', {timeout},async()=>{
 const p=h.pages[0];await fixture(stock());await plus(p,'上海').click();const changed=globalThis.structuredClone(h.room.state);changed.stocks['上海'].operatingPrice=4400;st.refreshPrice(changed,'上海','报价测试');await h.fixture(changed);
 assert.equal(await p.textContent('#btnStockConfirm'),'更新报价');const before=h.room.state.players[0].cash;await p.click('#btnStockConfirm');assert.equal(h.room.state.players[0].cash,before);assert.equal(await p.textContent('#btnStockConfirm'),'确认交易');
 await p.click('#btnStockConfirm');await p.waitForFunction(()=>latestState.phase!=='stock');assert.equal(h.room.state.players[0].cash,145600);
});
test('无确认重试原请求身份，实际最多成交一次', {timeout},async()=>{
 const p=h.pages[0];await fixture(stock());await intercept(p,'lost');await plus(p,'上海').click();await p.click('#btnStockConfirm');await p.waitForFunction(()=>document.getElementById('btnStockConfirm').textContent==='重试获取结果');
 const sent=await p.evaluate(()=>window.__sent.filter(x=>x.type==='stock_trade'));assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.equal(h.room.state.players[0].stocks['上海'],1);assert.equal(h.room.state.players[0].cash,146000);
 await restore(p);await p.click('#btnStockConfirm');await p.waitForFunction(()=>latestState.phase!=='stock');assert.equal(h.room.state.players[0].stocks['上海'],1);assert.equal(h.room.state.players[0].cash,146000);
});
test('转让及同窗口认证重连保留累计额度', {timeout},async()=>{
 const p=h.pages[0],s=stock();s.stockWindow.boughtByCity={'上海':2};s.stockWindow.boughtTotal=2;s.stocks['上海'].holders.p0=2;st.syncHolders(s);await fixture(s);
 await p.click('#btnStockTransfer');await p.locator('#transferList button[data-city="上海"][data-delta="1"]').click();await p.getByRole('button',{name:'发起转让',exact:true}).click();await h.pages[1].getByRole('button',{name:'拒绝',exact:true}).click();await p.waitForFunction(()=>game.phase==='stock');assert.equal(h.room.state.stockWindow.boughtTotal,2);
 await p.evaluate(()=>socket.disconnect());await p.evaluate(()=>socket.connect());await p.waitForFunction(()=>socket.connected&&latestState.phase==='stock'&&!latestState.decision.paused);assert.equal(h.room.state.stockWindow.boughtTotal,2);assert.equal(await plus(p,'上海').isDisabled(),true);
 await p.reload({waitUntil:'networkidle'});await p.waitForSelector('#stockModal:not(.hidden)');assert.deepEqual(await p.evaluate(()=>stockDraft),{});assert.equal(await plus(p,'上海').isDisabled(),true);await p.evaluate(()=>setInterval(()=>{window.__fixtureRevision=latestState?.revision||0;},10));
 await p.click('#btnStockTransfer');await p.getByRole('button',{name:'返回',exact:true}).click();await p.getByRole('button',{name:'关闭',exact:true}).last().click();assert.equal(h.room.state.stockWindow.boughtTotal,2);await p.click('#btnStock');await p.click('#btnStockTransfer');await p.locator('#transferList button[data-city="上海"][data-delta="1"]').click();await p.getByRole('button',{name:'发起转让',exact:true}).click();await h.pages[1].getByRole('button',{name:'接受',exact:true}).click();await p.waitForFunction(()=>game.phase==='stock');assert.equal(h.room.state.stockWindow.boughtTotal,2);assert.equal(h.room.state.players[0].stocks['上海'],1);
 await p.evaluate(()=>new Promise(resolve=>socket.emit('disbandRoom',{},resolve)));await p.evaluate(()=>new Promise(resolve=>socket.emit('startGame',{},resolve)));await p.waitForSelector('#choiceModal:not(.hidden)');await h.choose();assert.deepEqual(await p.evaluate(()=>stockDraft),{});
 const delayed=stock();delayed.stocks['上海'].holders.p0=1;st.syncHolders(delayed);await fixture(delayed);await p.evaluate(()=>{window.__transferTimeout=socket.timeout.bind(socket);socket.timeout=ms=>({emit(event,payload,cb){return window.__transferTimeout(ms).emit(event,payload,(err,res)=>{if(payload.type==='stock_transfer')window.__transferAck=()=>cb(err,res);else cb(err,res);});}});});await p.click('#btnStockTransfer');await p.locator('#transferList button[data-city="上海"][data-delta="1"]').click();await p.getByRole('button',{name:'发起转让',exact:true}).click();await p.waitForFunction(()=>!!window.__transferAck);await fixture(stock());await p.click('#btnStockTransfer');await p.evaluate(()=>window.__transferAck());assert.equal(await p.locator('#modal').isVisible(),true);assert.equal(await p.textContent('#modalTitle'),'股票转让');await p.evaluate(()=>{socket.timeout=window.__transferTimeout;});
 assert.deepEqual(h.errors,[]);
});
test('呈现延迟与旧v1未确认订单不补单', {timeout},async()=>{
 const p=h.pages[0];await fixture(stock());await p.evaluate(()=>{window.__finish=finishRender;finishRender=state=>{if(state.phase==='stock')window.__queued=state;else window.__finish(state);};});await plus(p,'上海').click();await p.click('#btnStockConfirm');await p.waitForFunction(()=>window.__queued?.revision>game.revision);assert.equal(h.room.state.phase,'stock');
 await p.evaluate(()=>{finishRender=window.__finish;finishRender(window.__queued);});await p.waitForFunction(()=>latestState.phase!=='stock');
 await fixture(stock());await p.evaluate(()=>{window.__savedTimeout=socket.timeout.bind(socket);window.__sent=[];socket.timeout=ms=>({emit(event,payload,cb){window.__sent.push(payload);if(payload.type==='stock_done')cb(null,{ok:false,error:'测试结束拒绝'});else window.__savedTimeout(ms).emit(event,payload,cb);}});});
 await plus(p,'上海').click();await p.click('#btnStockConfirm');await p.waitForFunction(()=>document.getElementById('btnStockConfirm').textContent==='结束窗口');assert.ok((await p.textContent('#stockSummary')).includes('交易已成交'));assert.equal(h.room.state.players[0].cash,146000);assert.equal((await p.evaluate(()=>window.__sent.filter(x=>x.type==='stock_trade'))).length,1);
 await restore(p);await p.click('#btnStockConfirm');await p.waitForFunction(()=>latestState.phase!=='stock');assert.equal(h.room.state.players[0].stocks['上海'],1);assert.equal(h.room.state.players[0].cash,146000);
 const legacy=f.game(2,1);f.own(legacy,'p1','上海');legacy.phase='stock';legacy.pending={playerId:'p0',kind:'go_stock',after:'end'};for(const [i,player]of legacy.players.entries())player.socketId=h.room.players[i].socketId;h.room.state=legacy;h.api.emitGame(h.room);await p.waitForFunction(t=>game.startedAt===t&&game.phase==='stock',legacy.startedAt);
 await plus(p,'上海').click();await p.click('#btnStockConfirm');await p.waitForFunction(()=>game.phase!=='stock');assert.equal(h.room.state.players[0].stocks['上海'],1);assert.equal(h.room.state.players[0].cash,146000);legacy.startedAt++;h.room.state=legacy;h.api.emitGame(h.room);await p.waitForFunction(t=>game.startedAt===t&&game.phase==='stock',legacy.startedAt);
 await intercept(p,'lost');await plus(p,'上海').click();await p.click('#btnStockConfirm');await p.waitForFunction(()=>document.getElementById('btnStockConfirm').textContent==='重试获取结果');assert.equal((await p.evaluate(()=>window.__sent.filter(x=>x.type==='stock_trade'))).length,1);assert.equal(await p.locator('#btnStockConfirm').isDisabled(),true);await restore(p);
 assert.deepEqual(h.errors,[]);
});
