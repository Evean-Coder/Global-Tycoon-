'use strict';
(function(root){
 const enabled=g=>g?.managementEconomyRevision==='management-economy-v1';
 function orderText(o,fmt){if(o.cancelledReason)return '已取消，未领本金及尾款不补发';if(!o.paymentsRemaining)return '已结清';return o.scheduledPayments?'剩余回款 '+o.scheduledPayments.slice(o.nextPaymentIndex||0).map(fmt).join(' / ')+'；未领本金 '+fmt(o.principalOutstanding):'剩余'+o.paymentsRemaining+'次，每次'+fmt(o.paymentEach);}
 function assetRisk(game,cityId,fmt){if(!enabled(game))return '';const order=game.self?.activeManagement?.order,notes=[];if(order?.targetKind==='city'&&order.targetId===cityId&&order.paymentsRemaining>0&&!order.cancelledReason)notes.push('抵押或转让将取消本城订单未领本金 '+fmt(order.principalOutstanding)+' 及尾款，已收利润不追回');if(game.competition?.advantages.some(a=>a.cityId===cityId&&a.playerId===game.self.playerId))notes.push('抵押或转让将终止本城客源优势，中标费用不退');return notes.join('；');}
 function render({body,footer,game,draft:d,locked,pending,connected,fmt,submit,close,skip,rerender}){
  const data=game.self.activeManagement,top=body.scrollTop,focused=body.contains(document.activeElement)?document.activeElement.dataset.focusKey:null,expanded=[...body.querySelectorAll('details[open]')].map(n=>n.dataset.helpKey);
  body.replaceChildren();body.classList.add('management-economy-body');footer.replaceChildren();
  const node=(tag,text,parent=body,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;parent.append(el);return el;};
  const button=(text,parent,run,disabled=locked)=>{const b=node('button',text,parent,'secondary');b.type='button';b.disabled=disabled;b.onclick=run;return b;};
  const labels={active_order:'经营订单',active_build:'远程建设',active_competition_bid:'商业竞争'},descriptions={active_order:'预付本金，两次未来回合收款',active_build:'高价提升房级，保留长期收租价值',active_competition_bid:'暗价争夺客源，靠真实到访兑现'};
  node('p',d.type?labels[d.type]:'每回合可经营一项，也可放弃；关闭查看会保留机会。',body,'management-summary');
  if(d.error)node('p',d.error,body,'management-error');
  if(d.request&&!pending)button('查询刚才的操作结果',body,()=>d.request.retrieve(),!connected);
  if(!d.type){
   const types=node('div',undefined,body,'management-types');
   for(const type of Object.keys(labels)){const rows=data.quotes.filter(q=>q.type===type),count=rows.filter(q=>q.ok).length,b=button('',types,()=>{d.type=type;d.error='';d.competitionCity=null;rerender();body.scrollTop=0;});b.dataset.managementType=type;b.classList.add('management-type');node('strong',labels[type],b);node('span',descriptions[type],b);node('small',count?count+'个标的可选':type==='active_competition_bid'?game.self.competition.reason:'当前不可执行 · 查看原因',b);}
   if(data.order)node('p',data.order.targetId+'订单：'+orderText(data.order,fmt),body,'hint');
   if(game.self.competition.bid){const bid=game.self.competition.bid;node('p','本期报名：'+bid.cityId+' '+fmt(bid.amount)+' · '+(bid.status==='accepted'?'尚未扣款，等待轮末开标':'状态 '+bid.status),body,'management-competition-note');}
  }else if(d.type==='active_competition_bid'){
   const period=game.competition.period;
   node('p',period?.status==='open'?'第'+period.closeRound+'完整轮末开标；胜者下轮起最多4完整轮、2次客源。每期/每本人圈各一次。':game.self.competition.reason,body,'hint');
   const quotes=data.quotes.filter(q=>q.type===d.type),selected=quotes.find(q=>q.cityId===d.competitionCity);
   if(!selected){
    if(!quotes.length)node('p',game.self.competition.reason+'。须在已开放地区拥有非抵押城市。',body,'hint');
    for(const q of quotes){const row=node('article',undefined,body,'management-city competition-target');row.dataset.cityId=q.cityId;node('h4',q.region+' · '+q.cityId,row);node('p',q.ok?'标准租金 '+fmt(q.preview.baseRent)+' · 名义附加 '+fmt(q.preview.surcharge)+' / 次':q.reason,row);const b=button('选择旗舰城市',row,()=>{d.competitionCity=q.cityId;d.error='';rerender();body.scrollTop=0;},locked||!q.ok);b.dataset.competitionCity=q.cityId;}
   }else{
    const q=selected,row=node('article',undefined,body,'management-city competition-bid');row.dataset.cityId=q.cityId;node('h4',q.region+' · '+q.cityId,row);
    button('返回旗舰列表',row,()=>{d.competitionCity=null;rerender();body.scrollTop=0;});
    if(!q.ok)node('p',q.reason,row,'management-error');
    else{
     d.amounts||={};const amount=d.amounts[q.cityId]||100,preview=q.preview;
     const label=node('label','暗价（100–3000，步长100） ',row),input=node('select',undefined,label);input.dataset.focusKey='competition-amount';input.setAttribute('aria-label','商业竞争出价');input.disabled=locked;
     for(let n=100;n<=3000;n+=100){const o=node('option',fmt(n),input);o.value=String(n);}input.value=String(amount);input.onchange=()=>{d.amounts[q.cityId]=Number(input.value);d.lossConfirmed=null;rerender();};
     node('p','现在不扣款、不冻结；中标才扣 '+fmt(amount)+'，届时现金不足则失效。落选或失效不退本回合经营和本圈报名次数。',row,'management-competition-note');
     node('p','标准租金 '+fmt(preview.baseRent)+' · 名义附加 '+fmt(preview.surcharge)+' / 次（15%，最高3000）',row);
     const table=node('table',undefined,row,'competition-scenarios');const head=node('tr',undefined,node('thead',undefined,table));for(const text of ['真实触发','本人额外收入','扣中标价后净额'])node('th',text,head);
     const tbody=node('tbody',undefined,table);for(let i=0;i<=2;i++){const income=i?preview.increments[i-1].total:0,tr=node('tr',undefined,tbody);node('td',i+'次',tr);node('td',fmt(income),tr);node('td',fmt(income-amount),tr);}
     const details=node('details',undefined,row);details.dataset.helpKey='competition-income';details.open=expanded.includes('competition-income');node('summary','查看实收构成与假设',details);
     for(let i=0;i<2;i++){const p=preview.increments[i];node('p',(i+1)+'次累计：城主留存 '+fmt(p.retained)+'；本人租金股息 '+fmt(p.rentalDividend)+'；银行追加 '+fmt(p.bankDividend)+'；机遇 '+fmt(p.perkBonus),details);}node('p',preview.assumption,details);node('p','两次顺序消耗当前额度，与无客源的同样两次收租对照；优势不增加资产估值。',details);
     const token=q.bidTokensByAmount[amount],tokenKey=q.cityId+':'+amount;d.tokens||={};d.quoteChanged||={};if(d.tokens[tokenKey]&&d.tokens[tokenKey]!==token)d.quoteChanged[q.cityId]=true;if(d.quoteChanged[q.cityId])node('p','报价资料已更新，请重新核对金额和收益后确认。',row,'management-error');d.tokens[tokenKey]=token;
     if(game.gameMode==='quick')node('p','快速模式：整局剩余见游戏计时，到时封盘；未开标不扣，已付费用及未赚收益不补偿。',row,'management-competition-note');
     if(d.lossConfirmed===token)node('p','即使两次触发，当前估算也可能亏损。再次点击才提交此战略性报价。',row,'management-error');
     const confirm=button(d.lossConfirmed===token?'仍然确认报名':'确认报名',row,()=>{
      if(preview.increments[1].total<amount&&d.lossConfirmed!==token){d.lossConfirmed=token;rerender();return;}
      submit({type:d.type,periodId:q.periodId,region:q.region,cityId:q.cityId,amount,quoteVersion:token});
     },locked||!token);confirm.dataset.managementConfirm='';confirm.className='primary';
    }
   }
  }else{
   const rows=data.quotes.filter(q=>q.type===d.type);if(!rows.length)node('p','暂无符合条件的自有城市或机场。',body,'hint');
   for(const q of rows){const row=node('article',undefined,body,'management-city');row.dataset.cityId=q.cityId;node('h4',q.cityId,row);
    if(d.type==='active_order'){if(q.scheduledPayments){node('p','预付 '+fmt(q.finalAmount)+' · 基础净利润 '+fmt(q.baseProfit),row);node('p','下次本人回合：利润 '+fmt(q.scheduledPayments[0])+'；再下次：本金与余利 '+fmt(q.scheduledPayments[1]),row);}node('p','每本人圈一单、同时一单。产权变化、抵押、出局或封盘将取消未领本金和尾款，已收利润不追回。订单资讯按每笔实际回款另奖，不保证。',row,'hint');}
    else{node('p','目标房级 '+(game.cities[q.cityId].houseLevel+1)+' · 实际费用 '+(q.finalAmount===undefined?'暂不可用':fmt(q.finalAmount)),row);node('p','一级150% / 二级200% / 三级300% / 四级350%；优惠后最低150%。成功后再经过起点3次，不能连续施工同城。',row,'hint');}
    if(!q.ok)node('p',q.reason,row,'management-error');const b=button('确认'+labels[d.type],row,()=>submit({type:d.type,cityId:q.cityId,targetKind:q.targetKind,quoteVersion:q.quoteVersion}),locked||!q.ok);b.dataset.managementConfirm='';b.className='primary';
   }
  }
  if(d.type){const back=button('返回选择',footer,()=>{d.type=null;d.error='';rerender();body.scrollTop=0;});back.dataset.managementBack='';}
  else{const abandon=button('放弃经营',footer,skip);abandon.id='btnAbandonManagement';abandon.classList.add('management-abandon');}
  const closeButton=button('关闭查看',footer,close,false);closeButton.id='btnCloseManagement';body.scrollTop=top;
  if(focused)body.querySelector('[data-focus-key="'+focused+'"]')?.focus({preventScroll:true});
 }
 const api={enabled,orderText,assetRisk,render};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ManagementEconomyView=api;
})(typeof window!=='undefined'?window:globalThis);
