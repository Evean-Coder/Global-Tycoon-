'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),rules=require('../public/contextual-rules');
test('只读提示保留原许可、缺资料不猜金额',()=>{
 const c={isOwner:true,held:3,cityRoom:2,available:1,reasons:['现金不足']},before=JSON.stringify(c);const r=rules.stockLimitSummary(c);
 assert.ok(r.holdingText.includes('3/4'));assert.ok(r.quotaText.includes('最多买2股'));assert.equal(r.reasonText,'现金不足');assert.equal(JSON.stringify(c),before);
 assert.equal(rules.feeSummary(null,String)[0].value,'本次资料未提供');assert.equal(rules.feeSummary({baseAmount:100,finalAmount:70,effects:[{name:'优惠',amount:-30}]},String)[2].value,'70');
 assert.equal(rules.helpTopic('本人城市最多持有4股'),'stocks');assert.equal(rules.helpTopic('无法识别的服务器错误'),null);assert.equal(rules.eligibilityMessage('原始错误：<abc>'),'原始错误：<abc>');
});
