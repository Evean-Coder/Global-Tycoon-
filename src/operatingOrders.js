'use strict';
const econ=require('./economy'),{balanced}=require('./managementRules');
function validTarget(s,order){
 const p=s.players.find(p=>p.id===order.playerId);
 if(!p?.alive||s.phase==='game_over'||s.status==='over')return false;
 if(order.targetKind==='airport')return s.airports[order.targetId]?.ownerId===p.id;
 const c=s.cities[order.targetId];return c?.ownerId===p.id&&!c.mortgaged&&s.stocks[order.targetId]?.listingEpoch===order.listingEpoch;
}
function clean(s,events=[]){
 if(!balanced(s))return;
 for(const order of s.operatingOrders){if(order.paymentsRemaining>0&&!validTarget(s,order)){order.paymentsRemaining=0;order.cancelledReason='产权、抵押、出局或封盘导致订单失效';events.push({type:'management',kind:'order_cancelled',playerId:order.playerId,targetId:order.targetId,text:order.targetId+' 经营订单取消未领取收入'});}}
}
function quote(s,p,targetKind,targetId){
 if(!balanced(s)||!['city','airport'].includes(targetKind))return {ok:false,reason:'经营订单目标无效'};
 const target=targetKind==='city'?s.cities[targetId]:s.airports[targetId],epoch=p.opportunities.lapEpoch;
 if(!target||target.ownerId!==p.id||targetKind==='city'&&target.mortgaged)return {ok:false,reason:'订单需要自有非抵押城市或自有机场'};
 if(p.activeManagement.lastOrderLap===epoch)return {ok:false,reason:'本圈已启动经营订单，下次起点结算后恢复'};
 if(s.operatingOrders.some(o=>o.playerId===p.id&&o.paymentsRemaining>0))return {ok:false,reason:'已有订单进行中，完成或取消后才能再启动'};
 const price=targetKind==='city'?target.price:15000,upfront=Math.min(econ.rounded(price,10),1000),paymentEach=Math.min(econ.rounded(price,12),1500);
 return {ok:p.cash>=upfront,...(p.cash<upfront?{reason:'现金不足以支付订单预付款'}:{}),baseAmount:price,finalAmount:upfront,paymentEach,paymentsRemaining:2,targetKind,targetId,listingEpoch:targetKind==='city'?s.stocks[targetId].listingEpoch:null};
}
function start(s,p,q,events){
 p.cash=econ.safe(p.cash-q.finalAmount);p.activeManagement.lastOrderLap=p.opportunities.lapEpoch;
 const order={orderId:s.gameId+':order:'+s.turnId+':'+p.id,playerId:p.id,targetKind:q.targetKind,targetId:q.targetId,listingEpoch:q.listingEpoch,createdTurnId:s.turnId,upfront:q.finalAmount,paymentEach:q.paymentEach,paymentsRemaining:2,lastPaidTurnId:null,startedLapEpoch:p.opportunities.lapEpoch,cancelledReason:null};
 s.operatingOrders=s.operatingOrders.filter(o=>o.playerId!==p.id);s.operatingOrders.push(order);
 events.push({type:'management',kind:'order_started',playerId:p.id,targetId:q.targetId,amount:q.finalAmount,text:p.name+' 启动 '+q.targetId+' 经营订单，预付 '+q.finalAmount});
}
function settleAtTurnStart(s,p,events){
 if(!balanced(s))return;clean(s,events);
 const order=s.operatingOrders.find(o=>o.playerId===p.id&&o.paymentsRemaining>0);
 if(!order||s.turnId<=order.createdTurnId||order.lastPaidTurnId===s.turnId)return;
 p.cash=econ.safe(p.cash+order.paymentEach);order.paymentsRemaining--;order.lastPaidTurnId=s.turnId;
 events.push({type:'management',kind:'order_payment',settlementId:order.orderId+':'+s.turnId,playerId:p.id,targetId:order.targetId,amount:order.paymentEach,text:p.name+' 收到 '+order.targetId+' 订单款 '+order.paymentEach+'，剩余 '+order.paymentsRemaining+' 次'});
}
module.exports={quote,start,clean,settleAtTurnStart};
