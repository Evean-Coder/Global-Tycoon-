'use strict';

const { safe } = require('./economy');
const REVISION = 'travel-expense-v1';

function stage(state) {
  const enabled = state.ruleVersion === 2 && state.economyRevision === REVISION;
  const completedRounds = Math.max(0, (state.roundFlow?.index || 1) - 1);
  if (!Number.isSafeInteger(completedRounds)) throw new Error('完整轮数无效');
  const currentAmount = enabled ? (completedRounds >= 120 ? 3000 : completedRounds >= 80 ? 1500 : 0) : 0;
  let preview = null;
  if (enabled) {
    for (const [boundary, amount] of [[80, 1500], [120, 3000]]) {
      if (completedRounds >= boundary - 2 && completedRounds < boundary) {
        preview = { amount, startsAtRound: boundary + 1, roundsUntil: boundary - completedRounds };
      }
    }
  }
  return { enabled, completedRounds, currentAmount, preview };
}

function settle(state, playerId, events) {
  const info = stage(state), player = state.players.find(p => p.id === playerId);
  if (!info.enabled || !info.currentAmount || !player?.alive) return null;
  const previous = state.travelExpenseReceipts?.[playerId];
  if (previous?.turnId === state.turnId) return previous;
  if (!Number.isSafeInteger(state.turnId) || state.turnId < 1) throw new Error('回合编号无效');
  const amount = info.currentAmount, nextCash = safe(safe(player.cash) - amount);
  const seq = safe((state.settlementSeq || 0) + 1);
  const receipt = { turnId: state.turnId, roundId: info.completedRounds + 1, amount, settlementId: state.gameId + ':money:' + seq };
  const event = { type: 'travel_expense', kind: 'travel_expense', playerId, ...receipt,
    completedRounds: info.completedRounds, cashDeltas: { [playerId]: -amount }, fundDeltas: {},
    text: `${player.name} 第${receipt.roundId}完整轮回合结束，远航开支 ${amount}` };
  player.cash = nextCash;
  state.settlementSeq = seq;
  state.travelExpenseReceipts ||= {};
  state.travelExpenseReceipts[playerId] = receipt;
  events.push(event);
  return receipt;
}

module.exports = { REVISION, stage, settle };
