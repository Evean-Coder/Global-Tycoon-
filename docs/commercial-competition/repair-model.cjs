'use strict';
// Design checks only. Proposed auction rules are modeled, not installed in the game.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const econ=require('../../src/economy'),si=require('../../src/stockInvestment'),{CITIES}=require('../../src/board');
const results=[];function check(name,run){run();results.push({name,passed:true});}
function order(price){
 const advance=Math.max(1000,Math.min(2000,econ.rounded(price,10))),profit=advance;
 const first=econ.rounded(profit,25),second=advance+profit-first;
 return {advance,profit,first,second,newsProfit:profit+Math.min(150,econ.rounded(first,10))+Math.min(150,econ.rounded(second,10))};
}
const orders=[...Object.entries(CITIES).map(([city,c])=>({city,...order(c.price)})),{city:'机场',...order(15000)}];
check('21 targets retain 1000-2000 profit with principal outstanding after first payment',()=>{
 assert.equal(orders.length,21);for(const o of orders){assert.equal(o.first+o.second-o.advance,o.profit);assert.ok(o.profit>=1000&&o.profit<=2000);assert.ok(o.first<o.advance);}
});
check('Shanghai first 500, tail 3500; cancellation after first leaves minus 1500',()=>{
 const o=order(20000);assert.equal(o.first,500);assert.equal(o.second,3500);assert.equal(-o.advance+o.first,-1500);
});
check('news bonus recalculated, maximum 2200 rather than old 2300',()=>assert.equal(Math.max(...orders.map(o=>o.newsProfit)),2200));
check('airport split and news round correctly',()=>{const o=order(15000);assert.equal(o.first,375);assert.equal(o.second,2625);assert.equal(o.newsProfit,1688);});
function basic(p,closeRound){return p.alive&&p.hasCity&&!p.usedLap&&!p.pending&&(!p.activeUntil||p.activeUntil<=closeRound);}
function publish(players,closeRound){return players.filter(p=>basic(p,closeRound)).length>=2;}
const eligible=id=>({id,alive:true,hasCity:true,usedLap:false,pending:false,activeUntil:null});
check('previous winner is eligible alongside challenger',()=>assert.ok(publish([eligible('A'),eligible('B')],5)));
check('two used-lap players cause skipped market, not an empty mandatory window',()=>assert.equal(publish([{...eligible('A'),usedLap:true},{...eligible('B'),usedLap:true}],5),false));
check('single eligible player is not enough to open a new regional market',()=>assert.equal(publish([eligible('A'),{...eligible('B'),usedLap:true}],5),false));
check('active advantage ending at bid close permits renewal; later one does not',()=>{
 assert.equal(basic({...eligible('A'),activeUntil:5},5),true);assert.equal(basic({...eligible('A'),activeUntil:6},5),false);
});
function winningPool(bids,lastWinner){
 const valid=bids.filter(b=>b.valid&&b.cash>=b.amount);if(!valid.length)return [];
 const price=Math.max(...valid.map(b=>b.amount)),top=valid.filter(b=>b.amount===price);
 const challengers=top.filter(b=>b.id!==lastWinner);return (challengers.length?challengers:top).map(b=>b.id);
}
const bid=(id,amount,cash=10000)=>({id,amount,cash,valid:true});
check('equal price favors challenger, not seat or arrival order',()=>{
 assert.deepEqual(winningPool([bid('A',100),bid('B',100)],'A'),['B']);
 assert.deepEqual(winningPool([bid('B',100),bid('A',100)],'A'),['B']);
});
check('higher price wins despite last-winner identity',()=>assert.deepEqual(winningPool([bid('A',200),bid('B',100)],'A'),['A']));
check('multiple equal-price challengers remain a random pool',()=>assert.deepEqual(winningPool([bid('A',300),bid('B',300),bid('C',300)],'A'),['B','C']));
check('insufficient cash excluded before comparing price',()=>assert.deepEqual(winningPool([bid('A',3000,2000),bid('B',2000),bid('C',1000)],'A'),['B']));
check('one voluntary valid bidder can win an already-open market',()=>assert.deepEqual(winningPool([bid('A',100)],'A'),['A']));
function fixture(remaining){return {gameId:'repair-preview',revision:1,stockInvestmentRevision:'stock-investment-v2',activeManagementRevision:'active-management-v4',
 players:[{id:'owner',name:'owner',cash:150000,alive:true,stockLedger:{},opportunities:{selectedIds:['H4'],usage:{H4:3000-remaining}}},
 {id:'tenant',name:'tenant',cash:150000,alive:true,stockLedger:{},opportunities:{selectedIds:[],usage:{}}}],
 cities:{'上海':{...CITIES['上海'],houseLevel:4,ownerId:'owner',mortgaged:false}},
 stocks:{'上海':{holders:{owner:2},roundRentCount:0}},world:{active:null}};}
function runBranch(remaining,income){
 const s=fixture(remaining),initial=s.players[0].cash,values=[];
 for(let i=1;i<=2;i++){
  const q=econ.rentAmounts(s,{playerId:'tenant',cityId:'上海',baseAmount:income});
  for(const [id,n]of Object.entries(q.cashDeltas))s.players.find(p=>p.id===id).cash+=n;
  si.rentCommit(s,q,[],'preview:'+i);values.push(s.players[0].cash-initial);
 }
 return values;
}
const before=runBranch(700,33000),after=runBranch(700,36000),increments=after.map((v,i)=>v-before[i]);
check('sequential H4 allowance yields 3280 then 6480 total, not first-result doubled',()=>{
 assert.deepEqual(increments,[3280,6480]);assert.notEqual(increments[1],2*increments[0]);
});
check('preview after bid 3000 gives minus3000, plus280, plus3480',()=>assert.deepEqual([-3000,...increments.map(n=>n-3000)],[-3000,280,3480]));
const output={date:'2026-10-17',scope:'Candidate schedule/eligibility/tie model plus current pure rent quote and stock receipt accounting; no new game implementation, random tie-frequency proof, lifecycle integration, UI or game-balance proof',fullGames:0,
 checks:results.length,passed:results.length,orders,sequentialPreview:{ownerH4Remaining:700,increments,netAfterBid3000:[-3000,...increments.map(n=>n-3000)]},results};
fs.writeFileSync(path.join(__dirname,'repair-results.json'),JSON.stringify(output,null,2)+'\n');
process.stdout.write(JSON.stringify({...output,orders:undefined},null,2)+'\n');
