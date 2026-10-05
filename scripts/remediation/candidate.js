'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { digest } = require('../light-balance/control');
const SCHEDULE = Object.freeze([{ completed: 0, amount: 10000 }, { completed: 40, amount: 5000 }, { completed: 80, amount: 2000 }]);
function amount(completed) { return completed >= 80 ? 2000 : completed >= 40 ? 5000 : 10000; }
function compile() {
  const file = path.resolve(__dirname, '../../src/gameLogic.js'), original = fs.readFileSync(file, 'utf8');
  const marker = 'function settleGo(state, player, events) {';
  if (original.split(marker).length !== 2) throw new Error('起点结算源码结构变化，停止候选');
  const source = original.replace(marker, marker + '\n  const GO_BONUS = state.ruleVersion === 2 && state.roundFlow ? (state.roundFlow.index - 1 >= 80 ? 2000 : state.roundFlow.index - 1 >= 40 ? 5000 : 10000) : 10000;');
  const isolated = new Module(file, module);
  isolated.filename = file; isolated.paths = Module._nodeModulePaths(path.dirname(file));
  isolated._compile(source, file);
  return { apply: isolated.exports.apply, originalHash: digest(original), candidateHash: digest(source), source, schedule: SCHEDULE };
}
module.exports = { amount, compile, SCHEDULE };
