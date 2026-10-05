'use strict';
/* global socket, caches, Response, getComputedStyle */
const test=require('node:test'),assert=require('node:assert/strict'),{boot}=require('./helpers/browserHarness');
let h;
test.before(async()=>{h=await boot();});test.after(async()=>{if(h)await h.close();});
test('静态缓存升级 / 本地海面地图 / 旧协议提示 / 离线壳',async()=>{
 const page=h.pages[0];await h.choose();
 const before=JSON.stringify(h.room.state);
 const error=await page.evaluate(()=>new Promise(resolve=>socket.emit('action',{type:'roll_dice'},resolve)));assert.equal(error.ok,false);assert.ok(error.error.includes('刷新'));
 assert.equal(JSON.stringify(h.room.state),before);
 await page.evaluate(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();const old=await caches.open('global-tycoon-v3-ocean');await old.put('/old-client.js',new Response('旧协议缓存'));const registration=await navigator.serviceWorker.register('/sw.js');await new Promise(resolve=>{if(registration.active)return resolve();const worker=registration.installing||registration.waiting;worker.addEventListener('statechange',()=>{if(worker.state==='activated')resolve();});});});
 await page.waitForFunction(async()=>!(await caches.keys()).includes('global-tycoon-v3-ocean'));
 const keys=await page.evaluate(()=>caches.keys());assert.ok(keys.includes('global-tycoon-v5-travel'));
 for(const asset of ['world-map-ocean.png','ocean-surface.png']){const response=await page.request.get(h.url+'/assets/'+asset);assert.equal(response.status(),200);assert.ok(response.headers()['content-type'].includes('image/png'));}
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundImage.includes('ocean-surface.png')),true);
 await page.context().setOffline(true);await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.locator('#nickname').count(),1);assert.equal(await page.locator('#btnCreate').count(),1);await page.context().setOffline(false);
 assert.deepEqual(h.errors,[]);
});
