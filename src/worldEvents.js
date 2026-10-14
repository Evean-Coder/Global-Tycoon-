'use strict';
const {shuffle}=require('./random');
const {REGIONS,NEWS}=require('./gameplayCatalog');
const REVISION='world-news-v2';
function effectRules(s){return s.worldRevision===REVISION?{rentPercent:30,rentCap:6000,buildPercent:25,buildCap:3000,flightPercent:40,flightCap:60,orderPercent:10,orderCap:150}:{rentPercent:15,rentCap:3000,buildPercent:15,buildCap:2000,flightPercent:30,flightCap:require('./managementRules').modern(s)?60:50,orderPercent:0,orderCap:0};}
function createWorld(){return {status:'waiting',active:null,preview:null,roundsCompleted:0,constructionUsedIds:[],typeBag:[],regionBags:{boom:[],slowdown:[]},lastType:null,sequence:0};}
function draw(state,rng){
 const w=state.world;
 if(!w.typeBag.length){
  const allowed=Object.keys(NEWS).filter(t=>t!==w.lastType);
  const first=allowed[Math.floor(rng()*allowed.length)];
  w.typeBag=[first,...shuffle(Object.keys(NEWS).filter(t=>t!==first),rng)];
 }
 const type=w.typeBag.shift();w.lastType=type;
 let region=null;
 if(type==='boom'||type==='slowdown'){
  if(!w.regionBags[type].length)w.regionBags[type]=shuffle(REGIONS,rng);
  region=w.regionBags[type].shift();
 }
 const catalog=require('./gameplayCatalog').catalogForWorld(state);
 return {id:++w.sequence,type,region,name:catalog[type].name,description:catalog[type].description,remaining:3};
}
function advanceWorld(state,rng,events){
 const w=state.world;
 if(w.status==='stopped')return;
 if(w.status==='waiting'){
  if(!state.firstRoundDone)return;
  w.status='running';w.active=draw(state,rng);
  events.push({type:'news',kind:'news',text:'环球资讯：'+w.active.name+(w.active.region?' · '+w.active.region:''),news:{...w.active}});
  return;
 }
 w.roundsCompleted++;w.active.remaining--;
 if(w.active.remaining===1){w.preview=draw(state,rng);events.push({type:'news',kind:'news',text:'下轮预告：'+w.preview.name+(w.preview.region?' · '+w.preview.region:''),news:{...w.preview}});}
 if(w.active.remaining===0){w.active=w.preview||draw(state,rng);w.active.remaining=3;w.preview=null;events.push({type:'news',kind:'news',text:'环球资讯更新：'+w.active.name+(w.active.region?' · '+w.active.region:''),news:{...w.active}});}
}
module.exports={REVISION,effectRules,createWorld,draw,advanceWorld};
