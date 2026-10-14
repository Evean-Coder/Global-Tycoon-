'use strict';
const REVISION='active-management-v4',OPTIONAL_REVISION='active-management-v3',REQUIRED_REVISION='active-management-v2',LEGACY_REVISION='active-management-v1';
const balanced=s=>s?.activeManagementRevision===REVISION;
const enabled=s=>[REVISION,OPTIONAL_REVISION,REQUIRED_REVISION,LEGACY_REVISION].includes(s?.activeManagementRevision);
const modern=s=>[REVISION,OPTIONAL_REVISION,REQUIRED_REVISION].includes(s?.activeManagementRevision);
const optional=s=>[REVISION,OPTIONAL_REVISION].includes(s?.activeManagementRevision);
const playerModern=p=>[REVISION,OPTIONAL_REVISION,REQUIRED_REVISION].includes(p?.opportunities?.revision);
const emergencyAmount=p=>playerModern(p)?10000:6000;
module.exports={REVISION,OPTIONAL_REVISION,REQUIRED_REVISION,LEGACY_REVISION,enabled,balanced,optional,modern,playerModern,emergencyAmount};
