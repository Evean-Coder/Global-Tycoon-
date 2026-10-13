'use strict';
const REVISION='active-management-v2',LEGACY_REVISION='active-management-v1';
const modern=s=>s?.activeManagementRevision===REVISION;
const playerModern=p=>p?.opportunities?.revision===REVISION;
const emergencyAmount=p=>playerModern(p)?10000:6000;
module.exports={REVISION,LEGACY_REVISION,modern,playerModern,emergencyAmount};
