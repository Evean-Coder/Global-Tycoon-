'use strict';
// Candidate budget arithmetic, not an implementation of the proposed game rules.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {CITIES}=require('../../src/board');
const {rounded,rentFor,buildFee}=require('../../src/economy');
const results=[];
function check(name,fn){fn();results.push({name,passed:true});}
const extra=base=>Math.min(600,rounded(base,8));
function order(price){
  const advance=Math.min(rounded(price,10),1000),profit=Math.max(200,Math.min(600,rounded(price,3)));
  const first=Math.floor((advance+profit)/2),second=advance+profit-first;
  const news=Math.min(150,rounded(first,10))+Math.min(150,rounded(second,10));
  const oldEach=Math.min(rounded(price,12),1500);
  return {advance,first,second,profit,newsProfit:profit+news,
    currentProfit:2*oldEach-advance,currentNewsProfit:2*(oldEach+Math.min(150,rounded(oldEach,10)))-advance};
}
const distributionCases=[[],[{id:'owner',shares:2}],[{id:'a',shares:4}],[{id:'owner',shares:2},{id:'a',shares:4}],
  [{id:'a',shares:4},{id:'b',shares:4},{id:'c',shares:2}],
  [{id:'owner',shares:2},{id:'a',shares:4},{id:'b',shares:4}]];
function allocation(rent,holders,h4Remaining){
  const rentalPer=Math.floor(rounded(rent,20)/10),bankPer=Math.floor(rounded(rent,40)/10);
  const issued=holders.reduce((n,h)=>n+h.shares,0),retained=rent-issued*rentalPer;
  let bank=issued*bankPer,holderCash=0,ownerCash=retained;
  for(const h of holders){
    const h4=Math.min(h4Remaining,rounded(h.shares*rentalPer,50));
    const cash=h.shares*(rentalPer+bankPer)+h4;
    bank+=h4;holderCash+=cash;if(h.id==='owner')ownerCash+=cash;
  }
  assert.equal(retained+issued*rentalPer,rent);
  assert.equal(retained+holderCash,rent+bank);
  return {bank,ownerCash,allReceived:retained+holderCash};
}
const cityLevels=[],orders=[];
let ledgerCases=0,maxRatio=0,maxOwnerDelta=0,maxBankDelta=0;
for(const [city,c] of Object.entries(CITIES)){
  const o=order(c.price);orders.push({city,...o});
  assert.ok(o.profit>=200&&o.profit<=600);assert.ok(o.newsProfit<=760);
  assert.equal(o.first+o.second-o.advance,o.profit);
  for(let houseLevel=0;houseLevel<=4;houseLevel++){
    const base=rentFor({...c,houseLevel}),b=extra(base),benchmark=rounded(c.price,30);
    assert.ok(b>=0&&b<=600);assert.ok(2*b<=1200);
    assert.ok(2*b<=benchmark*0.8);
    maxRatio=Math.max(maxRatio,2*b/benchmark);
    cityLevels.push({city,houseLevel,base,singleExtra:b,twoExtras:2*b,ordinaryBuildFee:buildFee(c),standardUpgradeRentBenchmark:benchmark});
    for(const newsDelta of [-Math.min(6000,rounded(base,30)),0,Math.min(6000,rounded(base,30))]){
      const actualBase=base+newsDelta;
      for(const holders of distributionCases)for(const h4Remaining of [0,100,3000]){
        ledgerCases++;
        const before=allocation(actualBase,holders,h4Remaining),after=allocation(actualBase+b,holders,h4Remaining);
        assert.equal((after.allReceived-before.allReceived)-(after.bank-before.bank),b);
        maxOwnerDelta=Math.max(maxOwnerDelta,after.ownerCash-before.ownerCash);
        maxBankDelta=Math.max(maxBankDelta,after.bank-before.bank);
      }
    }
  }
}
orders.push({city:'机场',...order(15000)});
check('20 current cities and five house levels checked',()=>assert.equal(cityLevels.length,100));
check('21 city or airport order examples conserve principal',()=>{
  assert.equal(orders.length,21);for(const o of orders)assert.equal(o.first+o.second,o.advance+o.profit);
});
check('ordinary order net maximum reduced from 2000 to 600',()=>{
  assert.equal(Math.max(...orders.map(o=>o.currentProfit)),2000);
  assert.equal(Math.max(...orders.map(o=>o.profit)),600);
});
check('existing news receipt effect included, maximum reduced from 2300 to 760',()=>{
  assert.equal(Math.max(...orders.map(o=>o.currentNewsProfit)),2300);
  assert.equal(Math.max(...orders.map(o=>o.newsProfit)),760);
});
check('airport total and news rounding are 1450 and 596 net',()=>{
  const o=order(15000);assert.equal(o.first+o.second,1450);assert.equal(o.newsProfit,596);
});
check('Nairobi zero house supplemental full activity is below one normal rent increase',()=>{
  const q=cityLevels.find(q=>q.city==='内罗毕'&&q.houseLevel===0);
  assert.equal(q.singleExtra,86);assert.equal(q.twoExtras,172);assert.equal(q.standardUpgradeRentBenchmark,1080);
});
check('all full activity extra rentals at most 80% of same-land-price standard single rent increase benchmark',()=>assert.equal(maxRatio,0.8));
check('news is additive and does not inflate campaign base',()=>{
  const base=33000,news=6000;assert.equal(base+news+extra(base),39600);
  assert.equal(extra(5400),432);assert.equal(5400+1620+extra(5400),7452);
});
check('both external and owner holdings with H4 honor rental and bank accounting',()=>assert.equal(ledgerCases,5400));
check('owner-only two shares plus H4 yield 660 incremental cash on 600 rent extra, not a fake 600 net cap',()=>{
  const holders=[{id:'owner',shares:2}],before=allocation(33000,holders,3000),after=allocation(33600,holders,3000);
  assert.equal(after.ownerCash-before.ownerCash,660);
});
const output={date:'2026-10-16',scope:'Candidate arithmetic only; no engine, actual arrival probability, auction, quota lifecycle, individual rent discounts, UI or gameplay balance proof',
  passed:results.length,checks:results.length,cityLevelCases:cityLevels.length,orderCases:orders.length,ledgerCases,fullGames:0,
  observedMaxPerSettlementOwnerCashDelta:maxOwnerDelta,observedMaxPerSettlementBankOutflowDelta:maxBankDelta,
  results,orders,cityLevels};
fs.writeFileSync(path.join(__dirname,'core-first-results.json'),JSON.stringify(output,null,2)+'\n');
process.stdout.write(JSON.stringify({...output,orders:undefined,cityLevels:undefined},null,2)+'\n');
