'use strict';
/* global latestState, game, socket, lastRecord, startSelectedGame, returnToRoom, animBusy, diceAnimating, animQueued, playDiceAnim */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const os=require('node:os'),{chromium}=require('playwright');
const {boot}=require('./helpers/browserHarness'),{createGameState}=require('../src/state'),routes=require('../src/opportunityRoutes'),f=require('../test/helpers/gameplayFixtures');
let h,base=0;const evidence=path.join(__dirname,'../docs/quick-mode/browser-evidence'),measures=[];
function timeSource(){let value=0,seq=0;const timers=new Map();return {now:()=>value,setTimeout(fn,delay){const id=++seq;timers.set(id,{fn,at:value+delay});return id;},clearTimeout:id=>timers.delete(id),set(n){value=n;},advance(ms){value+=ms;for(const[id,t]of [...timers])if(t.at<=value&&timers.has(id)){timers.delete(id);t.fn();}}};}
const time=timeSource();
async function moveTo(ms){time.set(base+ms);h.api.advanceRouteTime(h.room);h.api.emitGame(h.room);await h.pages[0].waitForFunction(r=>latestState.revision>=r,h.room.state.revision);}
async function restart(){if(h.room.state.quick.status!=='closed'){h.api.closeQuickGame(h.room,'disband');h.api.emitGame(h.room);}await h.pages[0].waitForFunction(()=>game.phase==='game_over');base=time.now();await h.pages[0].evaluate(()=>startSelectedGame());await h.pages[0].waitForSelector('#choiceModal:not(.hidden)');await h.choose();}
function ready(){const s=createGameState(h.room.code,['浏览器甲','浏览器乙'],2,{routeRevision:routes.REVISION,gameMode:'quick',quickRevision:'quick-mode-v1'});for(const p of s.players)p.opportunities.selectedIds=['H1','H8','H10'];for(let i=1;i<=3;i++){s.opportunityStage={ordinal:i,resolved:true};routes.markInitialResolved(s,i);}return s;}
async function fixture(s=ready()){await h.fixture(s);await h.pages[0].waitForFunction(r=>game.revision>=r,h.room.state.revision);}
test.before(async()=>{fs.mkdirSync(evidence,{recursive:true});h=await boot({gameMode:'quick',quickClockOptions:time});for(const p of h.pages)await p.evaluate(()=>setInterval(()=>{window.__fixtureRevision=latestState.revision;},10));});
test.after(async()=>{if(h)await h.close();fs.writeFileSync(path.join(evidence,'measurements.json'),JSON.stringify({browser:'Microsoft Edge Chromium',physicalDevices:'未测；模拟视口',measures},null,2));});

