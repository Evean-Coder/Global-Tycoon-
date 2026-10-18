'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures');
const dir=process.env.E2E_EVIDENCE_ROOT?path.join(process.env.E2E_EVIDENCE_ROOT,'pc-map-fill'):path.join(__dirname,'../docs/pc-map-fill/evidence'),measurements=[];
let h;
test.before(async()=>{fs.mkdirSync(dir,{recursive:true});h=await boot();await h.choose();const s=f.game(2);s.players[0].position=7;s.players[1].position=18;f.own(s,'p0','上海');await h.fixture(s);});
test.after(async()=>{if(h)await h.close();fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify({browser:'Microsoft Edge headless',physicalDevices:'未测；有限模拟视口',measurements},null,2));});
test('central map stretches across PC interior and follows resizing without blocking controls',{timeout:60000},async()=>{
 const page=h.pages[0];
 for(const [width,height]of [[1440,900],[1920,1080],[1280,720],[768,1024],[844,280],[1440,900]]){
  await page.setViewportSize({width,height});
  await page.waitForFunction(()=>{
   const map=document.getElementById('boardMap').getBoundingClientRect(),tiles=document.getElementById('board').children;
   const first=tiles[0].getBoundingClientRect(),right=tiles[11].getBoundingClientRect(),bottom=tiles[21].getBoundingClientRect();
   const inset=document.body.classList.contains('landscape-game')?2:0;
   return Math.abs(map.left-first.right-inset)<.5&&Math.abs(map.top-first.bottom-inset)<.5&&Math.abs(map.right-right.left+inset)<.5&&Math.abs(map.bottom-bottom.top+inset)<.5;
  });
  // Sample map and pieces only after the resize callback has settled in one frame.
  await page.evaluate(()=>new Promise(r=>window.requestAnimationFrame(()=>window.requestAnimationFrame(r))));
  const m=await page.locator('#boardMap').evaluate(async el=>{
   const style=window.getComputedStyle(el),image=new window.Image();image.src=style.backgroundImage.slice(5,-2);await image.decode();
   // Image decoding can span a viewport resize; sample after layout observers run.
   await new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve)));
   const rect=id=>document.getElementById(id).getBoundingClientRect().toJSON();
   const tiles=document.getElementById('board').children;
   return {map:el.getBoundingClientRect().toJSON(),first:tiles[0].getBoundingClientRect().toJSON(),right:tiles[11].getBoundingClientRect().toJSON(),bottom:tiles[21].getBoundingClientRect().toJSON(),size:style.backgroundSize,repeat:style.backgroundRepeat,pointerEvents:style.pointerEvents,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,landscape:document.body.classList.contains('landscape-game'),overflow:document.documentElement.scrollWidth>window.innerWidth+1,squares:tiles.length,pieces:[...document.querySelectorAll('#pieces .piece')].map(p=>p.getBoundingClientRect().toJSON()),positions:[7,18].map(id=>tiles[id].getBoundingClientRect().toJSON()),ledger:rect('ledger')};
  });
  const inset=m.landscape?2:0;
  for(const delta of [m.map.left-m.first.right-inset,m.map.top-m.first.bottom-inset,m.map.right-m.right.left+inset,m.map.bottom-m.bottom.top+inset])assert.ok(Math.abs(delta)<.5,JSON.stringify(m));
  assert.equal(m.size,m.landscape?'cover':'100% 100%');assert.equal(m.repeat,'no-repeat');assert.equal(m.pointerEvents,'none');assert.ok(m.naturalWidth>0&&m.naturalHeight>0);assert.equal(m.squares,42);assert.equal(m.overflow,false);assert.equal(m.pieces.length,2);
  for(let i=0;i<2;i++){const piece=m.pieces[i],tile=m.positions[i];assert.ok(piece.x+piece.width/2>=tile.left&&piece.x+piece.width/2<=tile.right&&piece.y+piece.height/2>=tile.top&&piece.y+piece.height/2<=tile.bottom,JSON.stringify({piece,tile}));}
  if(m.landscape)assert.ok(m.ledger.left>=m.map.left&&m.ledger.right<=m.map.right+1&&m.ledger.top>=m.map.top&&m.ledger.bottom<=m.map.bottom+1);
  await page.locator('[data-square-id="1"]').click();await page.waitForSelector('#modal:not(.hidden)');await page.getByRole('button',{name:'关闭',exact:true}).last().click();
  await page.locator('#btnAssets').click();await page.waitForSelector('#modalTitle:text-is("资产总览")');await page.getByRole('button',{name:'关闭',exact:true}).last().click();
  await page.screenshot({path:path.join(dir,width+'x'+height+'.png')});measurements.push({width,height,...m});
 }
 assert.deepEqual(h.errors,[]);
});
