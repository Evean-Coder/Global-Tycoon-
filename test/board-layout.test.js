'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),layout=require('../public/board-layout');
test('compact route has 42 unique adjacent positions; resizing preserves identifiers',()=>{
 const seen=new Set();let prev;
 for(let id=0;id<42;id++){const p=layout.position(id,'compact');assert.ok(p[0]>=1&&p[0]<=7&&p[1]>=1&&p[1]<=6);assert.ok(!seen.has(String(p)));seen.add(String(p));if(prev)assert.equal(Math.abs(p[0]-prev[0])+Math.abs(p[1]-prev[1]),1);prev=p;}
 assert.equal(layout.mode(390,844),'compact');assert.equal(layout.mode(844,390),'compact');assert.equal(layout.mode(844,280),'compact');assert.equal(layout.mode(768,1024),'perimeter');assert.equal(layout.mode(1440,900),'perimeter');
 assert.deepEqual(layout.position(0,'perimeter'),[1,1]);assert.deepEqual(layout.position(41,'perimeter'),[2,1]);
});
