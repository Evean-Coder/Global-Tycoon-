/* global latestState, phoneLayout */
'use strict';
const {chromium,webkit}=require('playwright'),api=require('../../server');
const {createRng}=require('../../src/random'),{fakeClock}=require('../../test/helpers/gameplayFixtures'),{createActionClock}=require('../../src/actionClock');
async function settleBoardLayout(page){
 await page.evaluate(()=>new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve))));
 await page.waitForFunction(()=>{
  if(document.body.classList.contains('compact-game')&&typeof phoneLayout!=='undefined'&&phoneLayout){
   const main=document.getElementById('gameMain').getBoundingClientRect();
   if(!phoneLayout.magnified&&(Math.abs(phoneLayout.width-document.documentElement.clientWidth)>.5||Math.abs(phoneLayout.height-document.documentElement.clientHeight)>.5))return false;
   if(Math.abs(main.height-phoneLayout.boardHeight)>.5)return false;
   if(phoneLayout.mapMode==='overview'){const wrap=document.getElementById('boardWrap');if(wrap.scrollWidth>wrap.clientWidth+1||wrap.scrollHeight>wrap.clientHeight+1)return false;}
  }
  const map=document.getElementById('boardMap').getBoundingClientRect(),tiles=document.getElementById('board').children;
  if(!map.width||!tiles[21])return true;
  const first=tiles[0].getBoundingClientRect(),right=tiles[11].getBoundingClientRect(),bottom=tiles[21].getBoundingClientRect(),inset=document.body.classList.contains('landscape-game')?2:0;
  return Math.abs(map.left-first.right-inset)<.5&&Math.abs(map.top-first.bottom-inset)<.5&&Math.abs(map.right-right.left+inset)<.5&&Math.abs(map.bottom-bottom.top+inset)<.5;
 });
}
async function boot(options={}){
 await new Promise(r=>api.server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+api.server.address().port;
 const browserName=options.browserName||process.env.PHONE_TEST_BROWSER||'chromium';
 if(!['chromium','webkit'].includes(browserName))throw new Error('Unknown test browser');
 const browser=await (browserName==='webkit'?webkit:chromium).launch({channel:browserName==='chromium'&&!process.env.CI?'msedge':undefined,headless:true});
 const contexts=[],pages=[],errors=[],prestart={};
 for(let i=0;i<2;i++){const context=await browser.newContext({viewport:options.viewport||{width:1440,height:900},isMobile:!!options.mobile,hasTouch:!!options.mobile,reducedMotion:'reduce'}),page=await context.newPage();contexts.push(context);pages.push(page);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(url,{waitUntil:'networkidle'});await page.fill('#nickname',i?'浏览器乙':'浏览器甲');}
 prestart.lobbyHint=await pages[0].locator('#view-lobby .orientation-hint').isVisible();
 await pages[0].click('#btnCreate');await pages[0].waitForSelector('#view-room:not(.hidden)');
 const code=(await pages[0].textContent('#roomCode')).trim();await pages[1].fill('#joinCode',code);await pages[1].click('#btnJoin');await pages[0].waitForFunction(()=>!document.getElementById('btnStart').disabled);
 prestart.roomHint=await pages[0].locator('#view-room .orientation-hint').isVisible();
 const room=api.rooms.get(code);room.rng=createRng(22);room.actionClock=createActionClock(options.quickClockOptions||fakeClock());
 if(options.quickClockOptions)room.quickClockOptions=options.quickClockOptions;
 if(options.beforeStart)await options.beforeStart({api,room,pages});
 if(options.gameMode){await pages[0].locator('input[name=gameModeCard][value='+options.gameMode+']').check();await pages[0].waitForFunction(mode=>document.getElementById('roomMode').value===mode&&!document.getElementById('roomMode').disabled,options.gameMode);}
 prestart.mode=room.gameMode;prestart.guestModeDisabled=await pages[1].locator('#roomMode').isDisabled();
 if(options.mobile)for(const page of pages){const v=page.viewportSize();if(v.width<=600&&v.height>v.width)await page.setViewportSize({width:v.height,height:v.width});}
 await pages[0].click('#btnStart');await pages[0].waitForSelector('#choiceModal:not(.hidden)');await pages[1].waitForSelector('#choiceModal:not(.hidden)');
 return {api,browser,contexts,pages,room,errors,url,prestart,async choose(options={}){await pages[0].locator('#choiceCards button').first().click();await pages[1].locator('#choiceCards button').last().click();await pages[0].waitForSelector('#choiceModal',{state:'hidden'});if(!options.keepManagementOpen)for(const page of pages)if(await page.locator('#btnCloseManagement').isVisible())await page.locator('#btnCloseManagement').click();},async fixture(state){
  // 仅用于独立界面场景；连续经营场景另由 gameplay-scenario 的合法动作证明。
  // A completed game cannot be revived under its old identity. Start a new
  // fixture identity and record stream, as the real startGame handler does.
  if(room.state.phase==='game_over'&&state.phase!=='game_over'){
    room.gameRecord=null;room.events=[];room.eventSeq=0;room.lastEventBase=0;room.successfulActions=new Map();room.actionClock.clear();
  }else state.gameId=room.state.gameId;
  state.revision=room.state.revision+1;
  for(const [i,p]of state.players.entries())p.socketId=room.players[i].socketId;
  room.state=state;room.lastEvents=[];api.emitGame(room);await pages[0].waitForFunction(v=>document.querySelector('#board .sq')&&latestState?.revision>=v,state.revision);
  // State acceptance precedes resize-observer layout; geometry assertions need a painted frame.
  await settleBoardLayout(pages[0]);
 },async close(){for(const c of contexts)await c.close();await browser.close();for(const r of api.rooms.values()){api.stopQuickTimers(r);r.actionClock.clear();if(r.hostTimer)clearTimeout(r.hostTimer);}api.rooms.clear();await new Promise(r=>api.io.close(r));}};
}
module.exports={boot,settleBoardLayout};


