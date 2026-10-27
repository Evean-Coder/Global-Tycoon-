'use strict';
/* global game, phoneLayout, stockDraft, socket, PhoneLayout, requestPieceLayout */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {bootPhone,fixture,setScreen}=require('./helpers/phoneFixtures'),{settleBoardLayout}=require('./helpers/browserHarness');
const engine=process.env.PHONE_TEST_BROWSER||'chromium',dir=path.join(process.env.E2E_EVIDENCE_ROOT||'docs/phone-aspect-adaptation/evidence/verified',engine,'viewport');let h;const observations=[];
async function mockVisible(page,values){await page.evaluate(values=>{for(const [key,value]of Object.entries(values))Object.defineProperty(window.visualViewport,key,{value,configurable:true});window.visualViewport.dispatchEvent(new window.Event('resize'));},values);await page.evaluate(()=>new Promise(r=>window.requestAnimationFrame(()=>window.requestAnimationFrame(r))));}
async function restoreVisible(page){await page.evaluate(()=>{for(const key of ['width','height','offsetTop','offsetLeft','scale'])delete window.visualViewport[key];window.visualViewport.dispatchEvent(new window.Event('resize'));});await settleBoardLayout(page);}
test.before(async()=>{fs.mkdirSync(dir,{recursive:true});h=await bootPhone();for(const p of h.pages)p.setDefaultTimeout(5000);});
test.after(async()=>{fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({engine,scope:'浏览器API／界面验证；非实体机系统键盘',observations},null,2)+'\n');if(h)await h.close();});

test('automatic fitting recovers from a short viewport while manual map zoom remains an independent choice',async()=>{
 const p=h.pages[0];await h.fixture(fixture());const before=JSON.stringify(h.room.state),deadline=h.room.actionClock.deadlineMs;
 await setScreen(p,569,220);assert.equal(await p.evaluate(()=>phoneLayout.mapMode),'scroll');await setScreen(p,693,390);assert.equal(await p.evaluate(()=>phoneLayout.mapMode),'overview');
 await p.click('#btnCompactInfo');await p.click('#btnZoomMap');await p.waitForFunction(()=>phoneLayout.mapMode==='zoom');await setScreen(p,568,260);assert.equal(await p.evaluate(()=>phoneLayout.mapMode),'zoom');
 h.api.emitGame(h.room);await settleBoardLayout(p);assert.equal(await p.evaluate(()=>phoneLayout.mapMode),'zoom');await p.click('#btnCompactInfo');await p.click('#btnZoomMap');await p.waitForFunction(()=>phoneLayout.mapMode==='overview');
 assert.equal(JSON.stringify(h.room.state),before);assert.equal(h.room.actionClock.deadlineMs,deadline);observations.push({automaticRecovery:true,manualZoomPreserved:true});
});

test('visible keyboard rectangle keeps stock drafts, disclosure and funding controls through broadcasts',{timeout:30000},async()=>{
 const p=h.pages[0];await setScreen(p,844,390);const s=fixture();s.turnIndex=0;await h.fixture(s);await p.waitForSelector('#managementModal:not(.hidden)');await p.click('#btnCloseManagement');
 await p.click('#btnCompactInfo');await p.locator('#btnStock').scrollIntoViewIfNeeded();await p.click('#btnStock');await p.waitForSelector('#stockModal:not(.hidden)');
 const plus=p.locator('[data-stock-city="开罗"] [data-kind=buy][data-delta="1"]');await plus.tap();await p.locator('[data-stock-city="开罗"] details').evaluate(el=>el.open=true);
 const draft=await p.evaluate(()=>JSON.stringify(stockDraft)),deadline=h.room.actionClock.deadlineMs,before=JSON.stringify(h.room.state);
 try{
  await mockVisible(p,{width:844,height:220,offsetTop:30,offsetLeft:0,scale:1});await p.waitForFunction(()=>phoneLayout.modalRect.height===220);
  const modal=await p.locator('#stockModal .modal').boundingBox();assert.ok(modal.y>=30&&modal.y+modal.height<=250.5,JSON.stringify(modal));
  await p.locator('#btnStockConfirm').scrollIntoViewIfNeeded();assert.ok(await p.locator('#btnStockConfirm').isVisible());assert.equal(await p.evaluate(()=>JSON.stringify(stockDraft)),draft);
  h.room.state.players[1].cash+=17;h.room.state.revision++;h.api.emitGame(h.room);await p.waitForFunction(v=>game.revision>=v,h.room.state.revision);
  assert.equal(await p.evaluate(()=>JSON.stringify(stockDraft)),draft);assert.equal(await p.locator('[data-stock-city="开罗"] details').getAttribute('open'),'');assert.equal(h.room.actionClock.deadlineMs,deadline);
  const expected=JSON.parse(before);expected.players[1].cash+=17;expected.revision++;assert.equal(JSON.stringify(h.room.state),JSON.stringify(expected));
  await p.click('#btnStockRules');await p.click('#btnRulesClose');assert.equal(await p.evaluate(()=>JSON.stringify(stockDraft)),draft);observations.push({keyboard:'controlled VisualViewport API',draftPreserved:true,modal});
 }finally{await restoreVisible(p);}
 await p.click('#btnStockSkip');await p.waitForSelector('#stockModal',{state:'hidden'});
});

