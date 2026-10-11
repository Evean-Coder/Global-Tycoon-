'use strict';
const {createGameState,snapshot}=require('../../src/state');
const stocks=require('../../src/stocks'),logic=require('../../src/gameLogic'),{normalizeAction}=require('../../src/actionValidation');
function game(n=2){
  const s=createGameState('SMART',Array.from({length:n},(_,i)=>'玩家'+i),2,{routeRevision:'opportunity-routes-v1',gameMode:'normal',activeManagementRevision:'active-management-v1',propertySupportRevision:'property-support-v1',economyRevision:'travel-expense-v1'});
  s.phase='waiting_roll';s.pending=null;s.firstRoundDone=true;s.turnIndex=1;return s;
}
function own(s,id,pid='p1',level=0){stocks.transferCity(s,{cityId:id,newOwnerId:pid},[]);s.cities[id].houseLevel=level;s.cities[id].buildReady=true;s.cities[id].buildCosts=Array(level).fill(Math.round(s.cities[id].price*.6));return s.cities[id];}
function held(s,id,pid,shares){s.stocks[id].holders[pid]=shares;stocks.syncHolders(s);}
function window(s){stocks.openStockWindow(s,'p1');s.phase='stock';s.pending={playerId:'p1',kind:'go_stock',after:'end'};}
function view(s,extra={}){return {...snapshot(s,'p1',{decisionId:1}),...extra};}
function apply(s,a){const n=normalizeAction(s,a,{actorId:'p1',source:'player',timeContext:{mode:'normal',elapsedMs:null,totalRemainingMs:null,closed:false}});if(!n.ok)throw new Error(n.error+' '+JSON.stringify(a));return logic.apply(s,n.action,()=>.3,{actorId:'p1',source:'player',timeContext:{mode:'normal',elapsedMs:null,totalRemainingMs:null,closed:false}});}
module.exports={game,own,held,window,view,apply};
