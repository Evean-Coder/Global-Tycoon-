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
  function managementSummary(game){
    const a=game?.self?.activeManagement;
    if(!a)return {status:'legacy',label:'本局未启用主动经营',canOpen:false,quotaTexts:[]};
    const current=game.players?.[game.turnIndex]?.id===game.self.playerId;
    const used=a.usedThisTurn??(a.quota?.usedTurnId!=null&&game.turnId!=null&&a.quota.usedTurnId===game.turnId);
    if(typeof a.usedThisTurn!=='boolean'&&!(Number.isSafeInteger(a.quota?.usedTurnId)&&Number.isSafeInteger(game.turnId)))return {status:'unavailable',label:'主动经营资料未确认',canOpen:false,quotaTexts:[]};
    const p=game.players?.[game.turnIndex];
    const normal=current&&game.phase==='waiting_roll'&&!game.pending&&!game.decision?.paused&&p?.alive!==false&&!p?.jailed&&!p?.frozen;
    const possible=a.available&&(a.quotes||[]).some(q=>q.ok);
    const status=!normal?'unavailable':used?'used':possible?'ready':'empty';
    const label=status==='used'?'本回合已经营 · 下次正常回合可用':status==='ready'?(a.mandatory?'本回合必须先经营1项，再掷骰':'本回合可经营1项 · 也可直接掷骰'):status==='empty'?'本回合未经营 · 当前无可执行项目':game.phase==='game_over'?'对局已结束':'仅本人正常掷骰前可经营';
    const quota=a.quota||{},o=game.self.opportunities;
    const quotaTexts=['本圈促销：'+(typeof quota.promotionStartedLap==='boolean'?(quota.promotionStartedLap?'已使用':'剩余1次'):'资料未确认'),'本圈主动买股：'+(Number.isSafeInteger(quota.stockBoughtTotal)?'剩余'+Math.max(0,4-quota.stockBoughtTotal)+'/4股':'资料未确认')+' · 同城最多2股'];
    if(a.mandatory)quotaTexts.splice(0,quotaTexts.length,'每正常回合一项','促销同时一个活动','买股一次1–2股，无圈额度');
    if(o?.selectedIds?.includes('H1'))quotaTexts.push('本圈远程施工优惠：'+((o.usage?.H1||0)>0?'已使用，仍可正常主动建设':'剩余1次'));
    return {status,label,canOpen:normal&&!used,quotaTexts};
  }
  const api={stockLimitSummary,feeSummary,eligibilityMessage,helpTopic,managementSummary};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.ContextualRules=api;
})(typeof window!=='undefined'?window:globalThis);
