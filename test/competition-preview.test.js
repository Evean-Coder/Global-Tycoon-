'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),f=require('./helpers/managementEconomyFixtures'),si=require('../src/stockInvestment'),preview=require('../src/competitionPreview');
test('H4 sequential paired branches produce 3280 then 6480 with no mutation',()=>{
 const s=f.state();f.own(s,'p0','上海');s.cities['上海'].houseLevel=4;for(const u of s.stocks['上海'].units.slice(0,2))u.holderId='p0';si.sync(s);f.selected(s,'p0','H4');s.players[0].opportunities.usage.H4=2300;const before=JSON.stringify(s),p=preview.previewOwnerCashflow(s,'p0','上海');assert.deepEqual(p.increments.map(i=>i.total),[3280,6480]);assert.deepEqual([0,...p.increments.map(i=>i.total)].map(n=>n-3000),[-3000,280,3480]);assert.equal(JSON.stringify(s),before);
 f.advantage(s,'上海');const again=preview.previewOwnerCashflow(s,'p0','上海');assert.deepEqual(again.increments,p.increments);
});
test('owner with no issued shares retains full surcharge; tenant concessions do not change owner preview',()=>{const s=f.state();const q=preview.previewOwnerCashflow(s,'p0','内罗毕');assert.equal(q.increments[0].total,162);assert.equal(q.increments[1].total,324);f.selected(s,'p1','H11');assert.deepEqual(preview.previewOwnerCashflow(s,'p0','内罗毕').increments,q.increments);});
