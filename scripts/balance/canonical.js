'use strict';
const crypto = require('node:crypto');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
}
function hashCanonical(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

// Only inert identity/connection/time metadata is removed. Revisions, quote
// versions, bags, selected candidates and economic state remain comparable.
const METADATA = new Set(['startedAt', 'endedAt', 'createdAt', 'updatedAt', 'socketId', 'reconnectToken', 'connected', 'rngSeed']);
function mapValue(value, gameId, removeMetadata) {
  if (typeof value === 'string' && gameId) return value.split(gameId).join('$GAME');
  if (Array.isArray(value)) return value.map(v => mapValue(v, gameId, removeMetadata));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined && !(removeMetadata && METADATA.has(k))).map(k => [mapValue(k, gameId, false), mapValue(value[k], gameId, removeMetadata)]));
}
function semanticState(state) { return mapValue(state, state.gameId, true); }
function semanticAction(action, gameId) { return mapValue(action, gameId, false); }
module.exports = { canonical, hashCanonical, semanticState, semanticAction };
