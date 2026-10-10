'use strict';
const crypto=require('node:crypto');
const clone=value=>JSON.parse(JSON.stringify(value));
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
function diff(before,after,path=[],out=[]){
 if(JSON.stringify(before)===JSON.stringify(after))return out;
 if(before&&after&&typeof before==='object'&&typeof after==='object'&&Array.isArray(before)===Array.isArray(after)&&(!Array.isArray(before)||before.length===after.length)){
  for(const key of Object.keys(before))if(!Object.hasOwn(after,key))out.push({path:[...path,key],remove:true});
  for(const key of Object.keys(after))diff(before[key],after[key],[...path,key],out);
 }else out.push({path,value:clone(after)});
 return out;
}
function capture(room,metadata={source:'system'}){
 const s=room.state;if(!s||(!s.activeManagementRevision&&!s.propertySupportRevision))return;
 const next=clone(s);
 if(!room.privateReplay||room.privateReplay.gameId!==s.gameId)room.privateReplay={schema:'global-tycoon.private-replay.v1',gameId:s.gameId,initial:next,frames:[],last:next};
 else{
  const journal=room.privateReplay,changes=diff(journal.last,next);
  if(changes.length)journal.frames.push({metadata:clone(metadata),changes,hash:digest(next)});
  journal.last=next;
 }
}
function exportJournal(room){if(!room.privateReplay)return null;const {last,...journal}=room.privateReplay;return {...clone(journal),finalHash:digest(last)};}
function replay(journal){
 let state=clone(journal.initial);
 for(const frame of journal.frames){
  for(const change of frame.changes){
   if(change.path.some(key=>['__proto__','prototype','constructor'].includes(key)))throw new Error('回放路径无效');
   if(!change.path.length){state=clone(change.value);continue;}
   let target=state;for(const key of change.path.slice(0,-1))target=target[key];const key=change.path.at(-1);
   if(change.remove)delete target[key];else target[key]=clone(change.value);
  }
  if(digest(state)!==frame.hash)throw new Error('回放状态校验失败');
 }
 if(digest(state)!==journal.finalHash)throw new Error('回放终局校验失败');
 return state;
}
module.exports={capture,exportJournal,replay};
