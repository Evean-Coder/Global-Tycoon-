'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createGameState}=require('../src/state'),presentation=require('../public/board-presentation'),layout=require('../public/board-layout');
test('compact perimeter has42 unique neighbours including last to first and preserves original mapping',()=>{
 const seen=new Set();for(let id=0;id<42;id++){const p=layout.position(id,'compact-landscape');assert.deepEqual(p,layout.position(id));const n=layout.position((id+1)%42,'compact-landscape');assert.ok(!seen.has(String(p)));seen.add(String(p));assert.equal(Math.abs(p[0]-n[0])+Math.abs(p[1]-n[1]),1);assert.ok(p[0]>=1&&p[0]<=11&&p[1]>=1&&p[1]<=12);}
 assert.deepEqual(layout.geometry('compact-landscape').anchors,[0,11,21,32]);assert.deepEqual(layout.position(11),[1,12]);assert.equal(layout.mode(844,280,true),'compact-landscape');assert.equal(layout.mode(768,1024,true),'perimeter');assert.equal(layout.mode(844,280,false),'landscape');
});
test('all short names fit three characters, icon and full labels remain and frozen state is read-only',()=>{
 const s=createGameState('SHORT',['甲','乙','丙','丁']);function freeze(o){for(const v of Object.values(o))if(v&&typeof v==='object')freeze(v);return Object.freeze(o);}freeze(s);const before=JSON.stringify(s);
 for(const sq of s.board){const t=presentation.tile(sq,s);assert.ok(t.shortLabel.length<=3);assert.ok(t.kindLabel);assert.ok(t.glyph.includes('<svg'));assert.ok(t.fullLabel);assert.equal(t.ownerColor,null);}assert.equal(JSON.stringify(s),before);
 assert.equal(presentation.tile(s.board[4],s).shortLabel,'卡萨');assert.match(presentation.tile(s.board[4],s).fullLabel,/摩洛哥.*卡萨布兰卡/);assert.equal(presentation.tile(s.board[6],s).shortLabel,'开罗');
});
test('ownership color follows players independently from property group or pawn position',()=>{
 const s=createGameState('COLORS',['甲','乙','丙','丁']),sq=s.board[1];for(const p of s.players){s.cities[sq.cityId].ownerId=p.id;const t=presentation.tile(sq,s);assert.equal(t.ownerColor,p.color);assert.equal(t.ownerName,p.name);assert.equal(t.ownerSeat,p.seat+1);}
 s.cities[sq.cityId].mortgaged=true;assert.equal(presentation.tile(sq,s).ownerId,'p3');s.cities[sq.cityId].ownerId=null;assert.equal(presentation.tile(sq,s).ownerColor,null);s.airports[s.board[6].airportId].ownerId='p1';assert.equal(presentation.tile(s.board[6],s).ownerColor,s.players[1].color);
 s.cities[sq.cityId].ownerId='unknown';assert.equal(presentation.tile(sq,s).ownerColor,null);
});
