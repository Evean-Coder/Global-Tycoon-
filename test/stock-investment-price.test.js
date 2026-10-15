'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGameState}=require('../src/state'),inv=require('../src/stockInvestment'),stocks=require('../src/stocks');
test('10股报价按标准建设资产与完整经营轮计价，旧20股不迁移',()=>{
 const s=createGameState('v2',['a','b'],2,{stockInvestmentRevision:inv.REVISION}),old=createGameState('old',['a','b'],2);assert.equal(old.stockInvestmentRevision,undefined);assert.equal(old.stocks['开罗'].price,1200);
 for(const c of Object.values(s.cities))for(let level=0;level<=4;level++){c.houseLevel=level;assert.equal(inv.quoteBuy(s,c.id),Math.round((c.price+Math.round(c.price*.6)*level)*.12));}
 const c=s.cities['开罗'];c.houseLevel=0;stocks.transferCity(s,{cityId:c.id,newOwnerId:'p0'},[]);assert.equal(inv.quoteBuy(s,c.id),720);
 for(const round of [1,2,3])inv.round(s,round,[]);assert.equal(s.stocks[c.id].rentHistoryV2.length,2);assert.equal(inv.quoteBuy(s,c.id),720);inv.round(s,4,[]);assert.equal(inv.quoteBuy(s,c.id),648);inv.round(s,4,[]);assert.equal(s.stocks[c.id].rentHistoryV2.length,3);
 c.mortgaged=true;inv.refreshAll(s);assert.equal(s.stocks[c.id].price,518);
});
