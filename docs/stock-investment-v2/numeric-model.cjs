'use strict';
// Candidate arithmetic only. This does not execute production game actions or full games.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CITIES } = require('../../src/board');
const counts = {};
const check = (group, fn) => { fn(); counts[group] = (counts[group] || 0) + 1; };
const round = (v,n,d=100) => Number((BigInt(v)*BigInt(n)*2n+BigInt(d))/(2n*BigInt(d)));
const quote = (p,l,activity=100,mortgaged=false) => Math.max(1,round(p+round(p,60)*l,12*activity*(mortgaged?80:100),1000000));
const exitValue = (q,units,rate=90) => units.reduce((sum,u)=>sum+Math.floor(Math.min(q,u.bankBasis)*rate/100),0);
function receive(units,cash) {
  const sorted=units.slice().sort((a,b)=>a.unitId-b.unitId),base=Math.floor(cash/units.length),extra=cash%units.length;
  return sorted.map((u,i)=>({...u,paidCost:base+(i<extra?1:0),bankBasis:Math.min(u.bankBasis,base+(i<extra?1:0))}));
}
function distribute(income,holdings,owner=0,payer=1,payment=income,h4={}) {
  const rentalUnit=Math.floor(round(income,20)/10),bankUnit=Math.floor(round(income,40)/10);
  const rented=holdings.reduce((a,b)=>a+b,0)*rentalUnit;
  const delta=holdings.map(()=>0);delta[payer]-=payment;delta[owner]+=income-rented;
  let bank=0,extra=0;
  for(let i=0;i<holdings.length;i++) {
    const rental=rentalUnit*holdings[i],bonus=bankUnit*holdings[i];
    const addition=Math.min(h4[i]||0,round(rental,50));
    delta[i]+=rental+bonus+addition;bank+=bonus;extra+=addition;
  }
  return {rentalUnit,bankUnit,delta,bank,extra,rentSupplement:income-payment};
}
const referenceRows=[];
for(const [city,c] of Object.entries(CITIES)) {
  let previous=0;
  for(let level=0;level<=4;level++) check('pricing',()=>{
    const q=quote(c.price,level),rent=round(round(c.price,30+30*level),level===4&&c.price>=15000?110:100);
    const rental=Math.floor(round(rent,20)/10),bank=Math.floor(round(rent,40)/10);
    assert(q>previous);previous=q;
    assert.equal(q,round(c.price+round(c.price,60)*level,12));
    referenceRows.push({city,level,buyPrice:q,bankExitAtPurchase:exitValue(q,[{bankBasis:q}]),rent,perShareRental:rental,perShareBank:bank,perShareTotal:rental+bank,perRentYieldPercent:Math.round((rental+bank)/q*10000)/100});
  });
}
for(const activity of [90,100,110,115])for(const level of [0,4])for(const mortgaged of [false,true])check('priceFactors',()=>{
  const q=quote(10000,level,activity,mortgaged);
  assert.equal(q,Math.round((10000+6000*level)*.12*activity/100*(mortgaged?.8:1)));
});
for(const income of [0,1,25,3000,6000,21000])for(const holders of [[0,0,0,0],[0,4,0,0],[2,4,4,0],[1,3,3,3]])check('moneySources',()=>{
  const r=distribute(income,holders);
  assert.equal(r.delta.reduce((a,b)=>a+b,0),r.bank);
  assert(r.bank<=round(income,40));
  if(!holders.some(Boolean))assert.equal(r.bank,0);
});
check('selfRescueAndH4',()=>{
  const r=distribute(6000,[0,4,0,0]);assert.equal(r.delta[1],-4560);assert.equal(5000+r.delta[1],440);
});
check('selfRescueAndH4',()=>{
  const r=distribute(6000,[0,4,0,0],0,1,6000,{1:3000});assert.equal(r.extra,240);assert.equal(r.delta[1],-4320);
});
check('selfRescueAndH4',()=>{
  const r=distribute(6000,[0,4,0,0],0,1,4500,{1:50});assert.equal(r.extra,50);assert.equal(r.delta.reduce((a,b)=>a+b,0),1500+960+50);
});
check('selfRescueAndH4',()=>{
  const r=distribute(0,[2,4,4,0],0,1,0,{1:3000});assert.equal(r.bank,0);assert.equal(r.extra,0);
});
let naiveProfitableCycles=0;
for(const c of Object.values(CITIES))for(let level=0;level<4;level++)check('buildSellDemolish',()=>{
  const before=quote(c.price,level),after=quote(c.price,level+1),units=Array.from({length:10},(_,unitId)=>({unitId,bankBasis:before}));
  // Adversarial coalition controls all shares; use cheapest permitted normal build and maximal corresponding refund.
  const build=round(round(c.price,60),70),refund=round(build,60);
  const safeNet=exitValue(after,units)-10*before-build+refund;
  const naiveNet=10*Math.floor(after*.9)-10*before-build+refund;
  assert(safeNet<0);if(naiveNet>0)naiveProfitableCycles++;
});
assert(naiveProfitableCycles>0);
const origin=[{unitId:3,bankBasis:1200},{unitId:1,bankBasis:1500},{unitId:8,bankBasis:2000}];
for(const cash of [0,1,1000,3601,10000,90000])for(const q of [800,2400,9000])check('transferAndValuation',()=>{
  const next=receive(origin,cash),oldById=Object.fromEntries(origin.map(u=>[u.unitId,u]));
  assert.equal(next.reduce((a,u)=>a+u.paidCost,0),cash);
  for(const u of next)assert(u.bankBasis<=oldById[u.unitId].bankBasis&&u.bankBasis<=u.paidCost);
  const fee=round(cash,2);assert(exitValue(q,next)-exitValue(q,origin)-fee<=0);
  const chained=receive(next,90000);assert(exitValue(q,chained)<=exitValue(q,next));
  if(cash===0)assert.equal(exitValue(q,next),0);
});
const lots=[{unitId:0,bankBasis:1200,acquiredSeq:1},{unitId:1,bankBasis:2400,acquiredSeq:2},{unitId:2,bankBasis:1000,acquiredSeq:3},{unitId:3,bankBasis:0,acquiredSeq:4}];
for(const n of [1,2,3,4])check('partialExit',()=>{
  const ordered=lots.slice().sort((a,b)=>a.acquiredSeq-b.acquiredSeq||a.unitId-b.unitId),chosen=ordered.slice(0,n),remaining=ordered.slice(n),q=3000;
  assert.equal(exitValue(q,chosen)+exitValue(q,remaining),exitValue(q,lots));
  assert(exitValue(q,chosen,50)<=exitValue(q,chosen,90));
  // Forced owner reduction uses the ordinary quote: cash plus remaining bank value does not grow.
  assert.equal(exitValue(q,chosen)+exitValue(q,remaining)-exitValue(q,lots),0);
});
const horizonRows=[];
for(const level of [0,1,4])for(const actualHits of [0,1,3])check('finiteRentHorizon',()=>{
  const p=10000,q=quote(p,level),rent=round(p,30+30*level),income=Math.floor(round(rent,20)/10)+Math.floor(round(rent,40)/10);
  const exit=exitValue(q,[{bankBasis:q}]),net=income*actualHits+exit-q;
  if(actualHits===0)assert(net<0);
  horizonRows.push({level,actualHits,buyPrice:q,bankExit:exit,receivedDividends:income*actualHits,netIncludingExit:net});
});
const output={date:'2026-10-15',status:'candidate arithmetic passed; not production implementation or overall balance proof',counts,totalCases:Object.values(counts).reduce((a,b)=>a+b,0),fullGames:0,naiveProfitableCycles,referenceRows,horizonRows,example:distribute(6000,[0,4,0,0])};
fs.writeFileSync(path.join(__dirname,'numeric-results.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,counts,totalCases:output.totalCases,fullGames:0,naiveProfitableCycles}));
