'use strict';
const econ=require('./economy'),{balanced}=require('./managementRules');
function markPurchase(s,p,id,shares){
 if(!balanced(s)||require('./stockInvestment').enabled(s))return;
 const r=p.activeInvestment,st=s.stocks[id],prior=r.sharesByCity[id];
 r.sharesByCity[id]={listingEpoch:st.listingEpoch,shares:(prior?.listingEpoch===st.listingEpoch?prior.shares:0)+shares};
}
function reduce(s,playerId,id,shares){
 if(!balanced(s)||require('./stockInvestment').enabled(s))return;const p=s.players.find(p=>p.id===playerId),entry=p?.activeInvestment?.sharesByCity[id];if(!entry)return;
 entry.shares=Math.max(0,entry.shares-shares);if(!entry.shares)delete p.activeInvestment.sharesByCity[id];
}
function clearListing(s,id){if(balanced(s))for(const p of s.players)delete p.activeInvestment.sharesByCity[id];}
function expireAtGo(s,p){if(balanced(s))p.activeInvestment={lapEpoch:p.opportunities.lapEpoch,bonusPaid:0,sharesByCity:{},receipts:[]};}
function reward(s,p,id,perShare,reason,receiptId,events){
 if(!balanced(s)||require('./stockInvestment').enabled(s)||reason!=='go')return;
 const r=p.activeInvestment,entry=r.sharesByCity[id],st=s.stocks[id];
 if(!entry||entry.listingEpoch!==st.listingEpoch||r.receipts.includes(receiptId))return;
 r.receipts.push(receiptId);
 const shares=Math.min(entry.shares,st.holders[p.id]||0),amount=Math.min(Math.max(0,1500-r.bonusPaid),econ.rounded(perShare*shares,30));
 if(!amount)return;p.cash=econ.safe(p.cash+amount);r.bonusPaid+=amount;
 events.push({type:'dividend',kind:'active_investment_reward',settlementId:receiptId+':active',playerId:p.id,cityId:id,shares,amount,text:p.name+' 主动投资股息奖励 '+amount});
}
module.exports={markPurchase,reduce,clearListing,expireAtGo,reward};
