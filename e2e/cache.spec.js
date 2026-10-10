'use strict';
/* global socket, caches, Response, getComputedStyle, localStorage, fetch */
const test=require('node:test'),assert=require('node:assert/strict'),{boot}=require('./helpers/browserHarness');
const fs=require('node:fs'),path=require('node:path'),workerFixture=path.join(__dirname,'../public/__usability-previous-sw.js');
let h;
test.before(async()=>{assert.equal(fs.existsSync(workerFixture),false);h=await boot();});test.after(async()=>{if(h)await h.close();if(fs.existsSync(workerFixture))fs.unlinkSync(workerFixture);});
test('静态缓存升级 / 本地海面地图 / 旧协议提示 / 离线壳',{timeout:60000},async()=>{
 const page=h.pages[0];await h.choose();
 const before=JSON.stringify(h.room.state);
 const error=await page.evaluate(()=>new Promise(resolve=>socket.emit('action',{type:'roll_dice'},resolve)));assert.equal(error.ok,false);assert.ok(error.error.includes('刷新'));
 assert.equal(JSON.stringify(h.room.state),before);
 // 上一发布提交的实际HTML/CSS/JS进入v5缓存；旧CSS实际加载后再走新SW迁移。
 const previous=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/previous-cache-v5.json'),'utf8')).files;
 const previousWorker=previous['sw.js'].replace('c.addAll(CORE)','c.addAll([])'); // 旧资源由下方确定性种入，不再从新服务器预取。
 fs.writeFileSync(workerFixture,previousWorker);
 await page.evaluate(async()=>{const r=await navigator.serviceWorker.register('/__usability-previous-sw.js',{scope:'/'});await r.update();});
 await page.evaluate(async()=>{const end=Date.now()+5000;while(Date.now()<end){const keys=await caches.keys();if(keys.includes('global-tycoon-v5-travel')&&!keys.includes('global-tycoon-v12-atlas'))return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('旧worker安装未完成');});
 await page.evaluate(async old=>{const cache=await caches.open('global-tycoon-v5-travel');for(const [file,body]of Object.entries(old)){if(file==='sw.js')continue;await cache.put('/'+file,new Response(body));if(file!=='index.html')await cache.put('/'+file+'?v=20261005-travel',new Response(body));}await cache.put('/',new Response(old['index.html']));const css=await cache.match('/style.css');const style=document.createElement('style');style.id='previous-style';style.textContent=await css.text();document.head.append(style);},previous);
 await page.setViewportSize({width:375,height:812});assert.equal(await page.locator('#board .nm').first().evaluate(el=>getComputedStyle(el).display),'none');
 await page.evaluate(async()=>{await caches.open('global-tycoon-v6-usability');await caches.open('global-tycoon-v7-mobile');await caches.open('global-tycoon-v8-mobile');await caches.open('global-tycoon-v10-routes');document.getElementById('previous-style').remove();const registration=await navigator.serviceWorker.register('/sw.js');await registration.update();});
 await page.evaluate(async()=>{const end=Date.now()+5000;while(Date.now()<end){const keys=await caches.keys();if(keys.includes('global-tycoon-v12-atlas')&&!keys.includes('global-tycoon-v5-travel'))return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('新缓存安装/旧缓存清理未完成：'+JSON.stringify(await caches.keys()));});
 const keys=await page.evaluate(()=>caches.keys());assert.ok(keys.includes('global-tycoon-v12-atlas'),JSON.stringify(keys));assert.equal(keys.includes('global-tycoon-v6-usability'),false);assert.equal(keys.includes('global-tycoon-v7-mobile'),false);assert.equal(keys.includes('global-tycoon-v8-mobile'),false);assert.equal(keys.includes('global-tycoon-v10-routes'),false);
 await page.reload({waitUntil:'networkidle'});await page.waitForSelector('#board .sq');assert.equal(await page.locator('#board .nm').first().evaluate(el=>getComputedStyle(el).display),'block');
 assert.equal(await page.locator('script[src="rules-catalog.js?v=20261010-atlas-v1"]').count(),1);await page.click('#btnRules');assert.equal(await page.locator('.rules-opportunity').count(),12);await page.click('#btnRulesClose');
 // New version failures must not resolve to an unversioned cached old script.
 const strict=await page.evaluate(async()=>{const cache=await caches.open('global-tycoon-v12-atlas');await cache.put('/client.js',new Response('old-client-marker'));await cache.delete('/client.js?v=unavailable-route-version');await cache.delete('/socket.io/?EIO=4&transport=polling');return true;});assert.equal(strict,true);
 await page.context().setOffline(true);const unavailable=await page.evaluate(async()=>{const r=await fetch('/client.js?v=unavailable-route-version');return {status:r.status,body:await r.text()};});assert.equal(unavailable.status,503);assert.equal(unavailable.body.includes('old-client-marker'),false);
 assert.equal(await page.evaluate(async()=>{try{await fetch('/socket.io/?EIO=4&transport=polling');return true;}catch{return false;}}),false);await page.context().setOffline(false);
 for(const asset of ['board-world-map-v1.webp','atlas-background-v1.webp']){const response=await page.request.get(h.url+'/assets/'+asset);assert.equal(response.status(),200);assert.ok(response.headers()['content-type'].includes('image/webp'));}
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundImage.includes('atlas-background-v1.webp')),true);
 await page.evaluate(()=>localStorage.removeItem('gt_reconnect'));await page.context().setOffline(true);await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.locator('#nickname').count(),1);assert.equal(await page.locator('#btnCreate').count(),1);assert.equal(await page.locator('#view-lobby .orientation-hint').isVisible(),true);await page.click('#btnRules');assert.equal(await page.locator('.rules-opportunity').count(),12);await page.click('#btnRulesClose');assert.equal(await page.evaluate(()=>socket.connected),false);await page.context().setOffline(false);
 const blocked=await h.browser.newContext({viewport:{width:375,height:812},serviceWorkers:'block',reducedMotion:'reduce'});h.contexts.push(blocked);const p=await blocked.newPage();p.on('pageerror',e=>h.errors.push(e.message));let images=0;await p.route('**/assets/*.webp',route=>{images++;return route.abort();});await p.goto(h.url,{waitUntil:'networkidle'});const rp=h.room.players[0];await p.evaluate(data=>new Promise(resolve=>socket.emit('reconnect',data,resolve)),{roomCode:h.room.code,name:rp.name,token:rp.token});await p.waitForSelector('#board .sq');assert.ok(images>=2);assert.equal(await p.locator('#board .nm').count(),42);assert.equal(await p.locator('#board .nm').first().evaluate(el=>getComputedStyle(el).display),'block');await p.locator('#board [data-square-id="1"]').click();assert.equal(await p.locator('#modal').isVisible(),true);
 assert.deepEqual(h.errors,[]);
});


