'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGameState}=require('../src/state'),support=require('../src/propertySupport'),logic=require('../src/gameLogic'),stocks=require('../src/stocks'),{normalizeAction}=require('../src/actionValidation');
function state(){const s=createGameState('TEST',['甲','乙'],2,{propertySupportRevision:support.REVISION});s.firstRoundDone=true;s.phase='waiting_roll';s.pending=null;return s;}
test('六个有效回合、拒绝归零、重复和旧局隔离',()=>{
 const s=state(),p=s.players[0];for(let i=1;i<=5;i++){s.turnId=i;support.beginRoll(s,p);support.finish(s,p);support.finish(s,p);}assert.equal(p.propertySupport.missedPurchaseTurns,5);assert.equal(p.propertySupport.eligible,false);
 s.turnId=6;support.beginRoll(s,p);support.offer(s,p,s.cities['内罗毕']);support.refuse(s,p);support.finish(s,p);assert.equal(p.propertySupport.missedPurchaseTurns,0);
 for(let i=7;i<=12;i++){s.turnId=i;support.beginRoll(s,p);support.finish(s,p);}assert.equal(p.propertySupport.eligible,true);
 const old=createGameState('OLD',['甲','乙']);support.beginRoll(old,old.players[0]);assert.equal(old.players[0].propertySupport,undefined);
});
test('原价购买原子、原圈额度、曾拥有与本人隐私',()=>{
 const s=state(),p=s.players[0];p.propertySupport.eligible=true;const id=support.candidates(s)[0],q=support.quote(s,p.id,id),a={type:'support_buy',cityId:id,quoteVersion:q.quoteVersion};
 const before=p.cash;assert.equal(normalizeAction(s,a).ok,true);const result=logic.apply(s,a,()=>.5);assert.equal(result.rejected,undefined);assert.equal(p.cash,before-q.finalAmount);assert.equal(p.lapBuys,1);assert.equal(p.propertySupport.used,true);assert.equal(p.propertySupport.everOwnedCity,true);assert.equal(s.cities[id].ownerId,p.id);assert.equal(normalizeAction(s,a).ok,false);
 const view=require('../src/gameView').snapshot(s,'p1');assert.equal(view.players[0].propertySupport,undefined);
 const record=require('../src/record').buildGameRecord({state:s,code:s.roomCode,events:[]},'normal');assert.equal(record.propertySupportRevision,support.REVISION);assert.equal(JSON.stringify(record).includes('missedPurchaseTurns'),false);assert.equal(JSON.stringify(record).includes('eligible'),false);
 stocks.clearCityToBank(s,{cityId:id},[]);assert.equal(support.quote(s,p.id,id).ok,false);
});
test('库存、现金、阶段及报价变化无修改',()=>{
 const s=state(),p=s.players[0];p.propertySupport.eligible=true;const id=support.candidates(s)[0],q=support.quote(s,p.id,id);
 p.cash=0;let before=JSON.stringify(s);assert.equal(normalizeAction(s,{type:'support_buy',cityId:id,quoteVersion:q.quoteVersion}).ok,false);assert.equal(JSON.stringify(s),before);assert.equal(p.propertySupport.eligible,true);
 p.cash=150000;stocks.transferCity(s,{cityId:id,newOwnerId:'p1'},[]);before=JSON.stringify(s);assert.equal(normalizeAction(s,{type:'support_buy',cityId:id,quoteVersion:q.quoteVersion}).ok,false);assert.equal(JSON.stringify(s),before);
});
test('拒绝可负担机会取消进度资格，机场与非正常回合不误计',()=>{
 const s=state(),p=s.players[0];p.propertySupport.eligible=true;p.propertySupport.missedPurchaseTurns=6;support.beginRoll(s,p);support.offer(s,p,s.cities['内罗毕']);support.refuse(s,p);support.finish(s,p);assert.equal(p.propertySupport.eligible,false);assert.equal(p.propertySupport.missedPurchaseTurns,0);
 s.turnId++;support.beginRoll(s,p);p.propertySupport.turn.normal=false;support.finish(s,p);assert.equal(p.propertySupport.missedPurchaseTurns,0);
 p.airports=['开罗国际机场'];s.turnId++;support.beginRoll(s,p);support.finish(s,p);assert.equal(p.propertySupport.missedPurchaseTurns,1);
});
test('真实骰子回合完成出口计数，冻结跳过和实际飞行不计',()=>{
 const s=state(),p=s.players[0];
 for(let i=0;i<6;i++){s.turnIndex=0;s.phase='waiting_roll';s.pending=null;p.position=9;s.diceBag=[1];logic.apply(s,{type:'roll_dice'},()=>.5);assert.equal(p.propertySupport.missedPurchaseTurns,i+1);assert.equal(p.propertySupport.eligible,i===5);}
 s.turnIndex=0;s.phase='frozen_turn';p.frozen=true;logic.apply(s,{type:'respond_frozen',decision:'pass'},()=>.5);assert.equal(p.propertySupport.missedPurchaseTurns,6);
 const flight=state(),fp=flight.players[0];flight.airports['开罗国际机场'].ownerId=fp.id;fp.airports=['开罗国际机场'];fp.position=5;flight.diceBag=[1];logic.apply(flight,{type:'roll_dice'},()=>.5);assert.equal(flight.phase,'flight');logic.apply(flight,{type:'flight',target:'伦敦希思罗国际机场'},()=>.5);assert.equal(fp.propertySupport.missedPurchaseTurns,0);
});
test('四条真实产权获得路径永久结束扶持，出售不恢复',()=>{
 for(const path of ['buy','fundraise','auction','direct']){
  const s=state(),p=s.players[0],cityId='内罗毕';p.propertySupport.eligible=true;p.propertySupport.missedPurchaseTurns=6;
  if(path==='direct'){
   stocks.transferCity(s,{cityId,newOwnerId:'p1'},[]);s.turnIndex=1;logic.apply(s,{type:'sell_city',cityId,mode:'direct'},()=>.5);assert.equal(s.pending.awaiting,p.id);logic.apply(s,{type:'direct_sale_respond',decision:'buy'},()=>.5);
  }else{
   s.phase='buy';s.pending={playerId:path==='auction'?'p1':p.id,cityId};
   if(path==='buy')logic.apply(s,{type:'buy',decision:'buy'},()=>.5);
   if(path==='fundraise'){p.cash=0;logic.apply(s,{type:'buy_fundraise',decision:'start'},()=>.5);p.cash=s.cities[cityId].price;logic.apply(s,{type:'buy_fundraise',decision:'confirm'},()=>.5);}
   if(path==='auction'){s.turnIndex=1;logic.apply(s,{type:'buy',decision:'pass'},()=>.5);assert.equal(s.pending.awaiting,p.id);logic.apply(s,{type:'auction_respond',decision:'bid',amount:2700},()=>.5);logic.apply(s,{type:'auction_respond',decision:'end'},()=>.5);}
  }
  assert.equal(s.cities[cityId].ownerId,p.id,path);assert.equal(p.propertySupport.everOwnedCity,true,path);assert.equal(p.propertySupport.eligible,false,path);stocks.clearCityToBank(s,{cityId},[]);assert.equal(support.quote(s,p.id,cityId).ok,false,path);
 }
});
test('现金不足按落点时判断，自救挂起不计直到原回合完成',()=>{
 const s=state(),p=s.players[0];p.cash=0;p.position=0;s.diceBag=[1];logic.apply(s,{type:'roll_dice'},()=>.5);assert.equal(s.phase,'buy');assert.equal(p.propertySupport.turn.affordable,false);logic.apply(s,{type:'buy',decision:'pass'},()=>.5);logic.apply(s,{type:'auction_respond',decision:'pass'},()=>.5);assert.equal(p.propertySupport.missedPurchaseTurns,1);
 const debt=state(),debtor=debt.players[0];stocks.transferCity(debt,{cityId:'内罗毕',newOwnerId:'p1'},[]);debtor.cash=0;debtor.position=0;debt.diceBag=[1];logic.apply(debt,{type:'roll_dice'},()=>.5);assert.equal(debt.phase,'self_rescue');const turn=debt.turnId;assert.equal(debtor.propertySupport.missedPurchaseTurns,0);debtor.cash=0;logic.apply(debt,{type:'rescue_done'},()=>.5);assert.equal(debtor.propertySupport.missedPurchaseTurns,1);assert.equal(debtor.propertySupport.processedTurnId,turn);
});

