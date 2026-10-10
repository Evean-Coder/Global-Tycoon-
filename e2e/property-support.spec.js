'use strict';
/* global game, innerWidth */
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
