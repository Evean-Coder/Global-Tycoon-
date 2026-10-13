/* global game, latestState, actionPending, openActiveManagement, opportunityDescription, socket, openAssetOverview */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {boot}=require('./helpers/browserHarness'),{createGameState}=require('../src/state'),{own,fakeClock}=require('../test/helpers/gameplayFixtures'),active=require('../src/activeManagement');
test('经营两级选择与唯一入口：四端真实请求、无项目和报价变更',{timeout:90000},async()=>{
 const time=fakeClock(),h=await boot({quickClockOptions:time}),page=h.pages[0],dir=path.join(__dirname,'../docs/management-redesign/evidence');fs.mkdirSync(dir,{recursive:true});
 try{
  await h.choose();await page.bringToFront();const rows=[];let turn=100;
  for(const [width,height]of [[1440,900],[768,1024],[700,320],[844,280]]){
   await page.setViewportSize({width,height});
   const s=createGameState('UI',['甲','乙'],2,{activeManagementRevision:active.REQUIRED_REVISION});s.phase='waiting_roll';s.pending=null;s.turnId=++turn;own(s,'p0','内罗毕');own(s,'p1','上海');
   await h.fixture(s);await page.waitForFunction(()=>game?.self?.activeManagement?.required&&!actionPending);
   assert.match(await page.evaluate(()=>opportunityDescription('H12')),/10000/);assert.equal(await page.locator('#btnRoll').isDisabled(),true);assert.equal(await page.locator('#ledger button').filter({hasText:'主动经营'}).count(),0);
   await page.locator('#btnManagement').click();assert.equal(await page.locator('[data-management-type]').count(),3,JSON.stringify({errors:h.errors,ui:await page.evaluate(()=>({title:document.getElementById('modalTitle').textContent,body:document.getElementById('managementBody').textContent,phase:game?.phase,me:game?.self?.playerId,current:game?.players[game.turnIndex]?.id}))}));assert.equal(await page.locator('.management-city').count(),0);
   await page.locator('[data-management-type=active_stock_buy]').click();assert.equal(await page.locator('.management-city').count(),2);
   await page.locator('[aria-label="上海买入股数"]').selectOption('2');assert.equal(await page.locator('.management-city').count(),2);
   await page.locator('[data-management-back]').click();await page.locator('[data-management-type=active_promote]').click();assert.equal(h.room.state.players[0].cash,150000);
   const size=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>window.innerWidth,button:(()=>{const r=document.getElementById('btnManagement').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,height:r.height};})()}));
   assert.equal(size.overflow,false,JSON.stringify(size));assert.ok(size.button.height>=44);assert.ok(size.button.left>=0&&size.button.right<=width+1&&size.button.bottom<=height+1,JSON.stringify(size));
   await page.screenshot({path:path.join(dir,width+'x'+height+'.png')});rows.push({width,height,...size});
   await page.locator('[data-management-confirm]').click();await page.waitForFunction(()=>game?.self?.activeManagement?.usedThisTurn&&!actionPending);assert.equal(h.room.state.players[0].cash,149892);assert.equal(await page.locator('#btnRoll').isDisabled(),false);
  }
  // A stale quote cannot silently buy at the updated price.
  const s=createGameState('STALE',['甲','乙'],2,{activeManagementRevision:active.REQUIRED_REVISION});s.phase='waiting_roll';s.pending=null;s.turnId=++turn;own(s,'p1','上海');await h.fixture(s);await page.waitForFunction(()=>game?.revision===latestState?.revision&&!actionPending);await page.evaluate(()=>openActiveManagement());await page.locator('[data-management-type=active_stock_buy]').click();
  h.room.state.stocks['上海'].price+=100;h.room.state.stocks['上海'].quoteVersion++;
  await page.locator('[data-management-confirm]').click();await page.waitForFunction(()=>!actionPending&&document.querySelector('.management-error'));assert.equal(h.room.state.players[0].cash,150000);
  await page.waitForFunction(()=>game?.stocks['上海'].price===4100);assert.equal(h.room.state.stocks['上海'].holders.p0,undefined);
  await page.locator('[data-management-confirm]').click();await page.waitForFunction(()=>game.self.activeManagement.usedThisTurn&&!actionPending);assert.equal(h.room.state.stocks['上海'].holders.p0,1);
  const empty=createGameState('EMPTY',['甲','乙'],2,{activeManagementRevision:active.REQUIRED_REVISION});empty.phase='waiting_roll';empty.pending=null;empty.turnId=++turn;await h.fixture(empty);await page.waitForFunction(()=>game?.self?.activeManagement?.quotes.length===0&&!actionPending);assert.equal(await page.locator('#btnRoll').isDisabled(),false);
  const reconnect=globalThis.structuredClone(h.room.state);reconnect.turnId++;own(reconnect,'p0','内罗毕');await h.fixture(reconnect);await page.evaluate(()=>openActiveManagement());await page.locator('[data-management-type=active_promote]').click();
  await page.evaluate(()=>socket.disconnect());await page.waitForFunction(()=>!socket.connected);await page.evaluate(()=>socket.connect());await page.waitForFunction(()=>socket.connected&&game.decision&&!game.decision.paused&&!actionPending);
  await page.evaluate(()=>openActiveManagement());if(await page.locator('[data-management-type=active_promote]').count())await page.locator('[data-management-type=active_promote]').click();
  await page.evaluate(()=>{const original=socket.emit;window.restoreManagementEmit=()=>{socket.emit=original;};socket.emit=function(event,...args){if(event==='action'&&args[0].type==='active_promote'){window.managementPayload=args[0];const callback=args.pop();args.push((...response)=>{window.releaseManagementAck=()=>callback(...response);});}return original.call(this,event,...args);};});
  await page.locator('[data-management-confirm]').click();await page.waitForFunction(()=>game.self.activeManagement.usedThisTurn&&typeof window.releaseManagementAck==='function');
  await page.evaluate(()=>{openAssetOverview();window.restoreManagementEmit();window.releaseManagementAck();});await page.waitForFunction(()=>!actionPending);assert.equal(await page.locator('#modalTitle').textContent(),'资产总览');assert.equal(await page.locator('#modal').isVisible(),true);
  const after=h.room.state.players[0].cash,duplicate=await page.evaluate(()=>new Promise(resolve=>socket.emit('action',window.managementPayload,resolve)));assert.equal(duplicate.ok,true);assert.equal(h.room.state.players[0].cash,after);
  const expiry=globalThis.structuredClone(h.room.state);expiry.turnId++;expiry.promotions=[];await h.fixture(expiry);h.room.rng.diceBag=[1];const cash=h.room.state.players[0].cash;
  time.advance(90000);await page.waitForFunction(()=>game?.dice>0);assert.equal(h.room.state.players[0].activeManagement.usedTurnId,expiry.turnId);assert.equal(h.room.state.players[0].cash,cash-108);const revision=h.room.state.revision;time.advance(0);assert.equal(h.room.state.revision,revision);
  assert.deepEqual(h.errors,[]);fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify(rows,null,2));
 }finally{await h.close();}
});
