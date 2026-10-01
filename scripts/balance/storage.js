'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { ROOT, hashConfig, fingerprintSources } = require('./config');
const { hashCanonical } = require('./canonical');

class StorageStop extends Error {
  constructor(message, code = 'storage_failure') { super(message); this.code = code; }
}
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const clone = value => globalThis.structuredClone(value);
function inside(parent, target) {
  const relative = path.relative(parent, target);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
function checkParents(target, root) {
  if (!inside(root, target)) throw new Error('输出必须位于项目专用验证目录');
  for (let current = target; current !== root; current = path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('输出路径不能经过符号链接或目录联接');
  }
  if (fs.existsSync(target) && !inside(fs.realpathSync(root), fs.realpathSync(target))) throw new Error('输出真实路径越界');
}
function resolveRun(runDir, root = ROOT) {
  const base = path.resolve(root, 'artifacts/gameplay-balance');
  const target = path.resolve(root, runDir);
  if (!inside(base, target) || path.dirname(target) !== base) throw new Error('输出必须是artifacts/gameplay-balance下的独立批次目录');
  checkParents(target, path.resolve(root));
  return target;
}
function sizeTree(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return total;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (fs.lstatSync(p).isSymbolicLink()) throw new Error('验证证据目录包含链接');
    total += entry.isDirectory() ? sizeTree(p) : fs.statSync(p).size;
  }
  return total;
}
function validId(id) { if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('证据标识无效'); return id; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function verifyConfig(config, fingerprint) {
  if (hashConfig(config) !== config.configHash) throw new Error('保存配置摘要不匹配');
  if (fingerprint && fingerprint.hash !== config.codeFingerprint.hash) throw new Error('代码指纹不匹配，禁止混版本恢复');
}
function loadRun(runDir, { root = ROOT, fingerprint = fingerprintSources(root) } = {}) {
  const dir = resolveRun(runDir, root);
  for (const name of ['config.json', 'schedule.json', 'manifest.json']) checkParents(path.join(dir, name), path.resolve(root));
  const config = readJson(path.join(dir, 'config.json'));
  verifyConfig(config, fingerprint);
  const schedule = readJson(path.join(dir, 'schedule.json'));
  const manifest = readJson(path.join(dir, 'manifest.json'));
  if (manifest.configHash !== config.configHash || manifest.scheduleHash !== hashCanonical(schedule)) throw new Error('批次清单或计划不匹配');
  if (new Set(schedule.map(s => s.sampleId)).size !== schedule.length || schedule.some(s => s.configHash !== config.configHash)) throw new Error('计划存在重复或异版本样本');
  return { dir, config, schedule, manifest };
}

function openRun(config, options = {}) {
  const root = options.root || ROOT, dir = resolveRun(config.output, root);
  verifyConfig(config, options.fingerprint);
  if (!options.resume && fs.existsSync(dir)) throw new Error('新批次不能覆盖已有目录');
  if (options.resume) {
    const saved = loadRun(config.output, { root, fingerprint: options.fingerprint || config.codeFingerprint });
    if (saved.config.configHash !== config.configHash) throw new Error('恢复配置不匹配');
  } else fs.mkdirSync(dir, { recursive: true });
  const maxBytes = options.maxBytes ?? config.limits.outputBytes;
  let bytes = sizeTree(dir);
  const writers = new Map();
  function target(relative) {
    const file = path.resolve(dir, relative);
    checkParents(file, path.resolve(root));
    if (!inside(dir, file)) throw new Error('写入路径越界');
    return file;
  }
  function ensure(amount) {
    if (bytes + amount > maxBytes) throw new StorageStop(`输出容量不足：${bytes}+${amount}>${maxBytes}`, 'output_budget');
  }
  function atomic(relative, value, { exclusive = false, raw = false } = {}) {
    const file = target(relative);
    if (exclusive && fs.existsSync(file)) throw new Error('已有证据不能覆盖：' + relative);
    const buffer = raw ? Buffer.from(value) : Buffer.from(JSON.stringify(value, null, 2) + '\n');
    ensure(buffer.length); // Temporary and old files coexist until rename succeeds.
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = file + `.partial-${crypto.randomUUID()}`;
    let fd;
    try {
      fd = fs.openSync(temp, 'wx'); bytes += buffer.length;
      fs.writeFileSync(fd, buffer); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      options.beforeRename?.(temp, file);
      const old = fs.existsSync(file) ? fs.statSync(file).size : 0;
      fs.renameSync(temp, file); bytes -= old;
    } catch (error) {
      if (fd !== undefined) fs.closeSync(fd);
      bytes = sizeTree(dir); // Preserve failed temporary evidence, never advertise it as complete.
      if (error instanceof StorageStop) throw error;
      throw new StorageStop('原子保存失败：' + error.message);
    }
    return relative;
  }
  function read(relative) { return readJson(target(relative)); }
  function samplePath(id, leaf) { return `samples/${validId(id)}/${leaf}`; }
  function validateResult(result) {
    if (result.configHash !== config.configHash || result.source !== config.source || result.policyVersion !== config.policyVersion || result.ruleVersion !== config.ruleVersion || result.analysisVersion !== config.analysisVersion) throw new Error('逐局结果来源或版本不匹配');
    if (!['natural', 'censored', 'error'].includes(result.outcome) || (result.outcome === 'natural') !== !!result.winnerId) throw new Error('逐局终止分类无效');
  }
  function saveResult(result) { validateResult(result); return atomic(samplePath(result.sampleId, 'result.json'), result, { exclusive: true }); }
  function results(schedule) {
    return schedule.flatMap(spec => {
      const rel = samplePath(spec.sampleId, 'result.json');
      if (!fs.existsSync(target(rel))) return [];
      const r = read(rel); validateResult(r);
      if (r.sampleId !== spec.sampleId || r.groupId !== spec.groupId || r.engineSeed !== spec.engineSeed) throw new Error('逐局结果与计划不匹配');
      return [r];
    });
  }
  function loadEvidence(id) {
    const directory = target(samplePath(id, 'actions'));
    if (!fs.existsSync(directory)) return { records: [], recordHashes: [], tails: [], lastHash: null, segments: [] };
    const names = fs.readdirSync(directory);
    for (const name of names) if (fs.lstatSync(path.join(directory, name)).isSymbolicLink()) throw new Error('流水证据不能是链接');
    const numbers = [...new Set(names.flatMap(n => /^segment-(\d{6})\.jsonl(?:\.gz)?$/.exec(n)?.slice(1) || []))].sort();
    const records = [], recordHashes = [], tails = [], segments = [];
    let previousHash = null;
    for (const number of numbers) {
      const stem = `segment-${number}.jsonl`, gzip = path.join(directory, stem + '.gz'), plain = path.join(directory, stem), meta = gzip + '.meta.json';
      let buffer, name;
      if (fs.existsSync(gzip) && fs.existsSync(meta)) {
        const compressed = fs.readFileSync(gzip), m = readJson(meta);
        if (sha(compressed) !== m.gzipHash) throw new Error('压缩流水摘要不匹配：' + stem);
        buffer = zlib.gunzipSync(compressed); name = stem + '.gz';
        if (sha(buffer) !== m.contentHash) throw new Error('流水内容摘要不匹配：' + stem);
        if (fs.existsSync(plain) && !fs.readFileSync(plain).equals(buffer)) throw new Error('封闭段与原段冲突：' + stem);
      } else if (fs.existsSync(plain)) { buffer = fs.readFileSync(plain); name = stem; }
      else throw new Error('压缩流水缺少封闭凭据：' + stem);
      const content = buffer.toString('utf8'), end = content.lastIndexOf('\n');
      if (end + 1 !== content.length) tails.push({ segment: name, offset: end + 1, bytes: buffer.length - Buffer.byteLength(content.slice(0, end + 1)) });
      const lines = content.slice(0, end + 1).split('\n').filter(Boolean);
      for (const line of lines) {
        const row = JSON.parse(line);
        if (row.sequence !== records.length || row.previousHash !== previousHash || row.hash !== hashCanonical({ sequence: row.sequence, previousHash: row.previousHash, payload: row.payload })) throw new Error('动作流水顺序或摘要不匹配');
        records.push(row.payload); recordHashes.push(row.hash); previousHash = row.hash;
      }
      segments.push({ name, number: Number(number), records: lines.length });
    }
    return { records, recordHashes, tails, lastHash: previousHash, segments };
  }
  function writer(id) {
    if (!writers.has(id)) {
      const evidence = loadEvidence(id);
      writers.set(id, { sequence: evidence.records.length, previousHash: evidence.lastHash, number: Math.max(-1, ...evidence.segments.map(s => s.number)) + 1, count: 0 });
    }
    return writers.get(id);
  }
  function seal(id) {
    const w = writers.get(id); if (!w || !w.count) return;
    const rel = samplePath(id, `actions/segment-${String(w.number).padStart(6, '0')}.jsonl`), file = target(rel);
    const buffer = fs.readFileSync(file), compressed = zlib.gzipSync(buffer);
    atomic(rel + '.gz', compressed, { raw: true, exclusive: true });
    atomic(rel + '.gz.meta.json', { gzipHash: sha(compressed), contentHash: sha(buffer), records: w.count }, { exclusive: true });
    // Remove only this run's redundant plain segment after both durable copies verify.
    if (sha(fs.readFileSync(target(rel + '.gz'))) !== sha(compressed)) throw new Error('封闭段校验失败');
    fs.unlinkSync(file); bytes -= buffer.length;
    w.number++; w.count = 0;
  }
  function appendAction(id, payload) {
    const w = writer(id);
    const body = { sequence: w.sequence, previousHash: w.previousHash, payload };
    const row = { ...body, hash: hashCanonical(body) }, buffer = Buffer.from(JSON.stringify(row) + '\n');
    ensure(buffer.length);
    const rel = samplePath(id, `actions/segment-${String(w.number).padStart(6, '0')}.jsonl`), file = target(rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let fd;
    try {
      fd = fs.openSync(file, 'a'); fs.writeFileSync(fd, buffer); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      bytes += buffer.length; w.sequence++; w.count++; w.previousHash = row.hash;
    } catch (error) { if (fd !== undefined) fs.closeSync(fd); bytes = sizeTree(dir); throw new StorageStop('流水保存失败：' + error.message); }
    // Compression happens at a completed action boundary, with no checkpoint prefix rewrite.
    if (w.count >= (options.segmentRecords || 128)) seal(id);
    return { records: w.sequence, lastHash: w.previousHash, segment: w.number, offset: w.count };
  }
  function saveCheckpoint(id, checkpoint) {
    if (checkpoint.configHash !== config.configHash || checkpoint.sampleId !== id) throw new Error('检查点配置或样本不匹配');
    return atomic(samplePath(id, 'checkpoint.json'), checkpoint);
  }
  function checkpoint(id) { const rel = samplePath(id, 'checkpoint.json'); return fs.existsSync(target(rel)) ? read(rel) : null; }
  function saveAudit(id, evidence) { return atomic(`audits/${validId(id)}/${crypto.randomUUID()}.json`, { ...evidence, source: 'audit', sampleId: id }, { exclusive: true }); }
  function audits() {
    const directory = target('audits'); if (!fs.existsSync(directory)) return [];
    const entries = [];
    for (const id of fs.readdirSync(directory).sort()) for (const name of fs.readdirSync(target(`audits/${validId(id)}`)).sort()) {
      if (!name.endsWith('.json')) continue;
      const rel = `audits/${id}/${name}`, a = read(rel);
      if (a.source !== 'audit' || a.sampleId !== id) throw new Error('审计来源或样本不匹配');
      entries.push({ sampleId: id, path: rel, kind: a.kind || 'replay', ok: a.ok ?? null, paused: a.paused || false, originalOutcome: a.originalOutcome || null });
    }
    return entries;
  }
  return { dir, config: clone(config), atomic, read, appendAction, seal, loadEvidence, saveCheckpoint, checkpoint, saveResult, results, saveAudit, audits, get bytes() { return bytes; }, remaining: () => maxBytes - bytes };
}
module.exports = { StorageStop, resolveRun, sizeTree, loadRun, openRun };
