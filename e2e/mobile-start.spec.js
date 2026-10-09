'use strict';
/* global socket, latestState, stockDraft, Storage, DOMException, getComputedStyle, returnFromTransfer */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{io}=require('socket.io-client');
const {boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures'),stocks=require('../src/stocks');
const evidence=path.join(__dirname,'../docs/gameplay-usability/mobile-evidence');
let h;const measurements=[],timeout=60000;
test.before(async()=>{
 fs.mkdirSync(evidence,{recursive:true});h=await boot({viewport:{width:375,height:812},mobile:true});await h.choose();
 await h.pages[0].evaluate(()=>setInterval(()=>{window.__fixtureRevision=latestState?.revision||0;},10));
});
test.after(async()=>{fs.writeFileSync(path.join(evidence,'measurements.json'),JSON.stringify(measurements,null,2)+'\n');if(h){fs.writeFileSync(path.join(evidence,'page-errors.json'),JSON.stringify(h.errors,null,2)+'\n');await h.close();}});
async function phone(options={}){
 const ctx=await h.browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,reducedMotion:'reduce'});h.contexts.push(ctx);
 if(options.storageDenied)await ctx.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('受控存储限制','QuotaExceededError');};});
 const page=await ctx.newPage();page.on('pageerror',e=>h.errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(h.url,{waitUntil:'networkidle'});await page.fill('#nickname',options.name||'触控玩家');await page.waitForFunction(()=>!document.getElementById('btnCreate').disabled);
 return {ctx,page};
}
async function partner(code){
 const s=io(h.url,{transports:['websocket'],auth:{clientRouteRevision:'opportunity-routes-v1'}});await new Promise((r,j)=>{s.once('connect',r);s.once('connect_error',j);});
 const res=await new Promise((r,j)=>s.timeout(3000).emit('joinRoom',{roomCode:code,name:'触控搭档'},(e,v)=>e?j(e):r(v)));assert.equal(res.ok,true);return s;
}
function stockState(){const s=f.game(2);f.own(s,'p1','上海');s.phase='stock';s.pending={playerId:'p0',kind:'go_stock',after:'end'};stocks.openStockWindow(s,'p0');return s;}

test('手机触控慢请求只创建/开始一次，受限存储不阻断',{timeout},async()=>{
 const {ctx,page}=await phone({storageDenied:true});let peer;
 try{
  const hint=await page.locator('#view-lobby .orientation-hint').boundingBox(),button=await page.locator('#btnCreate').boundingBox();assert.ok(hint.y+hint.height<button.y);
  await page.screenshot({path:path.join(evidence,'lobby-375.png'),fullPage:true});
  await page.evaluate(()=>{window.__emit=socket.emit.bind(socket);window.__count={};socket.emit=(ev,...args)=>{if(['createRoom','startGame'].includes(ev)){window.__count[ev]=(window.__count[ev]||0)+1;setTimeout(()=>window.__emit(ev,...args),400);return socket;}return window.__emit(ev,...args);};});
  await page.locator('#btnCreate').tap();assert.equal(await page.textContent('#btnCreate'),'正在创建…');assert.equal(await page.locator('#btnCreate').isDisabled(),true);await page.locator('#btnCreate').tap({force:true});
  await page.waitForSelector('#view-room:not(.hidden)');const code=(await page.textContent('#roomCode')).trim();assert.equal(await page.evaluate(()=>window.__count.createRoom),1);assert.ok((await page.textContent('#toast')).includes('保存重连身份'));
  const room=h.api.rooms.get(code);assert.equal([...h.api.rooms.values()].filter(r=>r.players.some(p=>p.socketId===room.hostId)).length,1);
  peer=await partner(code);await page.waitForFunction(()=>!document.getElementById('btnStart').disabled);assert.equal(await page.locator('#view-room .orientation-hint').isVisible(),true);
  await page.locator('#btnStart').tap();assert.equal(await page.textContent('#btnStart'),'正在开始…');await page.locator('#btnStart').tap({force:true});await page.waitForSelector('#choiceModal:not(.hidden)');assert.equal(await page.evaluate(()=>window.__count.startGame),1);assert.equal(room.state.players.length,2);
  measurements.push({scenario:'touch-slow-create-start',createdRequests:1,startRequests:1,storageDenied:true,realPlayers:2});
 }finally{peer?.close();await ctx.close();}
});

