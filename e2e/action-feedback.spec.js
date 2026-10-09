'use strict';
/* global socket, latestState, actionPending, diceAnimating */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures');
let h;const timeout=30000;
const state=()=>{const s=f.game(2);f.own(s,'p0','上海','东京');return s;};
test.before(async()=>{h=await boot({viewport:{width:812,height:375},mobile:true});await h.choose();await h.pages[0].evaluate(()=>setInterval(()=>window.__fixtureRevision=latestState?.revision||0,10));});
test.after(async()=>{if(h)await h.close();});
test('等待确认时给出反馈，后续点击不补发或播放假骰子',{timeout},async()=>{
 const p=h.pages[0];await h.fixture(state());await p.emulateMedia({reducedMotion:'no-preference'});await p.locator('#btnBank').tap();
 await p.evaluate(()=>{window.__timeout=socket.timeout.bind(socket);window.__sent=[];socket.timeout=ms=>({emit(ev,data,cb){window.__sent.push(data);return window.__timeout(ms).emit(ev,data,(err,res)=>window.__release=()=>cb(err,res));}});});
 await p.locator('#modalBody .lrow button').first().tap();assert.ok((await p.textContent('#toast')).includes('等待服务器确认'));await p.waitForFunction(()=>!!window.__release);
 await p.locator('#btnBank').tap();await p.locator('#modalBody .lrow button').last().tap();assert.ok((await p.textContent('#toast')).includes('上一操作'));
 await p.getByRole('button',{name:'关闭',exact:true}).tap();await p.locator('#btnRoll').tap();assert.equal(await p.evaluate(()=>diceAnimating),false);assert.equal(await p.evaluate(()=>window.__sent.length),1);assert.equal(h.room.state.cities['东京'].mortgaged,false);
 await p.screenshot({path:path.join(__dirname,'../docs/gameplay-usability/mobile-evidence/action-pending-812.png')});
 await p.evaluate(()=>{window.__release();socket.timeout=window.__timeout;});assert.equal(await p.evaluate(()=>actionPending),false);assert.ok((await p.textContent('#toast')).includes('操作已确认'));assert.equal(h.room.state.cities['上海'].mortgaged,true);await p.emulateMedia({reducedMotion:'reduce'});
});
test('断线点击明确未发送，恢复后原操作入口可用',{timeout},async()=>{
 const p=h.pages[0];await h.fixture(state());await p.locator('#btnBank').tap();await p.evaluate(()=>socket.disconnect());await p.locator('#modalBody .lrow button').first().tap();
 assert.ok((await p.textContent('#toast')).includes('操作尚未发送'));assert.equal(await p.evaluate(()=>socket.sendBuffer.length),0);assert.equal(await p.evaluate(()=>actionPending),false);assert.equal(h.room.state.cities['上海'].mortgaged,false);
 await p.evaluate(()=>socket.connect());await p.waitForFunction(()=>socket.connected&&!latestState.decision.paused);await p.locator('#btnBank').tap();await p.locator('#modalBody .lrow button').first().tap();await p.waitForFunction(()=>latestState.cities['上海'].mortgaged&&!actionPending);assert.equal(h.room.state.cities['上海'].mortgaged,true);
});
test('慢回执查询沿用原动作身份，仍只抵押一次',{timeout},async()=>{
 const p=h.pages[0];await h.fixture(state());await p.locator('#btnBank').tap();
 await p.evaluate(()=>{window.__timeout=socket.timeout.bind(socket);window.__sent=[];socket.timeout=ms=>({emit(ev,data,cb){window.__sent.push(data);return window.__timeout(ms).emit(ev,data,(err,res)=>{if(window.__sent.length===1)cb(new Error('受控回执丢失'));else window.__retryRelease=()=>cb(err,res);});}});});
 await p.locator('#modalBody .lrow button').first().tap();await p.waitForFunction(()=>!!window.__retryRelease);assert.ok((await p.textContent('#toast')).includes('正在查询刚才'));const sent=await p.evaluate(()=>window.__sent);assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.equal(h.room.state.players[0].cash,160000);
 await p.evaluate(()=>{window.__retryRelease();socket.timeout=window.__timeout;});assert.equal(await p.evaluate(()=>actionPending),false);assert.equal(h.room.state.players[0].cash,160000);assert.deepEqual(h.errors,[]);
});
