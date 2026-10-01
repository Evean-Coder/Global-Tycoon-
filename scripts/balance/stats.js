'use strict';
const { safe } = require('../../src/economy');
const { OPPORTUNITIES } = require('../../src/gameplayCatalog');
const { combinations, buildSchedule } = require('./schedule');
const { hashCanonical } = require('./canonical');
const { createTrackedRng } = require('./random');
const ratio = (a, b) => b > 0 ? a / b : null;
const total = xs => xs.reduce((a, b) => safe(a + b), 0);
const keyFor = s => `${s.players || s.playerCount}:${s.experiment}:${s.roster.join(',')}`;
function quantile(sorted, p) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p, low = Math.floor(i);
  return sorted[low] + (sorted[Math.ceil(i)] - sorted[low]) * (i - low);
}
function describe(items) {
  const valid = items.filter(x => Number.isFinite(typeof x === 'number' ? x : x?.value));
  const sorted = valid.map(x => typeof x === 'number' ? x : x.value).sort((a, b) => a - b);
  const sum = total(sorted);
  return { count: sorted.length, unknown: items.length - sorted.length, sum, mean: ratio(sum, sorted.length), median: quantile(sorted, .5), p10: quantile(sorted, .1), p90: quantile(sorted, .9), min: sorted[0] ?? null, max: sorted.at(-1) ?? null, minEvidence: valid.find(x => x.value === sorted[0])?.sampleId || null, maxEvidence: valid.find(x => x.value === sorted.at(-1))?.sampleId || null };
}
function coverageFor(schedule, manifest, results) {
  const planned = new Set(schedule.map(s => s.sampleId)), rows = results.filter(r => planned.has(r.sampleId));
  const statuses = schedule.map(s => manifest.samples[s.sampleId]?.status);
  if (statuses.some(s => !['unstarted', 'pending', 'terminated'].includes(s))) throw new Error('统计清单状态无效');
  const groups = [...new Set(schedule.map(s => s.groupId))];
  const terminated = statuses.filter(s => s === 'terminated').length, pending = statuses.filter(s => s === 'pending').length;
  const counts = { planned: schedule.length, started: terminated + pending, terminated, pending, unstarted: statuses.filter(s => s === 'unstarted').length, natural: rows.filter(r => r.outcome === 'natural').length, censored: rows.filter(r => r.outcome === 'censored').length, error: rows.filter(r => r.outcome === 'error').length, plannedGroups: groups.length, completeGroups: groups.filter(g => schedule.filter(s => s.groupId === g).every(s => manifest.samples[s.sampleId].status === 'terminated')).length };
  if (counts.natural + counts.censored + counts.error !== terminated) throw new Error('统计终止分母无法对账');
  counts.completionRate = ratio(counts.natural, counts.started); counts.censorRate = ratio(counts.censored, counts.terminated); counts.errorRate = ratio(counts.error, counts.terminated);
  return counts;
}
function validate(manifest, results, config, schedule, allowDebug = false) {
  if (config.source !== 'formal' && !(allowDebug && config.source === 'debug')) throw new Error('统计只接受指定正式批次，debug须明确标记');
  if (manifest.configHash !== config.configHash || manifest.source !== config.source || manifest.scheduleHash !== hashCanonical(schedule)) throw new Error('统计配置或计划摘要不匹配');
  if (hashCanonical(buildSchedule(config)) !== hashCanonical(schedule)) throw new Error('保存计划不符合冻结配置');
  const specs = new Map(schedule.map(s => [s.sampleId, s]));
  if (specs.size !== schedule.length || Object.keys(manifest.samples).length !== schedule.length) throw new Error('统计计划存在重复或未知样本');
  const seen = new Set();
  for (const r of results) {
    if (seen.has(r.sampleId)) throw new Error('统计结果重复'); seen.add(r.sampleId);
    const spec = specs.get(r.sampleId);
    if (!spec || manifest.samples[r.sampleId]?.status !== 'terminated') throw new Error('统计结果无对应完成清单');
    if (r.source !== config.source || r.configHash !== config.configHash || r.ruleVersion !== config.ruleVersion || r.policyVersion !== config.policyVersion || r.analysisVersion !== config.analysisVersion || r.codeFingerprint?.hash !== config.codeFingerprint.hash) throw new Error('统计结果来源或版本不匹配');
    for (const k of ['groupId', 'engineSeed', 'policiesBySeat', 'roster', 'experiment']) if (hashCanonical(r[k]) !== hashCanonical(spec[k])) throw new Error('统计结果与计划坐标不匹配');
    if (!['natural', 'censored', 'error'].includes(r.outcome) || (r.outcome === 'natural') !== !!r.winnerId || r.playerCount !== spec.players || r.players.length !== spec.players || new Set(r.players.map(p => p.id)).size !== spec.players) throw new Error('统计结果分类或人数无效');
    if (r.outcome === 'natural' && (!r.players.some(p => p.id === r.winnerId) || r.players.filter(p => p.alive).length !== 1)) throw new Error('统计自然胜者不唯一');
    if (r.outcome !== 'error' && (r.observationComplete !== true || !r.observations)) throw new Error('有效对局缺少完整观察，不能填零收益');
  }
  for (const spec of schedule) if (manifest.samples[spec.sampleId]?.status === 'terminated' && !seen.has(spec.sampleId)) throw new Error('统计清单缺少结果');
}
function intervals(values, requested, familySize, validMin = .99) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const validRate = ratio(sorted.length, requested), tail = .05 / (2 * familySize);
  const ordinary = [quantile(sorted, .025), quantile(sorted, .975)], adjusted = [quantile(sorted, tail), quantile(sorted, 1 - tail)];
  const stable = !!sorted.length && validRate >= validMin && sorted[0] !== sorted.at(-1);
  return { draws: requested, validDraws: sorted.length, validRate, familySize, adjustedTail: tail, ordinary: stable ? ordinary : null, adjusted: stable ? adjusted : null, stable, reason: !sorted.length ? 'zero_denominator' : validRate < validMin ? 'insufficient_valid_draws' : !stable ? 'degenerate_distribution' : null };
}
function evidenceGate(kind, coverage, rules, detail = {}) {
  const reasons = [];
  if (coverage.terminated !== coverage.planned) reasons.push('计划未完成');
  if (coverage.error) reasons.push('存在工具异常');
  if ((coverage.completionRate ?? 0) < rules.completionMin) reasons.push('自然完赛率不足');
  if (kind === 'seat' && coverage.natural < rules.seatNaturalMin) reasons.push('自然局数不足');
  if (kind === 'policy') {
    if (coverage.completeGroups < rules.policyGroupsMin) reasons.push('完整独立组不足');
    if (coverage.natural < rules.policyNaturalMin) reasons.push('自然局数不足');
  }
  if (kind === 'opportunity') {
    if (detail.selected < rules.opportunityNaturalMin || detail.nonselected < rules.opportunityNaturalMin) reasons.push('选择/未选择自然玩家不足');
    if (detail.selectedGroups < rules.opportunityGroupsMin || detail.nonselectedGroups < rules.opportunityGroupsMin) reasons.push('两侧独立组不足');
    if (!detail.seats?.length || detail.seats.some(s => s.selected < rules.opportunitySeatMin || s.nonselected < rules.opportunitySeatMin)) reasons.push('各座位两侧分母不足');
  }
  return { adequate: reasons.length === 0, reasons };
}
function classify(effect, interval, gate, threshold) {
  if (!gate.adequate || !interval?.stable || effect === null) return { label: '证据不足', explanation: [...gate.reasons, ...(interval?.reason ? [interval.reason] : [])].join('；') };
  const excludes = range => range && (range[0] > 0 || range[1] < 0);
  if (Math.abs(effect) >= threshold && excludes(interval.adjusted)) return { label: '明显风险', explanation: '达到预设幅度且族内校正区间不含零，仅适用于当前自动策略环境' };
  if (Math.abs(effect) >= threshold && excludes(interval.ordinary)) return { label: '观察到趋势', explanation: '普通区间不含零，族内校正后仍需独立证据' };
  return { label: '本次未发现明显风险', explanation: Math.abs(effect) >= threshold ? '差值较大但方向仍不确定；没有证明等强' : '保留区间与检出能力限制；没有证明等强' };
}
function buildVectors(specs, results, kind, n) {
  const rows = results.filter(r => specs.some(s => s.sampleId === r.sampleId));
  const groupIds = [...new Set(specs.filter(s => rows.some(r => r.sampleId === s.sampleId)).map(s => s.groupId))];
  const dims = kind === 'neutral' ? 1 + n + 12 * n * 4 : 1 + n;
  const groups = groupIds.map(id => ({ id, vector: new Float64Array(dims) }));
  const groupMap = new Map(groups.map(g => [g.id, g.vector]));
  const roster = specs[0]?.roster || [];
  const choicesByResult = new Map(rows.map(r => [r.sampleId, new Map((r.observations?.choices || []).filter(c => c.stage === 1).map(c => [c.playerId, c.opportunityId]))]));
  const playerCounts = Object.fromEntries(OPPORTUNITIES.map(h => [h.id, { selected: 0, nonselected: 0, selectedGroups: new Set(), nonselectedGroups: new Set(), seats: Array.from({ length: n }, () => ({ selected: 0, nonselected: 0 })) }]));
  for (const r of rows.filter(r => r.outcome === 'natural')) {
    const v = groupMap.get(r.groupId); v[0]++;
    if (kind === 'cross') v[1 + roster.indexOf(r.players.find(p => p.id === r.winnerId).policy)]++;
    else {
      v[1 + r.players.find(p => p.id === r.winnerId).seat]++;
      for (const p of r.players) {
        const chosen = choicesByResult.get(r.sampleId).get(p.id); if (!chosen) continue;
        for (let h = 0; h < 12; h++) {
          const id = OPPORTUNITIES[h].id, selected = chosen === id, offset = 1 + n + (h * n + p.seat) * 4 + (selected ? 0 : 2);
          v[offset]++; if (p.id === r.winnerId) v[offset + 1]++;
          const side = selected ? 'selected' : 'nonselected'; playerCounts[id][side]++; playerCounts[id][side + 'Groups'].add(r.groupId); playerCounts[id].seats[p.seat][side]++;
        }
      }
    }
  }
  const sum = new Float64Array(dims); for (const g of groups) for (let i = 0; i < dims; i++) sum[i] += g.vector[i];
  return { groups, sum, detail: Object.fromEntries(Object.entries(playerCounts).map(([id, d]) => [id, { ...d, selectedGroups: d.selectedGroups.size, nonselectedGroups: d.nonselectedGroups.size }])) };
}
function descriptors(kind, n, roster = []) {
  if (kind === 'cross') return combinations(roster.map((name, i) => ({ name, i })), 2).map(([a, b]) => ({ family: 'policy', id: `${a.name}-${b.name}`, names: [a.name, b.name], calculate: v => v[0] ? (v[a.i + 1] - v[b.i + 1]) / v[0] : null }));
  const seats = Array.from({ length: n }, (_, seat) => ({ family: 'seat', id: `seat-${seat}`, seat, calculate: v => v[0] ? v[seat + 1] / v[0] - 1 / n : null }));
  const abilities = OPPORTUNITIES.map((h, index) => ({ family: 'opportunity', id: h.id, calculate(v) {
    let value = 0;
    for (let seat = 0; seat < n; seat++) { const off = 1 + n + (index * n + seat) * 4; if (!v[off] || !v[off + 2]) return null; value += v[off + 1] / v[off] - v[off + 3] / v[off + 2]; }
    return value / n;
  } }));
  return [...seats, ...abilities];
}
async function bootstrap(groups, comparisons, { draws, rng, familySizes, validMin = .99, budget, onProgress } = {}) {
  const values = comparisons.map(() => []), dims = groups[0]?.vector.length || 0;
  const calculate = comparisons.map(d => d.calculate);
  let completed = 0;
  if (groups.length < 2 || !dims) return comparisons.map(d => ({ id: d.id, ...intervals([], draws, familySizes[d.family], validMin), reason: 'insufficient_independent_groups' }));
  const initial = new Float64Array(dims); for (const g of groups) for (let i = 0; i < dims; i++) initial[i] += g.vector[i];
  const active = comparisons.map((d, i) => d.calculate(initial) === null ? -1 : i).filter(i => i >= 0);
  if (!active.length) return comparisons.map(d => ({ id: d.id, ...intervals([], draws, familySizes[d.family], validMin) }));
  const vector = new Float64Array(dims), weights = new Uint32Array(groups.length);
  for (let draw = 0; draw < draws; draw++) {
    if (budget?.exhausted()) break;
    const work = budget?.beginWork();
    try {
      vector.fill(0); weights.fill(0);
      for (let pick = 0; pick < groups.length; pick++) weights[Math.floor(rng() * groups.length)]++;
      for (let g = 0; g < groups.length; g++) if (weights[g]) { const v = groups[g].vector, w = weights[g]; for (let k = 0; k < dims; k++) vector[k] += v[k] * w; }
      for (const i of active) { const v = calculate[i](vector); if (v !== null) values[i].push(v); }
      completed++;
    } finally { if (work) budget.endWork(work); }
    if (draw % 100 === 99) { budget?.flush(); onProgress?.({ drawsCompleted: completed, drawsPlanned: draws }); await new Promise(resolve => require('node:timers').setImmediate(resolve)); }
  }
  return comparisons.map((d, i) => ({ id: d.id, ...intervals(values[i], draws, familySizes[d.family], validMin), completedDraws: completed, ...(completed < draws ? { stable: false, ordinary: null, adjusted: null, reason: 'compute_budget' } : {}) }));
}
function usageWarnings(ability, players, rules) {
  const eligible = ['used', 'declined', 'available_unused'].reduce((a, k) => a + ability.statuses[k], 0), used = ability.statuses.used;
  const evaluated = players.filter(p => p.selectedIds.includes(ability.id));
  const never = evaluated.filter(p => { const s = p.opportunityStatuses?.[ability.id]; return !s ? p.eligibilityCoverage === 'complete-transition-observer' : !s.unknown && !(s.used + s.declined + s.available_unused + s.exhausted); }).length;
  const unknown = evaluated.filter(p => !p.opportunityStatuses?.[ability.id] ? p.eligibilityCoverage !== 'complete-transition-observer' : p.opportunityStatuses[ability.id].unknown).length;
  return { eligible, used, useRate: ratio(used, eligible), evaluatedPlayers: evaluated.length, neverEligible: never, unknownPlayers: unknown, neverRate: ratio(never, evaluated.length - unknown), lowUsage: ability.selected >= rules.usageSelectedMin && eligible >= rules.usageEligibleMin && used / eligible < rules.usageWarning, rarelyEligible: ability.selected >= rules.usageSelectedMin && unknown === 0 && ratio(never, evaluated.length) >= rules.neverEligibleWarning };
}
async function aggregate(manifest, results, config, { schedule, allowDebug = false, budget, onProgress } = {}) {
  if (!schedule) throw new Error('统计必须提供保存的完整计划');
  validate(manifest, results, config, schedule, allowDebug);
  const coverage = coverageFor(schedule, manifest, results), rules = config.screeningRules;
  const summary = { schemaVersion: 1, source: config.source, configHash: config.configHash, codeFingerprint: config.codeFingerprint, policyVersion: config.policyVersion, analysisVersion: config.analysisVersion, ruleVersion: config.ruleVersion, coverage, provisional: coverage.pending > 0 || coverage.unstarted > 0, computeMs: manifest.computeMs, totalComputeMs: manifest.totalComputeMs, stopReason: manifest.stopReason, limits: config.limits, screeningRules: rules, reportSeed: config.reportSeed, experiments: [], comparisons: [], stages: [], combinations: [], abilities: [], economy: {}, limitations: ['仅为固定自动策略环境的关联筛查，不代表真人胜率或机遇独立因果强度', '自然完赛筛选、后期存活、有限种子与启发式限制推广；没有证明等强', '区间为整组重采样近似值，9/24/36三族分别校正，非报告全部指标的精确总体保证', '待恢复样本计入开局分母，经济/触发只来自有完整观察的已终止样本'] };
  const rng = createTrackedRng(config.reportSeed);
  const keys = [...new Set(schedule.map(keyFor))];
  for (const key of keys) {
    const specs = schedule.filter(s => keyFor(s) === key), ids = new Set(specs.map(s => s.sampleId)), rows = results.filter(r => ids.has(r.sampleId)), n = specs[0].players;
    const c = coverageFor(specs, manifest, rows);
    const seats = Array.from({ length: n }, (_, seat) => { const wins = rows.filter(r => r.outcome === 'natural' && r.players.find(p => p.id === r.winnerId).seat === seat).length; return { seat, wins, started: c.started, natural: c.natural, allStartWinRate: ratio(wins, c.started), conditionalWinRate: ratio(wins, c.natural), allStartUniformReference: c.completionRate === null ? null : c.completionRate / n }; });
    if (total(seats.map(s => s.wins)) !== c.natural) throw new Error('自然胜场总数无法对账');
    const duration = Object.fromEntries(['natural', 'censored', 'error'].map(kind => [kind, { rounds: describe(rows.filter(r => r.outcome === kind).map(r => ({ value: r.completeRounds, sampleId: r.sampleId }))), actions: describe(rows.filter(r => r.outcome === kind).map(r => ({ value: r.actions, sampleId: r.sampleId }))) }]));
    const assets = Object.fromEntries(['natural', 'censored'].map(kind => [kind, describe(rows.filter(r => r.outcome === kind).flatMap(r => r.players.map(p => ({ value: p.assets?.total ?? null, sampleId: r.sampleId, playerId: p.id }))))]));
    const policies = specs[0].roster.map(policy => { const wins = rows.filter(r => r.outcome === 'natural' && r.players.find(p => p.id === r.winnerId).policy === policy).length; return { policy, wins, started: c.started, natural: c.natural, allStartWinRate: ratio(wins, c.started), conditionalWinRate: ratio(wins, c.natural) }; });
    const experiment = { key, n, experiment: specs[0].experiment, roster: specs[0].roster, coverage: c, seats, policies: [...new Map(policies.map(p => [p.policy, p])).values()], duration, assets, longGame: c.terminated === c.planned && ((c.censorRate ?? 0) >= rules.censorWarning || (duration.natural.rounds.p90 ?? 0) >= rules.durationP90Warning) };
    summary.experiments.push(experiment);
    if (specs[0].experiment === 'debug') continue;
    const kind = specs[0].experiment === 'cross' ? 'cross' : 'neutral', vectors = buildVectors(specs, rows, kind, n), ds = descriptors(kind, n, specs[0].roster);
    const cis = await bootstrap(vectors.groups, ds, { draws: rules.bootstrapDraws, rng, familySizes: rules.familySizes, validMin: rules.bootstrapValidMin, budget, onProgress });
    ds.forEach((d, i) => {
      const detail = d.family === 'opportunity' ? vectors.detail[d.id] : null;
      const gate = evidenceGate(d.family, c, rules, detail || {}), effect = d.calculate(vectors.sum), threshold = d.family === 'seat' ? rules.seatEffect : d.family === 'policy' ? rules.policyEffect : rules.opportunityEffect;
      summary.comparisons.push({ key, n, family: d.family, id: d.id, names: d.names || null, seat: d.seat ?? null, effect, detail, interval: cis[i], evidence: gate, classification: classify(effect, cis[i], gate, threshold) });
    });
  }
  const complete = results.filter(r => r.observationComplete && r.observations), stageGroups = new Map();
  for (const r of complete) {
    for (const [kind, money] of Object.entries(r.observations.economy)) {
      summary.economy[kind] ||= { cashDelta: 0, cashIn: 0, cashOut: 0, bankFlow: 0, fundDelta: 0, bankSupplement: 0, count: 0, sampleIds: [] };
      const target = summary.economy[kind]; for (const k of ['cashDelta', 'cashIn', 'cashOut', 'bankFlow', 'fundDelta', 'bankSupplement', 'count']) target[k] = safe(target[k] + money[k]); if (target.sampleIds.length < 3) target.sampleIds.push(r.sampleId);
    }
    for (const choice of r.observations.choices) {
      const assetBand = choice.assets <= 150000 ? '≤150000' : choice.assets <= 300000 ? '150000–300000' : '>300000';
      const key = [r.playerCount, choice.stage, choice.aliveCount, assetBand, choice.assetRank, choice.opportunityId].join('|');
      if (!stageGroups.has(key)) stageGroups.set(key, { n: r.playerCount, stage: choice.stage, aliveCount: choice.aliveCount, assetBand, assetRank: choice.assetRank, opportunityId: choice.opportunityId, selected: 0, natural: 0, censored: 0, wins: 0, benefits: [], assetsAtChoice: [], sampleIds: [] });
      const g = stageGroups.get(key); g.selected++; g[r.outcome]++; if (r.outcome === 'natural' && r.winnerId === choice.playerId) g.wins++;
      const p = r.observations.players[choice.playerId], benefits = p.opportunityBenefits[choice.opportunityId];
      g.benefits.push(benefits || { reward: 0, saving: 0, permission: 0 }); g.assetsAtChoice.push(choice.assets); if (g.sampleIds.length < 3) g.sampleIds.push(r.sampleId);
    }
  }
  summary.stages = [...stageGroups.values()].map(g => ({ ...g, conditionalWinRate: ratio(g.wins, g.natural), assetsAtChoice: describe(g.assetsAtChoice), benefits: Object.fromEntries(['reward', 'saving', 'permission'].map(k => [k, describe(g.benefits.map(b => b[k]))])) }));
  summary.stageOverview = [2, 3, 4].flatMap(n => [1, 2, 3].flatMap(stage => OPPORTUNITIES.map(h => {
    const rows = summary.stages.filter(g => g.n === n && g.stage === stage && g.opportunityId === h.id);
    const selected = total(rows.map(g => g.selected)), natural = total(rows.map(g => g.natural)), wins = total(rows.map(g => g.wins));
    return { n, stage, id: h.id, selected, natural, censored: total(rows.map(g => g.censored)), wins, conditionalWinRate: ratio(wins, natural), reward: total(rows.map(g => g.benefits.reward.sum)), saving: total(rows.map(g => g.benefits.saving.sum)), permission: total(rows.map(g => g.benefits.permission.sum)) };
  })));
  const allPlayers = complete.flatMap(r => Object.values(r.observations.players));
  summary.abilities = OPPORTUNITIES.map(h => {
    const ability = { id: h.id, name: h.name, offered: 0, selected: 0, triggers: 0, rewards: 0, savings: 0, permissions: 0, unknownGames: results.length - complete.length, statuses: { unmet: 0, exhausted: 0, available_unused: 0, declined: 0, used: 0, unknown: 0 }, evidence: [] };
    for (const r of complete) { const a = r.observations.abilities[h.id]; for (const k of ['offered', 'selected', 'triggers', 'rewards', 'savings', 'permissions']) ability[k] = safe(ability[k] + a[k]); for (const k of Object.keys(ability.statuses)) ability.statuses[k] += a.statuses[k]; if (a.selected && ability.evidence.length < 3) ability.evidence.push(r.sampleId); }
    return { ...ability, usage: usageWarnings(ability, allPlayers, rules) };
  });
  summary.economyByOutcome = Object.fromEntries(['natural', 'censored'].map(outcome => [outcome, Object.fromEntries(Object.keys(summary.economy).map(kind => {
    const rows = complete.filter(r => r.outcome === outcome);
    return [kind, Object.fromEntries(['cashDelta', 'cashIn', 'cashOut', 'bankFlow', 'fundDelta'].map(k => [k, describe(rows.map(r => ({ value: r.observations.economy[kind]?.[k] || 0, sampleId: r.sampleId })))]))];
  }))]));
  summary.personalProgress = Object.fromEntries(['natural', 'censored'].map(outcome => [outcome, Object.fromEntries(['turns', 'skippedTurns', 'activeTurns', 'laps', 'cashDelta', 'mortgageInterest'].map(k => [k, describe(complete.filter(r => r.outcome === outcome).flatMap(r => Object.values(r.observations.players).map(p => ({ value: k === 'activeTurns' ? p.turns - p.skippedTurns : k === 'mortgageInterest' ? p.liabilities?.mortgage_interest || 0 : p[k], sampleId: r.sampleId }))))]))]));
  summary.abilitiesByPlayers = [2, 3, 4].map(n => ({ n, abilities: OPPORTUNITIES.map(h => {
    const rows = complete.filter(r => r.playerCount === n), a = { id: h.id, selected: 0, offered: 0, triggers: 0, rewards: 0, savings: 0, permissions: 0, statuses: { unmet: 0, exhausted: 0, available_unused: 0, declined: 0, used: 0, unknown: 0 } };
    for (const r of rows) { const value = r.observations.abilities[h.id]; for (const k of ['selected', 'offered', 'triggers', 'rewards', 'savings', 'permissions']) a[k] = safe(a[k] + value[k]); for (const k of Object.keys(a.statuses)) a.statuses[k] += value.statuses[k]; }
    return { ...a, usage: usageWarnings(a, rows.flatMap(r => Object.values(r.observations.players)), rules) };
  }) }));
  for (const n of [2, 3, 4]) for (const name of ['remote_build', 'investment_defense', 'airport_neighbor']) {
    const rows = complete.filter(r => r.playerCount === n).flatMap(r => r.observations.combinations[name].map(p => ({ ...p, sampleId: r.sampleId, groupId: r.groupId, natural: r.outcome === 'natural', won: r.winnerId === p.playerId })));
    const groups = new Set(rows.map(r => r.groupId)).size, natural = rows.filter(r => r.natural).length;
    summary.combinations.push({ n, name, players: rows.length, groups, naturalPlayers: natural, wins: rows.filter(r => r.won).length, conditionalWinRate: ratio(rows.filter(r => r.won).length, natural), adequate: groups >= rules.comboGroupsMin, interpretation: groups >= rules.comboGroupsMin ? '探索观察，不作因果或组合排名' : '组合证据不足，不排名', assets: describe(rows.map(r => ({ value: r.assets?.total ?? null, sampleId: r.sampleId }))), evidence: rows.slice(0, 3).map(r => ({ sampleId: r.sampleId, playerId: r.playerId, triggers: r.triggers, benefits: r.benefits })) });
  }
  summary.bootstrapRandomCalls = rng.calls;
  return summary;
}
module.exports = { aggregate, validate, coverageFor, describe, quantile, intervals, evidenceGate, classify, buildVectors, descriptors, bootstrap, usageWarnings };
