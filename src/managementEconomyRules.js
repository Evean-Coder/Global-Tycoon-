'use strict';
const REVISION='management-economy-v1';
const enabled=s=>s?.ruleVersion===2&&s.managementEconomyRevision===REVISION&&s.activeManagementRevision==='active-management-v4'&&s.stockInvestmentRevision==='stock-investment-v2';
const safe=n=>{if(!Number.isSafeInteger(n))throw new Error('经营金额超出范围');return n;};
const rounded=(n,p)=>safe(Number((BigInt(safe(n))*BigInt(p)*2n+100n)/200n));
module.exports={REVISION,enabled,safe,rounded};