test('QB01 mode is confirmed before real start and guest control is read-only',async()=>{
  assert.equal(h.prestart.mode,'quick');assert.equal(h.prestart.guestModeDisabled,true);assert.equal(h.room.state.gameMode,'quick');assert.equal(await h.pages[0].locator('#quickClockBar').isVisible(),true);assert.ok((await h.pages[0].textContent('#quickClockBar')).includes('整局'));assert.equal(h.room.actionClock.remainingMs,30000);await h.choose();
});
test('QB02 restart uses waiting/error feedback instead of raw fire-and-forget',async()=>{
  const a=h.pages[0];h.api.closeQuickGame(h.room,'disband');h.api.emitGame(h.room);await a.waitForFunction(()=>game.phase==='game_over');await a.evaluate(()=>returnToRoom());
  await a.evaluate(()=>{window.__realQuickTimeout=socket.timeout.bind(socket);socket.timeout=()=>({emit:(_event,_data,cb)=>{window.__quickStartCallback=cb;}});});await a.click('#btnStart');assert.equal(await a.locator('#btnStart').isDisabled(),true);assert.ok((await a.textContent('#btnStart')).includes('正在'));
  await a.evaluate(()=>{window.__quickStartCallback(null,{ok:false,error:'测试开始失败'});socket.timeout=window.__realQuickTimeout;});await a.waitForFunction(()=>document.getElementById('connectionStatus').textContent.includes('测试开始失败'));assert.equal(await a.locator('#btnStart').isEnabled(),true);
  base=time.now();await a.click('#btnStart');await a.waitForSelector('#choiceModal:not(.hidden)');await h.choose();assert.equal(h.room.state.quick.status,'running');
});
test('QB03 total time continues through personal pause and ignores stale correction',async()=>{
  const [a,b]=h.pages;const packets=[];time.advance(5000);await a.waitForFunction(()=>document.getElementById('quickTimer').textContent!=='30:00');
  await b.evaluate(()=>socket.disconnect());await a.waitForFunction(()=>latestState.decision.paused);const personal=await a.textContent('#timer'),first=await a.textContent('#quickTimer');time.advance(5000);await a.waitForFunction(first=>document.getElementById('quickTimer').textContent!==first,first);assert.equal(await a.textContent('#timer'),personal);
  packets.push(h.room.quickClock.read());h.api.io.to('room:'+h.room.code).emit('quickTimeUpdate',{...packets[0],gameId:'old'});h.api.io.to('room:'+h.room.code).emit('quickTimeUpdate',{...packets[0],elapsedMs:0});await new Promise(r=>setTimeout(r,30));assert.notEqual(await a.textContent('#quickTimer'),'30:00');
  await b.evaluate(()=>socket.connect());await b.waitForFunction(()=>socket.connected&&!latestState.decision.paused);assert.equal(h.room.state.quick.status,'running');
  await a.evaluate(()=>socket.listeners('quickTimeUpdate')[0]({gameId:latestState.gameId,elapsedMs:1800000,totalRemainingMs:0,closed:false,quickRevision:'quick-mode-v1',mode:'quick'}));assert.ok((await a.textContent('#quickEndHint')).includes('等待'));assert.notEqual(await a.evaluate(()=>game.phase),'game_over');assert.equal(h.room.state.quick.status,'running');
});
test('QB04 net assets, debts and spendable cash have distinct labels',async()=>{
  const s=ready();f.own(s,'p0','上海');s.cities['上海'].mortgaged=true;s.cities['上海'].mortgageInterest=1000;s.players[0].cash=-100;
  await fixture(s);const a=h.pages[0];assert.ok((await a.textContent('#ledgerBody')).includes('当前净资产'));await a.click('#btnAssets');const text=await a.textContent('#modalBody');assert.ok(text.includes('当前净资产（用于排名）'));await a.locator('.net-details summary').click();assert.ok((await a.textContent('#modalBody')).includes('抵押本金（负债）'));assert.ok(text.includes('不是可支付现金'));await a.locator('#modalBody button').last().click();
});
test('QB05 ties, reasons and authoritative result work before a record arrives',async()=>{
  const s=ready();f.own(s,'p0','上海');s.cities['上海'].mortgaged=true;s.players[0].cash=140000;await fixture(s);
  h.api.closeQuickGame(h.room,'disband');h.api.emitGame(h.room);await h.pages[0].waitForFunction(()=>game.phase==='game_over');const a=h.pages[0];assert.ok((await a.textContent('#modalBody')).includes('并列第一'));assert.ok((await a.textContent('#modalBody')).includes('提前解散'));assert.deepEqual(await a.locator('.rank tr:not(:first-child) td:first-child').allTextContents(),['1','1']);
  await a.evaluate(()=>{lastRecord=null;window.__quickEndState=latestState;socket.listeners('gameState')[0](latestState);});assert.ok((await a.textContent('#modalBody')).includes('等待对局记录'));h.api.io.to('room:'+h.room.code).emit('gameRecord',h.room.gameRecord);await a.waitForFunction(()=>!!lastRecord);assert.deepEqual(await a.locator('.rank tr:not(:first-child) td:first-child').allTextContents(),['1','1']);
});
test('QB06 download and replay preserve the frozen quick result',async()=>{
  const a=h.pages[0],download=a.waitForEvent('download');await a.getByRole('button',{name:'下载对局数据',exact:true}).click();const file=await download;assert.ok(file.suggestedFilename().endsWith('.json'));const record=JSON.parse(fs.readFileSync(await file.path(),'utf8'));assert.deepEqual(record.quick,h.room.gameRecord.quick);
  await a.getByRole('button',{name:'回放对局',exact:true}).click();assert.ok((await a.textContent('#modalBody')).includes('冻结净资产'));await a.getByRole('button',{name:'关闭',exact:true}).click();await restart();assert.equal(await a.evaluate(()=>lastRecord),null);assert.equal(h.room.state.quick.status,'running');
});
test('QB07 PC tablet and short landscape layouts expose accessible controls',{timeout:60000},async()=>{
  await moveTo(1000);await fixture();const a=h.pages[0];for(const[width,height]of [[1440,900],[1024,768],[768,1024],[568,320],[812,375]]){
    await a.setViewportSize({width,height});await a.evaluate(()=>new Promise(r=>window.requestAnimationFrame(()=>window.requestAnimationFrame(r))));
    const m=await a.evaluate(()=>({width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,timer:document.getElementById('quickTimer').getBoundingClientRect().width,button:{w:document.getElementById('btnAssets').getBoundingClientRect().width,h:document.getElementById('btnAssets').getBoundingClientRect().height}}));assert.ok(m.scrollWidth<=m.width+1,JSON.stringify(m));assert.ok(m.timer>0);assert.ok(m.button.w>=44&&m.button.h>=44);
    await a.locator('#btnAssets').focus();await a.keyboard.press('Enter');assert.equal(await a.locator('#modal').isVisible(),true);await a.locator('#modalBody button').last().click();await a.screenshot({path:path.join(evidence,'quick-'+width+'x'+height+'.png'),fullPage:true});measures.push({width,height,...m});
  }
});
test('QB08 authority closes old sheets and cancels queued visual animations',async()=>{
  const a=h.pages[0];await a.emulateMedia({reducedMotion:'no-preference'});await a.evaluate(()=>{for(const id of ['choiceModal','stockModal','routeModal','modal'])document.getElementById(id).classList.remove('hidden');playDiceAnim();animBusy=true;animQueued={...latestState,phase:'waiting_roll'};});h.api.closeQuickGame(h.room,'disband');h.api.emitGame(h.room);await a.waitForFunction(()=>game.phase==='game_over');assert.deepEqual(await a.evaluate(()=>({animBusy,diceAnimating,queued:animQueued})),{animBusy:false,diceAnimating:false,queued:null});await new Promise(r=>setTimeout(r,800));assert.equal(await a.evaluate(()=>game.phase),'game_over');assert.equal(await a.locator('#choiceModal').isVisible(),false);assert.equal(await a.locator('#stockModal').isVisible(),false);assert.equal(await a.locator('#routeModal').isVisible(),false);await a.emulateMedia({reducedMotion:'reduce'});assert.deepEqual(h.errors,[]);
});

