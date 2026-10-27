'use strict';
(function(root){
 const valid=(n,fallback)=>Number.isFinite(n)&&n>0?n:fallback;
 const nonnegative=n=>Number.isFinite(n)?Math.max(0,n):0;
 const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
 function compute(sample={}){
  const scale=valid(sample.scale,1),magnified=scale>1.02,prior=magnified?sample.previousUnzoomedSize:null;
  const width=valid(prior?.width,valid(sample.layoutWidth,844)),height=valid(prior?.height,valid(sample.layoutHeight,390));
  const visible=magnified?{left:0,top:0,right:width,bottom:height}:{left:clamp(nonnegative(sample.offsetLeft),0,width-1),top:clamp(nonnegative(sample.offsetTop),0,height-1)};
  if(!magnified){visible.right=Math.min(width,visible.left+valid(sample.visibleWidth,width));visible.bottom=Math.min(height,visible.top+valid(sample.visibleHeight,height));}
  const safe={left:0,top:clamp(nonnegative(sample.safeTop),0,height-1),right:width-clamp(nonnegative(sample.safeRight),0,width-1),bottom:height-clamp(nonnegative(sample.safeBottom),0,height-1)};
  const left=visible.left,top=Math.max(visible.top,safe.top),right=Math.max(left+1,Math.min(visible.right,safe.right)),bottom=Math.max(top+1,Math.min(visible.bottom,safe.bottom));
  const availableWidth=right-left,availableHeight=bottom-top;
  const active=!!sample.phone&&(typeof sample.physicalLandscape==='boolean'?sample.physicalLandscape:width>height);
  const footerHeight=availableWidth>=236?44:92,mainWidth=Math.max(1,availableWidth-8),gap=4;
  function candidate(headerHeight){
   const boardHeight=Math.max(1,availableHeight-headerHeight-footerHeight-12),stacked=boardHeight>=278,minWidth=stacked?399:483,minHeight=stacked?278:180;
   const target=clamp(availableWidth*.23,128,240),sideWidth=Math.min(target,Math.max(72,mainWidth-gap-minWidth));
   const boardWidth=Math.max(1,mainWidth-gap-sideWidth);
   return {headerHeight,boardHeight,boardWidth,sideWidth,minWidth,minHeight,fits:boardWidth>=minWidth&&boardHeight>=minHeight};
  }
  const candidates=[candidate(44),candidate(24)],choice=candidates.find(c=>c.fits)||candidates[1];
  const mapMode=sample.userZoom?'zoom':choice.fits?'overview':'scroll';
  const minBoardWidth=mapMode==='zoom'?553:mapMode==='scroll'?choice.minWidth:0,minBoardHeight=mapMode==='zoom'?366:mapMode==='scroll'?choice.minHeight:0;
  const tileWidth=(Math.max(choice.boardWidth,minBoardWidth)-15)/12,tileHeight=(Math.max(choice.boardHeight,minBoardHeight)-14)/11,stacked=tileHeight>=24;
  const numberFont=stacked?(tileWidth>=40?9.5:8):tileWidth>=50?8:6.5,numberWidth=Math.ceil(numberFont*1.2),glyphSize=stacked||tileWidth>=50?8:5;
  const labelSpace=stacked?tileWidth-4:tileWidth-2-numberWidth-glyphSize;
  const labelFont=clamp(Math.floor(labelSpace/3*10)/10,8,12);
  return {active,width,height,scale,magnified,frameWidth:visible.right-visible.left,frameHeight:visible.bottom-visible.top,availableWidth,availableHeight,
   safeTop:Math.max(0,top-visible.top),safeRight:Math.max(0,visible.right-right),safeBottom:Math.max(0,visible.bottom-bottom),
   modalRect:{left,top,width:availableWidth,height:availableHeight},density:choice.fits?(choice.headerHeight===44?'standard':'short'):'constrained',
   ...choice,footerHeight,mapMode,minBoardWidth,minBoardHeight,tileLayout:stacked?'stacked':'inline',labelFont,numberFont,numberWidth,glyphSize,
   reasonCode:sample.userZoom?'user_zoom':choice.fits?'fits':choice.boardHeight<choice.minHeight?'short_height':'narrow_width'};
 }
 const reasons={fits:'完整42格 · 点击地块查看详情',short_height:'当前可见高度较小，棋盘可滑动；可收起浏览器工具栏或尝试全屏',narrow_width:'当前可见宽度较小，棋盘可滑动查看全部地块',user_zoom:'已主动放大地图 · 可恢复默认视图',layout_feedback:'布局变化较频繁，已保留可滑动地图；旋转屏幕或恢复默认视图可重新适配'};
 function diagnostic(layout){
  return {layout:{width:layout.width,height:layout.height},visible:{width:layout.frameWidth,height:layout.frameHeight},available:{width:layout.availableWidth,height:layout.availableHeight},
   safe:{top:layout.safeTop,right:layout.safeRight,bottom:layout.safeBottom,left:0},scale:layout.scale,density:layout.density,mapMode:layout.mapMode,reason:layout.reasonCode};
 }
 const api={compute,diagnostic,reason:code=>reasons[code]||'按当前可见空间显示'};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PhoneLayout=api;
})(typeof window!=='undefined'?window:globalThis);
