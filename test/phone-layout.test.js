'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),policy=require('../public/phone-layout');
const phone=(width,height,extra={})=>policy.compute({phone:true,physicalLandscape:true,layoutWidth:width,layoutHeight:height,...extra});
test('normal target region fits complete original board, including the smallest boundary',()=>{
 for(const width of [568,569,640,693,844,932,1280,1467])for(const height of [260,261,280,320,360,390,480,600]){
  const p=phone(width,height);assert.equal(p.mapMode,'overview',JSON.stringify({width,height,p}));assert.ok(p.boardWidth+p.sideWidth+12<=width+.01);assert.ok(p.boardHeight+p.headerHeight+p.footerHeight+12<=height+.01);
 }
});
test('automatic fallback recovers independently of explicit user zoom',()=>{
 assert.equal(phone(569,220).mapMode,'scroll');assert.equal(phone(693,390).mapMode,'overview');assert.equal(phone(693,390,{userZoom:true}).mapMode,'zoom');assert.equal(phone(480,220,{userZoom:true}).mapMode,'zoom');
 assert.equal(phone(480,220).mapMode,'scroll');assert.equal(phone(844,390).mapMode,'overview');
});
test('intersecting visible and safe rectangles avoids deducting the same right/bottom area twice',()=>{
 const full=phone(844,390,{safeRight:24,safeTop:12,safeBottom:20});assert.equal(full.availableWidth,820);assert.equal(full.availableHeight,358);
 const already=phone(844,390,{visibleWidth:820,visibleHeight:370,safeRight:24,safeBottom:20});assert.equal(already.availableWidth,820);assert.equal(already.availableHeight,370);assert.equal(already.safeRight,0);assert.equal(already.safeBottom,0);
 const keyboard=phone(844,390,{offsetTop:20,visibleHeight:200,safeTop:12,safeBottom:20});assert.equal(keyboard.modalRect.top,20);assert.equal(keyboard.modalRect.height,200);
});
test('pinch zoom keeps the original layout size while preserving the requested scale',()=>{
 const p=phone(844,390,{visibleWidth:422,visibleHeight:195,scale:2,previousUnzoomedSize:{width:844,height:390}});assert.equal(p.frameWidth,844);assert.equal(p.frameHeight,390);assert.equal(p.scale,2);assert.equal(p.mapMode,'overview');
});
test('continuous and malformed inputs stay finite, pure, and do not classify desktops as phones',()=>{
 for(let width=480;width<=1500;width+=37)for(let height=180;height<=640;height+=29){const input=Object.freeze({phone:true,layoutWidth:width,layoutHeight:height}),p=policy.compute(input);assert.ok(p.footerHeight>=44);assert.ok(p.labelFont>=8);for(const value of Object.values(p))if(typeof value==='number')assert.ok(Number.isFinite(value));}
 for(const value of [NaN,Infinity,-1,null,undefined]){const p=phone(value,value,{safeTop:value,safeRight:value,visibleHeight:value});assert.ok(p.frameWidth>0&&p.frameHeight>0);}
 assert.equal(policy.compute({layoutWidth:844,layoutHeight:390,phone:false}).active,false);
});
test('diagnostic data is an explicit layout-only projection',()=>{
 const input={phone:true,layoutWidth:844,layoutHeight:390,token:'secret',roomCode:'123456',players:['private']},p=policy.compute(input),d=policy.diagnostic(p);assert.equal(JSON.stringify(d).includes('secret'),false);assert.equal(JSON.stringify(d).includes('123456'),false);assert.deepEqual(Object.keys(d).sort(),['layout','visible','available','safe','scale','density','mapMode','reason'].sort());
});