test('QB10 finite browser flow uses legal actions through growth routes reconnect and deadline',{timeout:60000},async()=>{
  await restart();await h.pages[0].setViewportSize({width:1440,height:900});
  for(const ms of [300000,600000]){await moveTo(ms);await h.pages[0].waitForSelector('#choiceModal:not(.hidden)');await h.choose();}
  const log=[];
  async function action(id,a){const page=h.pages[+id.slice(1)];await page.waitForFunction(r=>latestState.revision>=r,h.room.state.revision);const result=await page.evaluate(a=>new Promise(r=>socket.emit('action',{...a,gameId:latestState.gameId,actionId:'browser-flow-'+globalThis.crypto.randomUUID(),decisionId:latestState.decision.decisionId,actorRevision:latestState.self.actorRevision},r)),a);assert.equal(result.ok,true,JSON.stringify({a,result}));log.push({id,type:a.type,phase:h.room.state.phase});}
  async function roll(id,n){h.room.rng.diceBag=[n];await action(id,{type:'roll_dice'});if(h.room.state.phase==='stock')await action(id,{type:'stock_done'});}
  for(const n of [10,8,10,9,5])for(const id of ['p0','p1'])await roll(id,n);
  await roll('p0',1);await action('p0',{type:'buy',decision:'buy'});await roll('p1',1);
  for(const [ms,n]of [[900000,9],[1320000,8]]){await moveTo(ms);for(const id of ['p0','p1']){const c=h.room.state.routeFlow.activeChoice,other=h.pages[id==='p0'?1:0];await other.waitForFunction(r=>latestState.revision>=r,h.room.state.revision);assert.equal(await other.evaluate(()=>latestState.self.routeChoice),undefined);await action(id,{type:'route_skip',opportunityId:c.opportunityId,candidateVersion:c.candidateVersion});await roll(id,n);if(h.room.state.phase==='buy')await action(id,{type:'buy',decision:'buy'});}}
  await h.pages[1].evaluate(()=>socket.disconnect());await h.pages[0].waitForFunction(()=>latestState.decision.paused);await moveTo(1680000);await h.pages[1].evaluate(()=>socket.connect());await h.pages[0].waitForFunction(()=>!latestState.decision.paused);
  await roll('p0',10);assert.equal(h.room.state.phase,'buy');const city=h.room.state.pending.cityId;await moveTo(1800000);await h.pages[0].waitForFunction(()=>game.phase==='game_over');assert.equal(h.room.state.cities[city].ownerId,null);assert.equal(h.room.gameRecord.quick.reason,'time_limit');
  for(const page of h.pages){await page.waitForFunction(()=>!!lastRecord?.quick);assert.ok((await page.textContent('#modalBody')).includes('30分钟到时封盘'));}
  await h.pages[1].evaluate(()=>socket.disconnect());await h.pages[1].evaluate(()=>socket.connect());await h.pages[1].waitForFunction(()=>socket.connected&&game.phase==='game_over'&&!!lastRecord?.quick);assert.deepEqual(await h.pages[1].evaluate(()=>lastRecord.quick),h.room.gameRecord.quick);
  fs.writeFileSync(path.join(evidence,'continuous-flow.json'),JSON.stringify({clockInputs:[0,300000,600000,900000,1320000,1680000,1800000],stateFixture:false,randomInjection:'既有骰袋测试接口',actions:log,result:h.room.gameRecord.quick},null,2));assert.deepEqual(h.errors,[]);
});

