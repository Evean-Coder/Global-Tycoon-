'use strict';
const crypto = require('node:crypto');
const { PREFERENCES, digest } = require('./config');

function combinations(items, n) {
  if (n === 0) return [[]];
  return items.flatMap((value, i) => combinations(items.slice(i + 1), n - 1).map(tail => [value, ...tail]));
}
function permutations(items) {
  if (items.length === 0) return [[]];
  return items.flatMap((value, i) => permutations(items.filter((_, j) => j !== i)).map(tail => [value, ...tail]));
}
function deriveSeed(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest().readUInt32BE(0);
}
function buildSchedule(config) {
  const used = new Set(), schedule = [];
  const experiments = [];
  if (config.source === 'debug') experiments.push({ experiment: 'debug', n: config.debug.players, roster: Array(config.debug.players).fill('neutral'), count: config.debug.games });
  else if (config.source === 'formal') {
    for (const n of [2, 3, 4]) experiments.push({ experiment: 'neutral', n, roster: Array(n).fill('neutral'), count: config.sampleTargets.neutralSeeds });
    for (const n of [2, 3, 4]) for (const roster of combinations(PREFERENCES, n)) experiments.push({ experiment: 'cross', n, roster, count: config.sampleTargets.crossSeeds });
  } else throw new Error('计划来源必须为formal或debug');

  for (let ordinal = 0; ordinal < Math.max(...experiments.map(e => e.count)); ordinal++) {
    for (const e of experiments) {
      if (ordinal >= e.count) continue;
      const coordinates = [config.seedPrefix, e.experiment, e.n, e.roster.join(','), ordinal];
      let salt = 0;
      let engineSeed = config.source === 'debug' ? (config.debug.seed + ordinal) >>> 0 : deriveSeed(coordinates);
      while (used.has(engineSeed)) engineSeed = deriveSeed([...coordinates, 'salt', ++salt]);
      used.add(engineSeed);
      const groupId = 'g-' + digest(coordinates).slice(0, 20);
      const arrangements = e.experiment === 'cross' ? permutations(e.roster) : [e.roster];
      for (let permutation = 0; permutation < arrangements.length; permutation++) {
        const policiesBySeat = arrangements[permutation].slice();
        const policySeedsByPlayer = Object.fromEntries(policiesBySeat.map((policy, seat) => [`p${seat}`, deriveSeed([...coordinates, 'policy', policy === 'neutral' ? `seat${seat}` : policy])]));
        schedule.push({
          sampleId: 's-' + digest([config.configHash, groupId, permutation]).slice(0, 24), groupId,
          experiment: e.experiment, roster: e.roster.slice(), seedOrdinal: ordinal, permutation, seedSalt: salt,
          players: e.n, policiesBySeat, engineSeed, policySeedsByPlayer,
          choiceRule: config.choiceRules, source: config.source,
          limits: config.limits, configHash: config.configHash,
          policyVersion: config.policyVersion, analysisVersion: config.analysisVersion, ruleVersion: 2,
        });
      }
    }
  }
  if (new Set(schedule.map(s => s.sampleId)).size !== schedule.length) throw new Error('样本标识碰撞');
  return schedule;
}
module.exports = { combinations, permutations, deriveSeed, buildSchedule };
