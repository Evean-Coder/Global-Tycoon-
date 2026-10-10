'use strict';

const { performance } = require('node:perf_hooks');
const DURATION_MS = 1800000;
const NODES = [300000, 600000, 900000, 1320000, 1500000, 1680000, DURATION_MS];

function createQuickClock(options = {}) {
  const now = options.now || (() => performance.now());
  const wallNow = options.wallNow || Date.now;
  const setTimer = options.setTimeout || setTimeout;
  const clearTimer = options.clearTimeout || clearTimeout;
  const onAdvance = options.onAdvance || (() => {});
  let gameId = null, startedAt = null, origin = null, frozen = null;
  let timer = null, generation = 0, nextIndex = 0;

  function elapsed() {
    const value = frozen === null ? now() - origin : frozen;
    if (!Number.isFinite(value) || value < 0) throw new Error('快速模式单调时间无效');
    return value;
  }
  function read() {
    const elapsedMs = origin === null ? 0 : elapsed();
    return { mode: 'quick', gameId, elapsedMs, totalRemainingMs: Math.max(0, DURATION_MS - elapsedMs), closed: origin === null || frozen !== null };
  }
  function cancel() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  function schedule() {
    cancel();
    if (origin === null || frozen !== null || nextIndex >= NODES.length) return;
    const identity = generation;
    timer = setTimer(() => {
      if (identity !== generation || frozen !== null) return;
      timer = null;
      const time = read();
      while (nextIndex < NODES.length && NODES[nextIndex] <= time.elapsedMs) nextIndex++;
      onAdvance(time);
      if (identity === generation && frozen === null) schedule();
    }, Math.max(0, NODES[nextIndex] - elapsed()));
    if (timer && typeof timer.unref === 'function') timer.unref();
  }
  function start(id, at = wallNow()) {
    if (typeof id !== 'string' || !id || !Number.isFinite(at) || at < 0) throw new Error('快速模式开局身份或时间无效');
    if (origin !== null && frozen === null) throw new Error('快速模式已开始');
    const point = now();
    if (!Number.isFinite(point)) throw new Error('快速模式单调时间无效');
    cancel(); generation++; gameId = id; startedAt = at; origin = point; frozen = null; nextIndex = 0;
    schedule();
    return { ...read(), startedAt };
  }
  function stop() {
    if (origin !== null && frozen === null) frozen = elapsed();
    cancel(); generation++;
    return read();
  }
  return { start, read, schedule, stop };
}

module.exports = { createQuickClock, DURATION_MS, NODES };
