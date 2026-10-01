'use strict';
const {createGameState}=require('../../src/state');
const {createRng}=require('../../src/random');
const stocks=require('../../src/stocks');
function game(n=3,version=2){return createGameState('TEST',Array.from({length:n},(_,i)=>'玩家'+i),version);}
function own(s,pid,...ids){const p=s.players.find(p=>p.id===pid);for(const id of ids){s.cities[id].ownerId=pid;p.cities.push(id);s.cities[id].buildReady=true;stocks.initializeListing(s,id);}}
function selected(s,pid,...ids){s.players.find(p=>p.id===pid).opportunities.selectedIds.push(...ids);}
function fakeClock(){let now=0,seq=0;const timers=new Map();return {now:()=>now,setTimeout:(fn,delay)=>{const id=++seq;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),advance(ms){now+=ms;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};}
function order(s,cityId,side,shares){return {cityId,side,shares,quoteVersion:s.stocks[cityId].quoteVersion,listingEpoch:s.stocks[cityId].listingEpoch};}
module.exports={game,own,selected,fakeClock,order,rng:()=>createRng(22)};
