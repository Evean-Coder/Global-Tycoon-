'use strict';
/* global game, latestState, socket, innerWidth, sendAction, closeModal, openModal */
const test=require('node:test'),assert=require('node:assert/strict'),{boot}=require('./helpers/browserHarness'),{createGameState}=require('../src/state');
let h;
test.before(async()=>{h=await boot({mobile:true});await h.choose();});
test.after(async()=>{if(h)await h.close();});
test('扶持查看取消后成功原价购城并继续原回合',{timeout:30000},async()=>{
 const s=createGameState('TEST',['甲','乙'],2,{propertySupportRevision:'property-support-v1'});s.firstRoundDone=true;s.phase='waiting_roll';s.players[0].propertySupport.eligible=true;s.players[0].propertySupport.missedPurchaseTurns=6;
 const p=h.pages[0];p.setDefaultTimeout(5000);await h.fixture(s);await p.setViewportSize({width:844,height:390});
 await p.getByRole('button',{name:'置业扶持 · 查看原价购地机会'}).tap();const state=JSON.stringify(h.room.state),deadline=h.room.actionClock.deadlineMs;
 for(const [width,height]of [[1440,900],[1024,768],[768,1024],[390,844],[320,568],[844,390]]){
  await p.setViewportSize({width,height});const button=p.getByRole('button',{name:'原价购买',exact:true}).first();await button.scrollIntoViewIfNeeded();const r=await button.boundingBox();assert.ok(r.height>=44&&r.y>=0&&r.y+r.height<=height);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 }
 await p.getByRole('button',{name:'关闭',exact:true}).last().focus();await p.keyboard.press('Enter');assert.equal(JSON.stringify(h.room.state),state);assert.equal(h.room.actionClock.deadlineMs,deadline);
 assert.equal(h.room.state.players[0].propertySupport.eligible,true);
 await p.getByRole('button',{name:'置业扶持 · 查看原价购地机会'}).click();const before=h.room.state.players[0].cash;
 await p.getByRole('button',{name:'原价购买',exact:true}).first().click();
 await p.waitForFunction(()=>game.players[0].cities.length===1);
 assert.equal(h.room.state.players[0].propertySupport.used,true);assert.ok(h.room.state.players[0].cash<before);assert.equal(h.room.state.phase,'waiting_roll');assert.equal(await p.locator('#btnRoll').isEnabled(),true);assert.deepEqual(h.errors,[]);
});

test('有限双人流程：六回合资格、候选变化、购地、掷骰与重连',{timeout:60000},async()=>{
 const s=createGameState('TEST',['甲','乙'],2,{propertySupportRevision:'property-support-v1'});s.firstRoundDone=true;s.phase='waiting_roll';s.pending=null;s.opportunityStage={ordinal:3,resolved:true};require('../src/worldEvents').advanceWorld(s,()=>.5,[]);await h.fixture(s);const p=h.pages[0];
 // Controlled positions avoid random purchases; the twelve rolls and turn
 // completion are executed through the real client/socket/engine.
 for(let i=0;i<6;i++)for(let j=0;j<2;j++){
  h.room.state.players[j].position=9;h.room.state.diceBag=[1];await h.pages[j].waitForFunction(id=>game.phase==='waiting_roll'&&game.players[game.turnIndex].id===id,'p'+j);const revision=h.room.state.revision;const result=await h.pages[j].evaluate(()=>new Promise(resolve=>sendAction({type:'roll_dice'},resolve)));assert.equal(result.ok,true);await p.waitForFunction(r=>latestState.revision>r,revision);
 }
 assert.equal(h.room.state.players[0].propertySupport.missedPurchaseTurns,6);const entry=p.getByRole('button',{name:'置业扶持 · 查看原价购地机会'});await entry.click();const deadline=h.room.actionClock.deadlineMs;await p.getByRole('button',{name:'关闭',exact:true}).last().click();assert.equal(h.room.actionClock.deadlineMs,deadline);
 const support=require('../src/propertySupport'),stocks=require('../src/stocks'),oldId=support.candidates(h.room.state)[0],oldQuote=support.quote(h.room.state,'p0',oldId),changed=globalThis.structuredClone(h.room.state);stocks.transferCity(changed,{cityId:oldId,newOwnerId:'p1'},[]);await h.fixture(changed);const before=JSON.stringify(h.room.state);const rejected=await p.evaluate(a=>new Promise(resolve=>sendAction(a,resolve)),{type:'support_buy',cityId:oldId,quoteVersion:oldQuote.quoteVersion});assert.equal(rejected.ok,false);assert.equal(JSON.stringify(h.room.state),before);
 await entry.click();const target=support.candidates(h.room.state)[0];await p.getByRole('button',{name:'原价购买',exact:true}).first().click();await p.waitForFunction(id=>game.cities[id].ownerId==='p0',target);assert.equal(h.room.state.players[0].propertySupport.used,true);
 h.room.state.players[0].position=9;h.room.state.diceBag=[1];assert.equal((await p.evaluate(()=>new Promise(resolve=>sendAction({type:'roll_dice'},resolve)))).ok,true);await p.evaluate(()=>socket.disconnect());await p.waitForFunction(()=>!socket.connected);await p.evaluate(()=>socket.connect());await p.waitForFunction(()=>socket.connected&&game.self?.propertySupport?.used===true);assert.equal(h.room.state.players[0].propertySupport.used,true);assert.deepEqual(h.errors,[]);
});

test('扶持缺条件原因常显，旧回执不关闭新资料',{timeout:30000},async()=>{
 const s=createGameState('TEST',['甲','乙'],2,{propertySupportRevision:'property-support-v1'});s.firstRoundDone=true;s.phase='waiting_roll';s.pending=null;s.players[0].propertySupport.eligible=true;s.players[0].cash=0;const p=h.pages[0];await h.fixture(s);const entry=p.getByRole('button',{name:'置业扶持 · 查看原价购地机会'});await entry.click();assert.match(await p.locator('#modalBody').textContent(),/现金不足.*资格仍保留/);assert.equal(await p.getByRole('button',{name:'原价购买',exact:true}).first().isDisabled(),true);await p.getByRole('button',{name:'关闭',exact:true}).last().click();
 s.players[0].cash=150000;s.players[0].lapBuys=4;await h.fixture(s);await entry.click();assert.match(await p.locator('#modalBody').textContent(),/剩余购地额度 0\/4|额度已用完/);await p.getByRole('button',{name:'关闭',exact:true}).last().click();
 s.players[0].lapBuys=0;for(const city of Object.values(s.cities))city.ownerId='p1';await h.fixture(s);await entry.click();assert.match(await p.locator('#modalBody').textContent(),/没有可售.*资格仍保留/);await p.getByRole('button',{name:'关闭',exact:true}).last().click();
 for(const city of Object.values(s.cities))city.ownerId=null;await h.fixture(s);await entry.click();await p.evaluate(()=>{window.savedSendAction=sendAction;sendAction=(_a,callback)=>{window.delayedCallback=callback;};});
 try{await p.getByRole('button',{name:'原价购买',exact:true}).first().click();await p.evaluate(()=>{closeModal();openModal('新的资料');window.delayedCallback({ok:true});});assert.equal(await p.locator('#modalTitle').textContent(),'新的资料');assert.equal(h.room.state.players[0].propertySupport.used,false);}
 finally{await p.evaluate(()=>{sendAction=window.savedSendAction;closeModal();delete window.savedSendAction;delete window.delayedCallback;});}
 assert.deepEqual(h.errors,[]);
});
