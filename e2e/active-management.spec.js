'use strict';
/* global game, socket, latestState, innerWidth, sendAction, closeModal, openModal, fmt */
const test=require('node:test'),assert=require('node:assert/strict'),{boot}=require('./helpers/browserHarness'),{createGameState}=require('../src/state'),stocks=require('../src/stocks');
const {chromium}=require('playwright'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
let h;
test.before(async()=>{h=await boot({mobile:true});await h.choose();});
test.after(async()=>{if(h)await h.close();});
test('手机主动经营取消保留次数，建设成功禁用其他项但可继续掷骰',{timeout:30000},async()=>{
 const s=createGameState('TEST',['甲','乙'],2,{activeManagementRevision:'active-management-v1'});s.phase='waiting_roll';s.pending=null;stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p0'},[]);
 const p=h.pages[0];p.setDefaultTimeout(5000);await h.fixture(s);await p.setViewportSize({width:844,height:390});
 const entry=p.getByRole('button',{name:'主动经营 · 促销 / 买股 / 建设',exact:true});await entry.tap();
 const state=JSON.stringify(h.room.state),deadline=h.room.actionClock.deadlineMs;
 for(const [width,height]of [[1440,900],[1024,768],[768,1024],[390,844],[320,568],[844,390]]){
  assert.deepEqual(await p.locator('#modalBody h4').allTextContents(),['限时促销','主动买股','远程建设']);assert.equal(await p.evaluate(()=>game.self.activeManagement.quotes.every(q=>!q.ok||document.getElementById('modalBody').textContent.includes(fmt(q.finalAmount))&&document.getElementById('modalBody').textContent.includes(fmt(q.cashAfter)))),true);
  await p.setViewportSize({width,height});const button=p.getByRole('button',{name:'确认远程建设',exact:true}).first();await button.scrollIntoViewIfNeeded();const r=await button.boundingBox();assert.ok(r.height>=44&&r.y>=0&&r.y+r.height<=height);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 }
 await p.getByRole('button',{name:'取消',exact:true}).last().focus();await p.keyboard.press('Enter');assert.equal(JSON.stringify(h.room.state),state);assert.equal(h.room.actionClock.deadlineMs,deadline);assert.equal(h.room.state.players[0].activeManagement.usedTurnId,null);
 await entry.click();await p.getByRole('button',{name:'确认远程建设',exact:true}).first().click();await p.waitForFunction(()=>game.cities['内罗毕'].houseLevel===1);
 assert.equal(await entry.isDisabled(),true);assert.equal(await p.locator('#btnRoll').isEnabled(),true);assert.equal(h.room.state.phase,'waiting_roll');const revision=h.room.state.revision;await p.locator('#btnRoll').click();await p.waitForFunction(r=>latestState.revision>r,revision);assert.equal(h.room.state.dice>=1,true);assert.deepEqual(h.errors,[]);
});

test('经营报价变化先展示再确认，不自动投资',{timeout:30000},async()=>{
 const s=createGameState('TEST',['甲','乙'],2,{activeManagementRevision:'active-management-v1'});s.phase='waiting_roll';s.pending=null;stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p0'},[]);await h.fixture(s);const p=h.pages[0],entry=p.getByRole('button',{name:'主动经营 · 促销 / 买股 / 建设',exact:true});await entry.click();const oldText=await p.locator('#modalBody').textContent();
 const changed=globalThis.structuredClone(h.room.state);changed.stocks['内罗毕'].operatingPrice+=1000;stocks.refreshPrice(changed,'内罗毕','经营报价更新');const cash=changed.players[0].cash;await h.fixture(changed);await entry.click();assert.notEqual(await p.locator('#modalBody').textContent(),oldText);assert.equal(h.room.state.players[0].cash,cash);assert.equal(h.room.state.players[0].activeManagement.usedTurnId,null);
 const quote=require('../src/activeManagement').quote(h.room.state,'p0','active_stock_buy','内罗毕',1);await p.getByRole('button',{name:'确认主动买股',exact:true}).first().click();await p.waitForFunction(()=>game.players[0].stocks['内罗毕']===1);assert.equal(h.room.state.players[0].cash,cash-quote.finalAmount);assert.deepEqual(h.errors,[]);
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


test('真实200%系统缩放下经营与扶持可读并可键盘取消',{timeout:60000},async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-active-zoom-')),context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:1440,height:900},reducedMotion:'reduce'}),original=h.pages[0];
 try{
  const settings=await context.newPage();await settings.goto('chrome://settings/appearance');assert.equal(await settings.evaluate(()=>new Promise(resolve=>globalThis.chrome.settingsPrivate.setDefaultZoom(2,resolve))),true);
  const p=await context.newPage();await p.goto(h.url,{waitUntil:'networkidle'});assert.equal(await p.evaluate(()=>innerWidth),720);const rp=h.room.players[0];await p.evaluate(data=>new Promise(resolve=>socket.emit('reconnect',data,resolve)),{roomCode:h.room.code,name:rp.name,token:rp.token});h.pages[0]=p;
  const s=createGameState('TEST',['甲','乙'],2,{activeManagementRevision:'active-management-v1',propertySupportRevision:'property-support-v1'});s.firstRoundDone=true;s.phase='waiting_roll';s.pending=null;s.players[0].propertySupport.eligible=true;s.players[0].propertySupport.missedPurchaseTurns=6;await h.fixture(s);
  for(const name of ['置业扶持 · 查看原价购地机会','主动经营 · 促销 / 买股 / 建设']){
   const before=JSON.stringify(h.room.state),deadline=h.room.actionClock.deadlineMs;await p.getByRole('button',{name,exact:true}).click();assert.equal(await p.locator('#modal').isVisible(),true);assert.ok((await p.locator('#modalBody').textContent()).length>100);const cancel=p.getByRole('button',{name:name.startsWith('置业扶持')?'关闭':'取消',exact:true}).last();await cancel.scrollIntoViewIfNeeded();await cancel.focus();await p.keyboard.press('Enter');assert.equal(JSON.stringify(h.room.state),before);assert.equal(h.room.actionClock.deadlineMs,deadline);
  }
 }finally{h.pages[0]=original;await context.close();}
});


