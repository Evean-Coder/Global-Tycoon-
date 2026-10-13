'use strict';
(function(root){
  function isPhone(e){return !!e.mobileUA||!!e.coarse&&Math.min(e.screenWidth,e.screenHeight)<=600;}
  function isLandscape(e){return e.width>e.height&&(e.orientationType?e.orientationType.startsWith('landscape'):e.screenWidth>e.screenHeight);}
  function create({active,key,onLandscape}){
    const gate=document.getElementById('orientationGate'),button=document.getElementById('btnLandscape'),status=document.getElementById('orientationStatus');
    const inertBefore=new Map();let blocked=false,busy=false,entryKey=null,previousFocus=null,ownedLock=false,ownedFullscreen=false;
    const environment=()=>({width:window.innerWidth,height:window.innerHeight,screenWidth:window.screen.width,screenHeight:window.screen.height,orientationType:window.screen.orientation?.type||'',coarse:window.matchMedia('(pointer: coarse)').matches,mobileUA:navigator.userAgentData?.mobile||/iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent)});
    function focus(){if(blocked&&!gate.contains(document.activeElement))document.getElementById('orientationTitle').focus({preventScroll:true});}
    function release(){if(ownedLock){window.screen.orientation?.unlock?.();ownedLock=false;}if(ownedFullscreen&&document.fullscreenElement){document.exitFullscreen?.().catch(()=>{});ownedFullscreen=false;}}
    function sync(auto=true){
      const e=environment(),enabled=active()&&isPhone(e),next=enabled&&!isLandscape(e),changed=blocked!==next;
      blocked=next;gate.classList.toggle('hidden',!blocked);document.body.classList.toggle('orientation-blocked',blocked);
      if(blocked){
        if(changed)previousFocus=document.activeElement;
        for(const el of document.body.children)if(el!==gate&&!['SCRIPT','STYLE'].includes(el.tagName)){if(!inertBefore.has(el))inertBefore.set(el,el.inert);el.inert=true;}
        focus();
      }else{
        for(const [el,value]of inertBefore)el.inert=value;inertBefore.clear();
        if(changed&&previousFocus?.isConnected&&!previousFocus.closest('.hidden'))previousFocus.focus({preventScroll:true});
        if(changed&&enabled)onLandscape?.();
      }
      if(!enabled){entryKey=null;release();}
      else if(auto&&key()!==entryKey){entryKey=key();void request(false);}
      return blocked;
    }
    async function request(fullscreen){
      if(busy||!active()||!isPhone(environment()))return;
      const orientation=window.screen.orientation;
      if(typeof orientation?.lock!=='function'){status.textContent='此浏览器不能自动横屏。请开启自动旋转，并将手机横放。';return;}
      busy=true;button.disabled=true;status.textContent='正在尝试切换横屏…';let timer;
      try{
        const attempt=async()=>{
          if(fullscreen&&!document.fullscreenElement&&document.documentElement.requestFullscreen){await document.documentElement.requestFullscreen();ownedFullscreen=true;}
          await orientation.lock('landscape');ownedLock=true;if(!active())release();
        };
        await Promise.race([attempt(),new Promise((_,reject)=>{timer=window.setTimeout(()=>reject(new Error('rotation timeout')),2000);})]);
        status.textContent='请将手机横放；检测到横屏后会自动继续。';
      }catch{status.textContent='浏览器未能自动切换。请开启系统自动旋转（iPhone关闭竖屏锁定），再横放手机。';}
      finally{window.clearTimeout(timer);busy=false;button.disabled=false;sync(false);}
    }
    button.onclick=()=>{void request(true);};
    document.addEventListener('focusin',focus);
    gate.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();}if(event.key==='Tab'){event.preventDefault();button.focus({preventScroll:true});}});
    for(const event of ['resize','orientationchange'])window.addEventListener(event,()=>sync());
    document.addEventListener('fullscreenchange',()=>sync());window.screen.orientation?.addEventListener?.('change',()=>sync());window.visualViewport?.addEventListener('resize',()=>sync());
    return {sync,request,isBlocked:()=>blocked,isPhone:()=>isPhone(environment()),isLandscape:()=>isLandscape(environment()),focus};
  }
  const api={isPhone,isLandscape,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MobileOrientation=api;
})(typeof window!=='undefined'?window:globalThis);
