'use strict';
// Design arithmetic using the existing integer rounding rule; no games or new engine behavior.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { rounded } = require('../../src/economy');
const bonus = rent => Math.min(rounded(rent,25),3000);
function allocation(rent, issued, ownerShares) {
  const rentalPerShare = Math.floor(rounded(rent,20)/10);
  const bankPerShare = Math.floor(rounded(rent,40)/10);
  return {
    ownerRetained: rent-issued*rentalPerShare,
    ownerCash: rent-issued*rentalPerShare+ownerShares*(rentalPerShare+bankPerShare),
    rentalDistributed: issued*rentalPerShare,
    bankDistributed: issued*bankPerShare,
    rentalPerShare,bankPerShare
  };
}
const cases = [];
function check(name,run) { run(); cases.push({name,passed:true}); }
check('zero rent provides no surcharge',()=>assert.equal(bonus(0),0));
check('undeveloped Nairobi surcharge is 270',()=>assert.equal(bonus(1080),270));
check('level-two Cairo surcharge is 1350',()=>assert.equal(bonus(5400),1350));
check('level-four Shanghai is capped at 3000',()=>assert.equal(bonus(33000),3000));
check('boom plus campaign gives 42000 before individual reductions',()=>assert.equal(39000+bonus(39000),42000));
check('quarter rounding matches existing half-up integer rule',()=>assert.equal(bonus(1002),251));
check('surcharge is not recursively increased',()=>assert.equal(5400+bonus(5400),6750));
check('three surcharges total no more than 9000',()=>assert.equal(bonus(68000)*3,9000));
check('Cairo two collections, fully external-issued shares, bid 1200 yield 960 owner profit',()=>{
  const before=allocation(5400,10,0),after=allocation(6750,10,0);
  assert.equal((after.ownerCash-before.ownerCash)*2-1200,960);
});
check('Cairo each share receives 27 extra rental and 54 extra bank cash',()=>{
  const before=allocation(5400,10,0),after=allocation(6750,10,0);
  assert.equal(after.rentalPerShare-before.rentalPerShare,27);
  assert.equal(after.bankPerShare-before.bankPerShare,54);
});
check('owner-share bank rewards must not be mislabeled as campaign cash guarantees',()=>{
  const before=allocation(33000,2,2),after=allocation(36000,2,2);
  assert.equal(after.ownerCash-before.ownerCash,3240);
  assert.ok(after.ownerCash-before.ownerCash>3000);
});
let distributionCases=0;
for(const rent of [1080,5400,33000,39000,1002]) {
  for(const [issued,ownerShares] of [[0,0],[4,0],[6,2],[10,0],[10,2]]) {
    distributionCases++;
    const before=allocation(rent,issued,ownerShares),after=allocation(rent+bonus(rent),issued,ownerShares);
    assert.equal(after.ownerRetained+after.rentalDistributed,rent+bonus(rent));
    assert.equal((after.ownerRetained-before.ownerRetained)+(after.rentalDistributed-before.rentalDistributed),bonus(rent));
    assert.ok(after.bankDistributed>=before.bankDistributed);
    assert.ok(bonus(rent)<=3000);
  }
}
cases.push({name:'25 fixed rent and stock issuance combinations conserve rental cash',passed:true});
const output={date:'2026-10-16',status:'candidate design arithmetic only',checks:cases.length,passed:cases.length,distributionCases,fullGames:0,
  excluded:'No auction engine, bidding strategies, actual visit probability, H4, individual discounts, UI, Socket, or win-rate proof',results:cases};
fs.writeFileSync(path.join(__dirname,'numeric-results.json'),JSON.stringify(output,null,2)+'\n');
process.stdout.write(JSON.stringify(output,null,2)+'\n');
