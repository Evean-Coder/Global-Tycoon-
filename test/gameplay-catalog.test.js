'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {NEWS,OPPORTUNITIES,REGIONS}=require('../src/gameplayCatalog');
test('定义五类资讯目录 / 定义十二项机遇目录',()=>{assert.equal(Object.keys(NEWS).length,5);assert.equal(OPPORTUNITIES.length,12);assert.equal(new Set(OPPORTUNITIES.map(o=>o.id)).size,12);assert.equal(REGIONS.length,5);for(const o of OPPORTUNITIES)assert.ok(!/海克斯|世界事件|强化池/.test(o.description));});
