'use strict';

const { buildSchedule } = require('./balance/schedule');
const { hashCanonical } = require('./balance/canonical');
const { hashConfig } = require('./balance/config');
const { OPPORTUNITIES } = require('../src/gameplayCatalog');
const { safe } = require('../src/economy');
const { coverageFor, describe, buildVectors, descriptors, bootstrap, evidenceGate, usageWarnings } = require('./balance/stats');
const { createTrackedRng } = require('./balance/random');

const total = xs => xs.reduce((a, b) => safe(a + b), 0);
const ratio = (a, b) => b ? a / b : null;
const keyFor = s => `${s.players || s.playerCount}:${s.experiment}:${s.roster.join(',')}`;

function reviewSchedule(config) {
  if (config.reviewScope !== 'neutral-and-two-player-cross') throw new Error('未登记的检验作用域');
  return buildSchedule(config).filter(s => s.experiment === 'neutral' || s.players === 2)
    .sort((a, b) => Number(a.experiment === 'cross') - Number(b.experiment === 'cross'));
}

function validate(manifest, results, config, schedule) {
  if (config.configHash !== hashConfig(config)) throw new Error('配置哈希无效');
  if (config.source !== 'formal' || hashCanonical(reviewSchedule(config)) !== hashCanonical(schedule) || manifest.scheduleHash !== hashCanonical(schedule)) throw new Error('检验计划与冻结配置不匹配');
  if (manifest.configHash !== config.configHash || manifest.source !== 'formal') throw new Error('检验清单来源不同');
  const specs = new Map(schedule.map(s => [s.sampleId, s])), seen = new Set();
  if (specs.size !== schedule.length || Object.keys(manifest.samples).length !== schedule.length) throw new Error('未知或重复计划');
  for (const r of results) {
    if (seen.has(r.sampleId)) throw new Error('重复样本'); seen.add(r.sampleId);
    const spec = specs.get(r.sampleId);
    if (!spec || manifest.samples[r.sampleId]?.status !== 'terminated') throw new Error('无有效完成样本');
    for (const k of ['configHash', 'policyVersion', 'analysisVersion', 'ruleVersion', 'source']) if (r[k] !== config[k]) throw new Error('结果版本/来源不同');
    if (r.codeFingerprint.hash !== config.codeFingerprint.hash) throw new Error('结果源码不同');
    for (const k of ['groupId', 'engineSeed', 'roster', 'policiesBySeat']) if (hashCanonical(r[k]) !== hashCanonical(spec[k])) throw new Error('样本坐标不同');
    if (r.playerCount !== spec.players || r.players.length !== spec.players || new Set(r.players.map(p => p.id)).size !== spec.players) throw new Error('参与者无效');
    if (!['natural', 'censored', 'error'].includes(r.outcome) || (r.outcome === 'natural') !== !!r.winnerId) throw new Error('胜负分类无效');
    if (r.outcome === 'natural' && (!r.players.some(p => p.id === r.winnerId && p.alive) || r.players.filter(p => p.alive).length !== 1)) throw new Error('自然胜者不唯一');
    if (r.outcome !== 'error' && (!r.observationComplete || !r.observations)) throw new Error('有效结果缺少完整观察');
  }
  for (const spec of schedule) if (manifest.samples[spec.sampleId].status === 'terminated' && !seen.has(spec.sampleId)) throw new Error('终止清单缺少结果');
}

function classify(effect, interval, gate, tolerance) {
  if (!gate.adequate || !interval?.stable || effect === null) return { label: '证据不足', explanation: [...gate.reasons, interval?.reason].filter(Boolean).join('；') };
  const [low, high] = interval.adjusted;
  if (low >= -tolerance && high <= tolerance) return { label: '容许范围内', explanation: '校正区间全部位于预登记容许带，仅适用于当前自动策略环境' };
  if (low > tolerance || high < -tolerance) return { label: '明确偏离', explanation: '校正区间全部位于容许带之外，须独立确认后调参' };
  if (Math.abs(effect) >= tolerance) return { label: '值得复核', explanation: '点估计超过容许幅度，区间尚不足以确认偏离' };
  return { label: '证据不足', explanation: '区间仍跨容许边界，不能认定等效' };
}

