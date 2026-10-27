'use strict';
/* global stockDraft */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {boot,settleBoardLayout}=require('./helpers/browserHarness'),{createGameState}=require('../src/state'),f=require('../test/helpers/gameplayFixtures'),stocks=require('../src/stocks');
const dir=process.env.E2E_EVIDENCE_ROOT?path.join(process.env.E2E_EVIDENCE_ROOT,'mobile-landscape-edge'):path.join(__dirname,'../docs/qq-browser-edge/evidence/fixed');
let h;const measurements=[];
function fixture(mode='normal'){
 const s=createGameState('EDGE',['玩家甲','玩家乙'],2,{gameMode:mode,...(mode==='quick'?{quickRevision:'quick-mode-v1',routeRevision:'opportunity-routes-v1'}:{})});
 s.phase='waiting_roll';s.pending=null;s.firstRoundDone=true;f.own(s,'p1','罗马');s.players.forEach(p=>p.position=9);
 s.world.status='running';s.world.active={type:'boom',name:'地区旺季',region:'欧洲',remaining:2,description:'欧洲城市租金变化。'};
 return s;
}
async function setInsets(page,insets){
 await page.evaluate(values=>{for(const [edge,value]of Object.entries(values))document.body.style.setProperty('--compact-safe-'+edge,value+'px');window.dispatchEvent(new window.Event('resize'));},insets);
 await page.waitForFunction(values=>{const css=window.getComputedStyle(document.body);return Object.entries(values).every(([edge,value])=>edge==='left'||css['padding'+edge[0].toUpperCase()+edge.slice(1)]===value+'px');},insets,{timeout:2000});await settleBoardLayout(page);
}
async function geometry(page){return page.evaluate(()=>{
 const ids=['boardWrap','actionBar','boardMap','side'],rects=Object.fromEntries(ids.map(id=>[id,document.getElementById(id).getBoundingClientRect().toJSON()]));
 const css=window.getComputedStyle(document.body);return {...rects,header:document.querySelector('header').getBoundingClientRect().toJSON(),padding:[css.paddingTop,css.paddingRight,css.paddingBottom,css.paddingLeft],width:window.innerWidth,height:window.innerHeight,overflow:document.documentElement.scrollWidth>window.innerWidth,tiles:document.querySelectorAll('#board .sq').length,boardScroll:document.getElementById('boardWrap').scrollHeight-document.getElementById('boardWrap').clientHeight};
 });}
test.before(async()=>{fs.mkdirSync(dir,{recursive:true});h=await boot({mobile:true,viewport:{width:844,height:382},gameMode:'quick',quickClockOptions:f.fakeClock()});await h.choose();});
test.after(async()=>{if(h)await h.close();fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify({physicalDevices:'未测；Chromium/Edge触屏及UA模拟',measurements},null,2)+'\n');});

test('phone landscape uses the freed left area at every reported inset, preserving full board and right edge',{timeout:45000},async()=>{
 const p=h.pages[0];
 for(const mode of ['normal','quick'])for(const [width,height]of [[568,280],[844,382],[932,430]]){
  await p.setViewportSize({width,height});await h.fixture(fixture(mode));let baseline;
  for(const left of [0,8,40,80]){
   await setInsets(p,{left,right:0,top:0,bottom:0});const m=await geometry(p);baseline||=m;
   assert.equal(m.padding[3],'0px');assert.equal(m.header.left,0);assert.ok(Math.abs(m.boardWrap.left-4)<.5);assert.ok(Math.abs(m.actionBar.left-4)<.5);
   assert.equal(m.boardWrap.width,baseline.boardWrap.width);assert.equal(m.actionBar.right,baseline.actionBar.right);assert.equal(m.tiles,42);assert.equal(m.boardScroll,0);assert.equal(m.overflow,false);
   assert.ok(m.boardWrap.right<=m.side.left+1);assert.ok(m.actionBar.bottom<=height);for(const id of ['btnRoll','btnManagement','btnAssets','btnBank','btnCompactInfo'])assert.ok((await p.locator('#'+id).boundingBox()).height>=44);
   measurements.push({mode,left,...m});
  }
  await p.locator('#toast').evaluate(el=>el.classList.add('hidden'));await p.screenshot({path:path.join(dir,mode+'-'+width+'x'+height+'.png')});
 }
 assert.deepEqual(h.errors,[]);
});

test('the same left alignment applies to QQ, other Android and iOS while other three safe edges survive',{timeout:30000},async()=>{
 const p=h.pages[0];await p.setViewportSize({width:844,height:382});await h.fixture(fixture());const cdp=await p.context().newCDPSession(p);
 try{for(const userAgent of [
  'Mozilla/5.0 (Linux; Android 13; TEST) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 MQQBrowser/15.0',
  'Mozilla/5.0 (Linux; Android 13; TEST) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
 ]){
  await cdp.send('Emulation.setUserAgentOverride',{userAgent});await p.evaluate(()=>window.dispatchEvent(new window.Event('resize')));await setInsets(p,{left:40,right:24,top:12,bottom:20});const m=await geometry(p);
  assert.deepEqual(m.padding,['12px','24px','20px','0px'],JSON.stringify(m));assert.equal(m.header.left,0);assert.ok(Math.abs(m.boardWrap.left-4)<.5);assert.equal(m.header.right,820);assert.ok(m.actionBar.right<=820&&m.actionBar.bottom<=362);assert.equal(m.overflow,false);measurements.push({userAgent,...m});
 }}finally{await cdp.detach();}
 assert.deepEqual(h.errors,[]);
});

test('left inset and opponent broadcasts keep stock quantity, reading state, game funds and deadline',async()=>{
 const p=h.pages[0];await setInsets(p,{left:0,right:0,top:0,bottom:0});const s=fixture();s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};stocks.openStockWindow(s,'p0');await h.fixture(s);
 await p.locator('[data-city="罗马"][data-kind="buy"][data-delta="1"]').first().tap();await p.locator('#stockModal .stock-item details').first().evaluate(el=>el.open=true);
 const before=JSON.stringify(h.room.state),deadline=h.room.actionClock.deadlineMs,draft=await p.evaluate(()=>JSON.stringify(stockDraft));
 await setInsets(p,{left:80});assert.equal(JSON.stringify(h.room.state),before);assert.equal(h.room.actionClock.deadlineMs,deadline);assert.equal(await p.evaluate(()=>JSON.stringify(stockDraft)),draft);assert.equal(await p.locator('#stockModal').isVisible(),true);assert.equal(await p.locator('#stockModal .stock-item details').first().getAttribute('open'),'');
 h.api.emitGame(h.room);await settleBoardLayout(p);assert.equal(await p.evaluate(()=>JSON.stringify(stockDraft)),draft);assert.equal(await p.locator('#stockModal .stock-item details').first().getAttribute('open'),'');assert.equal(h.room.actionClock.deadlineMs,deadline);assert.equal(JSON.stringify(h.room.state),before);
 await p.click('#btnStockRules');await p.click('#btnRulesClose');assert.equal(await p.evaluate(()=>JSON.stringify(stockDraft)),draft);assert.deepEqual(h.errors,[]);
});
