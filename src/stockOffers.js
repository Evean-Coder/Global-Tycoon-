'use strict';
const inv=require('./stockInvestment'),econ=require('./economy');
const active=o=>o.status==='pending';
function protectedCash(s,id){const p=s.pending||{},actor=p.awaiting||p.targetId||p.playerId||s.players[s.turnIndex]?.id;return ['self_rescue','buy_fundraise','auction_bid','direct_sale_ask','trade_confirm','build_decide','buy','buy_airport','flight'].includes(s.phase)&&actor===id;}
function invalid(s,o,now){
 if(now>=o.expiresAt)return '报价已到期';if(s.status!=='playing'||s.phase==='game_over')return '对局已结束';
 if(![o.buyerId,o.sellerId].every(id=>s.players.some(p=>p.id===id&&p.alive&&p.connected!==false)))return '交易方离线或出局';
 if(s.turnId!==o.originTurnId||JSON.stringify(inv.context(s,o.makerId))!==JSON.stringify(o.context))return '已离开发起窗口';
 const st=s.stocks[o.cityId];if(st.clearing||!s.cities[o.cityId].ownerId||st.listingEpoch!==o.listingEpoch||st.quoteVersion!==o.quoteVersion)return '城市报价或产权已改变';
 if(o.units.some(i=>st.units[i.unitId].holderId!==o.sellerId||st.units[i.unitId].acquiredSeq!==i.acquiredSeq))return '股份来源已改变';return null;
}
function end(o,status,reason,events){o.status=status;o.reason=reason;events.push({type:'stock',kind:'stock_offer_closed',offerId:o.offerId,playerId:o.makerId,status,text:'股票报价'+reason});}
function sweep(s,now=Date.now(),events=[]){if(!inv.enabled(s))return false;let changed=false;for(const o of s.stockOffers.filter(active)){const reason=invalid(s,o,now);if(reason){end(o,now>=o.expiresAt?'expired':'invalidated',reason,events);changed=true;}}return changed;}
function cancelAll(s,reason,events){for(const o of s.stockOffers.filter(active))end(o,'cancelled',reason,events);}
function validate(s,pid,a,time={}){
 if(!inv.enabled(s))throw new Error('本局不支持股票议价');const now=time.now??Date.now(),p=s.players.find(p=>p.id===pid);if(!p?.alive||p.connected===false)throw new Error('玩家身份已失效');
 if(a.type==='stock_offer_create'){
  const ctx=inv.context(s,pid),target=s.players.find(p=>p.id===a.targetId);
  if(!ctx||JSON.stringify(ctx)!==JSON.stringify(a.stockContext)||inv.quota(s,pid).invitationUsed||s.stockOffers.some(o=>active(o)&&o.makerId===pid))throw new Error('每个人回合最多一份报价，仅可在掷骰前或起点窗口发起');
  if(!target?.alive||target.connected===false||target.id===pid||!['buy','sell'].includes(a.side)||!Number.isSafeInteger(a.shares)||a.shares<1||a.shares>4||!Number.isSafeInteger(a.cash)||a.cash<0)throw new Error('交易对象、股数或协商金额无效');
  const buyerId=a.side==='buy'?pid:target.id,sellerId=a.side==='sell'?pid:target.id,st=s.stocks[a.cityId];
  if(!st||!s.cities[a.cityId].ownerId||st.clearing||a.quoteVersion!==st.quoteVersion||a.listingEpoch!==st.listingEpoch)throw new Error('城市报价已失效');
  const units=inv.select(s,sellerId,a.cityId,a.shares);if((st.holders[buyerId]||0)+a.shares>inv.cap(s,buyerId,a.cityId))throw new Error('接收方持股超过上限');
  const deadline=time.decisionDeadline,expiresAt=Math.min(now+20000,deadline??NaN,time.quickDeadline??Infinity);
  if(!Number.isFinite(expiresAt)||expiresAt<=now)throw new Error('原决定已到期');
  return {makerId:pid,buyerId,sellerId,cityId:a.cityId,shares:a.shares,cash:a.cash,fee:econ.rounded(a.cash,2),context:ctx,units:units.map(u=>({unitId:u.unitId,acquiredSeq:u.acquiredSeq})),originTurnId:s.turnId,quoteVersion:st.quoteVersion,listingEpoch:st.listingEpoch,expiresAt,createdAt:now};
 }
 const o=s.stockOffers.find(o=>o.offerId===a.offerId);if(!o||!active(o)||a.offerVersion!==o.version)throw new Error('报价已关闭或更新');const reason=invalid(s,o,now);if(reason)throw new Error(reason);
 if(a.type==='stock_offer_cancel'){if(pid!==o.makerId)throw new Error('只有发起者可以取消');return o;}
 if(a.type!=='stock_offer_reply'||pid===o.makerId||![o.buyerId,o.sellerId].includes(pid)||typeof a.accept!=='boolean')throw new Error('无权回复该报价');
 if(a.accept){if(protectedCash(s,o.buyerId)||protectedCash(s,o.sellerId))throw new Error('当事人正在处理付款，请完成后再交易');const buyer=s.players.find(p=>p.id===o.buyerId),seller=s.players.find(p=>p.id===o.sellerId);if(buyer.cash<o.cash||(s.stocks[o.cityId].holders[buyer.id]||0)+o.shares>inv.cap(s,buyer.id,o.cityId))throw new Error('现金或持股条件已改变');econ.safe(seller.cash+o.cash-o.fee);econ.safe(buyer.cash-o.cash);}
 return o;
}
function recipientUnits(s,o){const source=s.stocks[o.cityId].units,ids=o.units.map(u=>u.unitId).sort((a,b)=>a-b),base=Math.floor(o.cash/ids.length),remainder=o.cash%ids.length;return ids.map((id,i)=>({unitId:id,paidCost:base+(i<remainder?1:0),bankBasis:Math.min(source[id].bankBasis,base+(i<remainder?1:0))}));}
function recipientExit(s,o){const price=inv.quoteBuy(s,o.cityId);return recipientUnits(s,o).reduce((n,u)=>n+Number(BigInt(Math.min(price,u.bankBasis))*90n/100n),0);}
function apply(s,pid,a,time,events){const q=validate(s,pid,a,time);
 if(a.type==='stock_offer_create'){s.stockOffers=s.stockOffers.filter(active).concat(s.stockOffers.filter(o=>!active(o)).slice(-24));const o={...q,offerId:s.gameId+':offer:'+(++s.stockOfferSeq),version:1,status:'pending',recipientExitRecorded:recipientExit(s,q)};s.stockOffers.push(o);s.players.find(p=>p.id===pid).stockTurnQuota={...inv.quota(s,pid),invitationUsed:true};events.push({type:'stock',kind:'stock_offer_created',playerId:pid,offerId:o.offerId,text:s.players.find(p=>p.id===pid).name+' 发起股票报价'});return;}
 if(a.type==='stock_offer_cancel'){end(q,'cancelled','已取消',events);return;}
 if(!a.accept){end(q,'declined','已拒绝',events);return;}
 const units=recipientUnits(s,q),buyer=s.players.find(p=>p.id===q.buyerId),seller=s.players.find(p=>p.id===q.sellerId),seq=++s.stockAcquisitionSeq;
 buyer.cash-=q.cash;seller.cash+=q.cash-q.fee;for(const u of units)Object.assign(s.stocks[q.cityId].units[u.unitId],u,{holderId:buyer.id,acquiredSeq:seq});
 inv.ledger(s,buyer.id,q.cityId,'playerBuyCost',q.cash);inv.ledger(s,seller.id,q.cityId,'playerSaleNet',q.cash-q.fee);inv.sync(s);q.status='accepted';q.reason='已成交';events.push({type:'stock',kind:'stock_transfer',playerId:seller.id,targetId:buyer.id,cityId:q.cityId,shares:q.shares,cash:q.cash,fee:q.fee,text:seller.name+' 向 '+buyer.name+' 出售 '+q.cityId+' '+q.shares+'股，协商总价 '+q.cash+'，卖方手续费 '+q.fee});
}
function view(s,pid){return s.stockOffers.filter(o=>[o.buyerId,o.sellerId].includes(pid)).map(o=>({offerId:o.offerId,version:o.version,makerId:o.makerId,buyerId:o.buyerId,sellerId:o.sellerId,cityId:o.cityId,shares:o.shares,cash:o.cash,fee:o.fee,status:o.status,reason:o.reason,expiresAt:o.expiresAt,recipientExit:active(o)?recipientExit(s,o):o.recipientExitRecorded}));}
module.exports={validate,apply,sweep,cancelAll,view,protectedCash};
