'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),ev=require('../src/botEvaluation'),f=require('./helpers/botStrategyFixtures');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{performance}=require('node:perf_hooks');
const total=a=>a.reduce((x,y)=>x+y,0);
test('有限预测质量守恒，一步十点位置正确，冻结与监狱停留不算租金命中',()=>{
 const s=f.game();s.players[1].position=40;let rows=ev.forecast(f.view(s),8).p1;assert.equal(rows.length,8);
 for(const row of rows)assert.ok(Math.abs(total(row.mass)-1)<1e-10);
 assert.ok(Math.abs(rows[0].go-.9)<1e-10);assert.equal(rows[0].landing[8],.1);
 s.players[1].frozen=true;rows=ev.forecast(f.view(s),1).p1;assert.equal(total(rows[0].landing),0);assert.equal(rows[0].mass[40],1);
 s.players[1].frozen=false;s.players[1].jailed=true;rows=ev.forecast(f.view(s),1).p1;assert.ok(Math.abs(total(rows[0].landing)-.2)<1e-10);assert.ok(Math.abs(rows[0].mass[40]-.8)<1e-10);
});
test('储备使用本人真实租金与原机场费，预告远航开支提高预算',()=>{
 const s=f.game();f.own(s,'开普敦','p0',4);const low=ev.context(f.view(s));assert.equal(low.reserve,6000+.6*10800);
 s.players[1].position=20;assert.equal(ev.context(f.view(s)).reserve,6000);
 s.roundFlow.index=79;assert.equal(ev.context(f.view(s)).reserve,9000);
 s.airports['纽约肯尼迪国际机场'].ownerId='p0';s.players[0].airports=['纽约肯尼迪国际机场'];assert.equal(ev.context(f.view(s)).reserve,10800);
});
test('建设名义资产减实际成本，资讯到期后回归原租金',()=>{
 const s=f.game();f.own(s,'内罗毕');const v=f.view(s),ctx=ev.context(v);
 const normal=ev.evaluate(ctx,{kind:'build',cityId:'内罗毕',cashCost:2160});assert.equal(normal.assetDelta,0);assert.ok(normal.expectedIncome>0);
 const remote=ev.evaluate(ctx,{kind:'build',cityId:'内罗毕',cashCost:3132});assert.equal(remote.assetDelta,-972);
 s.world.active={type:'boom',region:'非洲',remaining:1};const booming=ev.context(f.view(s));assert.ok(ev.cityIncome(booming,'内罗毕')>ev.cityIncome(ctx,'内罗毕'));
 s.world.active.remaining=0;assert.equal(ev.cityIncome(ev.context(f.view(s)),'内罗毕'),ev.cityIncome(ctx,'内罗毕'));
});
test('城主收入含保留收益与本人股息一次，外部股东只占真实份额',()=>{
 const s=f.game();f.own(s,'内罗毕');const baseline=ev.cityIncome(ev.context(f.view(s)),'内罗毕');
 f.held(s,'内罗毕','p1',4);assert.equal(ev.cityIncome(ev.context(f.view(s)),'内罗毕'),baseline);
 f.held(s,'内罗毕','p0',10);assert.ok(Math.abs(ev.cityIncome(ev.context(f.view(s)),'内罗毕')-baseline*.9)<1e-8);
 const mine=ev.stockBenefit(ev.context(f.view(s)),'内罗毕');assert.equal(mine.expectedIncome,0);
});
test('收购已上市城市保留外部股份，不把旧基金当购房收益',()=>{
 const s=f.game();f.own(s,'上海','p0',2);const id='上海',v=f.view(s),a=ev.cityIncome(ev.context(v),id,2,true);
 f.held(s,id,'p0',20);s.stocks[id].dividendFund=100000;require('../src/stocks').refreshPrice(s,id,'基金');
 const ctx=ev.context(f.view(s));assert.ok(Math.abs(ev.cityIncome(ctx,id,2,true)-a*.8)<1e-8);
 const bid=ev.evaluate(ctx,{kind:'city',cityId:id,cashCost:40000});assert.equal(bid.assetDelta,4000);
 require('../src/stocks').transferCity(s,{cityId:id,newOwnerId:'p1'},[]);assert.equal(s.stocks[id].holders.p0,20);assert.equal(s.stocks[id].dividendFund,0);
});
test('基金已含在股价，不重复计分红；真实派息前后未来增量不变',()=>{
 const s=f.game();f.own(s,'内罗毕','p0',2);const a=ev.stockBenefit(ev.context(f.view(s)),'内罗毕');
 s.stocks['内罗毕'].dividendFund=100000;require('../src/stocks').refreshPrice(s,'内罗毕','指定基金');
 const b=ev.stockBenefit(ev.context(f.view(s)),'内罗毕');assert.deepEqual(a,b);
 require('../src/stocks').settleCityDividend(s,'内罗毕','go','test',[]);assert.deepEqual(ev.stockBenefit(ev.context(f.view(s)),'内罗毕'),a);
});
test('股票手续费、抵押惩罚、供应和集中限制采用真实规则',()=>{
 const s=f.game();f.own(s,'上海','p0',3);let ctx=ev.context(f.view(s));const base=ev.stockBenefit(ctx,'上海',2),fee=ev.stockBenefit(ctx,'上海',2,80);assert.equal(base.assetDelta-fee.assetDelta,80);
 f.held(s,'上海','p1',3);s.players[1].cash=10000;assert.equal(ev.stockAllowed(ev.context(f.view(s)),'上海',2),false);
 s.players[1].cash=150000;f.held(s,'上海','p0',17);assert.equal(ev.stockAllowed(ev.context(f.view(s)),'上海',1),false);
 s.stocks['上海'].holders={};s.cities['上海'].mortgaged=true;ctx=ev.context(f.view(s));assert.equal(ev.stockAllowed(ctx,'上海',1),false);assert.equal(ev.stockBenefit(ctx,'上海').expectedIncome,0);
});
test('快速视野真实剩余时间、有限轮速与缺失后备，零时限禁新增投资',()=>{
 const s=f.game(),v=f.view(s);v.gameMode='quick';assert.equal(ev.context(v).horizon,1);
 v.quickTime={elapsedMs:0,totalRemainingMs:1800000};assert.equal(ev.context(v).horizon,8);
 v.quickTime={elapsedMs:1790000,totalRemainingMs:10000};assert.equal(ev.context(v).horizon,1/6);
 v.quickTime.totalRemainingMs=0;assert.equal(ev.affordable(ev.context(v),0),false);
 v.completeRounds=101;v.quickTime={elapsedMs:1500000,totalRemainingMs:300000};assert.equal(ev.context(v).horizon,8);
});
test('100固定快照CPU基准（不运行完整对局）',{timeout:15000},()=>{
 const s=f.game(4);for(const [i,id]of Object.keys(s.cities).entries())f.own(s,id,'p'+i%4,i%4);
 const policy=require('../src/botPolicy'),views=[f.view(s)];require('../src/stocks').openStockWindow(s,'p1');s.phase='stock';s.pending={playerId:'p1'};views.push(f.view(s));
 s.phase='self_rescue';s.players[1].cash=-1000;s.pending={playerId:'p1',due:1000};views.push(f.view(s));
 s.players[1].cash=150000;require('../src/opportunities').beginOpportunityStage(s,1,{kind:'start'},()=>.3);views.push(f.view(s));
 for(let i=0;i<8;i++)policy.choose(views[i%views.length]);
 const times=[],wall=[];for(let i=0;i<100;i++){const start=performance.now(),cpu=process.cpuUsage();policy.choose(views[i%views.length]);const used=process.cpuUsage(cpu);times.push((used.user+used.system)/1000);wall.push(performance.now()-start);}
 times.sort((a,b)=>a-b);wall.sort((a,b)=>a-b);const report={samples:100,p50:times[49],p95:times[94],max:times[99],wallP95:wall[94],wallMax:wall[99],unit:'毫秒CPU时间；wall为实际耗时',timingNote:'Windows进程CPU计时粒度较粗，短样本可能为0；同时报告高精度实际耗时，不把0解释为零计算成本。',node:process.version,platform:os.platform(),cpu:os.cpus()[0].model,scope:'固定4人20城，经营/股票/自救/机遇四类快照，非对局模拟'};
 const dir=path.join(__dirname,'../artifacts/ai-strategy');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'performance.json'),JSON.stringify(report,null,2));console.log('bot CPU',JSON.stringify(report));assert.ok(report.p95<=50,'策略P95超过50ms');
});
