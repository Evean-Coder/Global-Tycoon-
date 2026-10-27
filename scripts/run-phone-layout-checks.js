'use strict';
// Each engine runs in an isolated test process; a missing browser is a failure.
const {spawnSync}=require('node:child_process');
const engines=process.argv.includes('--webkit-only')?['webkit']:process.argv.includes('--chromium-only')?['chromium']:['chromium','webkit'];
for(const engine of engines){
 console.log('Phone layout checks: '+engine);
 const result=spawnSync(process.execPath,['--test','--test-force-exit','--test-concurrency=1','e2e/phone-aspect.spec.js','e2e/phone-viewport.spec.js','e2e/phone-dialogs.spec.js'],{stdio:'inherit',env:{...process.env,CI:'1',PHONE_TEST_BROWSER:engine}});
 if(result.error){console.error(result.error.message);process.exit(1);}if(result.status!==0)process.exit(result.status||1);
}
