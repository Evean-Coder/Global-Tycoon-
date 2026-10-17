'use strict';
const {createHash}=require('node:crypto');
const rules=require('./managementEconomyRules');
const REGIONS=['非洲','大洋洲','欧洲','美洲','亚洲'];
const player=(s,id)=>s.players.find(p=>p.id===id);
const sourceValid=(s,b)=>player(s,b.playerId)?.alive&&s.cities[b.cityId]?.ownerId===b.playerId&&!s.cities[b.cityId].mortgaged&&s.stocks[b.cityId]?.listingEpoch===b.listingEpoch&&s.cities[b.cityId].ownershipEpoch===b.ownershipEpoch;
function initialize(s){s.commercialCompetition={nextPublicationRound:null,currentPeriod:null,bids:[],advantages:[],lastWinnerByRegion:{},lastClosedPeriodId:null};for(const p of s.players)p.activeManagement.lastCompetitionBidLap=null;for(const a of [...Object.values(s.airports),...Object.values(s.cities)])a.ownershipEpoch=0;}
function turnEligible(s,p){return rules.enabled(s)&&p?.alive&&s.status==='playing'&&s.phase==='waiting_roll'&&!s.pending&&!p.jailed&&!p.frozen&&s.players[s.turnIndex]?.id===p.id&&p.activeManagement.usedTurnId!==s.turnId&&p.activeManagement.skippedTurnId!==s.turnId;}
function basicEligible(s,id,region,closeRound){
 const p=player(s,id),cc=s.commercialCompetition;
 return !!(rules.enabled(s)&&p?.alive&&Object.values(s.cities).some(c=>c.continent===region&&c.ownerId===id&&!c.mortgaged)&&p.activeManagement.lastCompetitionBidLap!==p.opportunities.lapEpoch&&!cc.bids.some(b=>b.playerId===id&&b.status==='accepted')&&!cc.advantages.some(a=>a.playerId===id&&!a.endedReason&&a.remainingHits>0&&a.expiresAfterRound>closeRound));
}
function publishAtRoundStart(s,roundId,events=[]){
 if(!rules.enabled(s)||!s.firstRoundDone||s.status!=='playing')return;
 const cc=s.commercialCompetition;
 if(cc.currentPeriod?.bidRound===roundId||cc.nextPublicationRound!==null&&roundId<cc.nextPublicationRound)return;
 const regions=REGIONS.filter(r=>s.players.filter(p=>basicEligible(s,p.id,r,roundId)).length>=2);
 if(cc.nextPublicationRound===null&&!regions.length)return;
 cc.nextPublicationRound=roundId+4;cc.bids=[];cc.advantages=cc.advantages.filter(a=>!a.endedReason);
 cc.currentPeriod={periodId:s.gameId+':competition:'+roundId,bidRound:roundId,closeRound:roundId,activeFromRound:roundId+1,activeThroughRound:roundId+4,publishedRegions:regions,status:'open'};
 events.push({type:'management',kind:'competition_opened',periodId:cc.currentPeriod.periodId,regions:[...regions],text:regions.length?'商业竞争报名开放：'+regions.join('、')+'；本完整轮末开标':'本期无两名合格经营者的地区，商业竞争跳过'});
}
function quoteBid(s,id,input={}){
 const p=player(s,id),cc=s.commercialCompetition,period=cc?.currentPeriod,c=s.cities[input.cityId],amount=input.amount;
 const fail=reason=>({ok:false,reason});
 if(!turnEligible(s,p))return fail('仅本人正常掷骰前可经营，每回合一项');
 if(!period||period.status!=='open'||period.bidRound!==s.roundFlow.index||input.periodId!==period.periodId||!period.publishedRegions.includes(input.region))return fail('本期该地区未开放报名');
 if(!c||c.continent!==input.region||c.ownerId!==id||c.mortgaged)return fail('旗舰须为本地区自有非抵押城市，机场不可选');
 if(cc.bids.some(b=>b.playerId===id&&b.periodId===period.periodId))return fail('本期已报名，不能修改或再次报名');
 if(!basicEligible(s,id,input.region,period.closeRound))return fail('本圈已报名、已有未决报名或优势尚未到期');
 if(!Number.isSafeInteger(amount)||amount<100||amount>3000||amount%100!==0)return fail('出价须100–3000，步长100');
 if(p.cash<amount)return fail('当前现金不足以承担此出价');
 const st=s.stocks[c.id],facts=[s.gameId,s.managementEconomyRevision,s.turnId,id,period.periodId,input.region,c.id,amount,c.ownerId,c.houseLevel,c.mortgaged,c.ownershipEpoch,st.listingEpoch,st.quoteVersion,st.holders,p.cash,p.opportunities,p.activeManagement,s.world.active];
 const quoteVersion=createHash('sha256').update(JSON.stringify(facts)).digest('hex');
 return {ok:true,type:'active_competition_bid',periodId:period.periodId,region:input.region,cityId:c.id,listingEpoch:st.listingEpoch,ownershipEpoch:c.ownershipEpoch,amount,cashRequired:amount,debitNow:0,cashAfterNow:p.cash,closeRound:period.closeRound,startsRound:period.activeFromRound,expiresAfterRound:period.activeThroughRound,quoteVersion};
}
function acceptBid(s,id,q,events=[]){
 const fresh=quoteBid(s,id,q);if(!fresh.ok||fresh.quoteVersion!==q.quoteVersion)throw new Error(fresh.reason||'竞争报价已更新，请再次确认');
 q=fresh;
 const p=player(s,id),b={bidId:q.periodId+':'+id,periodId:q.periodId,playerId:id,region:q.region,cityId:q.cityId,listingEpoch:q.listingEpoch,ownershipEpoch:q.ownershipEpoch,amount:q.amount,submittedTurnId:s.turnId,submittedLapEpoch:p.opportunities.lapEpoch,status:'accepted'};
 s.commercialCompetition.bids.push(b);p.activeManagement.lastCompetitionBidLap=p.opportunities.lapEpoch;p.activeManagement.usedTurnId=s.turnId;
 events.push({type:'management',kind:'competition_bid_accepted',periodId:b.periodId,playerId:id,text:p.name+' 已提交商业竞争报名，轮末开标，尚未扣款'});
}
function invalidReason(s,b){if(!player(s,b.playerId)?.alive)return '玩家已出局';if(!sourceValid(s,b))return '旗舰产权或抵押状态改变';if(player(s,b.playerId).cash<b.amount)return '开标时资金不足';return null;}
function planClose(s,roundId,rng){
 if(!rules.enabled(s))return null;const cc=s.commercialCompetition,p=cc.currentPeriod;
 if(!p||p.status!=='open'||p.closeRound!==roundId||cc.lastClosedPeriodId===p.periodId)return null;
 const outcomes=[];
 for(const region of p.publishedRegions){
  const bids=cc.bids.filter(b=>b.region===region&&b.status==='accepted'),valid=bids.filter(b=>!invalidReason(s,b));
  let winner=null;
  if(valid.length){const high=Math.max(...valid.map(b=>b.amount)),top=valid.filter(b=>b.amount===high),challengers=top.filter(b=>b.playerId!==cc.lastWinnerByRegion[region]),pool=challengers.length?challengers:top;winner=pool.length===1?pool[0]:pool[Math.floor(rng()*pool.length)];if(!winner)throw new Error('竞价随机源无效');}
  outcomes.push({region,winnerId:winner?.bidId||null,entries:bids.map(b=>({bidId:b.bidId,reason:invalidReason(s,b)}))});
 }
 return {periodId:p.periodId,roundId,outcomes};
}
function commitClose(s,plan,events=[]){
 if(!plan)return;const cc=s.commercialCompetition,p=cc.currentPeriod;
 if(cc.lastClosedPeriodId===plan.periodId)return;
 if(p?.periodId!==plan.periodId||p.status!=='open'||s.status!=='playing')throw new Error('竞价期次已失效');
 // Validate all entries before any debit. The server commits the entire candidate.
 for(const result of plan.outcomes)for(const entry of result.entries){const b=cc.bids.find(b=>b.bidId===entry.bidId);if(!b||invalidReason(s,b)!==entry.reason)throw new Error('开标条件已变化');if(entry.bidId===result.winnerId)rules.safe(player(s,b.playerId).cash-b.amount);}
 for(const result of plan.outcomes){
  const publicBids=[];let winning=null;
  for(const entry of result.entries){const b=cc.bids.find(b=>b.bidId===entry.bidId);b.status=entry.reason?'invalid':b.bidId===result.winnerId?'won':'lost';b.invalidReason=entry.reason;
   publicBids.push(entry.reason?{playerId:b.playerId,reason:entry.reason}:{playerId:b.playerId,cityId:b.cityId,amount:b.amount,status:b.status});
   if(b.status==='won'){const owner=player(s,b.playerId);owner.cash-=b.amount;cc.lastWinnerByRegion[b.region]=b.playerId;winning={playerId:b.playerId,cityId:b.cityId,amount:b.amount};cc.advantages.push({advantageId:b.bidId,periodId:p.periodId,playerId:b.playerId,region:b.region,cityId:b.cityId,listingEpoch:b.listingEpoch,ownershipEpoch:b.ownershipEpoch,startsRound:p.activeFromRound,expiresAfterRound:p.activeThroughRound,remainingHits:2,endedReason:null,lastSettlementId:null});}
  }
  events.push({type:'management',kind:'competition_period_closed',periodId:p.periodId,region:result.region,bids:publicBids,winner:winning,text:result.region+' 商业竞争'+(winning?'：'+player(s,winning.playerId).name+'以'+winning.amount+'中标 '+winning.cityId:'流标')});
 }
 p.status='closed';cc.lastClosedPeriodId=p.periodId;
}
function clean(s,events=[]){
 if(!rules.enabled(s))return;
 for(const a of s.commercialCompetition.advantages){if(a.endedReason)continue;const reason=s.status!=='playing'?'对局结束':!sourceValid(s,a)?'旗舰产权、抵押或玩家状态改变':s.roundFlow.index>a.expiresAfterRound?'有效期结束':a.remainingHits<=0?'两次客源已用完':null;if(reason){a.endedReason=reason;events.push({type:'management',kind:'competition_advantage_ended',playerId:a.playerId,cityId:a.cityId,advantageId:a.advantageId,text:a.cityId+' 客源优势结束：'+reason});}}
}
function expireAtBoundary(s,roundId,events=[]){if(!rules.enabled(s))return;for(const a of s.commercialCompetition.advantages)if(!a.endedReason&&a.expiresAfterRound<=roundId){a.endedReason='有效期结束';events.push({type:'management',kind:'competition_advantage_ended',playerId:a.playerId,cityId:a.cityId,text:a.cityId+' 客源优势到期'});}clean(s,events);}
function planRent(s,{cityId,tenantId,baseRent}){
 if(!rules.enabled(s)||s.status!=='playing'||baseRent<=0)return null;
 const a=s.commercialCompetition.advantages.find(a=>a.cityId===cityId&&!a.endedReason&&a.remainingHits>0&&a.playerId!==tenantId&&sourceValid(s,a)&&s.roundFlow.index>=a.startsRound&&s.roundFlow.index<=a.expiresAfterRound);
 if(!a)return null;const surcharge=Math.min(3000,rules.rounded(baseRent,15));
 return surcharge?{advantageId:a.advantageId,cityId,baseRent,surcharge,remainingHits:a.remainingHits,listingEpoch:a.listingEpoch}:null;
}
function validateRent(s,plan){if(!plan)return;const a=s.commercialCompetition?.advantages.find(a=>a.advantageId===plan.advantageId);if(!a||a.endedReason||a.remainingHits!==plan.remainingHits||!sourceValid(s,a)||a.listingEpoch!==plan.listingEpoch||s.roundFlow.index<a.startsRound||s.roundFlow.index>a.expiresAfterRound)throw new Error('客源租金计划已失效');}
function commitRent(s,plan,settlementId){if(!plan)return;validateRent(s,plan);const a=s.commercialCompetition.advantages.find(a=>a.advantageId===plan.advantageId);if(a.lastSettlementId===settlementId)throw new Error('租金已结算');a.remainingHits--;a.lastSettlementId=settlementId;if(!a.remainingHits)a.endedReason='两次客源已用完';}
function cancelAll(s,reason,events=[]){if(!rules.enabled(s))return;for(const b of s.commercialCompetition.bids)if(b.status==='accepted')b.status='cancelled';if(s.commercialCompetition.currentPeriod?.status==='open')s.commercialCompetition.currentPeriod.status='cancelled';for(const a of s.commercialCompetition.advantages)if(!a.endedReason){a.endedReason=reason;events.push({type:'management',kind:'competition_advantage_ended',playerId:a.playerId,cityId:a.cityId,text:a.cityId+' 客源优势结束：'+reason});}}
function publicView(s){if(!rules.enabled(s))return null;const cc=s.commercialCompetition;return {period:cc.currentPeriod?{...cc.currentPeriod,publishedRegions:[...cc.currentPeriod.publishedRegions]}:null,nextPublicationRound:cc.nextPublicationRound,participants:cc.bids.filter(b=>b.status==='accepted').map(b=>b.playerId),participantsByRegion:Object.fromEntries(REGIONS.map(region=>[region,cc.bids.filter(b=>b.status==='accepted'&&b.region===region).map(b=>b.playerId)])),advantages:cc.advantages.filter(a=>!a.endedReason&&sourceValid(s,a)).map(a=>({...a})),results:cc.currentPeriod?.status==='closed'?cc.bids.map(b=>b.status==='invalid'?{playerId:b.playerId,reason:b.invalidReason}:b.status==='won'||b.status==='lost'?{playerId:b.playerId,region:b.region,cityId:b.cityId,amount:b.amount,status:b.status}:null).filter(Boolean):[]};}
function selfView(s,id){if(!rules.enabled(s))return null;const cc=s.commercialCompetition,period=cc.currentPeriod,bid=cc.bids.find(b=>b.playerId===id);return {bid:bid?{...bid}:null,periodId:period?.periodId||null,reason:period?.status==='open'&&period.publishedRegions.length?'每期与每本人圈各一次，开标时须仍付得起':'本轮没有开放的商业竞争；需要同洲至少两名合格经营者'};}
function assert(s){if(!rules.enabled(s))return;const cc=s.commercialCompetition;if(!cc)throw new Error('缺少经营竞争状态');const seen=new Set();for(const b of cc.bids){if(seen.has(b.playerId)||!Number.isSafeInteger(b.amount)||b.amount<100||b.amount>3000||b.amount%100)throw new Error('竞争报名无效');seen.add(b.playerId);}const active=new Set();for(const a of cc.advantages){if(!Number.isSafeInteger(a.remainingHits)||a.remainingHits<0||a.remainingHits>2)throw new Error('客源次数无效');if(!a.endedReason&&a.remainingHits>0){if(active.has(a.playerId))throw new Error('客源优势重叠');active.add(a.playerId);}}}
module.exports={REGIONS,initialize,turnEligible,basicEligible,publishAtRoundStart,quoteBid,acceptBid,planClose,commitClose,clean,expireAtBoundary,planRent,validateRent,commitRent,cancelAll,publicView,selfView,assert};
