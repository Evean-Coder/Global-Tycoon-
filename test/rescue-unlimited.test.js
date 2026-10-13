'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),f=require('./helpers/gameplayFixtures');
const {createActionClock}=require('../src/actionClock'),logic=require('../src/gameLogic'),{normalizeAction}=require('../src/actionValidation'),economy=require('../src/economy');
function rescue(mode='normal'){
 const s=f.game(2);s.phase='self_rescue';s.pending={playerId:'p0',kind:'self_rescue',due:1000,reason:'指定欠款'};s.players[0].cash=-1000;s.firstRoundDone=true;
 if(mode==='quick'){s.quickRevision='quick-mode-v1';s.gameMode='quick';}return s;
}
test('self rescue never times out, keeps identity and supports pause/resume in both modes',()=>{
 for(const mode of ['normal','quick']){
  const time=f.fakeClock(),clock=createActionClock(time),s=rescue(mode);let hits=0;
  clock.sync(s,()=>hits++);const id=clock.decisionId;assert.equal(clock.deadlineMs,null);assert.equal(clock.remainingSeconds(),null);assert.equal(clock.timeoutId,null);
  time.advance(3600000);s.players[0].cash=-500;clock.sync(s,()=>hits++,false,0);assert.equal(clock.decisionId,id);assert.equal(clock.expired(),false);assert.equal(hits,0);
  assert.equal(clock.pause(),true);clock.sync(s,()=>hits++);assert.equal(clock.view(s.gameId).paused,true);assert.equal(clock.view(s.gameId).untimed,true);time.advance(3600000);assert.equal(clock.resume(()=>hits++),true);assert.equal(clock.deadlineMs,null);assert.equal(clock.decisionId,id);
  s.phase='buy';s.pending={playerId:'p0',cityId:'内罗毕'};clock.sync(s,()=>hits++);assert.equal(clock.untimed,false);assert.equal(clock.remainingMs,mode==='quick'?20000:60000);time.advance(clock.remainingMs);assert.equal(hits,1);clock.clear();
 }
});
test('a canceled previous deadline cannot bankrupt an untimed rescue, even with no assets',()=>{
 const timers=[],time=f.fakeClock(),clock=createActionClock({...time,setTimeout(fn,ms){timers.push(fn);return time.setTimeout(fn,ms);}}),s=rescue();let hits=0;
 s.phase='buy';clock.sync(s,()=>hits++);s.phase='self_rescue';clock.sync(s,()=>hits++);timers[0]();time.advance(10000000);assert.equal(hits,0);assert.equal(s.players[0].alive,true);
 logic.apply(s,{type:'rescue_done'},f.rng());assert.equal(s.players[0].alive,false);
});
test('real rent and airport debts capture payer, recipient, source and original paid amount',()=>{
 const rent=f.game(2);rent.firstRoundDone=true;f.own(rent,'p1','内罗毕');rent.players[0].cash=100;rent.players[0].position=0;rent.diceBag=[1];const q=economy.quoteRent(rent,{playerId:'p0',cityId:'内罗毕'});logic.apply(rent,{type:'roll_dice'},f.rng());
 assert.equal(rent.phase,'self_rescue');assert.equal(rent.pending.playerId,'p0');assert.deepEqual(rent.pending.payment,{cityId:'内罗毕',recipientId:'p1',amount:q.finalAmount});assert.equal(rent.pending.due,q.finalAmount-100);
 const airport=f.game(2);airport.firstRoundDone=true;airport.airports['开罗国际机场'].ownerId='p1';airport.players[1].airports=['开罗国际机场'];airport.players[0].cash=100;airport.players[0].position=5;airport.diceBag=[1];logic.apply(airport,{type:'roll_dice'},f.rng());assert.equal(airport.phase,'self_rescue');assert.deepEqual(airport.pending.payment,{airportId:'开罗国际机场',recipientId:'p1',amount:3000});
 const view=require('../src/gameView').snapshot(airport,'p0');assert.deepEqual(view.pending.payment,airport.pending.payment);assert.notEqual(view.pending.payment,airport.pending.payment);
});
test('direct sale refusal preserves original debt facts and funded rescue continues without recharging',()=>{
 const s=rescue();f.own(s,'p0','上海');s.pending.payment={cityId:'巴黎',recipientId:'p1',amount:1500};const facts=globalThis.structuredClone(s.pending.payment);
 const action=normalizeAction(s,{type:'sell_city',cityId:'上海',mode:'direct',context:{payment:{amount:1}}},'p0');assert.equal(action.ok,true);logic.apply(s,action.action,f.rng());assert.equal(s.phase,'direct_sale_ask');logic.apply(s,{type:'direct_sale_respond',decision:'pass'},f.rng());assert.equal(s.phase,'self_rescue');assert.deepEqual(s.pending.payment,facts);assert.equal(s.players[0].cash,-1000);
 const mortgage=normalizeAction(s,{type:'rescue_mortgage',cityId:'上海'},'p0');assert.equal(mortgage.ok,true);logic.apply(s,mortgage.action,f.rng());assert.equal(s.players[0].alive,true);assert.equal(s.players[0].cash,9000);assert.notEqual(s.phase,'self_rescue');
});
