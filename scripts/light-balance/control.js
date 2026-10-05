'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { renameAtomic } = require('../balance/storage');
const CAPS = Object.freeze({ A: 240000, B: 480000, C: 300000, D: 180000 });
const LIMIT = 1200000;
const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
function write(dir, name, value, options = {}) {
  if (path.basename(name) !== name) throw new Error('输出路径无效');
  const data = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  const existing = fs.readdirSync(dir).reduce((n, f) => n + (fs.statSync(path.join(dir, f)).isFile() && f !== name ? fs.statSync(path.join(dir, f)).size : 0), 0);
  if (existing + Buffer.byteLength(data) > 10 * 1024 * 1024) throw new Error('输出超过10MiB');
  const tmp = path.join(dir, name + '.tmp');
  fs.writeFileSync(tmp, data); renameAtomic(tmp, path.join(dir, name), options);
}
class BudgetStop extends Error { constructor(stage) { super('阶段预算停止 ' + stage); this.stage = stage; } }
function createMeter(dir, { now = () => performance.now(), caps = CAPS, limit = LIMIT } = {}) {
  const file = path.join(dir, 'budget.json');
  const ledger = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { version: 1, limit, caps, used: Object.fromEntries(Object.keys(caps).map(k => [k, 0])), runs: 0 };
  if (ledger.limit !== limit || JSON.stringify(ledger.caps) !== JSON.stringify(caps)) throw new Error('不能重置额度');
  let active = null;
  const total = () => Object.values(ledger.used).reduce((a, b) => a + b, 0);
  const save = () => write(dir, 'budget.json', ledger);
  function checkpoint() {
    if (!active) return;
    const current = now(), elapsed = Math.max(0, current - active.last);
    ledger.used[active.stage] += elapsed; active.last = current; save();
  }
  function guard() {
    const delta = active ? Math.max(0, now() - active.last) : 0;
    if (total() + delta >= ledger.limit || (active && ledger.used[active.stage] + delta >= ledger.caps[active.stage])) throw new BudgetStop(active?.stage || 'total');
  }
  function begin(stage) { if (active || !Object.hasOwn(caps, stage)) throw new Error('阶段无效'); active = { stage, last: now() }; guard(); }
  function end() { checkpoint(); active = null; }
  function measure(stage, fn) { try { begin(stage); return fn(guard); } finally { if (active) end(); } }
  ledger.runs++; save();
  return { ledger, guard, checkpoint, begin, end, measure, total, save };
}
function lock(dir) {
  const file = path.join(dir, 'controller.lock');
  if (fs.existsSync(file)) {
    const pid = Number(fs.readFileSync(file, 'utf8'));
    try { process.kill(pid, 0); throw new Error('已有活动控制器'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    fs.unlinkSync(file);
  }
  fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
  return () => fs.unlinkSync(file);
}
module.exports = { CAPS, LIMIT, digest, write, BudgetStop, createMeter, lock };
