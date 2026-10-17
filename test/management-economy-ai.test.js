'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),f=require('./helpers/managementEconomyFixtures'),cc=require('../src/commercialCompetition'),{snapshot}=require('../src/state'),ev=require('../src/botEvaluation'),policy=require('../src/botPolicy');
test('AI counts upfront once, delayed principal and future bid liability rather than free action',()=>{
 const s=f.state();cc.publishAtRoundStart(s,1);const v=snapshot(s,'p0'),ctx=ev.context(v),order=v.self.activeManagement.quotes.find(q=>q.type==='active_order'&&q.ok),bid=v.self.activeManagement.quotes.find(q=>q.type==='active_competition_bid'&&q.ok);
 assert.ok(ev.evaluate(ctx,{kind:'order',cityId:order.cityId,cashCost:order.finalAmount,quote:order}).expectedIncome>0);
 const c=ev.evaluate(ctx,{kind:'competition',cityId:bid.cityId,cashCost:3000,quote:bid});assert.equal(c.assetDelta,-3000);assert.ok(c.score<0);const action=policy.choose(v);assert.ok(action);assert.notEqual(action.amount,3000);
});
test('AI cannot distinguish hidden bid/dice data and skips near quick seal',()=>{
 const s=f.state();cc.publishAtRoundStart(s,1);const view=snapshot(s,'p0'),a=policy.choose(view);s.diceBag=[10,9,8];s.rngSeed=77;assert.deepEqual(policy.choose(snapshot(s,'p0')),a);view.quickRevision='quick-mode-v1';view.gameMode='quick';view.quickTime={mode:'quick',elapsedMs:1799999,totalRemainingMs:1,closed:false};assert.ok(['active_skip','roll_dice'].includes(policy.choose(view).type));
});
test('changing only another seat secret bid cannot change the same own decision',()=>{
 const s=f.state();cc.publishAtRoundStart(s,1);f.turn(s,'p1');cc.acceptBid(s,'p1',f.bid(s,'p1','开罗',100));f.turn(s,'p0');const first=policy.choose(snapshot(s,'p0'));s.commercialCompetition.bids[0].amount=3000;assert.deepEqual(policy.choose(snapshot(s,'p0')),first);
});