test('开局失败与未确认可见，断线不缓存新请求',{timeout},async()=>{
 const {ctx,page}=await phone({name:'反馈玩家'});let peer;
 try{
  await page.fill('#joinCode','000000');await page.locator('#btnJoin').tap();await page.waitForFunction(()=>document.getElementById('connectionStatus').textContent.includes('房间不存在'));
  assert.equal(await page.locator('#btnJoin').isEnabled(),true);
  await page.locator('#btnCreate').tap();await page.waitForSelector('#view-room:not(.hidden)');const code=(await page.textContent('#roomCode')).trim();peer=await partner(code);await page.waitForFunction(()=>!document.getElementById('btnStart').disabled);
  const room=h.api.rooms.get(code),host=room.hostId;room.hostId=peer.id;
  await page.locator('#btnStart').tap();await page.waitForFunction(()=>document.getElementById('connectionStatus').textContent.includes('只有房主'));assert.equal(room.state,null);room.hostId=host;
  await page.evaluate(()=>{window.__timeout=socket.timeout.bind(socket);window.__requests=0;socket.timeout=()=>({emit(_ev,_data,cb){window.__requests++;setTimeout(()=>cb(new Error('受控丢失确认')),300);}});});
  await page.locator('#btnStart').tap();assert.equal(await page.textContent('#btnStart'),'正在开始…');await page.waitForFunction(()=>document.getElementById('connectionStatus').textContent.includes('尚未确认'));assert.equal(await page.evaluate(()=>window.__requests),1);assert.equal(room.state,null);
  await page.evaluate(()=>{socket.timeout=window.__timeout;socket.disconnect();});assert.equal(await page.locator('#btnStart').isDisabled(),true);assert.ok((await page.textContent('#connectionStatus')).includes('连接'));
  await page.evaluate(()=>document.getElementById('btnStart').onclick());assert.equal(await page.evaluate(()=>socket.sendBuffer.length),0);assert.equal(room.state,null);
  await page.evaluate(()=>socket.connect());await page.waitForFunction(()=>socket.connected&&document.getElementById('playerList').textContent.includes('反馈玩家'));
  measurements.push({scenario:'request-feedback',missingRoomVisible:true,notHostVisible:true,unconfirmedNotRetried:true,offlineSendBuffer:0,reconnect:true});
 }finally{peer?.close();await ctx.close();}
});

test('创建和加入丢失回执时仍由本人房间状态确认',{timeout},async()=>{
 const host=await phone({name:'房间确认甲'}),guest=await phone({name:'房间确认乙'});
 try{
  for(const p of [host.page,guest.page])await p.evaluate(()=>{const timeout=socket.timeout.bind(socket);socket.timeout=ms=>({emit(ev,data){return timeout(ms).emit(ev,data,()=>{});}});});
  await host.page.locator('#btnCreate').tap();await host.page.waitForSelector('#view-room:not(.hidden)');const code=(await host.page.textContent('#roomCode')).trim();
  await guest.page.fill('#joinCode',code);await guest.page.locator('#btnJoin').tap();await guest.page.waitForSelector('#view-room:not(.hidden)');await host.page.waitForFunction(()=>!document.getElementById('btnStart').disabled);
  assert.equal(await guest.page.textContent('#roomCode'),code);assert.equal(await guest.page.locator('#connectionStatus').isVisible(),false);
  measurements.push({scenario:'lost-room-ack',createStateConfirmed:true,joinStateConfirmed:true});
 }finally{await host.ctx.close();await guest.ctx.close();}
});

test('手机股票转让未编辑返回恢复同窗草稿并可主动结束',{timeout},async()=>{
 const page=h.pages[0];await page.setViewportSize({width:812,height:375});await h.fixture(stockState());
 await page.locator('button[data-city="上海"][data-kind="buy"][data-delta="1"]').tap();const before=JSON.stringify(h.room.state),deadline=h.room.actionClock.deadlineMs;
 await page.locator('#btnStockTransfer').tap();await page.getByRole('button',{name:'返回',exact:true}).tap();
 assert.equal(await page.locator('#stockModal').isVisible(),true);assert.equal(await page.locator('#modal').isVisible(),false);assert.equal(await page.evaluate(()=>stockDraft['上海'].buy),1);assert.equal(JSON.stringify(h.room.state),before);assert.equal(h.room.actionClock.deadlineMs,deadline);
 await page.screenshot({path:path.join(evidence,'stock-return-812.png')});await page.locator('#btnStockSkip').tap();await page.waitForFunction(()=>latestState.phase!=='stock');assert.notEqual(h.room.state.phase,'stock');
 await h.fixture(stockState());await page.locator('#btnStockTransfer').tap();await page.getByRole('button',{name:'返回',exact:true}).tap();assert.equal(await page.locator('#btnStockConfirm').isDisabled(),true);
 await page.locator('#btnStockTransfer').tap();await page.getByRole('button',{name:'返回',exact:true}).tap();
 await page.locator('#btnStockAssets').tap();await page.locator('#modal').getByRole('button',{name:'股票转让',exact:true}).tap();await page.getByRole('button',{name:'返回',exact:true}).tap();assert.equal(await page.textContent('#modalTitle'),'资产总览');
 await page.getByRole('button',{name:'继续买卖股票',exact:true}).tap();assert.equal(await page.locator('#stockModal').isVisible(),true);
 measurements.push({scenario:'unedited-transfer-return',stockRestored:true,draftBuy:1,stateAndDeadlineUnchanged:true,canSkipImmediately:true,assetOriginReturnsToAssets:true});
});

