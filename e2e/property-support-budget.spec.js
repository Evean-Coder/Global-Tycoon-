'use strict';
/* global game, supportDraft, sendAction */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{boot}=require('./helpers/browserHarness'),{createGameState}=require('../src/state'),support=require('../src/propertySupport');
const dir=process.env.E2E_EVIDENCE_ROOT?path.join(process.env.E2E_EVIDENCE_ROOT,'property-support-budget'):path.join(__dirname,'../docs/property-support-budget/evidence');let h;
function state(eligible=true){const s=createGameState('BUDGET',['甲','乙'],2,{propertySupportRevision:support.REVISION});s.firstRoundDone=true;s.phase='waiting_roll';s.pending=null;s.players[0].propertySupport.eligible=eligible;s.players[0].propertySupport.missedPurchaseTurns=eligible?6:2;return s;}
test.before(async()=>{fs.mkdirSync(dir,{recursive:true});h=await boot({mobile:true});await h.choose();});test.after(async()=>{if(h)await h.close();});
test('budget support is hidden normally, privately pushed and supports one atomic basket across screens',{timeout:45000},async()=>{
 const p=h.pages[0];await h.fixture(state(false));assert.equal(await p.locator('#ledgerBody').getByText(/置业扶持/).count(),0);assert.equal(await p.locator('#propertySupportModal').isVisible(),false);
 await h.fixture(state());await p.waitForSelector('#propertySupportModal:not(.hidden)');assert.equal(await h.pages[1].locator('#propertySupportModal').isVisible(),false);assert.equal(await p.locator('[data-support-city]').count(),18);assert.equal(await p.locator('[data-support-city="纽约"]').count(),0);
 for(const [width,height]of [[1440,900],[768,1024],[844,280]]){await p.setViewportSize({width,height});await p.locator('#btnSupportConfirm').scrollIntoViewIfNeeded();const r=await p.locator('#btnSupportConfirm').boundingBox();assert.ok(r.height>=44&&r.y+r.height<=height+1);await p.screenshot({path:path.join(dir,width+'x'+height+'.png')});}
 await p.getByRole('checkbox',{name:'选择内罗毕',exact:true}).check();await p.getByRole('checkbox',{name:'选择卡萨布兰卡',exact:true}).check();await p.getByRole('checkbox',{name:'选择开罗',exact:true}).check();assert.match(await p.locator('.support-summary').textContent(),/14,400/);
 const deadline=h.room.actionClock.deadlineMs;h.api.emitGame(h.room);await p.waitForFunction(()=>supportDraft.ids.length===3);assert.equal(h.room.actionClock.deadlineMs,deadline);const cash=h.room.state.players[0].cash;await p.locator('#btnSupportConfirm').tap();await p.waitForFunction(()=>game.self.propertySupport.used);assert.equal(h.room.state.players[0].cities.length,3);assert.equal(h.room.state.players[0].cash,cash-14400);assert.equal(h.room.state.players[0].lapBuys,3);assert.equal(await p.locator('#propertySupportModal').isVisible(),false);
 assert.deepEqual(h.errors,[]);
});
test('cancel retains eligibility; quote changes require new selection and late receipts cannot close another window',async()=>{
 const p=h.pages[0],s=state();s.turnId=50;await h.fixture(s);await p.waitForSelector('#propertySupportModal:not(.hidden)');await p.locator('#btnSupportLater').tap();h.api.emitGame(h.room);assert.equal(await p.locator('#propertySupportModal').isVisible(),false);assert.equal(h.room.state.players[0].propertySupport.eligible,true);
 const next=globalThis.structuredClone(h.room.state);next.turnId+=2;await h.fixture(next);await p.waitForSelector('#propertySupportModal:not(.hidden)');await p.getByRole('checkbox',{name:'选择内罗毕',exact:true}).check();
 const changed=globalThis.structuredClone(h.room.state);require('../src/stocks').transferCity(changed,{cityId:'内罗毕',newOwnerId:'p1'},[]);await h.fixture(changed);assert.match(await p.locator('.support-error').textContent(),/重新选择/);assert.equal(await p.getByRole('checkbox',{name:'选择内罗毕',exact:true}).count(),0);assert.equal(await p.locator('#btnSupportConfirm').isDisabled(),true);
 await p.getByRole('checkbox',{name:'选择卡萨布兰卡',exact:true}).check();await p.evaluate(()=>{window.__savedSupportSend=sendAction;sendAction=(_a,cb)=>{window.__supportCallback=cb;return {retrieve(){}};};});
 try{await p.locator('#btnSupportConfirm').tap();const later=globalThis.structuredClone(h.room.state);later.turnId+=2;await h.fixture(later);await p.getByRole('checkbox',{name:'选择开罗',exact:true}).check();await p.evaluate(()=>window.__supportCallback({ok:true}));assert.equal(await p.locator('#propertySupportModal').isVisible(),true);assert.equal(await p.getByRole('checkbox',{name:'选择开罗',exact:true}).isChecked(),true);}
 finally{await p.evaluate(()=>sendAction=window.__savedSupportSend);}
 assert.deepEqual(h.errors,[]);
});
