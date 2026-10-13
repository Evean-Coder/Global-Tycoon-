'use strict';
const REVISION='active-management-v3',REQUIRED_REVISION='active-management-v2',LEGACY_REVISION='active-management-v1';
const modern=s=>[REVISION,REQUIRED_REVISION].includes(s?.activeManagementRevision);
const optional=s=>s?.activeManagementRevision===REVISION;
const playerModern=p=>[REVISION,REQUIRED_REVISION].includes(p?.opportunities?.revision);
const emergencyAmount=p=>playerModern(p)?10000:6000;
module.exports={REVISION,REQUIRED_REVISION,LEGACY_REVISION,optional,modern,playerModern,emergencyAmount};