test('QB11 real total clock preserves an opened route at 28 and closes its sheet at 30',async()=>{
  await restart();for(const ms of [300000,600000]){await moveTo(ms);await h.pages[0].waitForSelector('#choiceModal:not(.hidden)');await h.choose();}
  await moveTo(900000);await h.pages[0].waitForSelector('#routeModal:not(.hidden)');const held=h.room.state.players[0].opportunities.selectedIds.slice();
  await h.pages[1].evaluate(()=>socket.disconnect());await h.pages[0].waitForFunction(()=>latestState.decision.paused);await moveTo(1680000);assert.equal(await h.pages[0].locator('#routeModal').isVisible(),true);assert.equal(h.room.state.routeFlow.laterClosed,true);
  await moveTo(1800000);await h.pages[0].waitForFunction(()=>game.phase==='game_over');assert.equal(await h.pages[0].locator('#routeModal').isVisible(),false);assert.deepEqual(h.room.state.players[0].opportunities.selectedIds,held);await h.pages[1].evaluate(()=>socket.connect());await h.pages[1].waitForFunction(()=>game.phase==='game_over'&&!!lastRecord?.quick);assert.deepEqual(h.errors,[]);
});

test('QB07c mobile touch can open assets and rules in a short landscape viewport',async()=>{
  await restart();const context=await h.browser.newContext({viewport:{width:812,height:375},isMobile:true,hasTouch:true,reducedMotion:'reduce'});const page=await context.newPage();page.on('pageerror',e=>h.errors.push(e.message));
  try{await page.goto(h.url,{waitUntil:'networkidle'});const rp=h.room.players[1];await page.evaluate(d=>new Promise(r=>socket.emit('reconnect',d,r)),{roomCode:h.room.code,name:rp.name,token:rp.token});await page.waitForSelector('#quickClockBar:not(.hidden)');await page.locator('#btnAssets').tap();assert.equal(await page.locator('#modal').isVisible(),true);await page.locator('#modalBody button').last().tap();await page.locator('#btnRules').tap();assert.ok((await page.textContent('#rulesBody')).includes('30分钟'));await page.locator('#btnRulesClose').tap();const m=await page.evaluate(()=>({width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,touchPoints:navigator.maxTouchPoints}));assert.ok(m.touchPoints>0);assert.ok(m.scrollWidth<=m.width+1);measures.push({label:'mobile-touch-landscape',...m});await page.screenshot({path:path.join(evidence,'quick-touch-812x375.png')});}
  finally{const rp=h.room.players[1],token=rp.token;await context.close();await h.pages[1].evaluate(d=>new Promise(r=>{socket.connect();socket.emit('reconnect',d,r);}),{roomCode:h.room.code,name:rp.name,token});await h.pages[0].waitForFunction(()=>!latestState.decision.paused);}
});

