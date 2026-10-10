'use strict';
/* global getComputedStyle, innerWidth, socket */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {boot}=require('./helpers/browserHarness');
let h;
test.before(async()=>{h=await boot({beforeStart:async({pages,room})=>{
 const p=pages[0];
 await p.evaluate(()=>{window.savedModeEmit=socket.emit;window.modeRequests=0;socket.emit=function(event,...args){if(event==='setRoomMode')window.modeRequests++;return window.savedModeEmit.call(this,event,...args);};});
 assert.equal(await pages[1].locator('input[name=gameModeCard]').first().isDisabled(),true);
 await p.locator('input[name=gameModeCard][value=quick]').check();
 await p.waitForFunction(()=>document.getElementById('roomMode').value==='quick'&&!document.getElementById('roomMode').disabled);
 assert.equal(room.gameMode,'quick');
 await p.locator('input[name=gameModeCard][value=normal]').check();
 await p.waitForFunction(()=>document.getElementById('roomMode').value==='normal'&&!document.getElementById('roomMode').disabled);
 assert.equal(await p.evaluate(()=>window.modeRequests),2);
 await p.evaluate(()=>{socket.emit=function(event,...args){if(event==='setRoomMode'){window.modeRequests++;window.modeFailure=args.at(-1);return this;}return window.savedModeEmit.call(this,event,...args);};});
 await p.locator('input[name=gameModeCard][value=quick]').focus();await p.keyboard.press('Space');assert.equal(await p.locator('input[name=gameModeCard][value=normal]').isDisabled(),true);assert.equal(await p.locator('#roomMode').getAttribute('tabindex'),'-1');
 await p.evaluate(()=>{socket.emit=window.savedModeEmit;window.modeFailure(null,{ok:false,error:'受控失败'});});assert.equal(await p.locator('input[name=gameModeCard][value=normal]').isChecked(),true);assert.equal(room.gameMode,'normal');assert.equal(await p.evaluate(()=>window.modeRequests),3);
}});});
test.after(async()=>{if(h)await h.close();});
test('模式卡权限、独立地图与唯一悬浮模块',{timeout:45000},async()=>{
 const p=h.pages[0];
 await h.choose();
 const dir=path.join(__dirname,'../docs/frontend-atlas/evidence');fs.mkdirSync(dir,{recursive:true});
 for(const [width,height]of [[1440,900],[1024,768],[768,1024],[390,844],[844,390],[320,568]]){
  await p.setViewportSize({width,height});
  await p.waitForTimeout(100);
  assert.equal(await p.locator('#ledger #newsBar').count(),1);
  assert.equal(await p.locator('#turnSummary').count(),1);
  const m=await p.evaluate(()=>({image:getComputedStyle(document.getElementById('boardMap')).backgroundImage,fit:getComputedStyle(document.getElementById('boardMap')).backgroundSize,overflow:document.documentElement.scrollWidth>innerWidth+1,hit:[...document.querySelectorAll('#board .sq')].some(el=>{const a=el.getBoundingClientRect(),b=document.getElementById('ledger').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;})}));
  assert.ok(m.image.includes('board-world-map-v1.webp'));assert.equal(m.fit,'contain');assert.equal(m.overflow,false);assert.equal(m.hit,false);
  const overlap=await p.evaluate(()=>{const clip=document.getElementById('gameMain').getBoundingClientRect(),bar=document.getElementById('actionBar').getBoundingClientRect();return [...document.querySelectorAll('#board .sq')].some(el=>{const r=el.getBoundingClientRect(),top=Math.max(r.top,clip.top),bottom=Math.min(r.bottom,clip.bottom);return bottom>top&&r.left<bar.right&&r.right>bar.left&&top<bar.bottom&&bottom>bar.top;});});
  assert.equal(overlap,false,width+'x'+height+' 可见棋盘格不能被操作栏覆盖');
  assert.equal(await p.evaluate(()=>{const tile=document.querySelector('#board [data-square-id="0"]').getBoundingClientRect();return [...document.querySelectorAll('#pieces .piece')].every(el=>{const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return x>=tile.left&&x<=tile.right&&y>=tile.top&&y<=tile.bottom;});}),true,'旋转或可用高度变化后棋子中心仍在真实地块');
  assert.equal(await p.locator('.sq-amount').count(),20);
  assert.equal(await p.evaluate(()=>[...document.querySelectorAll('.sq-amount')].every(el=>{const r=el.getBoundingClientRect(),tile=el.closest('.sq').getBoundingClientRect();return getComputedStyle(el).display!=='none'&&r.height>0&&r.top>=tile.top&&r.bottom<=tile.bottom;})),true,width+'x'+height+' 地价必须显示在地块内');
  await p.screenshot({path:path.join(dir,`board-${width}x${height}.png`),fullPage:true});
 }
 assert.deepEqual(h.errors,[]);
});