test('候选排序、占用排除与各类失败均保留资格和完整状态',()=>{
 const s=state(),p=s.players[0];p.propertySupport.eligible=true;const expected=s.board.filter(q=>q.type==='city').sort((a,b)=>a.price-b.price).slice(0,3).map(q=>q.cityId);assert.deepEqual(support.candidates(s),expected);
 const tied=globalThis.structuredClone(s);tied.board.find(q=>q.cityId==='开普敦').price=3600;tied.cities['开普敦'].price=3600;assert.deepEqual(support.candidates(tied).slice(0,2),['内罗毕','开普敦']);
 s.phase='auction_bid';s.pending={cityId:expected[0]};assert.equal(support.candidates(s).includes(expected[0]),false);s.phase='waiting_roll';s.pending=null;
 for(const phase of ['self_rescue','auction_bid','trade_confirm','opportunity_choose','route_choose','jail_turn','frozen_turn']){s.phase=phase;const before=JSON.stringify(s);assert.equal(normalizeAction(s,{type:'support_buy',cityId:expected[0],quoteVersion:support.quote(s,p.id,expected[0]).quoteVersion}).ok,false);assert.equal(JSON.stringify(s),before);}
 s.phase='waiting_roll';p.lapBuys=4;let before=JSON.stringify(s);assert.equal(support.quote(s,p.id,expected[0]).ok,false);assert.equal(JSON.stringify(s),before);assert.equal(p.propertySupport.eligible,true);
 p.lapBuys=0;s.firstRoundDone=false;before=JSON.stringify(s);assert.equal(support.quote(s,p.id,expected[0]).ok,false);assert.equal(JSON.stringify(s),before);
 s.firstRoundDone=true;for(const c of Object.values(s.cities))c.ownerId='p1';assert.deepEqual(support.candidates(s),[]);assert.equal(p.propertySupport.eligible,true);
});

