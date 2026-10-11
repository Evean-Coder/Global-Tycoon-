'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const f=require('./helpers/botStrategyFixtures'),policy=require('../src/botPolicy'),baseline=require('./helpers/bot-policy-v1.cjs'),ev=require('../src/botEvaluation'),opp=require('../src/opportunities'),stocks=require('../src/stocks'),routes=require('../src/opportunityRoutes');
const reports=[];
function purchase(s,cid='开普敦',cash=15000){s.phase='buy';s.pending={playerId:'p1',cityId:cid};s.players[1].position=s.board.find(sq=>sq.cityId===cid).id;s.players[1].cash=cash;}
function activeBuild(){const s=f.game(4);f.own(s,'纽约','p1',3);f.held(s,'纽约','p1',4);s.players[1].opportunities.selectedIds=['H1'];for(const p of s.players.filter(p=>p.id!=='p1'))p.position=15;return s;}
function rescue(s,cash=-1000){s.phase='self_rescue';s.players[1].cash=cash;s.pending={kind:'self_rescue',playerId:'p1',due:-cash,reason:'指定债务',resume:{type:'end_turn'}};}
function flight(s,from=6,free=true){const aid=s.board[from].airportId;s.phase='flight';s.players[1].position=from;s.pending={playerId:'p1',kind:'flight',fromAirportId:aid,free};}
function transfer(s,cash=10){f.own(s,'内罗毕','p0');f.held(s,'内罗毕','p0',1);stocks.openStockWindow(s,'p0');s.turnIndex=0;s.phase='trade_confirm';s.pending={fromId:'p0',targetId:'p1',awaiting:'p1',items:[{cityId:'内罗毕',shares:1}],cash,fromStock:{playerId:'p0',kind:'go_stock',after:'end'}};}
function auction(s,cash=150000){f.own(s,'上海','p0',4);s.players[1].cash=cash;s.phase='auction_bid';s.pending={type:'auction',cityId:'上海',sellerId:'p0',order:['p1','p0'],index:0,currentBid:0,currentBidder:null,awaiting:'p1'};}
function select(s,ids){opp.beginOpportunityStage(s,1,{kind:'start'},()=>.3);s.opportunityStage.participants.p1.candidateIds=ids;}
function route(s,held,candidates){for(const p of s.players)p.opportunities.selectedIds=held.slice();for(let i=1;i<=3;i++){s.opportunityStage={resolved:true,ordinal:i};routes.markInitialResolved(s,i);}s.phase='waiting_roll';s.pending=null;s.routeFlow.players.p1.pending.push({opportunityId:'SMART:route:fixed',source:'lap:3'});routes.tryOpenRouteChoice(s,'p1',()=>.3,{mode:'normal'});s.routeFlow.activeChoice.candidateIds=candidates;}
const cases=[
 ['安全购地可用较低储备',()=>{const s=f.game();purchase(s);return {s};},a=>a.type==='buy'&&a.decision==='buy','15000购买7200后仍留7800，安全道路预算足够'],
 ['高租金阻止相同购地',()=>{const s=f.game();purchase(s);f.own(s,'悉尼','p0',4);return {s};},a=>a.decision==='pass','下十格有16200租金，7800现金不足安全预算'],
 ['本圈购城上限',()=>{const s=f.game();purchase(s,undefined,150000);s.players[1].lapBuys=4;return {s};},a=>a.decision==='pass','圈额度满不能继续购买'],
 ['落点建房正常费用值得',()=>{const s=f.game();f.own(s,'内罗毕');s.players[1].position=1;s.phase='build_decide';s.pending={playerId:'p1',cityId:'内罗毕'};return {s};},a=>a.decision==='build','支付2160得到同额名义房屋且有增量租金'],
 ['建设低现金不制造欠款',()=>{const s=f.game();f.own(s,'内罗毕');s.players[1].position=1;s.players[1].cash=3000;s.phase='build_decide';s.pending={playerId:'p1',cityId:'内罗毕'};return {s};},a=>a.decision==='pass','建房后现金840不足储备'],
 ['主动溢价建设无回本则掷骰',()=>{const s=f.game();f.own(s,'内罗毕');s.players[0].position=20;return {s};},a=>a.type==='roll_dice','单对手无近期访问、低级远程建房溢价不值得'],
 ['高等级热点城市值得建设',()=>({s:activeBuild()}),a=>a.type==='active_build','三对手距纽约十格、四级高价城市租金跃升且H1减费'],
 ['短期热点选择促销',()=>{const s=f.game(4);f.own(s,'巴黎','p1',4);f.held(s,'巴黎','p1',4);for(const p of s.players.filter(p=>p.id!=='p1'))p.position=8;return {s};},a=>a.type==='active_promote','满级不能建房，三对手距十格，两轮奖励预计超过520费用'],
 ['有建设潜力的股价选择主动买股',()=>{const s=f.game();f.own(s,'东京','p0',2);return {s};},a=>a.type==='active_stock_buy'&&a.cityId==='东京','现有两级房高于尚未更新的经营价，涨价步长仍有空间'],
 ['股票比较而非列表第一个',()=>{const s=f.game();f.own(s,'内罗毕','p0');f.own(s,'东京','p0',2);f.window(s);return {s};},a=>a.type==='stock_trade'&&a.orders[0].cityId==='东京','低级内罗毕排列在前，东京现有建设更有经营价值'],
 ['恢复储备优先减持弱股票',()=>{const s=f.game();f.own(s,'内罗毕','p0');f.own(s,'东京','p0',3);f.held(s,'内罗毕','p1',3);f.held(s,'东京','p1',2);s.players[1].cash=2000;f.window(s);return {s};},a=>a.orders?.[0].side==='sell'&&a.orders[0].cityId==='内罗毕'&&a.orders[0].shares===3,'先卖三股低增长资产，再由新快照判断缺口'],
 ['自救适量卖股',()=>{const s=f.game();f.own(s,'内罗毕','p0');f.own(s,'东京','p0',3);f.held(s,'内罗毕','p1',3);f.held(s,'东京','p1',2);rescue(s);return {s};},a=>a.type==='rescue_sell_stock'&&a.cityId==='内罗毕'&&a.shares===2,'720一股，欠1000只需两股，保留东京增长股份'],
 ['仅土地可抵押完成自救',()=>{const s=f.game();f.own(s,'内罗毕');rescue(s);return {s};},a=>a.type==='rescue_mortgage','无股份或房屋且有合法抵押额度'],
 ['抵押名额满则拆房自救',()=>{const s=f.game();f.own(s,'内罗毕','p1',1);f.own(s,'开普敦').mortgaged=true;f.own(s,'开罗').mortgaged=true;rescue(s);return {s};},a=>a.type==='rescue_demolish','两座已抵押，拆一级退款1296足以补债'],
 ['自救无资产才结束',()=>{const s=f.game();rescue(s);return {s};},a=>a.type==='rescue_done','无可出售、抵押或拆除资产'],
 ['自救资金已补足立即退出',()=>{const s=f.game();f.own(s,'内罗毕');rescue(s,1);return {s};},a=>a.type==='rescue_done','不多卖资产'],
 ['免费航班选择更好道路',()=>{const s=f.game();flight(s);return {s};},a=>a.type==='flight'&&a.target==='上海浦东国际机场','位置35后续骰子可接近起点，飞行本身不计起点奖励'],
 ['已在好道路不付费飞走',()=>{const s=f.game();flight(s,35,false);return {s};},a=>a.target===null,'当前位置未来通过起点概率更好，机票只增加费用'],
 ['免费飞行也保留偿付风险约束',()=>{const s=f.game();flight(s);s.players[1].cash=0;return {s};},a=>a.target===null,'零现金不新增经营决定'],
 ['优惠转入股份接受',()=>{const s=f.game();transfer(s);return {s};},a=>a.accept===true,'10现金获得当前价值720的有效股份'],
 ['过贵转入股份拒绝',()=>{const s=f.game();transfer(s,3000);return {s};},a=>a.accept===false,'付款大于有效股份价值和有限预期'],
 ['城主四股拒绝超限转让',()=>{const s=f.game();transfer(s);f.own(s,'内罗毕','p1');f.held(s,'内罗毕','p0',1);f.held(s,'内罗毕','p1',4);return {s};},a=>a.accept===false,'不突破城主四股限制'],
 ['含房拍卖不再用地价封顶',()=>{const s=f.game();auction(s);return {s};},a=>a.decision==='bid'&&a.amount===51000,'上海四级总价值68000，75%开价51000优于资产价值'],
 ['拍卖不足预算即退出',()=>{const s=f.game();auction(s,50000);return {s};},a=>a.decision==='pass','51000开价超过现金且必须留储备'],
 ['快速临近结束停止溢价建设',()=>({s:activeBuild(),extra:{gameMode:'quick',quickTime:{elapsedMs:1790000,totalRemainingMs:10000}}}),a=>a.type==='roll_dice','十秒内不足以收回建设溢价'],
 ['缺失快局时限保守建设',()=>({s:activeBuild(),extra:{gameMode:'quick'}}),a=>a.type==='roll_dice','不猜测还有大量时间回本'],
 ['三城持股优先分散投资机遇',()=>{const s=f.game();for(const id of ['内罗毕','开普敦','开罗']){f.own(s,id,'p0');f.held(s,id,'p1',1);}s.players[1].position=40;select(s,['H2','H5','H7']);return {s};},a=>a.opportunityId==='H5','已满足三城且快经过起点，其他两项没有资产条件'],
 ['已有有效路线不为固定分数换掉',()=>{const s=f.game();for(const id of ['内罗毕','开普敦','开罗']){f.own(s,id,'p0');f.held(s,id,'p1',1);}s.players[1].position=40;route(s,['H5','H10','H11'],['H1','H3','H7']);return {s};},a=>a.type==='route_skip','新地产和航班选项缺实际条件，不能换掉起点现金收益'],
 ['新一次性资金确有价值则换路线',()=>{const s=f.game();route(s,['H1','H8','H10'],['H2','H7','H12']);return {s};},a=>a.type==='route_confirm'&&a.newId==='H12','未领过6000，替换无地产条件的旧机遇有真实增量'],
 ['募资无法筹足安全预算则取消',()=>{const s=f.game();s.phase='buy_fundraise';s.pending={playerId:'p1',target:{kind:'city',cityId:'纽约'}};s.players[1].cash=0;return {s};},a=>a.type==='buy_fundraise'&&a.decision==='cancel','无合法筹资手段，不能靠该阶段禁止的股票出售'],
 ['快局短期优质购地可合法募资',()=>{const s=f.game(4);f.own(s,'开普敦','p1',2);purchase(s,'纽约',18900);s.phase='buy_fundraise';s.pending={playerId:'p1',target:{kind:'city',cityId:'纽约'}};for(const p of s.players.filter(p=>p.id!=='p1'))p.position=15;return {s,extra:{gameMode:'quick',quickTime:{elapsedMs:1680000,totalRemainingMs:120000}}};},a=>a.type==='rescue_mortgage','两轮内纽约收入机会高，旧开普敦不可到达，抵押能补预算且利息较低'],
 ['募资资金足够直接确认',()=>{const s=f.game();s.phase='buy_fundraise';s.pending={playerId:'p1',target:{kind:'city',cityId:'纽约'}};return {s};},a=>a.type==='buy_fundraise'&&a.decision==='confirm','已有足额资金不继续抵押'],
 ['经营动作上限转入掷骰',()=>({s:activeBuild(),memory:{steps:6}}),a=>a.type==='roll_dice','同一决定有行动上限'],
 ['冻结恢复经营值得缴费',()=>{const s=activeBuild();s.phase='frozen_turn';s.pending={playerId:'p1'};s.players[1].frozen=true;s.players[1].position=34;return {s};},a=>a.decision==='pay','接近起点且可恢复热点城市建设，组合回报超过5000救援费'],
 ['冻结临近结算不缴费',()=>{const s=activeBuild();s.phase='frozen_turn';s.pending={playerId:'p1'};s.players[1].frozen=true;s.players[1].position=34;return {s,extra:{gameMode:'quick',quickTime:{elapsedMs:1790000,totalRemainingMs:10000}}};},a=>a.decision==='pass','十秒剩余时间不足以赚回5000费用'],
 ['股票动作上限结束窗口',()=>{const s=f.game();f.own(s,'东京','p0',2);f.window(s);return {s,memory:{steps:8}};},a=>a.type==='stock_done','单窗口最多八次步骤'],
];
for(const [name,setup,expected,reason]of cases)test(name,()=>{
 const {s,extra={},memory={}}=setup(),v=f.view(s,extra),before=JSON.stringify(v),a=policy.choose(v,memory),old=baseline.choose(v,memory);
 const entry={name,reason,oldAction:old,newAction:a,changed:JSON.stringify(old)!==JSON.stringify(a),passed:false};reports.push(entry);
 assert.ok(expected(a),name+': '+JSON.stringify(a));assert.equal(JSON.stringify(v),before);
 const result=f.apply(JSON.parse(JSON.stringify(s)),a);assert.notEqual(result.rejected,true);
 entry.passed=true;
});
test('相同快照确定、排列变化和私有牌袋不会改变动作',()=>{
 const s=activeBuild(),v=f.view(s),a=policy.choose(v);assert.deepEqual(policy.choose(v),a);
 const freeze=x=>{if(x&&typeof x==='object'){Object.freeze(x);for(const child of Object.values(x))freeze(child);}return x;};assert.deepEqual(policy.choose(freeze(v)),a);
 s.diceBag.reverse();s.chanceDeck.reverse();let reversed=f.view(s);reversed.cities=Object.fromEntries(Object.entries(reversed.cities).reverse());reversed.stocks=Object.fromEntries(Object.entries(reversed.stocks).reverse());reversed.self.activeManagement.quotes.reverse();assert.deepEqual(policy.choose(reversed),a);
});
test('同窗口已卖股票不回购，换窗口允许重新评估',()=>{
 const s=f.game();f.own(s,'东京','p0',2);f.window(s);const v=f.view(s),memory={windowId:v.self.stockWindow.windowId,soldCityIds:['东京']};assert.equal(policy.choose(v,memory).type,'stock_done');
 stocks.closeStockWindow(s);f.window(s);assert.equal(policy.choose(f.view(s),memory).type,'stock_trade');
});
test('窗口额度、供应、城主上限和集中持股逐个到边界',()=>{
 const s=f.game();f.own(s,'东京','p0',2);f.window(s);
 s.stockWindow.boughtByCity={'东京':2};s.stockWindow.boughtTotal=2;assert.equal(policy.choose(f.view(s)).type,'stock_done');
 s.stockWindow.boughtByCity={'内罗毕':1,'开罗':1,'纽约':1};s.stockWindow.boughtTotal=3;assert.equal(policy.choose(f.view(s)).type,'stock_done');
 s.stockWindow.boughtByCity={};s.stockWindow.boughtTotal=6;assert.equal(policy.choose(f.view(s)).type,'stock_done');
 s.stockWindow.boughtTotal=0;f.held(s,'东京','p0',20);assert.equal(policy.choose(f.view(s)).type,'stock_done');
 s.stocks['东京'].holders={};f.own(s,'东京','p1',2);f.held(s,'东京','p1',4);assert.equal(policy.choose(f.view(s)).type,'stock_done');
 f.held(s,'东京','p1',5);s.players[1].cash=10000;assert.equal(ev.stockAllowed(ev.context(f.view(s)),'东京',1),false);
});
test('保住热点高房级城市，优先抵押低收入闲置土地',()=>{
 const s=f.game(4);f.own(s,'内罗毕');f.own(s,'纽约','p1',4);for(const p of s.players.filter(p=>p.id!=='p1'))p.position=15;rescue(s);
 const a=policy.choose(f.view(s));assert.equal(a.type,'rescue_mortgage');assert.equal(a.cityId,'内罗毕');assert.notEqual(f.apply(s,a).rejected,true);assert.equal(s.cities['纽约'].mortgaged,false);assert.ok(s.players[1].cash>=0);
});
test('新策略使用的真实报价过期时拒绝且不部分扣款',()=>{
 const s=activeBuild(),a=policy.choose(f.view(s));assert.equal(a.type,'active_build');const before=JSON.stringify(s);
 const result=require('../src/actionValidation').normalizeAction(s,{...a,quoteVersion:'stale'},{actorId:'p1',source:'player'});assert.equal(result.ok,false);assert.equal(JSON.stringify(s),before);
});
test('买入股票总资产25%边界，与单城10%限制分别生效',()=>{
 const s=f.game();for(const id of ['内罗毕','开罗','开普敦','东京'])f.own(s,id,'p0',2);const v=f.view(s),ctx=ev.context(v);
 ctx.self.assetSummary={...ctx.self.assetSummary,total:100000,stockValue:25000};assert.equal(ev.stockAllowed(ctx,'东京',1),false);
 ctx.self.assetSummary.stockValue=0;v.stocks['东京'].holders.p1=2;assert.equal(ev.stockAllowed(ctx,'东京',1),false);v.stocks['东京'].holders.p1=1;assert.equal(ev.stockAllowed(ctx,'东京',1),true);
});
test('H5补齐路线有预算才估价值，施工优惠共享上限',()=>{
 const s=activeBuild();f.held(s,'纽约','p1',0);for(const id of ['开罗','开普敦']){f.own(s,id,'p0');f.held(s,id,'p1',1);}f.own(s,'内罗毕','p0');s.players[1].position=40;
 const ctx=ev.context(f.view(s));assert.ok(ev.opportunityValue(ctx,'H5')>0);s.players[1].cash=0;assert.equal(ev.opportunityValue(ev.context(f.view(s)),'H5'),0);
 assert.equal(ev.routeValue(ctx,['H1','H2']),Math.max(ev.opportunityValue(ctx,'H1'),ev.opportunityValue(ctx,'H2')));
});
test('异常回退仍合法自救，空房不拆、抵押上限和已尝试出售不重复',()=>{
 const s=f.game();f.own(s,'内罗毕','p0');f.held(s,'内罗毕','p1',3);rescue(s);const a=policy.fallback(f.view(s));assert.equal(a.type,'rescue_sell_stock');assert.equal(a.shares,2);assert.notEqual(f.apply(s,a).rejected,true);assert.ok(s.players[1].cash>=0);
 const t=f.game();f.own(t,'内罗毕');f.own(t,'开罗').mortgaged=true;f.own(t,'开普敦').mortgaged=true;rescue(t);assert.equal(policy.choose(f.view(t)).type,'sell_city');assert.equal(policy.fallback(f.view(t),{saleAttempts:['内罗毕']}).type,'rescue_done');
});
test('H1–H12可计算且一次性奖励/机场访问事实约束收益',()=>{
 const s=activeBuild();f.own(s,'伦敦');f.own(s,'巴黎');for(const id of ['开罗','开普敦','内罗毕']){f.own(s,id,'p0',2);f.held(s,id,'p1',1);}s.airports['伦敦希思罗国际机场'].ownerId='p1';s.players[1].airports.push('伦敦希思罗国际机场');
 for(let i=1;i<=12;i++)assert.ok(Number.isFinite(ev.opportunityValue(ev.context(f.view(s)),'H'+i)));
 assert.ok(ev.opportunityValue(ev.context(f.view(s)),'H3')>0);assert.ok(ev.opportunityValue(ev.context(f.view(s)),'H4')>0);assert.ok(ev.opportunityValue(ev.context(f.view(s)),'H6')>0);assert.ok(ev.opportunityValue(ev.context(f.view(s)),'H9')>0);
 s.players[1].opportunities.oneTimeRewards.H12={amount:6000,receiptId:'test',sourceId:'test'};assert.equal(ev.opportunityValue(ev.context(f.view(s)),'H12'),0);
 s.players[1].opportunities.visitedAirportIds=Object.keys(s.airports);assert.equal(ev.opportunityValue(ev.context(f.view(s)),'H8'),0);
});
test.after(()=>{const dir=path.join(__dirname,'../artifacts/ai-strategy');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'fixed-scenarios.json'),JSON.stringify({baseline:'0f6d3cc',scope:'固定决策场景，非总体胜率',cases:reports},null,2));});
