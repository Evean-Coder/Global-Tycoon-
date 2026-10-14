'use strict';
/* global game, closeModal, closeManagement, openRulesTopic */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{boot}=require('./helpers/browserHarness'),f=require('../test/helpers/gameplayFixtures'),{createGameState}=require('../src/state'),news=require('../src/worldEvents');
const dir=path.join(__dirname,'../docs/business-missions/evidence');let h;
function fixture(){const s=createGameState('MISSIONS',['甲','乙'],2,{businessMissionRevision:'business-missions-v1',worldRevision:'world-news-v2',disconnectRevision:'disconnect-v1',activeManagementRevision:'active-management-v4'});s.firstRoundDone=true;f.own(s,'p0','内罗毕','罗马');s.world.status='running';s.world.active=news.draw(s,f.rng());s.world.active.type='construction';s.world.active.description=require('../src/gameplayCatalog').NEWS_V2.construction.description;s.world.active.name='建设优惠季';s.world.active.remaining=2;return s;}
test.before(async()=>{fs.mkdirSync(dir,{recursive:true});h=await boot({mobile:true});await h.choose();for(const p of h.pages)p.setDefaultTimeout(5000);});
test.after(async()=>{if(h)await h.close();});
test('task cards readable on desktop tablet and short phone landscape; explicit accept, help anchor and close',{timeout:45000},async()=>{
 const p=h.pages[0];
 for(const [width,height] of [[1440,900],[768,1024],[844,280]]){
  await p.setViewportSize({width,height});await p.evaluate(()=>{closeModal();closeManagement();});await h.fixture(fixture());await p.evaluate(()=>closeManagement());
  await p.locator('#btnMissions').scrollIntoViewIfNeeded();await p.click('#btnMissions');await p.waitForSelector('#modalTitle:text-is("经营任务")');assert.match(await p.textContent('#modalBody'),/建设实践.*航线探索/s);
  assert.equal(await p.locator('#modalBody button').getByText('接受任务',{exact:true}).first().isEnabled(),true);
  const r=await p.locator('#modal').evaluate(el=>{const c=el.querySelector('.modal-card')||el.querySelector('.modal'),r=(c||el.firstElementChild).getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,screen:window.innerHeight,overflow:document.documentElement.scrollWidth>window.innerWidth+1};});assert.equal(r.overflow,false);assert.ok(r.top>=-1&&r.bottom<=r.screen+1);
  await p.locator('#modalBody').getByText('接受任务',{exact:true}).first().click();await p.waitForFunction(()=>!!game?.self?.businessMission?.active);assert.equal(h.room.state.players[0].businessMission.active.type,'build');
  await p.getByRole('button',{name:'任务规则',exact:true}).click();await p.waitForSelector('#rules-anchor-tasks');assert.equal(await p.locator('#rules-topic-property').getAttribute('open'),'');await p.click('#btnRulesClose');await p.evaluate(()=>openRulesTopic('connection'));assert.match(await p.textContent('#rules-topic-connection'),/最多等20秒/);assert.equal((await p.textContent('#rules-topic-connection')).includes('任一存活玩家掉线会暂停'),false);await p.click('#btnRulesClose');
  await p.screenshot({path:path.join(dir,width+'x'+height+'.png')});await p.getByRole('button',{name:'关闭查看',exact:true}).last().click();assert.equal(await p.locator('#modal').isVisible(),false);
 }
 assert.deepEqual(h.errors,[]);
});
test('news details and task reader survive other broadcasts; costs and private progress update from state',{timeout:20000},async()=>{
 const p=h.pages[0];await p.setViewportSize({width:844,height:390});await h.fixture(fixture());await p.evaluate(()=>closeManagement());
 await p.locator('#news-impact summary').scrollIntoViewIfNeeded();await p.click('#news-impact summary');assert.equal(await p.locator('#news-impact').getAttribute('open'),'');
 await p.locator('#btnMissions').scrollIntoViewIfNeeded();await p.click('#btnMissions');h.room.state.players[1].cash+=50;h.room.state.revision++;h.api.emitGame(h.room);await p.waitForFunction(v=>game.revision>=v,h.room.state.revision);assert.equal(await p.locator('#modalTitle').textContent(),'经营任务');assert.equal(await p.locator('#news-impact').getAttribute('open'),'');
 await p.getByRole('button',{name:'关闭查看',exact:true}).last().click();
 const other=h.room.players[1];other.connected=false;h.api.emitGame(h.room);await p.waitForFunction(()=>game.connectionStatus?.offlineIds.includes('p1'));assert.equal(await p.locator('#btnRoll').isEnabled(),false); // Management still awaits an explicit choice.
 assert.match(await p.textContent('#waitBanner'),/在线玩家继续/);assert.equal(gameSafe(h.room.state),true);other.connected=true;h.api.emitGame(h.room);assert.deepEqual(h.errors,[]);
});
function gameSafe(s){return s.players.every(p=>p.alive)&&s.phase==='waiting_roll';}
