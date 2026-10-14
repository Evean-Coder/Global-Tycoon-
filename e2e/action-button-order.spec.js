'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures'),stocks=require('../src/stocks');
const dir=process.env.E2E_EVIDENCE_ROOT?path.join(process.env.E2E_EVIDENCE_ROOT,'action-button-order'):path.join(__dirname,'../docs/action-button-order/evidence'),measurements=[];
let h;
test.before(async()=>{fs.mkdirSync(dir,{recursive:true});h=await boot({mobile:true});await h.choose();});
test.after(async()=>{if(h)await h.close();fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify({browser:'Microsoft Edge headless touch emulation',physicalDevices:'未测；三端模拟视口',measurements},null,2));});
test('roll then management ordering is shared across modes, viewports and stock continuation',{timeout:60000},async()=>{
 const p=h.pages[0];
 for(const mode of ['normal','quick'])for(const [width,height]of [[1440,900],[1024,768],[768,1024],[932,430],[568,320]]){
  await p.setViewportSize({width,height});const s=f.game(2);s.gameMode=mode;if(mode==='quick')s.quickRevision='quick-mode-v1';f.own(s,'p1','上海');await h.fixture(s);
  await p.evaluate(()=>new Promise(r=>window.requestAnimationFrame(()=>window.requestAnimationFrame(r))));
  const order=await p.evaluate(()=>{
   const ids=['btnRoll','btnManagement','btnAssets','btnBank'];
   return {buttons:ids.map(id=>({id,...document.getElementById(id).getBoundingClientRect().toJSON()})),dom:[...document.querySelectorAll('#actionBar>button')].map(b=>b.id).filter(id=>ids.includes(id)),overflow:document.documentElement.scrollWidth>window.innerWidth+1};
  });
  assert.deepEqual(order.dom,['btnRoll','btnManagement','btnAssets','btnBank']);assert.equal(order.overflow,false);
  for(let i=1;i<order.buttons.length;i++){const previous=order.buttons[i-1],current=order.buttons[i];assert.ok(current.left>=previous.right-1&&Math.abs(current.top-previous.top)<1,JSON.stringify({mode,width,height,order}));}
  await p.locator('#btnAssets').tap();await p.waitForSelector('#modalTitle:text-is("资产总览")');await p.getByRole('button',{name:'关闭',exact:true}).last().tap();
  await p.locator('#toast').waitFor({state:'hidden',timeout:5000});await p.locator('#actionBar').screenshot({path:path.join(dir,mode+'-'+width+'x'+height+'.png')});
  const trading=globalThis.structuredClone(h.room.state);trading.phase='stock';trading.pending={playerId:'p0',kind:'go_stock',after:'end'};stocks.openStockWindow(trading,'p0');await h.fixture(trading);await p.waitForSelector('#stockModal:not(.hidden)');
  const resume=await p.locator('#btnResumeStock').boundingBox();assert.equal(await p.locator('#btnRoll').isVisible(),false);assert.ok(Math.abs(resume.x-order.buttons[0].x)<1&&Math.abs(resume.y-order.buttons[0].y)<1);const management=await p.locator('#btnManagement').boundingBox();assert.ok(management.x>=resume.x+resume.width-1);measurements.push({mode,width,height,order,resume});
 }
 assert.deepEqual(h.errors,[]);
});
