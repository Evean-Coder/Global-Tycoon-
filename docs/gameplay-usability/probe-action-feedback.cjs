'use strict';
const fs=require('node:fs'),path=require('node:path'),{boot}=require('../../e2e/helpers/browserHarness'),f=require('../../test/helpers/gameplayFixtures');
let h;const result={at:new Date().toISOString(),scope:'本地触控、受控延迟回执及主动断线；不改变正式源码'};
async function main(){
 h=await boot({viewport:{width:812,height:375},mobile:true});await h.choose();const page=h.pages[0];await page.evaluate(()=>setInterval(()=>window.__fixtureRevision=latestState?.revision||0,10));
 const state=()=>{const s=f.game(2);f.own(s,'p0','上海','东京');return s;};await h.fixture(state());await page.locator('#btnBank').tap();
 await page.evaluate(()=>{window.__originalTimeout=socket.timeout.bind(socket);window.__sent=0;socket.timeout=ms=>({emit(ev,data,cb){if(ev==='action')window.__sent++;return window.__originalTimeout(ms).emit(ev,data,(err,res)=>{window.__release=()=>cb(err,res);});}});});
 const before=await page.textContent('#toast');await page.locator('#modalBody .lrow button').first().tap();await page.waitForFunction(()=>!!window.__release);await page.locator('#btnBank').tap();await page.locator('#modalBody .lrow button').last().tap();
 result.pending=await page.evaluate(before=>({sent:window.__sent,actionPending,toastChanged:document.getElementById('toast').textContent!==before,secondButtonDisabled:document.querySelector('#modalBody .lrow:last-child button').disabled}),before);
 result.pending.secondMortgageApplied=h.room.state.cities['东京'].mortgaged;
 await page.evaluate(()=>{window.__release();socket.timeout=window.__originalTimeout;});await h.fixture(state());await page.locator('#btnBank').tap();await page.evaluate(()=>socket.disconnect());
 const offlineBefore=await page.textContent('#toast');await page.locator('#modalBody .lrow button').first().tap();
 result.offline=await page.evaluate(before=>({connected:socket.connected,actionPending,toastChanged:document.getElementById('toast').textContent!==before,sendBuffer:socket.sendBuffer.length}),offlineBefore);result.offline.mortgageApplied=h.room.state.cities['上海'].mortgaged;result.pageErrors=h.errors;
}
main().catch(e=>{result.error=e.message;process.exitCode=1;}).finally(async()=>{if(h)await h.close();fs.writeFileSync(path.join(__dirname,'action-feedback.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));});
