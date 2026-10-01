'use strict';
const { createGameState, resetDeck } = require('../../src/state');
const { createRng } = require('../../src/random');
const { beginOpportunityStage } = require('../../src/opportunities');

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
module.exports = { controlledFixture, ownCity, grant };
