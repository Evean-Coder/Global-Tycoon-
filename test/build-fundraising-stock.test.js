'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),f=require('./helpers/gameplayFixtures'),logic=require('../src/gameLogic'),{normalizeAction}=require('../src/actionValidation');
function fixture(){const s=f.game(2);f.own(s,'p0','罗马');f.own(s,'p1','里约热内卢');s.phase='build_decide';s.pending={playerId:'p0',cityId:'罗马'};s.players[0].position=s.board.find(x=>x.cityId==='罗马').id;s.players[0].cash=1000;s.stocks['里约热内卢'].price=2000;s.stocks['里约热内卢'].holders.p0=4;s.players[0].stocks['里约热内卢']=4;return s;}
function sell(s,n){const a={type:'rescue_sell_stock',cityId:'里约热内卢',shares:n,quoteVersion:s.stocks['里约热内卢'].quoteVersion};const checked=normalizeAction(s,a);assert.equal(checked.ok,true,checked.error);logic.apply(s,checked.action,()=>.5);}
test('partial build funding updates cash, retains pending construction and never auto builds',()=>{const s=fixture(),pending=globalThis.structuredClone(s.pending);sell(s,2);assert.equal(s.players[0].cash,5000);assert.equal(s.stocks['里约热内卢'].holders.p0,2);assert.deepEqual(s.pending,pending);assert.equal(s.cities['罗马'].houseLevel,0);sell(s,2);assert.equal(s.players[0].cash,9000);assert.equal(s.stocks['里约热内卢'].holders.p0,0);assert.equal(s.phase,'build_decide');});
test('invalid, stale, outside-stage and ineligible funding is rejected without mutation',()=>{for(const alter of [s=>s.phase='waiting_roll',s=>s.phase='buy_fundraise',s=>s.players[0].cash=20000,s=>s.cities['罗马'].mortgaged=true,s=>s.players[0].position=0,s=>s.cities['罗马'].houseLevel=4,s=>s.cities['罗马'].buildReady=false,s=>s.stocks['里约热内卢'].clearing=true]){const s=fixture();alter(s);const before=JSON.stringify(s);assert.equal(normalizeAction(s,{type:'rescue_sell_stock',cityId:'里约热内卢',shares:1,quoteVersion:s.stocks['里约热内卢'].quoteVersion}).ok,false);assert.equal(JSON.stringify(s),before);}
 for(const shares of [undefined,0,-1,1.5,5,NaN]){const s=fixture();assert.equal(normalizeAction(s,{type:'rescue_sell_stock',cityId:'里约热内卢',shares,quoteVersion:s.stocks['里约热内卢'].quoteVersion}).ok,false);}
 const s=fixture();assert.equal(normalizeAction(s,{type:'rescue_sell_stock',cityId:'里约热内卢',shares:1,quoteVersion:'stale'}).ok,false);
});


test('历史和现代建房筹资沿原变现规则，建房优惠只在真正建设时消耗',()=>{
 for(const version of [1,2]){const s=fixture();s.ruleVersion=version;s.cities['里约热内卢'].mortgaged=true;sell(s,1);assert.equal(s.players[0].cash,3000);assert.equal(s.stocks['里约热内卢'].holders.p0,3);}
 const s=fixture(),p=s.players[0];p.opportunities.selectedIds=['H2'];sell(s,2);sell(s,1);assert.equal(p.opportunities.usage.H2||0,0);const q=require('../src/economy').quoteBuild(s,{playerId:p.id,cityId:'罗马'});assert.equal(q.finalAmount,6480);const a=normalizeAction(s,{type:'respond_build',decision:'build',quoteVersion:q.quoteVersion});assert.equal(a.ok,true,a.error);logic.apply(s,a.action,()=>.5);assert.equal(p.cash,520);assert.equal(s.cities['罗马'].houseLevel,1);assert.equal(p.opportunities.usage.H2,1);
});
