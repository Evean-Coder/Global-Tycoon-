'use strict';
/* global game, socket, latestState, innerWidth, sendAction, closeModal, openModal */
const test=require('node:test'),assert=require('node:assert/strict'),{boot}=require('./helpers/browserHarness'),{createGameState}=require('../src/state'),stocks=require('../src/stocks');
let h;
test.before(async()=>{h=await boot({mobile:true});await h.choose();});
test.after(async()=>{if(h)await h.close();});
test('手机主动经营取消保留次数，建设成功禁用其他项但可继续掷骰',{timeout:30000},async()=>{
 const s=createGameState('TEST',['甲','乙'],2,{activeManagementRevision:'active-management-v1'});s.phase='waiting_roll';s.pending=null;stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p0'},[]);
 const p=h.pages[0];p.setDefaultTimeout(5000);await h.fixture(s);await p.setViewportSize({width:844,height:390});
 const entry=p.getByRole('button',{name:'主动经营 · 促销 / 买股 / 建设',exact:true});await entry.tap();
 const state=JSON.stringify(h.room.state),deadline=h.room.actionClock.deadlineMs;
 for(const [width,height]of [[1440,900],[1024,768],[768,1024],[390,844],[320,568],[844,390]]){
  await p.setViewportSize({width,height});const button=p.getByRole('button',{name:'确认远程建设',exact:true}).first();await button.scrollIntoViewIfNeeded();const r=await button.boundingBox();assert.ok(r.height>=44&&r.y>=0&&r.y+r.height<=height);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 }
 await p.getByRole('button',{name:'取消',exact:true}).last().focus();await p.keyboard.press('Enter');assert.equal(JSON.stringify(h.room.state),state);assert.equal(h.room.actionClock.deadlineMs,deadline);assert.equal(h.room.state.players[0].activeManagement.usedTurnId,null);
 await entry.click();await p.getByRole('button',{name:'确认远程建设',exact:true}).first().click();await p.waitForFunction(()=>game.cities['内罗毕'].houseLevel===1);
 assert.equal(await entry.isDisabled(),true);assert.equal(await p.locator('#btnRoll').isEnabled(),true);assert.equal(h.room.state.phase,'waiting_roll');assert.deepEqual(h.errors,[]);
});

test('迟到经营回执不能关闭后来打开的其他弹窗',{timeout:30000},async()=>{
 const s=createGameState('TEST',['甲','乙'],2,{activeManagementRevision:'active-management-v1'});s.phase='waiting_roll';s.pending=null;stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p0'},[]);await h.fixture(s);
 const p=h.pages[0];await p.setViewportSize({width:844,height:390});await p.getByRole('button',{name:'主动经营 · 促销 / 买股 / 建设',exact:true}).click();
 await p.evaluate(()=>{window.savedSendAction=sendAction;sendAction=(_action,callback)=>{window.delayedCallback=callback;};});
 try{await p.getByRole('button',{name:'确认远程建设',exact:true}).first().click();await p.evaluate(()=>{closeModal();openModal('后来打开的只读资料');window.delayedCallback({ok:true});});assert.equal(await p.locator('#modalTitle').textContent(),'后来打开的只读资料');assert.equal(await p.locator('#modal').isVisible(),true);assert.equal(h.room.state.cities['内罗毕'].houseLevel,0);}
 finally{await p.evaluate(()=>{sendAction=window.savedSendAction;closeModal();delete window.savedSendAction;delete window.delayedCallback;});}
 assert.deepEqual(h.errors,[]);
});
test('实际服务端重复经营请求不重复扣款，经营不延长决定期限',{timeout:30000},async()=>{
 const s=createGameState('TEST',['甲','乙'],2,{activeManagementRevision:'active-management-v1'});s.phase='waiting_roll';s.pending=null;stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p0'},[]);await h.fixture(s);
 const deadline=h.room.actionClock.deadlineMs,decision=h.room.actionClock.decisionId;
 const result=await h.pages[0].evaluate(async()=>{
  const q=game.self.activeManagement.quotes.find(q=>q.type==='active_promote'&&q.ok),payload={type:q.type,cityId:q.cityId,quoteVersion:q.quoteVersion,gameId:game.gameId,actionId:'same-promotion',decisionId:game.decision.decisionId,actorRevision:game.self.actorRevision};
  const first=await new Promise(resolve=>socket.emit('action',payload,resolve));const second=await new Promise(resolve=>socket.emit('action',payload,resolve));return {first,second};
 });
 assert.equal(result.first.ok,true);assert.deepEqual(result.first,result.second);assert.equal(h.room.state.promotions.length,1);assert.equal(h.room.state.players[0].cash,s.players[0].cash-144);assert.equal(h.room.actionClock.decisionId,decision);assert.equal(h.room.actionClock.deadlineMs,deadline);
 await h.pages[0].waitForFunction(()=>latestState.revision>0);assert.deepEqual(h.errors,[]);
});
