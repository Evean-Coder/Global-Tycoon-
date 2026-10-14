'use strict';
(function(root){
 const shortNames={'卡萨布兰卡':'卡萨','阿姆斯特丹':'阿姆','墨西哥城':'墨城','里约热内卢':'里约','开罗国际机场':'开罗','伦敦希思罗国际机场':'希思罗','纽约肯尼迪国际机场':'肯尼迪','上海浦东国际机场':'浦东'};
 const labels={start:'起点',city:'地产',airport:'机场',chance:'机会',rest:'休闲',jail:'监狱',pole:'极地'};
 const paths={city:'M2 8L8 2l6 6M4 7v7h8V7M7 14V9h2v5',airport:'M8 1v13M2 7l6-3 6 3M5 14l3-2 3 2',start:'M3 13L13 3M5 3h8v8',chance:'M5 5a3 3 0 116 0c0 2-3 2-3 5M8 13v1',rest:'M8 4a4 4 0 100 8 4 4 0 000-8M8 1v1M8 14v1M1 8h1M14 8h1',jail:'M2 2h12v12H2zM5 2v12M8 2v12M11 2v12',pole:'M8 1v14M2 4l12 8M2 12l12-8'};
 function icon(kind){return '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="'+(paths[kind]||paths.chance)+'" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';}
 function tile(square,state){
  const value= square.type==='city'?square.cityId:square.type==='airport'?square.airportId:square.name||labels[square.type]||'地块';
  const city=square.type==='city'?state.cities[square.cityId]:null,airport=square.type==='airport'?state.airports[square.airportId]:null;
  const owner=state.players.find(p=>p.id===(city||airport)?.ownerId),color=owner&&/^#[0-9a-f]{6}$/i.test(owner.color)?owner.color:null;
  return {fullLabel:city?(city.country?city.country+'·':'')+value:value,shortLabel:shortNames[value]||value,kindLabel:labels[square.type],glyph:icon(square.type),ownerId:owner?.id||null,ownerColor:color,ownerSeat:owner?owner.seat+1:null,ownerName:owner?.name||'无主',group:city?.group||null};
 }
 const api={tile,icon};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BoardPresentation=api;
})(typeof window!=='undefined'?window:globalThis);
