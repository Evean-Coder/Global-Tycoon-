'use strict';
(function(root){
 const enabled=g=>g?.turnExperienceRevision==='turn-experience-v1';
 const value=(n,fmt)=>Number.isSafeInteger(n)?fmt(n):'资料暂不可用';
 function receiptText(r,fmt){
  const target=r.targetId||'',v=n=>value(n,fmt);
  if(r.kind==='order_started')return target+' · 订单预付 '+v(r.cashOut);
  if(r.kind==='order_payment')return target+' · 订单到账 '+v(r.cashIn)+'（本金 '+v(r.principal)+'，利润 '+v(r.profit)+'，资讯奖励 '+v(r.newsBonus)+'）';
  if(r.kind==='order_cancelled')return target+' · 订单失效，未领本金 '+v(r.unpaidPrincipal)+' 不再返还';
  if(r.kind==='build')return target+' · 远程建设支出 '+v(r.cashOut)+'，房级 '+(Number.isSafeInteger(r.levelBefore)?r.levelBefore:'资料暂不可用')+' → '+(Number.isSafeInteger(r.levelAfter)?r.levelAfter:'资料暂不可用');
  if(r.kind==='instant_stock_dividend')return target+' · 股息到账 '+v(r.cashIn)+'（租金 '+v(r.rental)+'，银行 '+v(r.bank)+'，机遇 '+v(r.extra)+'）';
  if(r.kind==='competition_period_closed')return target+' · '+(r.status==='won'?'中标支出 '+v(r.cashOut):r.status==='lost'?'本期未中标，未扣款':'报名失效，未扣款')+(r.reason?' · '+r.reason:'');
  if(r.kind==='competition_rent')return target+' · 客源触发，名义附加 '+v(r.nominalSurcharge)+(Number.isSafeInteger(r.settlementCash)?'；本笔本人整笔收款 '+v(r.settlementCash):'')+'（含原租金与股息，不等于竞争新增利润）';
  return target+' · '+(r.reason||'客源优势结束');
 }
 function review(data,fmt,expanded){
  const root=document.createElement('section');root.className='experience-review';
  const add=(tag,text,parent=root)=>{const n=document.createElement(tag);n.textContent=text;parent.append(n);return n;};
  add('p','仅含经营与分红，不是全部现金流水；未到账收益不计为已收现金。').className='hint';
  if(!data?.historyAvailable)add('p','历史资料暂不可用，请以当前现金和资产为准。').className='hint';
  for(const reason of data?.incompleteReasons||[])add('p',reason+'；不据此推算缺失收益。').className='hint';
  const totals=data?.totals;
  if(totals){
   const details=add('details','');details.dataset.experienceKey='totals';add('summary','本局经营投入与结果',details);
   const o=totals.orders,c=totals.competition,b=totals.remote;
   add('p','订单：累计预付 '+value(o.upfront,fmt)+'；返还本金 '+value(o.principal,fmt)+'；实收利润 '+value(o.profit,fmt)+'；资讯奖 '+value(o.newsBonus,fmt)+'；取消未领本金 '+value(o.cancelledPrincipal,fmt),details);
   add('p','远程建设：'+b.count+'次，累计支出 '+value(b.cost,fmt)+'。当前房级与基础租金见城市详情，后续整笔租金不归因于施工。',details);
   add('p','商业竞争：中标支出 '+value(c.cost,fmt)+'；名义附加触发 '+c.hits+'次、共 '+value(c.nominalSurcharge,fmt)+'。附加须沿原分红结算，不是本人净利润。',details);
  }
  const list=add('ol','');list.className='experience-receipts';
  for(const r of (data?.recent||[]).slice(0,expanded?24:6)){const item=add('li',receiptText(r,fmt),list);item.dataset.experienceKey=r.id;}
  if(!list.children.length)add('p','暂无已记录的经营或分红结果。');
  return root;
 }
 const api={enabled,value,receiptText,review};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TurnExperienceView=api;
})(typeof window!=='undefined'?window:globalThis);
