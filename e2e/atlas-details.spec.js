'use strict';
/* global getComputedStyle, game */
const test=require('node:test'),assert=require('node:assert/strict'),{boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures');
let h;test.before(async()=>{h=await boot({mobile:true,beforeStart:async({pages})=>{for(const mode of ['quick','normal']){await pages[0].locator('input[name=gameModeCard][value='+mode+']').check();await pages[0].waitForFunction(m=>document.getElementById('roomMode').value===m&&!document.getElementById('roomMode').disabled,mode);}}});await h.choose();});test.after(async()=>{if(h)await h.close();});
test('三端强制决定沿原入口，纸色弹窗与回合摘要一致',{timeout:60000},async()=>{
 const p=h.pages[0];p.setDefaultTimeout(5000);
 const cases=[['buy','地产购买','购地决定'],['buy_airport','购买机场','机场购买'],['build_decide','建房 / 拆房','建设决定'],['flight','机场飞行','航班选择'],['jail_turn','监狱','监狱决定'],['frozen_turn','极地救援','极地救援'],['auction_bid','拍卖','城市拍卖'],['direct_sale_ask','直接出售','产权受让'],['self_rescue','自救','资金自救']];
 for(const [phase,title,label]of cases){
  const s=f.game(2);s.firstRoundDone=true;s.phase=phase;s.pending={playerId:'p0',awaiting:'p0',cityId:'内罗毕',airportId:'开罗国际机场',fromAirportId:'开罗国际机场',free:false,due:1000,sellerId:'p1'};
  if(phase==='build_decide'||phase==='self_rescue')f.own(s,'p0','内罗毕');if(phase==='direct_sale_ask')f.own(s,'p1','内罗毕');if(phase==='self_rescue')s.players[0].cash=-1000;if(phase==='jail_turn')s.players[0].jailed=true;if(phase==='frozen_turn')s.players[0].frozen=true;
  await h.fixture(s);await p.waitForSelector('#modal:not(.hidden)');assert.match(await p.locator('#modalTitle').textContent(),new RegExp(title.replaceAll('/','\\/')));assert.ok((await p.locator('#turnSummary').textContent()).includes(label));
  const before=JSON.stringify(h.room.state),deadline=h.room.actionClock.deadlineMs;
  for(const [width,height]of [[1440,900],[768,1024],[844,390]]){await p.setViewportSize({width,height});const info=await p.locator('#modal .modal').evaluate(el=>{const r=el.getBoundingClientRect(),style=getComputedStyle(el);return {width:r.width,x:r.x,bg:style.backgroundColor,font:style.fontFamily};});assert.ok(info.x>=0&&info.width<=width);const rgb=info.bg.match(/\d+/g).map(Number);assert.ok(rgb[0]>180&&rgb[0]>=rgb[2],info.bg);assert.equal(/Georgia|Times New Roman/.test(info.font),false);assert.ok(await p.locator('#modalBody button').count()>0);}
  assert.equal(JSON.stringify(h.room.state),before);assert.equal(h.room.actionClock.deadlineMs,deadline);
 }
 assert.deepEqual(h.errors,[]);
});

test('有限双人页面流程：买地、转让返回、股票成交、只读查看与结算',{timeout:30000},async()=>{
 const s=f.game(2);s.firstRoundDone=true;s.world.status='stopped';s.phase='waiting_roll';s.pending=null;s.diceBag=[1];await h.fixture(s);const p=h.pages[0];await p.click('#btnRoll');await p.waitForSelector('#modal:not(.hidden)');assert.match(await p.locator('#modalBody').textContent(),/购买后现金/);await p.getByRole('button',{name:'确认购买',exact:true}).click();await p.waitForFunction(()=>game.cities['内罗毕'].ownerId==='p0');
 const stock=globalThis.structuredClone(h.room.state);stock.turnIndex=0;stock.phase='stock';stock.pending={playerId:'p0',kind:'go_stock',after:'end'};require('../src/stocks').openStockWindow(stock,'p0');await h.fixture(stock);await p.locator('button[data-city="内罗毕"][data-kind="buy"][data-delta="1"]').click();await p.click('#btnStockTransfer');await p.getByRole('button',{name:'返回',exact:true}).click();await p.click('#btnStockConfirm');await p.waitForFunction(()=>game.players[0].stocks['内罗毕']===1);
 const state=JSON.stringify(h.room.state),deadline=h.room.actionClock.deadlineMs;for(const id of ['btnAssets','btnBank']){await p.click('#'+id);await p.getByRole('button',{name:'关闭',exact:true}).last().click();}await p.click('#btnRules');await p.click('#btnRulesClose');assert.equal(JSON.stringify(h.room.state),state);assert.equal(h.room.actionClock.deadlineMs,deadline);
 await p.evaluate(()=>document.getElementById('btnDisband').click());await p.waitForFunction(()=>game.phase==='game_over');assert.equal(h.room.gameRecord.endReason,'disband');assert.match(await p.locator('#modalTitle').textContent(),/对局结束/);assert.deepEqual(h.errors,[]);
});

