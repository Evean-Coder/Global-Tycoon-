'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const VERSION = 'balance-v1-20261001';
const PREFERENCES = ['property', 'investment', 'aviation', 'cautious'];
const PROFILES = {
  neutral: [15000, 1.05, 1.05, 0.25, 1],
  property: [12000, 1.2, 1.2, 0.2, 0.9],
  investment: [22000, 1, 1, 0.4, 0.9],
  aviation: [15000, 1.05, 1.05, 0.2, 1.4],
  cautious: [30000, 1, 1, 0.15, 0.8],
};
const SCORES = {
  property: { H1: 90, H2: 80, H3: 75, H11: 65, H12: 55 },
  investment: { H5: 90, H4: 80, H6: 75, H11: 65, H12: 55 },
  aviation: { H9: 90, H7: 80, H8: 75, H11: 65, H12: 55 },
  cautious: { H11: 90, H10: 85, H12: 75, H6: 65 },
};

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, sorted(value[k])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
}

function integer(value, name, min, max = Number.MAX_SAFE_INTEGER) {
  if (!/^(0|[1-9]\d*)$/.test(value || '') || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
    throw new Error(`${name}必须为${min}至${max}的整数`);
  }
  return Number(value);
}

function parseArgs(argv = []) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!['--formal', '--help', '--games', '--seed', '--players', '--output', '--resume', '--replay', '--report', '--sample'].includes(key)) throw new Error(`未知参数：${key}`);
    if (Object.hasOwn(values, key)) throw new Error(`重复参数：${key}`);
    if (key === '--formal' || key === '--help') values[key] = true;
    else {
      const next = argv[++i];
      if (!next || next.startsWith('--')) throw new Error(`${key}缺少值`);
      values[key] = next;
    }
  }
  const modes = ['--formal', '--resume', '--replay', '--report'].filter(k => values[k]);
  if (modes.length > 1) throw new Error('运行模式互斥');
  if (values['--help']) {
    if (Object.keys(values).length !== 1) throw new Error('--help须单独使用');
    return { mode: 'help' };
  }
  const mode = modes[0]?.slice(2) || 'debug';
  if (mode !== 'debug' && ['--games', '--seed', '--players'].some(k => values[k])) throw new Error('正式及证据模式不允许临时覆盖参数');
  if (['resume', 'replay', 'report'].includes(mode) && values['--output']) throw new Error('证据模式不能另指定输出');
  if ((mode === 'replay') !== !!values['--sample']) throw new Error('仅重放模式必须指定--sample');
  const options = { mode };
  if (mode === 'debug') {
    options.games = integer(values['--games'] || '20', '局数', 1);
    options.seed = integer(values['--seed'] || '22', '种子', 0, 0xffffffff);
    options.players = integer(values['--players'] || '4', '人数', 2, 4);
  }
  if (values['--output']) options.output = values['--output'];
  if (mode === 'formal' && !options.output) throw new Error('正式模式必须指定独立--output目录');
  if (['resume', 'replay', 'report'].includes(mode)) options.runDir = values[`--${mode}`];
  if (values['--sample']) options.sampleId = values['--sample'];
  return options;
}

function policyConfigs() {
  return deepFreeze(Object.fromEntries(Object.entries(PROFILES).map(([id, values]) => [id, {
    id, baseReserve: values[0], cityWeight: values[1], buildWeight: values[2], maxStockRatio: values[3], flightWeight: values[4],
    scores: { ...(SCORES[id] || {}) }, defaultScore: 40,
    randomChoices: id === 'neutral', rerollStage: id === 'neutral' ? null : 1, rerollBelow: 60,
  }])));
}

function sourceFiles(root = ROOT) {
  const files = ['package.json', 'package-lock.json', 'scripts/simulate-balance.js'];
  for (const dir of ['src', 'scripts/balance']) {
    if (!fs.existsSync(path.join(root, dir))) continue;
    for (const name of fs.readdirSync(path.join(root, dir)).sort()) {
      if (name.endsWith('.js')) files.push(`${dir}/${name}`);
    }
  }
  return files.sort();
}

function fingerprintSources(root = ROOT, files = sourceFiles(root)) {
  const hashes = files.map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') }));
  let commit = null, worktree = null;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    worktree = execFileSync('git', ['status', '--porcelain', '--', ...files], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { /* Non-Git fixture roots retain content fingerprints. */ }
  return { hash: digest(hashes), commit, worktree, files: hashes };
}

function hashConfig(config) {
  const semantic = Object.fromEntries(Object.entries(config).filter(([key]) => !['configHash', 'createdAt', 'output', 'runDir', 'runId'].includes(key)));
  return digest(semantic);
}

function buildConfig(options, fingerprint = fingerprintSources()) {
  if (!['formal', 'debug'].includes(options.mode)) throw new Error('仅新批次可创建配置');
  const source = options.mode;
  const config = {
    schemaVersion: 1, ruleVersion: 2, policyVersion: VERSION, analysisVersion: VERSION,
    codeFingerprint: fingerprint, source, seedPrefix: VERSION,
    policyConfigs: policyConfigs(), choiceRules: { neutral: 'random-all-stages-no-reroll', preference: 'score-stage1-reroll-below60' },
    limits: { rounds: 500, actions: 20000, sliceMs: 60000, computeMs: 240 * 60000, outputBytes: 2 * 1024 ** 3 },
    sampleTargets: { neutralSeeds: 600, crossSeeds: 40, games: 4200, groups: 2240 },
    screeningRules: {
      bootstrapDraws: 50000, familySizes: { seat: 9, policy: 24, opportunity: 36 },
      completionMin: 0.8, seatNaturalMin: 200, policyGroupsMin: 30, policyNaturalMin: 60,
      opportunityNaturalMin: 100, opportunityGroupsMin: 80, opportunitySeatMin: 10,
      seatEffect: 0.05, policyEffect: 0.1, opportunityEffect: 0.1,
      bootstrapValidMin: 0.99, comboGroupsMin: 30,
      censorWarning: 0.2, durationP90Warning: 250,
      usageSelectedMin: 100, usageEligibleMin: 30, usageWarning: 0.1, neverEligibleWarning: 0.8,
    },
    reportSeed: 0x5b1a2026,
  };
  if (source === 'debug') config.debug = { games: options.games, seed: options.seed, players: options.players };
  config.runId = options.output ? path.basename(options.output) : `debug-${Date.now()}`;
  config.output = options.output || `artifacts/gameplay-balance/${config.runId}`;
  config.createdAt = new Date().toISOString();
  config.configHash = hashConfig(config);
  return deepFreeze(config);
}

module.exports = { ROOT, VERSION, PREFERENCES, deepFreeze, digest, sorted, parseArgs, policyConfigs, fingerprintSources, hashConfig, buildConfig };
