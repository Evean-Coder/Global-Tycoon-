'use strict';
(function(root){
 function mode(width,height){if(width>=360&&width<=1200&&height<=600&&width>height)return 'landscape';return 'perimeter';}
 function position(id){
  if(!Number.isInteger(id)||id<0||id>41)throw new Error('地块编号无效');
  if(id<=11)return [1,id+1];if(id<=20)return [id-10,12];if(id===21)return [11,12];if(id<=31)return [11,33-id];if(id===32)return [11,1];return [43-id,1];
 }
 const api={mode,position};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BoardLayout=api;
})(typeof window!=='undefined'?window:globalThis);
