'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures');
const dir=process.env.E2E_EVIDENCE_ROOT?path.join(process.env.E2E_EVIDENCE_ROOT,'centered-panels'):path.join(__dirname,'../docs/mobile-ledger-centered/evidence'),measurements=[];
let h;
test.before(async()=>{
 fs.mkdirSync(dir,{recursive:true});h=await boot({mobile:true,viewport:{width:932,height:430}});await h.choose();
 const s=f.game(2);f.own(s,'p0','上海','东京','巴黎','伦敦','悉尼','开普敦');f.own(s,'p1','罗马');f.selected(s,'p0','H1','H2','H4');s.players[0].cash=15130;s.players[0].name='十二字符昵称甲乙丙丁戊己';s.stocks['罗马'].holders.p0=5;require('../src/stocks').syncHolders(s);s.world.status='running';s.world.active={type:'construction',name:'建设优惠季',description:'建设报价以实际费用为准。',remaining:2};await h.fixture(s);
});
test.after(async()=>{if(h)await h.close();fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify({browser:'Microsoft Edge headless touch emulation',physicalDevices:'未测；模拟手机横屏',measurements},null,2));});
test('mobile information pair fills a centered similar rectangle and preserves scrollable information',{timeout:60000},async()=>{
 const p=h.pages[0];
 for(const [width,height]of [[932,430],[844,390],[844,280],[568,320]]){
  await p.setViewportSize({width,height});await p.waitForFunction(()=>{
   const map=document.getElementById('boardMap').getBoundingClientRect(),panels=document.getElementById('atlasPanels').getBoundingClientRect();
   return document.body.classList.contains('landscape-game')&&Math.abs(panels.width/map.width-.86)<.001&&Math.abs(panels.height/map.height-.72)<.001&&Math.abs(panels.x+panels.width/2-map.x-map.width/2)<1&&Math.abs(panels.y+panels.height/2-map.y-map.height/2)<1;
  });
  const m=await p.evaluate(()=>{
   const ledger=document.getElementById('ledger'),map=document.getElementById('boardMap'),style=window.getComputedStyle(ledger);
   return {map:map.getBoundingClientRect().toJSON(),ledger:ledger.getBoundingClientRect().toJSON(),scrollHeight:ledger.scrollHeight,clientHeight:ledger.clientHeight,overflow:style.overflowY,text:ledger.textContent,squares:document.querySelectorAll('#board .sq').length,names:[...document.querySelectorAll('#board .nm')].every(n=>window.getComputedStyle(n).display!=='none'),pageOverflow:document.documentElement.scrollWidth>window.innerWidth+1,children:[...ledger.children].map(c=>({id:c.id,flexShrink:window.getComputedStyle(c).flexShrink}))};
  });
  assert.ok(m.ledger.left>=m.map.left&&m.ledger.right<=m.map.right+1&&m.ledger.top>=m.map.top&&m.ledger.bottom<=m.map.bottom+1);assert.equal(m.squares,42);assert.equal(m.names,true);assert.equal(m.pageOverflow,false);assert.equal(m.overflow,'auto');assert.ok(m.children.every(c=>c.flexShrink==='0'));assert.match(m.text,/15,130/);assert.match(m.text,/已选机遇/);assert.match(await p.locator('#newsBar').textContent(),/环球资讯.*建设优惠季/s);assert.match(m.text,/待掷骰/);
  // Stress long explanatory text separately; real content may now fit without scrolling.
  const note=await p.locator('.ledger-note').textContent();await p.locator('.ledger-note').evaluate(el=>el.textContent=el.textContent.repeat(20));
  m.longContent=await p.locator('#ledger').evaluate(el=>({scrollHeight:el.scrollHeight,clientHeight:el.clientHeight}));assert.ok(m.longContent.scrollHeight>m.longContent.clientHeight);
  await p.locator('#ledger').evaluate(el=>{el.scrollTop=el.scrollHeight;});await p.waitForFunction(()=>{const el=document.getElementById('ledger');return Math.abs(el.scrollHeight-el.scrollTop-el.clientHeight)<=1;});
  await p.locator('#turnSummary').scrollIntoViewIfNeeded();assert.equal(await p.locator('#turnSummary').isVisible(),true);
  await p.locator('.ledger-note').evaluate((el,text)=>el.textContent=text,note);await p.locator('#ledger').evaluate(el=>el.scrollTop=0);await p.locator('#boardWrap').evaluate(el=>{const ledger=document.getElementById('ledger');el.scrollTop=Math.max(0,ledger.offsetTop-8);el.scrollLeft=0;});
  await p.locator('#toast').waitFor({state:'hidden',timeout:5000});await p.screenshot({path:path.join(dir,width+'x'+height+'.png')});
  const assets=p.locator('#ledger .ledger-open').first();await assets.scrollIntoViewIfNeeded();await assets.tap();await p.waitForSelector('#modalTitle:text-is("资产总览")');await p.getByRole('button',{name:'关闭',exact:true}).last().tap();
  const square=p.locator('[data-square-id="1"]');await square.scrollIntoViewIfNeeded();await square.tap();await p.waitForSelector('#modal:not(.hidden)');await p.getByRole('button',{name:'关闭',exact:true}).last().tap();measurements.push({width,height,...m});
 }
 await p.setViewportSize({width:1440,height:900});await p.waitForFunction(()=>!document.body.classList.contains('landscape-game')&&document.getElementById('ledger').parentElement.id==='atlasPanels'&&document.getElementById('ledger').style.height==='');assert.equal(await p.locator('#boardMap').evaluate(el=>window.getComputedStyle(el).backgroundSize),'100% 100%');
 assert.deepEqual(h.errors,[]);
});