test('真实资讯预告与费用、同步和旁观回合摘要',{timeout:30000},async()=>{
 const {createGameState}=require('../src/state');const s=createGameState('NEWS',['甲','乙'],2,{economyRevision:'travel-expense-v1'});s.phase='waiting_roll';s.pending=null;s.world.active={type:'boom',name:'指定旺季',region:'亚洲',remaining:2,description:'经营效果说明'};s.world.preview={name:'指定下轮',region:'欧洲',remaining:3};s.roundFlow.index=79;await h.fixture(s);const p=h.pages[0];assert.equal(await p.locator('#newsBar').count(),1);assert.match(await p.locator('#newsBar').textContent(),/指定旺季.*亚洲.*2 轮/);assert.match(await p.locator('#newsBar').textContent(),/指定下轮.*欧洲/);assert.match(await p.locator('#newsBar').textContent(),/远航预告.*2 个完整轮后/);await p.locator('#newsBar summary').click();assert.match(await p.locator('#newsBar details').textContent(),/经营效果说明/);
 s.world.active=null;s.world.preview=null;s.roundFlow.index=1;await h.fixture(s);assert.match(await p.locator('#newsBar').textContent(),/首次环球行程完成后发布/);s.players[0].alive=false;s.turnIndex=1;await h.fixture(s);assert.match(await p.locator('#turnSummary').textContent(),/乙.*等待掷骰/);
 const choose=createGameState('CHOICE',['甲','乙'],2);require('../src/opportunities').beginOpportunityStage(choose,1,{kind:'waiting_roll'},()=>.5);await h.fixture(choose);assert.match(await p.locator('#turnSummary').textContent(),/全员正在选择.*机遇选择/);assert.deepEqual(h.errors,[]);
});
test('实际关键文字和状态颜色达到正文对比度要求',async()=>{
 const values=await h.pages[0].evaluate(()=>{
  const root=document.createElement('div');root.style.cssText='position:fixed;left:-10000px;background:var(--card)';
  root.innerHTML='<button class="primary">主操作</button><button class="positive">购买</button><button class="risk">危险</button><span class="muted">说明</span><div class="card-tag">说明</div><div class="sq"><span class="lvl">房4</span><span class="mg">抵</span></div>';
  document.body.append(root);
  const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),lum=color=>rgb(color).map(x=>{const v=x/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const paper=getComputedStyle(root).backgroundColor;
  const rows=[...root.querySelectorAll('button,.muted,.card-tag,.lvl,.mg')].map(el=>{const style=getComputedStyle(el),fg=lum(style.color),colors=style.backgroundImage.match(/rgb\([^)]*\)/g)||(style.backgroundColor==='rgba(0, 0, 0, 0)'?[paper]:[style.backgroundColor]);return {text:el.textContent,ratio:Math.min(...colors.map(color=>{const bg=lum(color);return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);}))};});root.remove();return rows;
 });
 for(const row of values)assert.ok(row.ratio>=4.5,JSON.stringify(row));
 fs.writeFileSync(path.join(__dirname,'../docs/frontend-atlas/evidence/contrast.json'),JSON.stringify(values,null,2));
});

