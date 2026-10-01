'use strict';
const { createGameState, resetDeck } = require('../../src/state');
const { createRng } = require('../../src/random');
const { beginOpportunityStage } = require('../../src/opportunities');
const { buildConfig, parseArgs } = require('../../scripts/balance/config');
const { buildSchedule } = require('../../scripts/balance/schedule');

// Controlled test fixtures are never imported by the batch entry or policy.
function controlledFixture({ players = 2, seed = 22, setup = () => {} } = {}) {
  const state = createGameState('BALANCE_CONTROLLED', Array.from({ length: players }, (_, i) => `测试${i}`));
  const rng = createRng(seed);
  resetDeck(state, rng);
  beginOpportunityStage(state, 1, { kind: 'start' }, rng);
  setup(state);
  return { source: 'controlled', state, seed };
}
function ownCity(state, playerId, cityId, level = 0) {
  const c = state.cities[cityId];
  if (c.ownerId) state.players.find(p => p.id === c.ownerId).cities = state.players.find(p => p.id === c.ownerId).cities.filter(id => id !== cityId);
  c.ownerId = playerId; c.houseLevel = level;
  c.buildCosts = Array.from({ length: level }, () => c.price * 0.6);
  const p = state.players.find(p => p.id === playerId);
  if (!p.cities.includes(cityId)) p.cities.push(cityId);
}
function grant(state, playerId, ids) {
  const o = state.players.find(p => p.id === playerId).opportunities;
  o.selectedIds = ids.slice();
  o.usage = Object.fromEntries(ids.map(id => [id, 0]));
}
function gameSpec(players = 2, source = 'debug', limits = {}) {
  const config = buildConfig(parseArgs(['--games', '1', '--players', String(players)]), { hash: 'controlled-test', commit: 'test', worktree: '', files: [] });
  const spec = buildSchedule(config)[0];
  return { ...spec, source, limits: { ...spec.limits, ...limits } };
}
function temporaryRun(t, { games = 2, players = 2, limits = { rounds: 3, actions: 100 } } = {}) {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'balance-run-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fingerprint = { hash: 'fixture', commit: null, worktree: '', files: [] };
  const config = globalThis.structuredClone(buildConfig({ mode: 'debug', games, players, seed: 22, output: 'artifacts/gameplay-balance/run' }, fingerprint));
  config.limits = { ...config.limits, ...limits };
  config.configHash = require('../../scripts/balance/config').hashConfig(config);
  return { root, fingerprint, config };
}
module.exports = { controlledFixture, ownCity, grant, gameSpec, temporaryRun };