test('real page pinch zoom is not undone, safe area is not doubled, and diagnostics contain layout only',{timeout:30000},async()=>{
 const p=h.pages[0];await h.fixture(fixture());await setScreen(p,844,390);const before=JSON.stringify(h.room.state),deadline=h.room.actionClock.deadlineMs;
 if(engine==='chromium'){
  const cdp=await p.context().newCDPSession(p);try{await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});await p.waitForFunction(()=>window.visualViewport.scale>1.9);await p.evaluate(()=>new Promise(r=>window.requestAnimationFrame(()=>window.requestAnimationFrame(r))));assert.equal(await p.evaluate(()=>phoneLayout.frameWidth),844);assert.ok(await p.evaluate(()=>window.visualViewport.scale>1.9));observations.push({pinch:'actual Chromium page scale',scale:await p.evaluate(()=>window.visualViewport.scale)});}finally{await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await cdp.detach();}
 }else{try{await mockVisible(p,{width:422,height:195,scale:2});assert.equal(await p.evaluate(()=>phoneLayout.frameWidth),844);observations.push({pinch:'controlled WebKit VisualViewport input, not physical gesture'});}finally{await restoreVisible(p);}}
 await p.evaluate(()=>{document.body.style.setProperty('--compact-safe-right','24px');document.body.style.setProperty('--compact-safe-bottom','20px');});
 try{await mockVisible(p,{width:820,height:370,offsetTop:0,offsetLeft:0,scale:1});assert.deepEqual(await p.evaluate(()=>({w:phoneLayout.availableWidth,h:phoneLayout.availableHeight,right:phoneLayout.safeRight,bottom:phoneLayout.safeBottom})),{w:820,h:370,right:0,bottom:0});}
 finally{await p.evaluate(()=>{document.body.style.removeProperty('--compact-safe-right');document.body.style.removeProperty('--compact-safe-bottom');});await restoreVisible(p);}
 await p.click('#btnCompactInfo');await p.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true});Object.defineProperty(document.documentElement,'requestFullscreen',{value:async()=>{throw new Error('denied');},configurable:true});});
 try{await p.click('#btnCopyPhoneFit');const data=JSON.parse(await p.locator('#phoneDiagnosticText').textContent());assert.deepEqual(Object.keys(data).sort(),['revision','layout','visible','available','safe','scale','density','mapMode','reason','features'].sort());assert.equal(JSON.stringify(data).includes('环球商会'),false);assert.equal(JSON.stringify(data).includes('token'),false);
  await p.click('#btnPhoneFullscreen');await p.waitForFunction(()=>!document.getElementById('btnPhoneFullscreen').disabled);assert.equal(await p.locator('#compactInfoModal').isVisible(),true);
 }finally{await p.evaluate(()=>{delete navigator.clipboard;delete document.documentElement.requestFullscreen;});}
 await p.click('#btnCompactInfoClose');assert.equal(JSON.stringify(h.room.state),before);assert.equal(h.room.actionClock.deadlineMs,deadline);assert.deepEqual(h.errors,[]);
});

