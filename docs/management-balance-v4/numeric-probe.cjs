'use strict';
// Candidate arithmetic only: reads current rules, never edits authoritative game state.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {CITIES}=require('../../src/board'),econ=require('../../src/economy'),f=require('../../test/helpers/gameplayFixtures');
const traffic=[{name:'无客流',own:0,target:0},{name:'投资目标活跃',own:0,target:3},{name:'本人城市活跃',own:3,target:0},{name:'双方温和活跃',own:1,target:1}];
const rows=[];
function buildQuote(id,level,perks,world=false){
 const s=f.game(2);s.activeManagementRevision='active-management-v3';f.own(s,'p0',id);const peer=Object.keys(CITIES).find(cid=>cid!==id&&CITIES[cid].group===CITIES[id].group);f.own(s,'p0',peer);s.cities[id].houseLevel=level;s.players[0].cash=1000000;
 if(perks)s.players[0].opportunities.selectedIds=['H1','H2','H3'];
 if(world){s.world.active={type:'construction',name:'建设优惠季'};s.world.constructionUsedIds=[];}
 return econ.quoteBuild(s,{playerId:'p0',cityId:id,mode:'active'});
}
const gradients={requested:[150,200,300,350],smooth:[150,200,250,300]};
function candidateBuild(id,level,perks,world=false,gradient='requested'){
 const base=econ.buildFee({price:CITIES[id].price}),nominal=econ.rounded(base,gradients[gradient][level]),floor=econ.rounded(base,150);
 let allowance=Math.min(econ.rounded(base,30),nominal-floor);
 const effects=buildQuote(id,level,perks,world).effects.map(e=>{const amount=Math.min(e.requested,allowance);allowance-=amount;return {...e,amount};});
 return {base,nominal,floor,effects,cost:nominal-effects.reduce((sum,e)=>sum+e.amount,0)};
}
function order(price,payments=2){const fee=Math.min(econ.rounded(price,10),1000),each=Math.min(econ.rounded(price,12),1500);return {cashCost:fee,cashChange:each*payments-fee,netAssetChange:each*payments-fee};}
function investment(price,circles,hits,shock,shares=4,legacy=false){
 const perSharePrice=econ.rounded(price,20),cost=perSharePrice*shares;
 const baseDividend=econ.floorRatio(econ.rounded(econ.rentFor({price,houseLevel:0}),20),20)*shares;
 const dividends=baseDividend*hits*circles,bonus=legacy?0:Math.min(1500,econ.rounded(baseDividend*hits,30)),fee=legacy?econ.rounded(cost,1):0;
 const capitalChange=econ.rounded(cost,Math.abs(shock))*(shock<0?-1:1);
 return {cashCost:cost+fee,cashChange:dividends+bonus-cost-fee,netAssetChange:dividends+bonus+capitalChange-fee,dividends,bonus,fee,shares,shock};
}
for(const id of ['内罗毕','罗马','上海'])for(const circles of [1,3,6])for(const t of traffic)for(const shock of [-20,0,20]){
 const c={price:CITIES[id].price,houseLevel:0},base=econ.buildFee(c),before=econ.rentFor(c),after=econ.rentFor({...c,houseLevel:1});
 const old=buildQuote(id,0,true).finalAmount,newCost=candidateBuild(id,0,true).cost,rentGain=(after-before)*t.own*circles;
 const build={cashCost:newCost,cashChange:rentGain-newCost,netAssetChange:base-newCost+rentGain};
 const oldBuild={cashCost:old,cashChange:rentGain-old,netAssetChange:base-old+rentGain};
 const oldPromotionFee=Math.min(econ.rounded(c.price,3),600),oldPromotionReward=Math.min(econ.rounded(c.price,10),1500);
 const earlyHits=Array.from({length:t.own},(_,i)=>Math.ceil((i+1)*8/t.own)).filter(turn=>turn<=3).length;
 const oldPromotion={cashCost:oldPromotionFee,cashChange:oldPromotionReward*Math.min(3,earlyHits)-oldPromotionFee,netAssetChange:oldPromotionReward*Math.min(3,earlyHits)-oldPromotionFee,qualifyingHits:earlyHits};
 const routes={order:order(c.price),investment:investment(c.price,circles,t.target,shock),build};
 const sorted=Object.entries(routes).sort((a,b)=>b[1].netAssetChange-a[1].netAssetChange);
 rows.push({id,price:c.price,circles,traffic:t.name,ownHitsPerCircle:t.own,investmentHitsPerCircle:t.target,marketShockPercent:shock,currentRoutes:{promote:oldPromotion,investment:investment(c.price,circles,t.target,shock,2,true),build:oldBuild},routes,winner:sorted[0][0],ties:sorted.filter(([,v])=>v.netAssetChange===sorted[0][1].netAssetChange).map(([k])=>k)});
}
let costCases=0,oldWindfalls=0;const gradientRows=[];
for(const id of Object.keys(CITIES))for(let level=0;level<4;level++)for(const perks of [false,true]){
 const q=buildQuote(id,level,perks),city={price:CITIES[id].price,houseLevel:level},delta=econ.cityTotalValue({...city,houseLevel:level+1})-econ.cityTotalValue(city);
 if(delta>q.finalAmount)oldWindfalls++;
 for(const world of [false,true])for(const gradient of Object.keys(gradients)){
  const result=candidateBuild(id,level,perks,world,gradient),rentGain=econ.rentFor({...city,houseLevel:level+1})-econ.rentFor(city);
  assert.ok(result.cost>=econ.rounded(delta,150));assert.ok(result.effects.reduce((sum,e)=>sum+e.amount,0)<=econ.rounded(delta,30));
  if(level===0)assert.ok(result.effects.every(e=>e.amount===0));if(!perks&&!world)assert.equal(result.cost,econ.rounded(delta,gradients[gradient][level]));
  gradientRows.push({id,targetLevel:level+1,perks,world,gradient,...result,netAssetBreakEvenHits:Math.ceil((result.cost-delta)/rentGain),cashBreakEvenHits:Math.ceil(result.cost/rentGain)});costCases++;
 }
}
const winners=Object.fromEntries(['order','investment','build'].map(k=>[k,rows.filter(r=>r.winner===k).length]));assert.ok(Object.values(winners).every(n=>n>0));
const cooldown={lastBuildLap:2,checks:[2,3,4,5].map(lap=>({lap,allowed:lap-2>=3,remaining:Math.max(0,5-lap)}))};assert.deepEqual(cooldown.checks.map(v=>v.allowed),[false,false,false,true]);
// Candidate gate truth table; production persistence/requests must be tested after development approval.
const remoteAllowed=(last,lap,target)=>(last.lap===null||lap-last.lap>=3)&&last.city!==target;
let last={lap:null,city:null};assert.equal(remoteAllowed(last,0,'内罗毕'),true);last={lap:0,city:'内罗毕'};
assert.equal(remoteAllowed(last,3,'内罗毕'),false);assert.equal(remoteAllowed(last,99,'内罗毕'),false);assert.equal(remoteAllowed(last,2,'罗马'),false);assert.equal(remoteAllowed(last,3,'罗马'),true);
last={lap:3,city:'罗马'};assert.equal(remoteAllowed(last,3,'内罗毕'),false);assert.equal(remoteAllowed(last,6,'内罗毕'),true);
assert.equal(investment(20000,1,100,0).bonus,1500);assert.equal(investment(20000,1,0,0).bonus,0);
for(const c of Object.values(CITIES)){assert.ok(order(c.price).cashCost<=1000);assert.ok(order(c.price).cashChange<=2000);assert.ok(order(c.price,0).netAssetChange<0);}
const immediate={order:order(20000,0).netAssetChange,investment:0,build:econ.buildFee({price:20000})-candidateBuild('上海',0,true).cost};assert.ok(Object.values(immediate).every(v=>v<=0));
const result={model:'单次经营增量模型；非正式引擎实现或完整对局',assumptions:['现金足够，城市持续归属且未抵押','每个个人圈按固定8次本人回合模拟，订单两次收款已兑现；未兑现另测','投资目标与本人城市基础地价相同，目标0级，正常派息在奖励到期前发生一次','分红按当前源代码标准租金/20%分红池/20股计算；订单和主动投资奖励使用候选公式','股票一次4股，价差仅在观察期末指定±20%/0%，不是随机预测','建设只比较一次升级，订单只比较一单，投资只比较一次买入；重复行动能力独立列示','建设增量租金含期末归城主的待结收益，现金回本使用全部结算后的理想值，不代表当场可用现金','不包括随机骰子、付款者破产、普通落点建设、股票清算与强化分红叠加；这些需开发后引擎验收'],rows,gradients,gradientRows,costCases,oldWindfalls,winners,cooldown,remoteAlternation:{checks:7,singleCityRemoteBuilds:1},immediate,repeatCapacity:{circles:6,oldBuildsUpToFourLevels:4,newRemoteBuilds:2,newOrdersMax:6,newActiveSharesLimitPerAction:4,stockMarketSupplyPerCity:20},checksPassed:9};
fs.writeFileSync(path.join(__dirname,'numeric-results.json'),JSON.stringify(result,null,2));
const pick=(id,circles,t,shock)=>rows.find(r=>r.id===id&&r.circles===circles&&r.traffic===t&&r.marketShockPercent===shock);
const examples=[pick('罗马',1,'无客流',0),pick('罗马',6,'投资目标活跃',0),pick('罗马',6,'本人城市活跃',0),pick('上海',3,'投资目标活跃',-20)];
const report=['# 三路线有限数值检查','', '2026-10-14。调整后的候选模型，正式产品代码未修改。','',`比较 ${rows.length} 个固定局面；${costCases} 项建设费用边界；完整对局0。9类模型断言通过。`,'','## 代表局面（单次经营增量净资产）','','| 城市 / 观察期 / 情况 | 经营订单 | 主动投资 | 远程建设 |','|---|---:|---:|---:|',...examples.map(r=>`| ${r.id} / ${r.circles}圈 / ${r.traffic}${r.marketShockPercent?'，股价'+r.marketShockPercent+'%':''} | ${r.routes.order.netAssetChange} | ${r.routes.investment.netAssetChange} | ${r.routes.build.netAssetChange} |`),'','## 费用梯度比较','','| 目标房级 | 用户梯度 | 平滑梯度 | 无优惠、无第四级高价加成时现金回本客流 |','|---|---:|---:|---:|',...gradients.requested.map((rate,i)=>'| '+(i+1)+'级 | '+rate+'% | '+gradients.smooth[i]+'% | '+Math.ceil(rate/50)+'次 / '+Math.ceil(gradients.smooth[i]/50)+'次 |'),'','采用用户150/200/300/350%梯度：更明确限制三级、四级远程升级；实际优惠总额最多标准费30%，费用绝不低于150%。两梯度均不能在零客流时仅凭升级获利。回本次数假定新增租金全部兑现且归本人，不代表真实到访概率。','','## 结论边界','',`- 固定输入中最优增量净资产分别出现：订单${winners.order}、投资${winners.investment}、建设${winners.build}个局面。这些是人为场景计数，不能称为胜率。`,`- 当前v3在优惠组合输入中出现${oldWindfalls}项无租金建设估值正增益；候选实际最低150%后，在${costCases}项建设检查中均没有正增益。`,'- 首次远程建设后第3次本人起点结算后还必须换城；6圈内持有两城时最多两次额外远程升级，仅持一城只能成功一次，普通落点建设独立。','- 订单2次兑现后净现金504–2000；不再依赖他人落点，但需要目标持续有效。','- 股价下降时可能亏损；奖金只来自实际股息，有30%/1500上限，无法保证本金或利润。','- 建设仍适合高客流和长持有，但资本占用更高。订单更容易快速兑现；投资依赖他人经营表现。','- 即时封盘：订单未赚收入不计值、股票没有现金返利、建设优惠不使新增估值高于成本。','- 尚未实施冷却/订单/奖励份额引擎，没有验证正式请求、真实落点或三端动作；全部开发检查仍未标通过。','','## 模型假设','',...result.assumptions.map(v=>'- '+v),'','证据：[固定输入输出](numeric-results.json)、[脚本](numeric-probe.cjs)。'];
fs.writeFileSync(path.join(__dirname,'numeric-report.md'),report.join('\n')+'\n');console.log(JSON.stringify({rows:rows.length,costCases,oldWindfalls,winners,immediate,checksPassed:9,fullGames:0}));
