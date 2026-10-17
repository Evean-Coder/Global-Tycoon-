'use strict';
// Finite audit: candidate rent input passed through the existing pure settlement quote.
// This is not a commercial-competition implementation or a full-game simulation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const econ=require('../../src/economy'),{CITIES,LAYOUT}=require('../../src/board');
const {rollDice}=require('../../src/random');
const holderCases=[
  {id:'none',holders:{}},
  {id:'two-player-tenant-four',holders:{tenant:4}},
  {id:'two-player-owner-two-tenant-four',holders:{owner:2,tenant:4}},
  {id:'owner-only-two',holders:{owner:2}},
  {id:'four-player-all-external',holders:{tenant:4,a:3,b:3}},
  {id:'three-player-all-issued',holders:{owner:2,tenant:4,a:4}}
];
const perks=[
  {id:'none'},
  {id:'H4-all',h4:true},
  {id:'H6-tenant',h6:true},
  {id:'H11-tenant',h11:true},
  {id:'H4-H6-H11',h4:true,h6:true,h11:true}
];
function quote(city,level,income,holders,perks){
  const ids=[...new Set(['owner','tenant',...Object.keys(holders)])];
  const players=ids.map(id=>({id,name:id,alive:true,cash:150000,opportunities:{selectedIds:[...(perks.h4?['H4']:[]),...(id==='tenant'&&perks.h6?['H6']:[]),...(id==='tenant'&&perks.h11?['H11']:[])],usage:{}}}));
  const state={gameId:'finite-design-audit',revision:1,activeManagementRevision:'active-management-v4',stockInvestmentRevision:'stock-investment-v2',
    players,cities:{[city]:{...CITIES[city],houseLevel:level,ownerId:'owner',mortgaged:false}},stocks:{[city]:{holders}},world:{active:null}};
  // Income already includes the candidate/news adjustment. Null active news prevents applying it twice.
  const q=econ.rentAmounts(state,{playerId:'tenant',cityId:city,baseAmount:income});
  const bank=q.bankSupplement+q.stockDividends.reduce((n,d)=>n+d.bank+d.extra,0);
  assert.equal(Object.values(q.cashDeltas).reduce((n,d)=>n+d,0),bank);
  return {cash:q.cashDeltas,bank,personalSupplement:q.bankSupplement,dividends:q.stockDividends};
}
let combinations=0;
const examples=[];
for(const [city,c]of Object.entries(CITIES))for(let level=0;level<=4;level++){
  const base=econ.rentFor({...c,houseLevel:level}),extra=Math.min(3000,econ.rounded(base,15));
  for(const newsChange of [-Math.min(6000,econ.rounded(base,30)),0,Math.min(6000,econ.rounded(base,30))]){
    for(const distribution of holderCases)for(const p of perks){
      combinations++;
      const before=quote(city,level,base+newsChange,distribution.holders,p),after=quote(city,level,base+newsChange+extra,distribution.holders,p);
      const ids=[...new Set([...Object.keys(before.cash),...Object.keys(after.cash)])];
      const delta=Object.fromEntries(ids.map(id=>[id,(after.cash[id]||0)-(before.cash[id]||0)]));
      assert.equal(Object.values(delta).reduce((n,d)=>n+d,0),after.bank-before.bank);
      if(newsChange===0&&((city==='上海'&&level===4)||(city==='开罗'&&level===2))){
        examples.push({city,level,distribution:distribution.id,perks:p.id,nominalExtra:extra,
          ownerIncrement:delta.owner,tenantIncrement:delta.tenant,bankIncrement:after.bank-before.bank,cashDeltas:delta,
          ownerAfterBid3000Once:delta.owner-3000});
      }
    }
  }
}
assert.equal(combinations,9000);
const shanghai=(d,p)=>examples.find(e=>e.city==='上海'&&e.distribution===d&&e.perks===p);
assert.equal(shanghai('four-player-all-external','none').ownerIncrement,2400);
assert.equal(shanghai('two-player-tenant-four','none').ownerIncrement,2760);
assert.equal(shanghai('owner-only-two','H4-all').ownerIncrement,3300);
assert.equal(shanghai('four-player-all-external','H4-all').bankIncrement,1500);
assert.equal(shanghai('owner-only-two','H4-all').ownerAfterBid3000Once,300);

// Valid shared dice-bag prefix, not independent draws or a full game.
const diceState={diceBag:[10,9,8,7,6,5,4,3,2,1]},positions={A:3,B:4},movementTrace=[];
const rng=()=>{throw new Error('the fixed prefix must not refill the bag');};
for(let completeRound=1;completeRound<=4;completeRound++)for(const id of ['A','B']){
  const roll=rollDice(diceState,rng),from=positions[id];positions[id]=(from+roll)%42;
  assert.ok(from+roll<42);assert.ok(!['pole','jail'].includes(LAYOUT[positions[id]][0]));
  movementTrace.push({completeRound,id,roll,position:positions[id],squareType:LAYOUT[positions[id]][0]});
}
assert.deepEqual(positions,{A:19,B:24});
const period0Eligible=['A','B'],previousWinner='A';
const nextWithBanOnly=period0Eligible.filter(id=>id!==previousWinner);
const usedLap=new Set(['A','B']);
const nextWithAllLimits=nextWithBanOnly.filter(id=>!usedLap.has(id));
assert.deepEqual(nextWithBanOnly,['B']);assert.deepEqual(nextWithAllLimits,[]);
const output={date:'2026-10-17',scope:'Candidate income through current pure rent/stock quote plus abstract eligibility and valid movement-prefix counterexamples; no new game implementation, game win rates, UI or auction proof',
  fullGames:0,combinations,examples,
  eligibility:{previousWinner,nextWithBanOnly,nextWithAllLimits,path:movementTrace,qualification:'Moves on chance squares can resolve cash cards; airport choices can decline flight. This is an allowed prefix, not a simulated full game.'},
  order:{advance:2000,profit:2000,firstPayment:2000,secondPayment:2000,cashAfterFirstRelativeToBeforeOrder:0},
  breakeven:{fullyExternalShanghaiPerHit:2400,atBid3000ExpectedHitsRequired:3000/2400,maxHits:2,fullyExternalCairoPerHit:650,cairoMaximumBeforeBid:1300}};
fs.writeFileSync(path.join(__dirname,'audit-results.json'),JSON.stringify(output,null,2)+'\n');
process.stdout.write(JSON.stringify({...output,examples:examples.filter(e=>e.city==='上海'&&['none','H4-all'].includes(e.perks)),eligibility:{previousWinner,nextWithBanOnly,nextWithAllLimits,positions}},null,2)+'\n');