test('entry pages remain scrollable with a keyboard-sized viewport and a new room can start after the orientation gate',{timeout:40000},async()=>{
 const context=await h.browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,reducedMotion:'reduce'});h.contexts.push(context);await context.addInitScript(()=>Object.defineProperty(window.screen.orientation,'lock',{value:undefined,configurable:true}));const p=await context.newPage();p.on('pageerror',e=>h.errors.push(e.message));p.on('dialog',d=>d.accept());let code;
 try{await p.goto(h.url,{waitUntil:'networkidle'});await p.fill('#nickname','适配入口核对');await mockVisible(p,{width:375,height:240,offsetTop:0,offsetLeft:0,scale:1});await p.locator('#btnCreate').scrollIntoViewIfNeeded();await p.click('#btnCreate');await p.waitForSelector('#view-room:not(.hidden)');code=(await p.textContent('#roomCode')).trim();
  await p.locator('#btnAddBot').scrollIntoViewIfNeeded();await p.click('#btnAddBot');await p.locator('input[name=gameModeCard][value=quick]').check();await p.waitForFunction(()=>!document.getElementById('btnStart').disabled);await restoreVisible(p);
  await p.click('#btnStart');await p.waitForSelector('#orientationGate:not(.hidden)');await p.setViewportSize({width:812,height:375});await p.waitForSelector('#choiceModal:not(.hidden)');await p.locator('#choiceCards button').first().click();await p.waitForSelector('#choiceModal',{state:'hidden'});await p.waitForSelector('#board .sq');
  assert.equal(await p.locator('#board .sq').count(),42);assert.equal(await p.evaluate(()=>game.gameMode),'quick');await p.click('#btnRoll');await p.waitForFunction(()=>game.players[0].position>0);assert.ok(h.api.rooms.get(code).state.players[0].position>0);observations.push({entryPortraitWithKeyboard:true,roomMode:true,landscapeStart:true,realHumanBotRoll:true});
 }finally{if(code){const clean=await p.evaluate(()=>new Promise(resolve=>socket.timeout(5000).emit('disbandRoom',{},(e,r)=>resolve(!e&&r?.ok===true))));assert.equal(clean,true);}await context.close();}
 assert.deepEqual(h.errors,[]);
});

test('missing visual viewport and fullscreen APIs retain playable layout and keyboard access',async()=>{
 const p=h.pages[0];await h.fixture(fixture());await setScreen(p,844,390);
 await p.evaluate(()=>{window.phoneVisualDescriptor=Object.getOwnPropertyDescriptor(window,'visualViewport');Object.defineProperty(window,'visualViewport',{value:undefined,configurable:true});Object.defineProperty(document.documentElement,'requestFullscreen',{value:undefined,configurable:true});window.dispatchEvent(new window.Event('resize'));});
 try{await p.waitForFunction(()=>phoneLayout.availableWidth===844&&phoneLayout.mapMode==='overview');await p.click('#btnCompactInfo');await p.locator('#btnPhoneFullscreen').focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#compactInfoModal').isVisible(),true);await p.click('#btnCompactInfoClose');observations.push({missingVisualViewport:true,missingFullscreen:true,keyboardControl:true});}
 finally{await p.evaluate(()=>{Object.defineProperty(window,'visualViewport',window.phoneVisualDescriptor);delete document.documentElement.requestFullscreen;window.dispatchEvent(new window.Event('resize'));});}
 assert.deepEqual(h.errors,[]);
});

test('resize bursts coalesce and geometry settles without continuous recomputation',async()=>{
 const p=h.pages[0];await h.fixture(fixture());await setScreen(p,844,390);
 await p.evaluate(()=>{window.savedPhoneCompute=PhoneLayout.compute;window.phoneComputes=0;PhoneLayout.compute=(...args)=>{window.phoneComputes++;return window.savedPhoneCompute(...args);};for(let i=0;i<100;i++){window.dispatchEvent(new window.Event('resize'));window.visualViewport?.dispatchEvent(new window.Event('scroll'));}});
 try{await p.waitForTimeout(400);const count=await p.evaluate(()=>window.phoneComputes);assert.ok(count>0&&count<=12,String(count));await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>window.phoneComputes),count);observations.push({resizeEvents:200,computeCalls:count,stableAfterMs:400});}
 finally{await p.evaluate(()=>PhoneLayout.compute=window.savedPhoneCompute);}
 await p.evaluate(async()=>{for(let n=0;n<28;n++){requestPieceLayout([]);await new Promise(r=>window.requestAnimationFrame(r));}});assert.equal(await p.evaluate(()=>phoneLayout.reasonCode),'layout_feedback');await p.evaluate(()=>window.dispatchEvent(new window.Event('resize')));await p.waitForFunction(()=>phoneLayout.mapMode==='overview');observations.push({observerLoopBounded:true,externalEventRecovers:true});
});
