'use strict';
// Candidate arithmetic only; no games or proposed production behavior is run.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {CITIES}=require('../../src/board'),{rounded,rentFor}=require('../../src/economy');
function order(price){
  const advance=Math.max(1000,Math.min(2000,rounded(price,10))),profit=advance;
  const first=rounded(profit,25),second=advance+profit-first;
  return {advance,first,second,profit,newsProfit:profit+Math.min(150,rounded(first,10))+Math.min(150,rounded(second,10))};
}
const bonus=rent=>Math.min(3000,rounded(rent,15));
const ownerNoShares=(rent,issued)=>rent-issued*Math.floor(rounded(rent,20)/10);
const orders=Object.entries(CITIES).map(([city,c])=>({city,...order(c.price)}));
orders.push({city:'机场',...order(15000)});
for(const o of orders){assert.equal(o.first+o.second-o.advance,o.profit);assert.equal(o.profit,o.advance);assert.ok(o.first<o.advance);assert.ok(o.profit>=1000&&o.profit<=2000);assert.ok(o.newsProfit<=2200);}
const states=[];
for(const [city,c]of Object.entries(CITIES))for(let houseLevel=0;houseLevel<=4;houseLevel++){
  const base=rentFor({...c,houseLevel}),extra=bonus(base);assert.ok(extra>=0&&extra<=3000);assert.ok(extra*2<=6000);
  states.push({city,houseLevel,base,extra,twice:extra*2});
}
assert.equal(order(3600).profit,1000);assert.equal(order(3600).newsProfit,1175);
assert.equal(order(14000).profit,1400);assert.equal(order(14000).newsProfit,1585);
assert.equal(order(15000).profit,1500);assert.equal(order(15000).newsProfit,1688);
assert.equal(order(20000).profit,2000);assert.equal(order(20000).newsProfit,2200);
const cairo=states.find(s=>s.city==='开罗'&&s.houseLevel===2),shanghai=states.find(s=>s.city==='上海'&&s.houseLevel===4);
assert.equal(cairo.extra,810);assert.equal(shanghai.extra,3000);
const cases=[cairo,shanghai].map(s=>{
  const ownerDelta=ownerNoShares(s.base+s.extra,10)-ownerNoShares(s.base,10);
  return {...s,fullyExternalIssuedOwnerDelta:ownerDelta,bid:200,oneArrivalNet:ownerDelta-200,twoArrivalNet:2*ownerDelta-200,noArrivalNet:-200};
});
assert.equal(cases[0].oneArrivalNet,450);assert.equal(cases[0].twoArrivalNet,1100);
assert.equal(cases[1].oneArrivalNet,2200);assert.equal(cases[1].twoArrivalNet,4600);
assert.equal(cases[1].fullyExternalIssuedOwnerDelta-2000,400);
assert.equal(cases[1].fullyExternalIssuedOwnerDelta*2-2000,2800);
assert.equal(cases[1].fullyExternalIssuedOwnerDelta-3000,-600);
assert.equal(cases[1].fullyExternalIssuedOwnerDelta*2-3000,1800);
assert.equal(cases[0].fullyExternalIssuedOwnerDelta*2-3000,-1700);
assert.equal(33000+6000+bonus(33000),42000);
const output={date:'2026-10-17',status:'candidate arithmetic only',fullGames:0,orderCases:orders.length,cityLevelCases:states.length,
  competition:{bidMin:100,bidMax:3000,bidStep:100,ratePercent:15,perSettlementCap:3000,maxHits:2,durationRounds:4},
  exclusions:'No auction, quotas, actual arrival probabilities, owner-share/H4/individual-reduction accounting, UI, gameplay balance or deployment proof',orders,states,cases};
fs.writeFileSync(path.join(__dirname,'moderate-results.json'),JSON.stringify(output,null,2)+'\n');
process.stdout.write(JSON.stringify({...output,orders:undefined,states:undefined},null,2)+'\n');
