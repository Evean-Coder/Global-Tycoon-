'use strict';
const { createRng } = require('../../src/random');

function createTrackedRng(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('随机种子必须为32位无符号整数');
  const inner = createRng(seed);
  let calls = 0;
  const rng = () => { calls++; return inner(); };
  Object.defineProperties(rng, { seed: { value: seed }, calls: { get: () => calls } });
  return rng;
}
module.exports = { createTrackedRng };
