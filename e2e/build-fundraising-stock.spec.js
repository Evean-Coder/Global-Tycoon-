'use strict';
/* global latestState */
const test=require('node:test'),assert=require('node:assert/strict'),{boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures');
let h;test.before(async()=>{h=await boot({mobile:true,viewport:{width:844,height:390},gameMode:'quick'});await h.choose();});test.after(async()=>{if(h)await h.close();});
test('build funding sells selected shares, keeps panel and deadline, then manually builds',{timeout:30000},async()=>{
 for(const mode of ['normal','quick'])for(const [width,height]of [[844,390],[768,1024],[1440,900]]){
 const s=require('../src/state').createGameState('FUND',['甲','乙'],2,{routeRevision:'opportunity-routes-v1',gameMode:mode,...(mode==='quick'?{quickRevision:'quick-mode-v1'}:{})});f.own(s,'p0','罗马');f.own(s,'p1','里约热内卢');s.players[0].cash=1000;s.players[0].position=s.board.find(x=>x.cityId==='罗马').id;s.phase='build_decide';s.pending={playerId:'p0',cityId:'罗马'};s.stocks['里约热内卢'].price=2000;s.stocks['里约热内卢'].holders.p0=4;s.players[0].stocks['里约热内卢']=4;await h.pages[0].setViewportSize({width,height});await h.fixture(s);
 const p=h.pages[0],deadline=h.room.actionClock.deadlineMs;
 await p.getByRole('button',{name:'募集资金',exact:true}).click();const input=p.getByRole('spinbutton',{name:'里约热内卢卖出股数'});
 await input.fill('5');assert.equal(await p.locator('[data-fund-city]').isDisabled(),true);await input.fill('2');assert.match(await p.locator('.fund-preview').textContent(),/4,000.*5,000.*2,200/);
 await p.locator('[data-fund-city]').click();await p.waitForFunction(()=>latestState.players[0].cash===5000);assert.equal(await p.locator('#modalTitle').textContent(),'建房募集资金');assert.match(await p.locator('#buildGap').textContent(),/2,200/);assert.equal(h.room.state.stocks['里约热内卢'].holders.p0,2);
 await input.fill('2');await p.locator('[data-fund-city]').click();await p.waitForFunction(()=>latestState.players[0].cash===9000);assert.match(await p.locator('#modalBody').textContent(),/资金已足够/);assert.equal(h.room.state.cities['罗马'].houseLevel,0);assert.equal(h.room.actionClock.deadlineMs,deadline);
 await p.getByRole('button',{name:'返回建房',exact:true}).click();await p.getByRole('button',{name:/建造 1 级/}).click();await p.waitForFunction(()=>latestState.cities['罗马'].houseLevel===1);assert.equal(h.room.state.players[0].cash,1800);assert.deepEqual(h.errors,[]);
 }
});

test('low-height funding preserves selected quantity, card and scroll through a quote update',async()=>{
 const p=h.pages[0],s=f.game(2);f.own(s,'p0','罗马');for(const id of Object.keys(s.cities))if(id!=='罗马')f.own(s,'p1',id);for(const st of Object.values(s.stocks))st.holders.p0=4;require('../src/stocks').syncHolders(s);s.players[0].cash=1000;s.players[0].position=s.board.find(x=>x.cityId==='罗马').id;s.phase='build_decide';s.pending={playerId:'p0',cityId:'罗马'};s.stocks['上海'].price=2000;await p.setViewportSize({width:844,height:390});await h.fixture(s);await p.getByRole('button',{name:'募集资金',exact:true}).click();const input=p.getByRole('spinbutton',{name:'上海卖出股数'});await input.fill('2');await input.focus();await p.setViewportSize({width:844,height:280});assert.equal(await input.inputValue(),'2');
 const card=p.locator('[data-bank-city="上海"]');await card.scrollIntoViewIfNeeded();const before=await p.locator('#modalBody').evaluate(el=>el.scrollTop);await input.evaluate(el=>window.__fundInput=el);const updated=globalThis.structuredClone(h.room.state);updated.stocks['上海'].price=2100;await h.fixture(updated);assert.equal(await input.inputValue(),'2');assert.equal(await input.evaluate(el=>window.__fundInput===el),true);assert.ok(Math.abs(await p.locator('#modalBody').evaluate(el=>el.scrollTop)-before)<=2);assert.match(await card.locator('.fund-preview').textContent(),/4,200.*5,200.*2,000/);
 await card.locator('[data-fund-city]').tap();await p.waitForFunction(()=>latestState.players[0].cash===5200);assert.match(await p.locator('#buildGap').textContent(),/2,000/);await p.getByRole('button',{name:'返回建房',exact:true}).tap();
 const flight=f.game(2);flight.phase='flight';flight.pending={playerId:'p0',fromAirportId:'开罗国际机场',free:false};await h.fixture(flight);const cancel=p.getByRole('button',{name:'不飞',exact:true});await cancel.scrollIntoViewIfNeeded();await cancel.tap();await p.waitForFunction(()=>latestState.phase!=='flight');assert.deepEqual(h.errors,[]);
});
