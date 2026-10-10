'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGameState,snapshot}=require('../src/state'),policy=require('../src/botPolicy'),{normalizeAction}=require('../src/actionValidation'),stocks=require('../src/stocks'),opp=require('../src/opportunities');
function fixture(){const s=createGameState('BOT',['真人','电脑'],2,{activeManagementRevision:'active-management-v1',propertySupportRevision:'property-support-v1'});s.phase='waiting_roll';s.pending=null;s.firstRoundDone=true;s.turnIndex=1;return s;}
function decide(s,memory={}){const v=snapshot(s,'p1',{decisionId:1});const before=JSON.stringify(v),a=policy.choose(v,memory);assert.equal(JSON.stringify(v),before);const n=normalizeAction(s,a,{actorId:'p1',source:'player'});assert.equal(n.ok,true,n.error+' '+JSON.stringify(a));return a;}
test('电脑初始机遇只读本人候选，不读取别人候选或未来随机数',()=>{
 const s=fixture();opp.beginOpportunityStage(s,1,{kind:'start'},()=>.3);const a=decide(s);s.chanceDeck.reverse();s.opportunityStage.participants.p0.candidateIds.reverse();assert.deepEqual(decide(s),a);
});
test('正常掷骰、落点买地、建设与机场有真实经营行为',()=>{
 const s=fixture();assert.equal(decide(s).type,'roll_dice');
 s.phase='buy';s.pending={playerId:'p1',cityId:'内罗毕'};assert.equal(decide(s).decision,'buy');
 s.players[1].cash=2000;assert.equal(decide(s).decision,'pass');s.players[1].cash=150000;
 s.phase='buy_airport';s.pending={playerId:'p1',airportId:Object.keys(s.airports)[0]};assert.equal(decide(s).decision,'buy');
 stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p1'},[]);s.cities['内罗毕'].buildReady=true;
 s.players[1].position=s.board.find(x=>x.cityId==='内罗毕').id;s.phase='build_decide';s.pending={playerId:'p1',cityId:'内罗毕'};assert.equal(decide(s).decision,'build');
});
test('主动经营与扶持复用真实报价，股票使用上市版本',()=>{
 const s=fixture();stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p1'},[]);s.cities['内罗毕'].buildReady=true;
 assert.equal(decide(s).type,'active_build');assert.equal(decide(s,{steps:6}).type,'roll_dice');
 const t=fixture();t.players[1].propertySupport.eligible=true;assert.equal(decide(t).type,'support_buy');
 stocks.transferCity(t,{cityId:'内罗毕',newOwnerId:'p0'},[]);assert.equal(decide(t,{steps:6}).type,'roll_dice');
 stocks.openStockWindow(s,'p1');s.phase='stock';s.pending={playerId:'p1'};assert.equal(decide(s).type,'stock_trade');assert.equal(decide(s,{steps:8}).type,'stock_done');
});
test('监狱、冻结、飞行、转让与拍卖有合法退出或出价',()=>{
 const s=fixture();s.phase='jail_turn';s.players[1].jailed=true;assert.equal(decide(s).type,'respond_jail');s.players[1].jailed=false;
 s.phase='frozen_turn';s.players[1].frozen=true;assert.equal(decide(s).type,'respond_frozen');s.players[1].frozen=false;
 s.phase='flight';s.pending={playerId:'p1',fromAirportId:Object.keys(s.airports)[0],free:true};assert.equal(decide(s).target,null);
 s.phase='auction_bid';s.pending={awaiting:'p1',cityId:'内罗毕',currentBid:0,currentBidder:null};assert.equal(decide(s).decision,'bid');
 s.phase='direct_sale_ask';s.pending={targetId:'p1',cityId:'内罗毕'};assert.equal(decide(s).decision,'buy');
});
test('欠款先卖持股/抵押/拆屋，资金补足后继续，失败有保守默认',()=>{
 const s=fixture();stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p1'},[]);s.phase='self_rescue';s.pending={playerId:'p1',due:1000,reason:'指定债务'};s.players[1].cash=-1000;
 assert.equal(decide(s).type,'rescue_mortgage');s.players[1].cash=1000;assert.equal(decide(s).type,'rescue_done');assert.equal(policy.fallback(snapshot(s,'p1')).type,'rescue_done');
});
test('城主持有四股时不继续买本城，现金储备与窗口上限生效',()=>{
 const s=fixture();stocks.transferCity(s,{cityId:'内罗毕',newOwnerId:'p1'},[]);s.stocks['内罗毕'].holders.p1=4;s.players[1].stocks['内罗毕']=4;
 stocks.openStockWindow(s,'p1');s.phase='stock';s.pending={playerId:'p1'};assert.equal(decide(s).type,'stock_done');
 s.stocks['内罗毕'].holders.p1=0;s.players[1].stocks['内罗毕']=0;s.stockWindow.boughtTotal=6;assert.equal(decide(s).type,'stock_done');
});
