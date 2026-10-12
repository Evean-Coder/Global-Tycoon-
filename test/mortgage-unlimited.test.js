'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGameState,snapshot}=require('../src/state'),logic=require('../src/gameLogic'),econ=require('../src/economy'),{normalizeAction}=require('../src/actionValidation'),f=require('./helpers/gameplayFixtures');
function fixture(version=2,mode='normal'){const s=createGameState('LOANS',['甲','乙'],version,{gameMode:mode,...(mode==='quick'?{routeRevision:'opportunity-routes-v1',quickRevision:'quick-mode-v1'}:{})});f.own(s,'p0','内罗毕','开普敦','开罗','东京');s.cities['开普敦'].mortgaged=true;s.cities['开罗'].mortgaged=true;return s;}
function apply(s,a){const n=normalizeAction(s,a);assert.equal(n.ok,true,n.error);const r=logic.apply(s,n.action,()=>.5);assert.notEqual(r.rejected,true);return r;}
test('normal and quick, legacy and current rules permit third and fourth city mortgages with exact cash',()=>{
 for(const [version,mode] of [[1,'normal'],[2,'normal'],[2,'quick']]){const s=fixture(version,mode),before=s.players[0].cash;apply(s,{type:'mortgage',cityId:'内罗毕'});apply(s,{type:'mortgage',cityId:'东京'});assert.equal(s.players[0].cash,before+econ.mortgageValue(s.cities['内罗毕'])+econ.mortgageValue(s.cities['东京']));assert.equal(s.players[0].cities.filter(id=>s.cities[id].mortgaged).length,4);for(const id of s.players[0].cities)assert.equal(s.cities[id].ownerId,'p0');}
});
test('repeat mortgages, unowned/other cities and forbidden decisions never mint cash',()=>{
 for(const change of [s=>s.cities['内罗毕'].mortgaged=true,s=>s.cities['内罗毕'].ownerId='p1',s=>s.cities['内罗毕'].ownerId=null,s=>{s.phase='trade_confirm';s.pending={targetId:'p0',awaiting:'p0'};}]){const s=fixture();change(s);const before=JSON.stringify(s);logic.apply(s,{type:'mortgage',cityId:'内罗毕'},()=>.5);assert.equal(JSON.stringify(s),before);}
 const s=fixture();apply(s,{type:'mortgage',cityId:'内罗毕'});const before=JSON.stringify(s);logic.apply(s,{type:'mortgage',cityId:'内罗毕'},()=>.5);assert.equal(JSON.stringify(s),before);
});
test('self rescue and city, airport or build fundraising permit third mortgages without prematurely confirming',()=>{
 for(const mode of ['normal','quick'])for(const kind of ['self','city','airport','build']){const s=fixture(2,mode);s.players[0].cash=kind==='self'?-50000:1000;let action='rescue_mortgage';
  if(kind==='self'){s.phase='self_rescue';s.pending={kind:'self_rescue',playerId:'p0',due:50000,reason:'测试',resume:false};}
  else if(kind==='build'){s.phase='build_decide';s.pending={playerId:'p0',cityId:'东京'};s.players[0].position=37;action='mortgage';}
  else{s.phase='buy_fundraise';s.pending={kind:'buy_fundraise',playerId:'p0',target:kind==='city'?{kind,cityId:'罗马'}:{kind,airportId:'开罗国际机场'}};}
  const pending=JSON.parse(JSON.stringify(s.pending)),phase=s.phase,cash=s.players[0].cash;apply(s,{type:action,cityId:'内罗毕'});assert.equal(s.players[0].cash,cash+1800);assert.equal(s.cities['内罗毕'].mortgaged,true);assert.equal(s.phase,phase);assert.deepEqual(s.pending,pending);
 }
});
test('AI can evaluate and fall back to a third mortgage while current simulation funding includes every city',()=>{
 const bf=require('./helpers/botStrategyFixtures'),ev=require('../src/botEvaluation'),policy=require('../src/botPolicy'),s=bf.game();bf.own(s,'内罗毕');bf.own(s,'开罗').mortgaged=true;bf.own(s,'开普敦').mortgaged=true;s.phase='self_rescue';s.players[1].cash=-1000;s.pending={kind:'self_rescue',playerId:'p1',due:1000,reason:'测试',resume:false};const v=bf.view(s);assert.ok(ev.liquidation(ev.context(v),1000).some(x=>x.action.type==='rescue_mortgage'&&x.action.cityId==='内罗毕'));const a=policy.fallback(v);assert.equal(a.type,'rescue_mortgage');assert.equal(a.cityId,'内罗毕');bf.apply(s,a);assert.equal(s.cities['内罗毕'].mortgaged,true);assert.ok(s.players[1].cash>=0);
 const t=fixture();assert.equal(require('../scripts/balance/policy').fundingPotential(snapshot(t,'p0')),econ.mortgageValue(t.cities['内罗毕'])+econ.mortgageValue(t.cities['东京']));
});
