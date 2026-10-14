'use strict';
const REVISION='business-missions-v1';
const enabled=s=>s?.businessMissionRevision===REVISION;
const initial=()=>({active:null,lastAcceptedLap:null,coupon:null,lastResult:null,seq:0});
const CATALOG={build:{name:'建设实践',description:'接受后在自己的城市落地建房，完成后现金至少6000。奖励一次建房券：标准费用10%，最多1000。'},flight:{name:'航线探索',description:'接受后支付机票飞往另一机场，完成后现金至少6000。奖励一次机票券：标准票价20%，最多1000。'}};
function quote(s,id,type){
 const p=s.players.find(p=>p.id===id),m=p?.businessMission;
 if(!enabled(s)||!p?.alive||s.phase!=='waiting_roll'||s.players[s.turnIndex].id!==id)return {ok:false,reason:'仅本人正常掷骰前可管理任务'};
 const quoteVersion=JSON.stringify([s.gameId,s.turnId,s.revision,id,type,m]);
 if(type==='abandon')return {ok:!!m.active,reason:m.active?null:'没有进行中的任务',quoteVersion};
 if(!CATALOG[type])return {ok:false,reason:'任务无效',quoteVersion};
 let reason=null;
 if(m.active)reason='已有任务进行中';else if(m.coupon)reason='请先使用或等待现有奖励券到期';else if(m.lastAcceptedLap===p.opportunities.lapEpoch)reason='本圈已接受任务，下次经过起点恢复';
 else if(type==='build'&&!Object.values(s.cities).some(c=>c.ownerId===id&&!c.mortgaged&&c.houseLevel<4))reason='需要可建设的自有城市';
 else if(type==='flight'&&(p.cash<6500||Object.keys(s.airports).length<2))reason='需要至少6500现金及两个机场';
 return {ok:!reason,reason,quoteVersion};
}
function apply(s,id,a){
 const q=quote(s,id,a.missionType);if(!q.ok||a.quoteVersion!==q.quoteVersion)throw new Error(q.reason||'任务状态已更新');
 const p=s.players.find(p=>p.id===id),m=p.businessMission;
 if(a.missionType==='abandon'){m.lastResult={status:'abandoned',type:m.active.type};m.active=null;return;}
 m.seq++;m.lastAcceptedLap=p.opportunities.lapEpoch;
 m.active={id:s.gameId+':mission:'+id+':'+m.seq,type:a.missionType,acceptedLap:p.opportunities.lapEpoch,expiresAtLap:p.opportunities.lapEpoch+2};
}
function couponOffer(s,p,kind,base){
 const c=enabled(s)&&p.businessMission?.coupon;
 if(!c||c.type!==kind||p.opportunities.lapEpoch>=c.expiresAtLap)return null;
 return {id:c.id,amount:Math.min(1000,require('./economy').rounded(base,kind==='build'?10:20))};
}
function observe(s,p,q,events){
 if(!enabled(s))return;
 const m=p.businessMission;
 if(q.missionCoupon&&m.coupon?.id===q.missionCoupon.id&&q.missionCoupon.amount>0){m.coupon=null;events.push({type:'mission',kind:'mission_coupon_used',playerId:p.id,amount:q.missionCoupon.amount,text:p.name+' 使用经营任务奖励券，节省 '+q.missionCoupon.amount});}
 const a=m.active;if(!a||p.opportunities.lapEpoch>=a.expiresAtLap||p.cash<6000)return;
 if(!(a.type==='build'&&q.kind==='build'&&q.managementMode==='normal'||a.type==='flight'&&q.kind==='flight'&&q.finalAmount>0))return;
 m.coupon={id:a.id+':coupon',type:a.type,expiresAtLap:p.opportunities.lapEpoch+2};m.lastResult={status:'completed',type:a.type,id:a.id};m.active=null;
 events.push({type:'mission',kind:'mission_completed',playerId:p.id,text:p.name+' 完成 '+CATALOG[a.type].name+'，获得一次奖励券（两圈内有效）'});
}
function onGo(s,p,events){
 if(!enabled(s))return;const m=p.businessMission;
 if(m.active&&p.opportunities.lapEpoch>=m.active.expiresAtLap){m.lastResult={status:'expired',type:m.active.type};m.active=null;events.push({type:'mission',kind:'mission_expired',playerId:p.id,text:p.name+' 经营任务到期'});}
 if(m.coupon&&p.opportunities.lapEpoch>=m.coupon.expiresAtLap){m.coupon=null;events.push({type:'mission',kind:'mission_coupon_expired',playerId:p.id,text:p.name+' 任务奖励券到期'});}
}
function clear(s,p){if(enabled(s)){p.businessMission.active=null;p.businessMission.coupon=null;}}
function view(s,id){const p=s.players.find(p=>p.id===id);return enabled(s)&&p?{...globalThis.structuredClone(p.businessMission),catalog:CATALOG,quotes:Object.fromEntries(['build','flight','abandon'].map(t=>[t,quote(s,id,t)])),lapEpoch:p.opportunities.lapEpoch}:null;}
module.exports={REVISION,enabled,initial,quote,apply,couponOffer,observe,onGo,clear,view,CATALOG};