test('QB07b actual browser 200 percent zoom keeps the clock and net details usable',{timeout:60000},async()=>{
  await restart();await fixture();const profile=fs.mkdtempSync(path.join(os.tmpdir(),'game-quick-zoom-'));
  const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:1440,height:900},reducedMotion:'reduce'});
  try{
    const settings=await context.newPage();await settings.goto('chrome://settings/appearance');assert.equal(await settings.evaluate(()=>new Promise(r=>globalThis.chrome.settingsPrivate.setDefaultZoom(2,r))),true);
    assert.equal(await settings.evaluate(()=>new Promise(r=>globalThis.chrome.settingsPrivate.getDefaultZoom(r))),2);
    const page=await context.newPage();await page.goto(h.url,{waitUntil:'networkidle'});const rp=h.room.players[0];await page.evaluate(data=>new Promise(r=>socket.emit('reconnect',data,r)),{roomCode:h.room.code,name:rp.name,token:rp.token});await page.waitForSelector('#quickClockBar:not(.hidden)');
    const m=await page.evaluate(()=>({width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,pixelRatio:window.devicePixelRatio}));assert.equal(m.width,720);assert.equal(m.pixelRatio,2);assert.ok(m.scrollWidth<=m.width+1);
    await page.locator('#btnAssets').focus();await page.keyboard.press('Enter');await page.locator('.net-details summary').focus();await page.keyboard.press('Enter');assert.ok((await page.textContent('#modalBody')).includes('抵押本金（负债）'));await page.screenshot({path:path.join(evidence,'quick-actual-zoom-200.png')});measures.push({label:'actual-browser-default-zoom-200',setting:2,...m});
    h.api.closeQuickGame(h.room,'disband');h.api.emitGame(h.room);await page.waitForFunction(()=>game.phase==='game_over');assert.ok((await page.textContent('#modalBody')).includes('提前解散'));
  }finally{await context.close();const target=path.resolve(profile),root=path.resolve(os.tmpdir());if(path.dirname(target)===root&&path.basename(target).startsWith('game-quick-zoom-'))fs.rmSync(target,{recursive:true,force:true});}
});
