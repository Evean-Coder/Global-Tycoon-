'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {io:Client}=require('socket.io-client'),api=require('../server');
const {createRng}=require('../src/random'),{createActionClock}=require('../src/actionClock'),{fakeClock}=require('./helpers/gameplayFixtures');
let url;const sockets=[];
const ack=(s,event,data)=>new Promise(resolve=>s.emit(event,data,resolve));
async function connect(){const s=Client(url,{transports:['websocket'],auth:{clientRouteRevision:'opportunity-routes-v1'}});sockets.push(s);s.on('gameState',g=>s.game=g);s.on('reconnectToken',t=>s.token=t.token);await new Promise(r=>s.once('connect',r));return s;}
async function wait(fn){for(let i=0;i<600;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw new Error('场景消息未到达');}
test.before(async()=>{await new Promise(r=>api.server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+api.server.address().port;});
test.after(()=>{for(const s of sockets)s.close();for(const r of api.rooms.values()){r.actionClock.clear();if(r.hostTimer)clearTimeout(r.hostTimer);}api.rooms.clear();api.io.close();});
test('建立多人完整流程驱动 / 覆盖开局首圈资讯启动 / 覆盖完整经营与第三选择 / 覆盖完整场景重连和结算',async()=>{
 const clients=[];for(let i=0;i<3;i++)clients.push(await connect());
 const created=await ack(clients[0],'createRoom',{name:'场景甲'}),code=created.roomCode;
 for(let i=1;i<3;i++)assert.equal((await ack(clients[i],'joinRoom',{roomCode:code,name:['场景甲','场景乙','场景丙'][i]})).ok,true);
 const room=api.rooms.get(code),clock=fakeClock();room.rng=createRng(22);room.actionClock=createActionClock(clock);
 assert.equal((await ack(clients[0],'startGame',{})).ok,true);await wait(()=>clients.every(s=>s.game?.self.choice));
 const trace=[],windowSteps=new Map();let steps=0,reconnected=false,remoteDiscount=false;
 async function act(index,a){
  const sock=clients[index],g=sock.game,payload={...a,gameId:g.gameId,actionId:'scenario-'+(++steps),decisionId:g.decision.decisionId,actorRevision:g.self.actorRevision};
  const res=await ack(sock,'action',payload);
  assert.equal(res.ok,true,JSON.stringify({step:steps,phase:g.phase,actor:index,action:a,response:res}));
  await wait(()=>clients.filter(s=>s.connected).every(s=>s.game.revision>=res.revision));
  trace.push({step:steps,actor:'p'+index,phase:g.phase,action:a.type,completeRound:room.state.roundFlow.index,newsRounds:room.state.world.roundsCompleted,revision:res.revision});
 }
 for(let guard=0;guard<1200;guard++){
  const g=clients[0].game,phase=g.phase;
  if(phase==='game_over')break;
  if(phase==='route_choose'){
   const index=Number(g.routeProgress.activeChoice.playerId.slice(1)),choice=clients[index].game.self.routeChoice;
   await act(index,{type:'route_skip',opportunityId:choice.opportunityId,candidateVersion:choice.candidateVersion});continue;
  }
  if(phase==='opportunity_choose'){
   if(g.opportunityStage.ordinal===2&&!reconnected){
    const before=JSON.stringify(room.state.opportunityStage.participants.p1),token=clients[1].token;
    clients[1].close();await wait(()=>room.actionClock.paused);clock.advance(100000);
    const replacement=await connect();assert.equal((await ack(replacement,'reconnect',{roomCode:code,name:'场景乙',token})).ok,true);clients[1]=replacement;
    await wait(()=>replacement.game?.self.choice);assert.equal(JSON.stringify(room.state.opportunityStage.participants.p1),before);assert.equal(room.actionClock.paused,false);reconnected=true;
   }
   for(let i=0;i<3;i++){
    const c=clients[i].game.self.choice;if(!c||c.submitted)continue;
    const selected=clients[i].game.self.opportunities.selectedIds;
    if(!selected.includes('H1')&&!c.candidateIds.includes('H1')&&c.rerollsLeft){await act(i,{type:'opportunity_reroll',stageId:c.stageId,candidateVersion:c.candidateVersion});continue;}
    const priority=selected.includes('H1')?['H2','H3','H6','H11','H7','H4','H10','H12']:['H1','H2','H3','H6','H11','H7','H4','H10','H12'];
    const id=priority.find(id=>c.candidateIds.includes(id))||c.candidateIds[0];await act(i,{type:'opportunity_choose',stageId:c.stageId,candidateVersion:c.candidateVersion,opportunityId:id});
   }
   continue;
  }
  const actor=g.pending?.awaiting||g.pending?.targetId||g.pending?.playerId||g.players[g.turnIndex].id,index=Number(actor.slice(1)),self=clients[index].game,p=self.players[index];
  let a;
  if(phase==='waiting_roll'){
   const remote=Object.entries(self.self.quotes.remote).find(([,q])=>q.ok&&q.effects.some(e=>e.amount>0));
   if(remote){a={type:'remote_build',cityId:remote[0],quoteVersion:remote[1].quoteVersion};remoteDiscount=true;}else a={type:'roll_dice'};
  }else if(phase==='stock'){
   const w=self.self.stockWindow,done=windowSteps.get(w.windowId)||{},owned=Object.keys(self.stocks).filter(id=>self.cities[id].ownerId&&!self.stocks[id].clearing);
   const id=owned.find(id=>(self.stocks[id].holders[actor]||0)<(self.cities[id].ownerId===actor?4:10));
   const make=(cid,side,n)=>({cityId:cid,side,shares:n,quoteVersion:self.stocks[cid].quoteVersion,listingEpoch:self.stocks[cid].listingEpoch});
   if(id&&!done.buy&&p.cash>=self.stocks[id].price+20000){a={type:'stock_trade',windowId:w.windowId,orders:[make(id,'buy',1)]};done.buy=true;}
   else if(!done.sell){const held=owned.find(id=>(self.stocks[id].holders[actor]||0)>=2);if(held)a={type:'stock_trade',windowId:w.windowId,orders:[make(held,'sell',1)]};done.sell=true;}
   windowSteps.set(w.windowId,done);a ||= {type:'stock_done'};
  }else if(phase==='buy'){const city=self.cities[self.pending.cityId];a={type:'buy',decision:p.cash>=city.price+15000&&p.lapBuys<4?'buy':'pass'};}
  else if(phase==='buy_airport')a={type:'buy_airport',decision:p.cash>=35000?'buy':'pass'};
  else if(phase==='build_decide'){const q=self.self.quotes.build[self.pending.cityId];a={type:'respond_build',decision:q.ok&&p.cash>=q.finalAmount+20000?'build':'pass',quoteVersion:q.quoteVersion};}
  else if(phase==='flight')a={type:'flight',target:null};
  else if(phase==='frozen_turn')a={type:'respond_frozen',decision:'pass'};
  else if(phase==='jail_turn')a={type:'respond_jail',decision:p.cash>=35000?'pay':'roll'};
  else if(phase==='auction_bid'){
   const pend=self.pending,c=self.cities[pend.cityId],min=pend.currentBid?pend.currentBid+1000:Math.round((c.price+c.price*.6*c.houseLevel)*.75);
   a={type:'auction_respond',decision:pend.currentBidder===actor?'end':p.lapBuys<4&&p.cash>=min+20000?'bid':'pass',amount:min};
  }else if(phase==='self_rescue'){
   const demolish=Object.entries(self.self.quotes.demolish).find(([,q])=>q.ok);
   const mortgages=p.cities.filter(id=>self.cities[id].mortgaged).length,city=p.cities.find(id=>!self.cities[id].mortgaged);
   if(demolish)a={type:'rescue_demolish',cityId:demolish[0],quoteVersion:demolish[1].quoteVersion};
   else if(city&&mortgages<2)a={type:'rescue_mortgage',cityId:city};
   else a={type:'rescue_done'};
  }else throw new Error('未覆盖阶段 '+phase);
  await act(index,a);
  const events=room.events;
  if(room.state.opportunityStage?.ordinal===3&&room.state.opportunityStage.resolved&&remoteDiscount&&events.some(e=>e.kind==='dividend')&&events.some(e=>e.kind==='stock_trade'&&e.side==='sell')&&events.some(e=>e.kind==='city_rent')&&room.state.world.roundsCompleted>=7)break;
 }
 assert.equal(reconnected,true);assert.equal(remoteDiscount,true,'同一合法对局中应完成一次有优惠的主动施工');
 assert.equal(room.state.opportunityStage.ordinal,3);assert.equal(room.state.opportunityStage.resolved,true);
 for(const kind of ['city_rent','dividend','stock_trade','price_update'])assert.ok(room.events.some(e=>e.kind===kind),kind);
 assert.ok(room.events.some(e=>e.kind==='stock_trade'&&e.side==='sell'));
 assert.ok(room.events.some(e=>e.kind==='news'&&e.text.includes('预告')));
 assert.equal((await ack(clients[0],'disbandRoom',{})).ok,true);assert.equal(room.state.status,'over');assert.ok(Object.values(room.state.stocks).every(s=>s.dividendFund===0));
 assert.equal(room.gameRecord.stats.eventCount,room.events.length);assert.equal(room.gameRecord.players[0].totalAssets,api.totalAssets(room.state,room.state.players[0]));
 const summary={seed:22,players:3,steps,actualNode:process.version,checks:['V1','V11','V12','V19','V26','V43','V46','V50','V53','V64','V66','V76'],observed:{reconnected,remoteDiscount,thirdChoice:true,newsRounds:room.state.world.roundsCompleted},trace,events:room.events,record:room.gameRecord};
 fs.writeFileSync(path.join(__dirname,'../docs/world-events-augments/scenario-evidence.json'),JSON.stringify(summary,null,2));
}, {timeout:60000});
