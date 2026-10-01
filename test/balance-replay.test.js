'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameState } = require('../src/state');
const { beginOpportunityStage } = require('../src/opportunities');
const { createRng } = require('../src/random');
const { hashCanonical, semanticState, semanticAction } = require('../scripts/balance/canonical');

test('语义摘要：仅记录标识/元数据差异可忽略，经济和随机进度不能忽略', () => {
  const a = createGameState('BALANCE', ['A', 'B']);
  beginOpportunityStage(a, 1, { kind: 'start' }, createRng(22));
  const b = globalThis.structuredClone(a);
  b.gameId = 'new-game';
  b.opportunityStage.stageId = 'new-game:choice:1';
  b.startedAt += 1000; b.rngSeed++; b.players[0].connected = false;
  b.players[0].socketId = 'other'; b.players[0].reconnectToken = 'hidden';
  const hash = s => hashCanonical(semanticState(s));
  assert.equal(hash(a), hash(b));
  for (const change of [s => s.players[0].cash++, s => s.stocks['上海'].quoteVersion++, s => s.revision++, s => s.diceBag.push(2), s => s.phase = 'buy']) {
    const c = globalThis.structuredClone(a); change(c); assert.notEqual(hash(a), hash(c));
  }
  assert.deepEqual(semanticAction({ stageId: a.gameId + ':choice:1', quoteVersion: 5 }, a.gameId), { quoteVersion: 5, stageId: '$GAME:choice:1' });
  assert.equal(hashCanonical({ a: 1, b: 2 }), hashCanonical({ b: 2, a: 1 }));
});