test('过期转让返回不打开旧股票窗口或关闭新决定',{timeout},async()=>{
 const page=h.pages[0];await h.fixture(stockState());await page.locator('#btnStockTransfer').tap();
 const s=f.game(2);s.phase='buy';s.pending={playerId:'p0',cityId:'上海'};await h.fixture(s);
 const title=await page.textContent('#modalTitle'),before=JSON.stringify(h.room.state);await page.evaluate(()=>returnFromTransfer());
 assert.equal(await page.locator('#stockModal').isVisible(),false);assert.equal(await page.locator('#modal').isVisible(),true);assert.equal(await page.textContent('#modalTitle'),title);assert.equal(JSON.stringify(h.room.state),before);
});

test('手机横屏三段布局与三端文字/触控矩阵',{timeout},async()=>{
 const page=h.pages[0],s=f.game(2);f.own(s,'p0','上海');s.cities['上海'].houseLevel=4;s.players[0].name='十二个汉字姓名显示测试';f.own(s,'p1','东京');s.cities['东京'].mortgaged=true;await h.fixture(s);
 for(const [width,height] of [[320,568],[375,812],[430,932],[568,320],[812,375],[884,330],[932,430],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await page.locator('#board .sq').first().scrollIntoViewIfNeeded();
  const m=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
    return {width:window.innerWidth,height:window.innerHeight,overflow:document.documentElement.scrollWidth>window.innerWidth,main:rect(document.getElementById('gameMain')),bar:rect(document.getElementById('actionBar')),header:rect(document.querySelector('header')),barPosition:getComputedStyle(document.getElementById('actionBar')).position,
    names:[...document.querySelectorAll('#board .sq')].map(el=>{const n=el.querySelector('.nm'),a=rect(el),b=rect(n);return {text:n.textContent,font:parseFloat(getComputedStyle(n).fontSize),display:getComputedStyle(n).display,within:b.x>=a.x-1&&b.x+b.width<=a.x+a.width+1&&b.y>=a.y-1&&b.bottom<=a.bottom+1,ownerOverflow:el.querySelector('.own')?.scrollHeight>el.querySelector('.own')?.clientHeight};}),
    controls:['btnRoll','btnAssets','btnBank','btnEndTurn'].map(id=>({id,...rect(document.getElementById(id))}))};
  });
  assert.equal(m.overflow,false,JSON.stringify(m));assert.equal(m.names.length,42);assert.ok(m.names.every(n=>n.display!=='none'&&n.font>=10&&n.within&&!n.ownerOverflow),JSON.stringify(m.names));assert.ok(m.controls.every(c=>c.height>=44));
  if(width>height&&height<=500&&width<=1200){assert.equal(m.barPosition,'relative');assert.ok(m.main.bottom<=m.bar.y);assert.ok(m.main.height>=height*.33);assert.ok(m.bar.bottom<=height+1);assert.ok(m.header.height<=48);assert.equal(await page.locator('#mapScrollHint').isVisible(),true);}
  for(const index of [0,11,21,31,41]){const tile=page.locator('#board .sq').nth(index);await tile.scrollIntoViewIfNeeded();if(width>height&&height<=500){const r=await tile.boundingBox(),bar=await page.locator('#actionBar').boundingBox();assert.ok(r.y+r.height<=bar.y+1);}}
  await page.locator('#board .sq').first().scrollIntoViewIfNeeded();
  if([375,884,1440].includes(width))await page.screenshot({path:path.join(evidence,'layout-'+width+'.png')});
  measurements.push({scenario:'layout',...m});
 }
 assert.deepEqual(h.errors,[]);
});

test('WebSocket不可用时回退轮询并能触控创建',{timeout},async()=>{
 const ctx=await h.browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});h.contexts.push(ctx);
 await ctx.addInitScript(()=>{window.WebSocket=class {constructor(){setTimeout(()=>this.onerror?.(new window.Event('error')),10);}close(){}send(){}};});
 const page=await ctx.newPage();page.on('pageerror',e=>h.errors.push(e.message));
 try{
  await page.goto(h.url,{waitUntil:'domcontentloaded'});await page.fill('#nickname','轮询玩家');await page.waitForFunction(()=>socket.connected);
  assert.equal(await page.evaluate(()=>socket.io.engine.transport.name),'polling');await page.locator('#btnCreate').tap();await page.waitForSelector('#view-room:not(.hidden)');assert.match((await page.textContent('#roomCode')).trim(),/^\d{6}$/);
  measurements.push({scenario:'websocket-fallback',transport:'polling',createSucceeded:true});assert.deepEqual(h.errors,[]);
 }finally{await ctx.close();}
});
