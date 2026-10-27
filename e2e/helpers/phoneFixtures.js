'use strict';
/* global socket, phoneLayout */
const {boot,settleBoardLayout}=require('./browserHarness'),f=require('../../test/helpers/managementEconomyFixtures'),{createGameState}=require('../../src/state');
let turn=6000;
async function bootPhone(options={}){
 const custom=options.beforeStart;
 const h=await boot({...options,mobile:true,viewport:options.viewport||{width:844,height:390},gameMode:'quick',quickClockOptions:f.fakeClock(),beforeStart:async ctx=>{
  ctx.room.botDelayMs=20;for(let i=0;i<2;i++)await ctx.pages[0].evaluate(()=>new Promise(resolve=>socket.emit('addBot',{},resolve)));
  if(custom)await custom(ctx);
 }});
 await h.choose();require('../../src/botScheduler').stop(h.room);return h;
}
function fixture(mode='normal'){
 const s=createGameState('PHONE',['环球商会航海甲','蓝色商会','绿色商会','金色商会'],2,{...f.options,turnExperienceRevision:'turn-experience-v1',routeRevision:'opportunity-routes-v1',gameMode:mode,...(mode==='quick'?{quickRevision:'quick-mode-v1'}:{})});
 s.phase='waiting_roll';s.pending=null;s.firstRoundDone=true;s.turnId=++turn;s.turnIndex=1;s.diceBag=[1,1,1,1];
 for(const [i,id]of ['内罗毕','开罗','上海','巴黎'].entries()){f.own(s,'p'+i,id);s.players[i].position=i===0?0:13;}
 s.world.status='running';s.world.active={type:'boom',name:'地区旺季',region:'欧洲',remaining:2,description:'欧洲城市经营变化，具体费用以真实报价为准。'};
 return s;
}
async function setScreen(page,width,height){
 await page.setViewportSize({width,height});
 try{await page.waitForFunction(({width,height})=>Math.abs(window.innerWidth-width)<=1&&Math.abs(window.innerHeight-height)<=1&&Math.abs(phoneLayout.width-width)<=1&&Math.abs(phoneLayout.height-height)<=1&&document.getElementById('actionBar').getBoundingClientRect().bottom<=height+1,{width,height});}catch(error){throw new Error(error.message+' '+JSON.stringify(await geometry(page)));}
 await settleBoardLayout(page);
}
async function geometry(page){return page.evaluate(()=>{
 const rect=el=>el.getBoundingClientRect().toJSON(),board=document.getElementById('boardWrap');
 return {viewport:{width:window.innerWidth,height:window.innerHeight,scale:window.visualViewport?.scale||1},density:phoneLayout.density,mapMode:phoneLayout.mapMode,tileLayout:phoneLayout.tileLayout,available:{width:phoneLayout.availableWidth,height:phoneLayout.availableHeight},
  board:rect(board),bar:rect(document.getElementById('actionBar')),map:rect(document.getElementById('boardMap')),news:rect(document.getElementById('newsBar')),ledger:rect(document.getElementById('ledger')),side:rect(document.getElementById('side')),
  overflow:document.documentElement.scrollWidth>window.innerWidth+1,scrollWidth:board.scrollWidth-board.clientWidth,scrollHeight:board.scrollHeight-board.clientHeight,
  buttons:['btnRoll','btnManagement','btnAssets','btnBank','btnCompactInfo'].map(id=>({id,...rect(document.getElementById(id))})),
  tiles:[...document.querySelectorAll('#board .sq')].map(el=>{const name=el.querySelector('.nm'),num=el.querySelector('.num'),icon=el.querySelector('.glyph');return {id:Number(el.dataset.squareId),...rect(el),name:rect(name),num:rect(num),icon:rect(icon),text:name.textContent,labelFont:parseFloat(window.getComputedStyle(name).fontSize),labelClipped:name.scrollWidth>name.clientWidth+1,numberWrapped:num.scrollHeight>num.clientHeight+1,numberClipped:num.scrollWidth>num.clientWidth+1};})};
 });}
module.exports={bootPhone,fixture,setScreen,geometry};
