'use strict';
const economy=require('./economy');
function quote(s,playerId,cityId){
 const p=s.players.find(x=>x.id===playerId),c=s.cities[cityId];
 if(!p?.alive||!c||c.ownerId!==playerId||!c.mortgaged)return {ok:false,reason:'只能赎回自己的抵押城市'};
 const principal=economy.mortgageValue(c),interest=c.mortgageInterest??0;
 if(!Number.isSafeInteger(interest)||interest<0)return {ok:false,reason:'抵押利息资料无效'};
 const total=economy.safe(principal+interest),q={ok:true,cityId,principal,interest,total,cashAfter:p.cash-total,quoteVersion:[s.gameId||s.roomCode,playerId,'redeem',cityId,principal,interest,c.ownerId].join(':')};
 if(s.phase!=='waiting_roll'||s.pending||s.players[s.turnIndex]?.id!==playerId)return {...q,ok:false,reason:'请在本人正常回合掷骰前赎回'};
 if(!Number.isSafeInteger(p.cash)||p.cash<total)return {...q,ok:false,reason:'现金不足以偿还本金和利息'};
 return q;
}
module.exports={quote};
