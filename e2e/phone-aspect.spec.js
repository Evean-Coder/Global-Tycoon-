'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {bootPhone,fixture,setScreen,geometry}=require('./helpers/phoneFixtures');
const engine=process.env.PHONE_TEST_BROWSER||'chromium',dir=path.join(process.env.E2E_EVIDENCE_ROOT||'docs/phone-aspect-adaptation/evidence/verified',engine,'matrix');let h;const observations=[];
test.before(async()=>{fs.mkdirSync(dir,{recursive:true});h=await bootPhone();});
test.after(async()=>{fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify({engine,physicalDevices:'未测；浏览器几何扫描',observations},null,2)+'\n');if(h)await h.close();});
test('continuous phone geometry preserves the complete board and usable actions across the planned ratio matrix',{timeout:240000},async()=>{
 const cases=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/phone-aspect-adaptation/viewport-matrix.json'),'utf8')).cases;
 const selected=engine==='webkit'?cases.filter(c=>[16,19.9,21,22].includes(parseFloat(c.ratio))&&[320,430].some(s=>Math.round(s*parseFloat(c.ratio)/9)===c.width)&&c.chromeLoss!==60):cases;
 const p=h.pages[0];for(const mode of ['normal','quick']){await h.fixture(fixture(mode));for(const c of selected.filter(c=>c.mode===mode)){
  await setScreen(p,c.width,c.height);const g=await geometry(p),why=JSON.stringify({case:c,geometry:g});
  assert.equal(g.tiles.length,42);assert.equal(g.overflow,false,why);assert.ok(Math.abs(g.viewport.scale-1)<.02,why);assert.ok(g.bar.bottom<=c.height+1,why);
  assert.ok(g.buttons.every(b=>b.height>=44&&b.width>=44),why);assert.deepEqual(g.tiles.map(t=>t.id),Array.from({length:42},(_,i)=>i));
  if(g.available.width>=568&&g.available.height>=260)assert.equal(g.mapMode,'overview',why);
  assert.ok(g.tiles.every(t=>t.labelFont>=8&&!t.labelClipped&&!t.numberClipped&&!t.numberWrapped),why);
  assert.ok(g.tiles.every(t=>[t.name,t.num,t.icon].every(r=>r.left>=t.left-1&&r.right<=t.right+1&&r.top>=t.top-1&&r.bottom<=t.bottom+1)),why);
  assert.ok(g.tiles.every(t=>g.tileLayout==='inline'?t.num.right<=t.name.left+1&&t.name.right<=t.icon.left+1:t.num.bottom<=t.name.top+1),why);
  if(g.mapMode==='overview'){
   assert.equal(g.scrollWidth,0,why);assert.equal(g.scrollHeight,0,why);
   assert.ok(g.tiles.every(t=>t.left>=g.board.left-1&&t.right<=g.board.right+1&&t.top>=g.board.top-1&&t.bottom<=g.board.bottom+1),why);
  }
  assert.ok(g.news.right<=g.ledger.left+1&&g.board.right<=g.side.left+1,why);
  const first=g.tiles[0],right=g.tiles[11],bottom=g.tiles[21];assert.ok(Math.abs(g.map.left-first.right-2)<1&&Math.abs(g.map.right-right.left+2)<1&&Math.abs(g.map.top-first.bottom-2)<1&&Math.abs(g.map.bottom-bottom.top+2)<1,why);
  observations.push({id:c.id,width:c.width,height:c.height,density:g.density,mapMode:g.mapMode,boardWidth:g.board.width,boardHeight:g.board.height,minTileWidth:Math.min(...g.tiles.map(t=>t.width)),minTileHeight:Math.min(...g.tiles.map(t=>t.height)),minimumLabelFont:Math.min(...g.tiles.map(t=>t.labelFont))});
  if(([569,570].includes(c.width)&&c.height===260)||c.ratio==='19.9:9'&&c.height===330||c.ratio==='21:9'&&c.height===480){await p.locator('#toast').evaluate(el=>el.classList.add('hidden'));await p.screenshot({path:path.join(dir,c.id+'.png')});}
 }}assert.deepEqual(h.errors,[]);console.log(JSON.stringify({engine,verifiedLayouts:observations.length}));
});
