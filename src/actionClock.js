'use strict';

const { performance } = require('node:perf_hooks');

const MAIN_PHASES = new Set(['waiting_roll', 'frozen_turn', 'jail_turn']);
const QUICK_STOCK_SECONDS = 60;
const OPPORTUNITY_CHOICE_SECONDS = 60;

function defaultNow() {
  return performance.now();
}

function decisionDescriptor(state) {
  if (state.routeRevision === 'opportunity-routes-v1' && state.phase === 'route_choose' && state.routeFlow?.activeChoice) {
    const c = state.routeFlow.activeChoice;
    return {key:state.gameId+'|'+state.turnId+'|route|'+c.playerId+'|'+c.opportunityId,phase:state.phase,actorId:c.playerId,targetKey:c.opportunityId,seconds:OPPORTUNITY_CHOICE_SECONDS};
  }
  if (state.ruleVersion === 2 && state.phase === 'opportunity_choose') {
    return {key:state.gameId+'|choice|'+state.opportunityStage.stageId,phase:state.phase,actorId:null,targetKey:state.opportunityStage.stageId,seconds:OPPORTUNITY_CHOICE_SECONDS};
  }
  const pending = state.pending || {};
  const actorId = pending.awaiting || pending.targetId || pending.playerId || state.players[state.turnIndex]?.id || null;
  const target = {
    type: pending.type || pending.kind || null,
    cityId: pending.cityId || null,
    airportId: pending.airportId || null,
    targetId: pending.targetId || null,
    fromId: pending.fromId || null,
    awaiting: pending.awaiting || null,
    index: Number.isSafeInteger(pending.index) ? pending.index : null,
    buyerIndex: Number.isSafeInteger(pending.buyerIndex) ? pending.buyerIndex : null,
  };
  return {
    key: (state.ruleVersion === 2 ? state.gameId+'|'+state.turnId+'|' : '') + state.phase + '|' + actorId + '|' + JSON.stringify(target),
    phase: state.phase,
    actorId,
    targetKey: JSON.stringify(target),
    seconds: state.phase === 'self_rescue' ? null : state.quickRevision === 'quick-mode-v1' && state.gameMode === 'quick' ? (state.phase === 'waiting_roll' && require('./managementRules').modern(state) ? 45 : state.phase === 'stock' ? QUICK_STOCK_SECONDS : 20) : MAIN_PHASES.has(state.phase) ? 90 : 60,
  };
}

function createActionClock(options = {}) {
  const now = options.now || defaultNow;
  const setTimer = options.setTimeout || setTimeout;
  const clearTimer = options.clearTimeout || clearTimeout;
  const clock = {
    decisionId: 0,
    key: null,
    phase: null,
    actorId: null,
    targetKey: null,
    deadlineMs: null,
    remainingMs: 0,
    paused: false,
    untimed: false,
    timeoutId: null,
  };

  function cancel() {
    if (clock.timeoutId !== null) clearTimer(clock.timeoutId);
    clock.timeoutId = null;
  }

  function schedule(onTimeout) {
    cancel();
    if (clock.paused || clock.deadlineMs == null) return;
    const delay = Math.max(0, clock.deadlineMs - now());
    const scheduledDecisionId = clock.decisionId;
    const scheduledKey = clock.key;
    clock.timeoutId = setTimer(() => {
      if (clock.decisionId !== scheduledDecisionId || clock.key !== scheduledKey) return;
      clock.timeoutId = null;
      if (clock.paused || clock.deadlineMs == null || now() < clock.deadlineMs) {
        schedule(onTimeout);
        return;
      }
      clock.remainingMs = 0;
      onTimeout(scheduledDecisionId, scheduledKey);
    }, delay);
    if (clock.timeoutId && typeof clock.timeoutId.unref === 'function') clock.timeoutId.unref();
  }

  clock.sync = (state, onTimeout, newDecision = false, totalRemainingMs = null) => {
    if (totalRemainingMs !== null && (!Number.isFinite(totalRemainingMs) || totalRemainingMs < 0)) throw new Error('决定总预算无效');
    if (!state || state.phase === 'game_over') {
      clock.clear();
      return { changed: false, active: false };
    }
    const d = decisionDescriptor(state);
    if (!newDecision && clock.key === d.key && (clock.untimed || clock.timeoutId !== null || clock.paused)) {
      if(clock.untimed)return {changed:false,active:true};
      if (!clock.paused && clock.deadlineMs != null) clock.remainingMs = Math.max(0, clock.deadlineMs - now());
      if (totalRemainingMs !== null && totalRemainingMs < clock.remainingMs) {
        clock.remainingMs = totalRemainingMs;
        if (!clock.paused) { clock.deadlineMs = now() + clock.remainingMs; schedule(onTimeout); }
      }
      return { changed: false, active: true };
    }
    cancel();
    clock.decisionId += 1;
    clock.key = d.key;
    clock.phase = d.phase;
    clock.actorId = d.actorId;
    clock.targetKey = d.targetKey;
    clock.untimed = d.seconds === null;
    clock.remainingMs = clock.untimed ? null : Math.min(d.seconds * 1000, totalRemainingMs === null ? Infinity : totalRemainingMs);
    clock.deadlineMs = clock.untimed ? null : now() + clock.remainingMs;
    clock.paused = false;
    schedule(onTimeout);
    return { changed: true, active: true };
  };

  clock.pause = () => {
    if (clock.key == null || clock.paused || (!clock.untimed && clock.deadlineMs == null)) return false;
    if(!clock.untimed)clock.remainingMs = Math.max(0, clock.deadlineMs - now());
    clock.paused = true;
    cancel();
    return true;
  };

  clock.resume = (onTimeout) => {
    if (clock.key == null || !clock.paused) return false;
    clock.paused = false;
    clock.deadlineMs = clock.untimed ? null : now() + clock.remainingMs;
    schedule(onTimeout);
    return true;
  };

  clock.clear = () => {
    cancel();
    clock.key = null;
    clock.phase = null;
    clock.actorId = null;
    clock.targetKey = null;
    clock.deadlineMs = null;
    clock.remainingMs = 0;
    clock.paused = false;
    clock.untimed = false;
  };

  clock.remainingSeconds = () => clock.untimed ? null : Math.ceil((clock.paused ? clock.remainingMs : Math.max(0, (clock.deadlineMs || now()) - now())) / 1000);
  clock.expired = () => !clock.paused && clock.deadlineMs !== null && now() >= clock.deadlineMs;
  clock.view = (gameId) => ({gameId,decisionId:clock.decisionId,phase:clock.phase,secondsRemaining:clock.remainingSeconds(),paused:clock.paused,...(clock.untimed?{untimed:true}:{})});
  clock.cancel = cancel;
  return clock;
}

module.exports = { createActionClock, decisionDescriptor, MAIN_PHASES, QUICK_STOCK_SECONDS, OPPORTUNITY_CHOICE_SECONDS };
