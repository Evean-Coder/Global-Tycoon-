'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createGameState}=require('../src/state'),active=require('../src/activeManagement'),econ=require('../src/economy'),stocks=require('../src/stocks'),{netAssetSummary}=require('../src/assets');
function fixture(){const s=createGameState('CURVE',['甲','乙','丙'],2,{activeManagementRevision:active.REVISION});s.phase='waiting_roll';s.pending=null;stocks.transferCity(s,{cityId:'伦敦',newOwnerId:'p0'},[]);stocks.transferCity(s,{cityId:'上海',newOwnerId:'p1'},[]);return s;}
test('真实结算的指定收益轨迹：无租、短中长期，不代替胜率',{timeout:5000},()=>{
 const rows=[];
 for(const kind of ['active_promote','active_stock_buy','active_build'])for(const visits of [0,1,2,5,10]){
  const base=fixture(),s=globalThis.structuredClone(base),cityId=kind==='active_stock_buy'?'上海':'伦敦',shares=kind==='active_stock_buy'?2:undefined,q=active.quote(s,'p0',kind,cityId,shares),events=[];
  active.apply(s,s.players[0],{type:kind,cityId,shares,quoteVersion:q.quoteVersion},events);
  for(let i=0;i<visits;i++)for(const state of [base,s]){
   econ.applySettlement(state,econ.quoteRent(state,{playerId:'p2',cityId}),events);
   stocks.settleCityDividend(state,cityId,'go','curve:'+i,events);
   state.roundFlow.index++;active.clean(state);
  }
  const value=netAssetSummary(s,'p0'),reference=netAssetSummary(base,'p0');
  rows.push({kind,visits,cost:q.finalAmount,cash:value.cash,netAssets:value.netAssets,relativeCash:value.cash-reference.cash,relativeNetAssets:value.netAssets-reference.netAssets});
  if(visits===0)assert.ok(value.netAssets<=reference.netAssets,'未产生经营收入时不能凭空增加净资产');
  assert.equal(s.stocks[cityId].dividendFund,0);
 }
 const promotions=rows.filter(r=>r.kind==='active_promote');assert.equal(promotions.find(r=>r.visits===2).relativeCash,promotions.find(r=>r.visits===10).relativeCash,'促销补贴不随长期租金无限增加');
 const dir=path.join(__dirname,'../docs/active-management/evidence');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'fixed-returns.json'),JSON.stringify({scope:'固定10次以内租金轨迹；不代表随机落点概率、胜率或正式平衡结论',rows},null,2));
});

test('H4分红奖励不重复、H5第三城持股沿用原奖励',{timeout:5000},()=>{
 const s=fixture(),p=s.players[0],events=[];p.opportunities.selectedIds=['H4','H5'];
 for(const cid of ['内罗毕','开普敦']){stocks.transferCity(s,{cityId:cid,newOwnerId:'p1'},events);s.stocks[cid].holders.p0=1;}
 stocks.syncHolders(s);const q=active.quote(s,p.id,'active_stock_buy','上海',2);active.apply(s,p,{type:'active_stock_buy',cityId:'上海',shares:2,quoteVersion:q.quoteVersion},events);
 const before=p.cash;econ.goRewards(s,p,events);assert.equal(p.cash,before+2000);assert.equal(events.filter(e=>e.opportunityId==='H5').length,1);
 econ.applySettlement(s,econ.quoteRent(s,{playerId:'p2',cityId:'上海'}),events);stocks.settleCityDividend(s,'上海','go','combo-dividend',events);
 const paid=p.cash,usage=p.opportunities.usage.H4;assert.ok(usage>0&&usage<=1000);stocks.settleCityDividend(s,'上海','go','combo-dividend',events);assert.equal(p.cash,paid);assert.equal(p.opportunities.usage.H4,usage);
 assert.equal(events.filter(e=>e.opportunityId==='H4').length,1);
});
