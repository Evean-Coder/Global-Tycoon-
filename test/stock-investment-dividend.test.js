'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGameState}=require('../src/state'),inv=require('../src/stockInvestment'),stocks=require('../src/stocks'),econ=require('../src/economy');
test('股息与租金原子净额，H4只奖励租金来源，GO不重复派息',()=>{
 const s=createGameState('v2',['owner','tenant'],2,{stockInvestmentRevision:inv.REVISION});stocks.transferCity(s,{cityId:'开罗',newOwnerId:'p0'},[]);s.turnIndex=1;s.phase='stock';stocks.openStockWindow(s,'p1');const st=s.stocks['开罗'];
 inv.applyTrade(s,inv.planTrade(s,'p1',inv.context(s,'p1'),[{cityId:'开罗',side:'buy',shares:2,quoteVersion:st.quoteVersion,listingEpoch:st.listingEpoch}]),[]);s.turnId++;stocks.openStockWindow(s,'p1');inv.applyTrade(s,inv.planTrade(s,'p1',inv.context(s,'p1'),[{cityId:'开罗',side:'buy',shares:2,quoteVersion:st.quoteVersion,listingEpoch:st.listingEpoch}]),[]);
 const p=s.players[1];p.cash=5000;const events=[];econ.applySettlement(s,econ.rentAmounts(s,{playerId:p.id,cityId:'开罗',baseAmount:6000}),events);assert.equal(p.cash,440);assert.equal(s.players[0].cash,155520);assert.equal(st.dividendFund,0);assert.equal(st.roundRent,6000);assert.equal(st.roundRentCount,1);assert.equal(events.find(e=>e.kind==='instant_stock_dividend').bank,960);
 p.opportunities.selectedIds=['H4'];p.cash=5000;econ.applySettlement(s,econ.rentAmounts(s,{playerId:p.id,cityId:'开罗',baseAmount:6000}),events);assert.equal(p.cash,680);assert.equal(p.opportunities.usage.H4,240);const cash=p.cash;stocks.settleCityDividend(s,'开罗','go','same',events);assert.equal(p.cash,cash);inv.assert(s);
});