async function reviewAggregate(manifest, results, config, { schedule, budget, onProgress } = {}) {
  validate(manifest, results, config, schedule);
  const coverage = coverageFor(schedule, manifest, results), rules = config.screeningRules;
  const summary = { schemaVersion: 1, source: 'formal', analysisScope: config.reviewScope, configHash: config.configHash, codeFingerprint: config.codeFingerprint,
    ruleVersion: config.ruleVersion, policyVersion: config.policyVersion, analysisVersion: config.analysisVersion, coverage,
    provisional: coverage.pending > 0 || coverage.unstarted > 0, computeMs: manifest.computeMs, totalComputeMs: manifest.totalComputeMs,
    stopReason: manifest.stopReason, limits: config.limits, screeningRules: rules, reportSeed: config.reportSeed,
    experiments: [], comparisons: [], stages: [], stageOverview: [], abilities: [], combinations: [], economy: {},
    limitations: ['本阶段仅中性基线与两人六配对，三四人经营交叉未执行', '有限初筛，不代表真人胜率；原独立组/自然数量/完赛门槛保持', '区间按依赖种子组重采样，保守9/24/36族；未运行的18项路线比较不冒充已检验', '初筛的点估计线索与确认结论分开，截断没有胜者，资产估值不是净资产'] };
  const rng = createTrackedRng(config.reportSeed);
  for (const key of [...new Set(schedule.map(keyFor))]) {
    const specs = schedule.filter(s => keyFor(s) === key), ids = new Set(specs.map(s => s.sampleId)), rows = results.filter(r => ids.has(r.sampleId)), n = specs[0].players;
    const c = coverageFor(specs, manifest, rows);
    const seats = Array.from({ length: n }, (_, seat) => {
      const wins = rows.filter(r => r.outcome === 'natural' && r.players.find(p => p.id === r.winnerId).seat === seat).length;
      return { seat, wins, started: c.started, natural: c.natural, allStartWinRate: ratio(wins, c.started), conditionalWinRate: ratio(wins, c.natural), allStartUniformReference: ratio(c.completionRate, n),
        eliminated: rows.filter(r => !r.players.find(p => p.seat === seat).alive).length };
    });
    const duration = Object.fromEntries(['natural', 'censored', 'error'].map(kind => [kind, {
      rounds: describe(rows.filter(r => r.outcome === kind).map(r => ({ value: r.completeRounds, sampleId: r.sampleId }))),
      actions: describe(rows.filter(r => r.outcome === kind).map(r => ({ value: r.actions, sampleId: r.sampleId }))),
    }]));
    const assets = Object.fromEntries(['natural', 'censored'].map(kind => [kind, describe(rows.filter(r => r.outcome === kind).flatMap(r => r.players.map(p => ({ value: p.assets?.total ?? null, sampleId: r.sampleId }))))]));
    const policies = [...new Set(specs[0].roster)].map(policy => {
      const wins = rows.filter(r => r.outcome === 'natural' && r.players.find(p => p.id === r.winnerId).policy === policy).length;
      return { policy, wins, started: c.started, natural: c.natural, allStartWinRate: ratio(wins, c.started), conditionalWinRate: ratio(wins, c.natural) };
    });
    summary.experiments.push({ key, n, experiment: specs[0].experiment, roster: specs[0].roster, coverage: c, seats, policies, duration, assets,
      longGame: c.terminated === c.planned && ((c.censorRate || 0) >= rules.censorWarning || (duration.natural.rounds.p90 || 0) >= rules.durationP90Warning) });
    const kind = specs[0].experiment === 'cross' ? 'cross' : 'neutral';
    const vectors = buildVectors(specs, rows, kind, n), ds = descriptors(kind, n, specs[0].roster);
    const intervals = await bootstrap(vectors.groups, ds, { draws: rules.bootstrapDraws, rng, familySizes: rules.familySizes, validMin: rules.bootstrapValidMin, budget, onProgress });
    ds.forEach((d, i) => {
      const detail = d.family === 'opportunity' ? vectors.detail[d.id] : null;
      const gate = evidenceGate(d.family, c, rules, detail || {}), effect = d.calculate(vectors.sum), tolerance = d.family === 'seat' ? rules.seatEffect : d.family === 'policy' ? rules.policyEffect : rules.opportunityEffect;
      summary.comparisons.push({ key, n, family: d.family, id: d.id, names: d.names || null, seat: d.seat ?? null, effect, detail,
        interval: intervals[i], evidence: gate, tolerance, classification: classify(effect, intervals[i], gate, tolerance),
        screeningSignal: effect !== null && Math.abs(effect) >= tolerance ? '点估计超过预设幅度，尚待独立确认' : null });
    });
  }
  const complete = results.filter(r => r.observationComplete && r.observations);
  for (const r of complete) for (const [kind, money] of Object.entries(r.observations.economy)) {
    summary.economy[kind] ||= { cashDelta: 0, cashIn: 0, cashOut: 0, bankFlow: 0, fundDelta: 0, bankSupplement: 0, count: 0, sampleIds: [] };
    const target = summary.economy[kind];
    for (const k of ['cashDelta', 'cashIn', 'cashOut', 'bankFlow', 'fundDelta', 'bankSupplement', 'count']) target[k] = safe(target[k] + money[k]);
    if (target.sampleIds.length < 3) target.sampleIds.push(r.sampleId);
  }
  summary.abilities = OPPORTUNITIES.map(h => {
    const a = { id: h.id, name: h.name, offered: 0, selected: 0, triggers: 0, rewards: 0, savings: 0, permissions: 0, unknownGames: results.length - complete.length,
      statuses: { unmet: 0, exhausted: 0, available_unused: 0, declined: 0, used: 0, unknown: 0 }, evidence: [] };
    for (const r of complete) {
      const value = r.observations.abilities[h.id];
      for (const k of ['offered', 'selected', 'triggers', 'rewards', 'savings', 'permissions']) a[k] = safe(a[k] + value[k]);
      for (const k of Object.keys(a.statuses)) a.statuses[k] += value.statuses[k];
      if (value.selected && a.evidence.length < 3) a.evidence.push(r.sampleId);
    }
    a.usage = usageWarnings(a, complete.flatMap(r => Object.values(r.observations.players)), rules);
    return a;
  });
  const groups = new Map();
  for (const r of complete) for (const choice of r.observations.choices) {
    const assetBand = choice.assets <= 150000 ? '≤150000' : choice.assets <= 300000 ? '150000–300000' : '>300000';
    const key = [r.playerCount, choice.stage, choice.aliveCount, assetBand, choice.assetRank, choice.opportunityId].join('|');
    if (!groups.has(key)) groups.set(key, { n: r.playerCount, stage: choice.stage, aliveCount: choice.aliveCount, assetBand, assetRank: choice.assetRank, opportunityId: choice.opportunityId,
      selected: 0, natural: 0, censored: 0, wins: 0, reward: 0, saving: 0, permission: 0 });
    const g = groups.get(key), benefit = r.observations.players[choice.playerId].opportunityBenefits[choice.opportunityId];
    g.selected++; g[r.outcome]++; if (r.winnerId === choice.playerId) g.wins++;
    for (const k of ['reward', 'saving', 'permission']) g[k] = safe(g[k] + (benefit?.[k] || 0));
  }
  summary.stages = [...groups.values()].map(g => ({ ...g, conditionalWinRate: ratio(g.wins, g.natural) }));
  summary.stageOverview = [2, 3, 4].flatMap(n => [1, 2, 3].flatMap(stage => OPPORTUNITIES.map(h => {
    const rows = summary.stages.filter(g => g.n === n && g.stage === stage && g.opportunityId === h.id);
    const natural = total(rows.map(g => g.natural)), wins = total(rows.map(g => g.wins));
    return { n, stage, id: h.id, selected: total(rows.map(g => g.selected)), natural, censored: total(rows.map(g => g.censored)), wins,
      conditionalWinRate: ratio(wins, natural), reward: total(rows.map(g => g.reward)), saving: total(rows.map(g => g.saving)), permission: total(rows.map(g => g.permission)) };
  })));
  summary.economyByOutcome = Object.fromEntries(['natural', 'censored'].map(outcome => [outcome, Object.fromEntries(Object.keys(summary.economy).map(kind => [kind,
    Object.fromEntries(['cashDelta', 'cashIn', 'cashOut', 'bankFlow', 'fundDelta'].map(k => [k, describe(complete.filter(r => r.outcome === outcome).map(r => ({ value: r.observations.economy[kind]?.[k] || 0, sampleId: r.sampleId })))])),
  ]))]));
  for (const n of [2, 3, 4]) for (const name of ['remote_build', 'investment_defense', 'airport_neighbor']) {
    const rows = complete.filter(r => r.playerCount === n).flatMap(r => r.observations.combinations[name].map(p => ({ ...p, sampleId: r.sampleId, groupId: r.groupId, natural: r.outcome === 'natural', won: r.winnerId === p.playerId })));
    const independent = new Set(rows.map(r => r.groupId)).size, natural = rows.filter(r => r.natural).length;
    summary.combinations.push({ n, name, players: rows.length, groups: independent, naturalPlayers: natural, wins: rows.filter(r => r.won).length,
      conditionalWinRate: ratio(rows.filter(r => r.won).length, natural), interpretation: independent >= rules.comboGroupsMin ? '探索观察，不作组合排名' : '组合证据不足，不排名',
      evidence: rows.slice(0, 3).map(r => ({ sampleId: r.sampleId, playerId: r.playerId, benefits: r.benefits })) });
  }
  summary.bootstrapRandomCalls = rng.calls;
  summary.personalProgress = Object.fromEntries(['natural', 'censored'].map(outcome => [outcome, Object.fromEntries(['turns', 'skippedTurns', 'activeTurns', 'laps', 'cashDelta', 'mortgageInterest'].map(k => [k, describe(complete.filter(r => r.outcome === outcome).flatMap(r => Object.values(r.observations.players).map(p => ({ value: k === 'activeTurns' ? p.turns - p.skippedTurns : k === 'mortgageInterest' ? p.liabilities?.mortgage_interest || 0 : p[k], sampleId: r.sampleId }))))]))]));
  return summary;
}

module.exports = { reviewSchedule, reviewAggregate, classify, validate };