test('监狱掷骰和放弃不计，解锁前正常回合也不计',()=>{
 for(const decision of ['roll','pass']){const s=state(),p=s.players[0];s.phase='jail_turn';s.pending={playerId:p.id};p.jailed=true;s.diceBag=[2];logic.apply(s,{type:'respond_jail',decision},()=>.5);assert.equal(p.propertySupport.missedPurchaseTurns,0);}
 const s=state(),p=s.players[0];s.firstRoundDone=false;p.position=9;s.diceBag=[1];logic.apply(s,{type:'roll_dice'},()=>.5);assert.equal(p.propertySupport.missedPurchaseTurns,0);
});

test('有资格直接掷骰不阻塞，下次正常回合保留使用机会',()=>{
 const s=state(),p=s.players[0];p.propertySupport.eligible=true;p.propertySupport.missedPurchaseTurns=6;p.position=9;s.players[1].position=9;s.opportunityStage={ordinal:3,resolved:true};require('../src/worldEvents').advanceWorld(s,()=>.5,[]);s.diceBag=[1,1];logic.apply(s,{type:'roll_dice'},()=>.5);assert.equal(s.turnIndex,1);assert.equal(p.propertySupport.eligible,true);logic.apply(s,{type:'roll_dice'},()=>.5);assert.equal(s.turnIndex,0);assert.equal(s.phase,'waiting_roll');assert.equal(support.quote(s,p.id,support.candidates(s)[0]).ok,true);
});


