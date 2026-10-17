'use strict';
const {createGameState}=require('../../src/state'),f=require('./gameplayFixtures');
const options={managementEconomyRevision:'management-economy-v1',activeManagementRevision:'active-management-v4',stockInvestmentRevision:'stock-investment-v2',worldRevision:'world-news-v2',disconnectRevision:'disconnect-v1'};
function state(n=2){const s=createGameState('ME',Array.from({length:n},(_,i)=>'玩家'+i),2,options);s.firstRoundDone=true;f.own(s,'p0','内罗毕');f.own(s,'p1','开罗');return s;}
function turn(s,id){s.turnIndex=s.players.findIndex(p=>p.id===id);s.turnId++;s.revision++;s.phase='waiting_roll';s.pending=null;}
function bid(s,id='p0',cityId='内罗毕',amount=100){const cc=require('../../src/commercialCompetition');return cc.quoteBid(s,id,{periodId:s.commercialCompetition.currentPeriod?.periodId,region:s.cities[cityId].continent,cityId,amount});}
function advantage(s,cityId='内罗毕',playerId='p0'){const a={advantageId:'test:'+cityId,playerId,cityId,listingEpoch:s.stocks[cityId].listingEpoch,ownershipEpoch:s.cities[cityId].ownershipEpoch,startsRound:s.roundFlow.index,expiresAfterRound:s.roundFlow.index+3,remainingHits:2,endedReason:null};s.commercialCompetition.advantages.push(a);return a;}
module.exports={state,options,turn,bid,advantage,...f};
