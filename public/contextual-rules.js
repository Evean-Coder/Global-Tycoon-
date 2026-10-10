'use strict';
// Pure display formatting. Trading permission remains in the existing engine.
(function(root){
  function stockLimitSummary(c){
    return {
      identityText:c.isOwner?'你的城市':'其他城市',
      holdingText:c.isOwner?'已持有 '+c.held+'/4 股 · 城主本城上限4股':'已持有 '+c.held+' 股',
      quotaText:'本窗口单城最多买2股 · 剩余 '+c.cityRoom+' 股 · 还可选 '+c.available+' 股',
      reasonText:(c.reasons||[]).join('；')
    };
  }
  function feeSummary(q,format,cashAfter){
    if(!q||!Number.isSafeInteger(q.baseAmount))return [{label:'费用资料',value:'本次资料未提供'}];
    return [{label:'标准金额',value:format(q.baseAmount)},...(q.effects||[]).map(e=>({label:e.name,value:format(Math.abs(e.amount))})),{label:'实际金额',value:Number.isSafeInteger(q.finalAmount)?format(Math.abs(q.finalAmount)):'本次资料未提供'},...(Number.isSafeInteger(cashAfter)?[{label:'操作后现金',value:format(cashAfter)}]:[])];
  }
  function eligibilityMessage(reason){return typeof reason==='string'?reason:'本次资料未提供';}
  function helpTopic(reason){
    if(typeof reason!=='string')return null;
    if(/股票|持股|股份|持有.*股|本窗口|供给/.test(reason))return 'stocks';
    if(/机场|机票|航班/.test(reason))return 'airport';
    if(/抵押|赎回|利息/.test(reason))return 'bank';
    if(/购地|建房|城市/.test(reason))return 'property';
    if(/连接|断线|暂停/.test(reason))return 'connection';
    return null;
  }
  const api={stockLimitSummary,feeSummary,eligibilityMessage,helpTopic};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.ContextualRules=api;
})(typeof window!=='undefined'?window:globalThis);
