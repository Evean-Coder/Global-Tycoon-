'use strict';
const { openRun, loadRun } = require('./storage');
const { aggregate } = require('./stats');
const { openBudget, reconcile, selectAuditSamples } = require('./batch');
const percent = value => value === null || value === undefined ? '不可计算' : `${(value * 100).toFixed(2)}%`;
const number = value => value === null || value === undefined ? '不可计算' : String(Math.round(value * 100) / 100);
const range = value => value ? `[${percent(value[0])}, ${percent(value[1])}]` : '不可稳定估计';
const policyName = { neutral: '中性', property: '地产', investment: '投资', aviation: '航线', cautious: '稳健' };
const comboName = { remote_build: '远程与建设', investment_defense: '持股与防御', airport_neighbor: '机场与邻城' };
const economicName = { city_rent: '城市租金', city_rent_fund: '租金入基金', dividend: '基础股息', retained_income: '城主保留收益', stock_buy: '银行买股', stock_sell: '银行卖股', stock_transfer: '玩家股份转让', stock_liquidation: '股份清算', stock_forced_sell: '超持强制卖出', rescue_stock_sell: '自救卖股', build: '建设支付', flight: '机票支付', opportunity_reward: '机遇现金奖励', go: '起点基本奖励', mortgage: '抵押借款', redeem: '赎回偿付', city_purchase: '城市购置', airport_purchase: '机场购置', airport_fee: '机场通行费', auction_purchase: '拍卖支付', auction_sale: '拍卖收入', auction_bank_purchase: '流拍银行回收', direct_purchase: '直接购城支付', direct_sale: '直接售城收入', chance_reward: '机会奖励', chance_fine: '机会罚款', bankrupt_relief: '破产救济', debt_forgiveness: '债务清除（非经营收入）', bankrupt_cash_return: '出局现金收回', freeze_fee: '解冻支付', jail_fee: '出狱支付', late_jail_fee: '后期自动出狱支付' };
function evidenceLinks(ids = []) { return ids.map(id => `[${id}](samples/${id}/result.json)`).join('、') || '无已执行证据'; }
function renderReport(summary, evidenceIndex) {
  const c = summary.coverage;
  const lines = [
    '# 玩法胜率平衡验证报告', '',
    `来源：**${summary.source === 'formal' ? 'formal 正式抽样' : 'debug 开发调试，不作为正式胜率证据'}**。配置：\`${summary.configHash}\`。代码：\`${summary.codeFingerprint.hash}\`。`, '',
    `计划 ${c.planned} 局；实际开局 ${c.started}；已终止 ${c.terminated}（自然 ${c.natural}、截断 ${c.censored}、异常 ${c.error}）；待恢复 ${c.pending}；未执行 ${c.unstarted}。独立完整组 ${c.completeGroups}/${c.plannedGroups}。`, '',
    `自然完赛率（自然/实际开局）：${percent(c.completionRate)}。停止原因：${summary.stopReason || '计划完成'}。${summary.provisional ? '计划仍不完整，主要强弱结论降级为证据不足。' : '计划完成不等于已证明玩法等强。'}`, '',
    `对局逻辑上限：${summary.limits.rounds} 完整轮或 ${summary.limits.actions} 成功动作；累计计算预算 ${summary.limits.computeMs / 60000} 分钟，输出上限 ${summary.limits.outputBytes} 字节。本批计算 ${number((summary.computeMs || 0) / 60000)} 分钟，所有正式版本累计 ${number((summary.totalComputeMs || 0) / 60000)} 分钟。执行时间含同步落盘，操作间等待不计入；≥60秒且CPU低于1秒的异常静止区间单独记录为推定挂起，预算台账同时保留原墙钟、CPU与排除量以便复核。`, '',
    '## 各实验覆盖与胜率', '',
    '开局胜场占比的分母包含待恢复；条件胜率只以自然完赛局为分母。截断资产领先者没有胜场。中性基线开局均匀参考为自然完赛率/人数。', '',
  ];
  for (const e of summary.experiments) {
    lines.push(`### ${e.n} 人 · ${e.roster.map(p => policyName[p]).join('/')}`, '',
      `目标 ${e.coverage.planned}，开局 ${e.coverage.started}，自然/截断/异常 ${e.coverage.natural}/${e.coverage.censored}/${e.coverage.error}，待恢复 ${e.coverage.pending}，未执行 ${e.coverage.unstarted}；完整组 ${e.coverage.completeGroups}/${e.coverage.plannedGroups}。`, '',
      '| 座位 | 自然胜场 | 开局分母 | 开局胜场占比 | 自然分母 | 条件胜率 | 开局均匀参考 |', '|---|---:|---:|---:|---:|---:|---:|');
    for (const s of e.seats) lines.push(`| ${s.seat + 1} | ${s.wins} | ${s.started} | ${percent(s.allStartWinRate)} | ${s.natural} | ${percent(s.conditionalWinRate)} | ${percent(s.allStartUniformReference)} |`);
    lines.push('', '| 路线 | 自然胜场 | 开局分母 | 开局胜场占比 | 自然分母 | 条件胜率 |', '|---|---:|---:|---:|---:|---:|');
    for (const p of e.policies) lines.push(`| ${policyName[p.policy]} | ${p.wins} | ${p.started} | ${percent(p.allStartWinRate)} | ${p.natural} | ${percent(p.conditionalWinRate)} |`);
    lines.push('', '| 终止类别 | 局数 | 完整轮均值 | 中位数 | P10/P90 | 成功动作均值 | 停止时个人资产均值 |', '|---|---:|---:|---:|---|---:|---:|');
    for (const [kind, label] of [['natural', '自然'], ['censored', '截断'], ['error', '异常']]) {
      const d = e.duration[kind]; lines.push(`| ${label} | ${d.rounds.count} | ${number(d.rounds.mean)} | ${number(d.rounds.median)} | ${number(d.rounds.p10)}/${number(d.rounds.p90)} | ${number(d.actions.mean)} | ${number(e.assets[kind]?.mean)} |`);
    }
    lines.push('', `局长极端证据：${evidenceLinks([e.duration.natural.rounds.maxEvidence, e.duration.censored.rounds.maxEvidence].filter(Boolean))}。${e.longGame ? '**长局警报**：达到预设截断率或自然局长P90门槛。' : '长局警报未触发或完整实验覆盖不足。'}`, '');
  }
  lines.push('## 主要比较与不确定性', '',
    `固定报告随机种子 ${summary.reportSeed}，每个可计算分层计划 ${summary.screeningRules.bootstrapDraws} 次整组重采样；座位/路线/首阶段机遇三族 m=${summary.screeningRules.familySizes.seat}/${summary.screeningRules.familySizes.policy}/${summary.screeningRules.familySizes.opportunity}。同组全部排列和同局玩家保留依赖。`, '',
    '首阶段机遇来自随机选择中性基线，逐座位计算选择/未选择条件胜率，再等权求差。它是当前候选机制和策略下的关联；后期机遇不混入该比较。', '',
    '| 人数/实验 | 比较 | 条件胜率差 | 普通95%区间 | 族内校正区间 | 自然两侧玩家/独立组 | 结论 |', '|---|---|---:|---|---|---|---|');
  for (const row of summary.comparisons) {
    const detail = row.detail ? `${row.detail.selected}/${row.detail.nonselected}；组${row.detail.selectedGroups}/${row.detail.nonselectedGroups}` : '见实验覆盖';
    lines.push(`| ${row.n}人 ${row.key} | ${row.family} ${row.id} | ${percent(row.effect)} | ${range(row.interval.ordinary)} | ${range(row.interval.adjusted)} | ${detail} | ${row.classification.label}：${row.classification.explanation || '区间与门槛不足'} |`);
  }
  if (!summary.comparisons.length) lines.push('| — | debug不进行正式强弱比较 | 不可计算 | 不可稳定估计 | 不可稳定估计 | — | 证据不足 |');
  lines.push('', '各座位两侧分母、有效重采样次数、固定尾概率及完整门槛原因保存在summary.json，零分母不填0。近似区间和分族校正不构成整份报告精确总体保证。', '',
    '## 12项机遇的出现、使用与收益', '',
    '候选出现次数含换组；生效选择与实际触发分开。现金奖励、实际节省和行动权限分别记录，节省不再次加进现金；中断局不当作整局未触发。', '',
    '| 机遇 | 候选/生效 | 实际触发 | 现金奖励 | 实际节省 | 权限次数 | 合法且有额度/使用 | 放弃/额度耗尽/未知 | 使用提示 |', '|---|---:|---:|---:|---:|---:|---|---|---|');
  for (const a of summary.abilities) lines.push(`| ${a.id} ${a.name} | ${a.offered}/${a.selected} | ${a.triggers} | ${a.rewards} | ${a.savings} | ${a.permissions} | ${a.usage.eligible}/${a.usage.used}（${percent(a.usage.useRate)}） | ${a.statuses.declined}/${a.statuses.exhausted}/${a.statuses.unknown}；观察缺失局${a.unknownGames} | ${a.usage.lowUsage ? '低使用警报 ' : ''}${a.usage.rarelyEligible ? '难触发警报' : '保留资格与决策区别'} |`);
  lines.push('', '### 人数与选择阶段', '', '| 人数 | 阶段 | 机遇 | 生效样本 | 自然/截断玩家 | 自然胜场/条件胜率 | 奖励/节省/权限 |', '|---|---:|---|---:|---|---|---|');
  for (const s of summary.stageOverview) lines.push(`| ${s.n} | ${s.stage} | ${s.id} | ${s.selected} | ${s.natural}/${s.censored} | ${s.wins}/${percent(s.conditionalWinRate)} | ${s.reward}/${s.saving}/${s.permission} |`);
  lines.push('', '第二、第三阶段进一步按当时存活人数、≤150000/150000–300000/>300000资产层和个人资产名次分层；完整分层、收益均值/中位数/P10/P90在summary.json的stages字段。后期存活选择不能与首期直接比较。', '',
    '## 组合探索', '', '| 人数 | 组合 | 玩家/独立组 | 自然玩家/胜场 | 条件胜率 | 解释 | 证据 |', '|---|---|---|---|---:|---|---|');
  for (const c of summary.combinations) lines.push(`| ${c.n} | ${comboName[c.name]} | ${c.players}/${c.groups} | ${c.naturalPlayers}/${c.wins} | ${percent(c.conditionalWinRate)} | ${c.interpretation} | ${evidenceLinks(c.evidence.map(e => e.sampleId))} |`);
  lines.push('', '## 经济流水与估值', '', '正负现金、银行净流入和城市基金分别核对。股票转让是玩家间转移；抵押是借款；股息与城主保留收益分别列示。债务清除不作为经营获利，资产估值不作为现金收入。', '', '| 项目 | 玩家实收总额 | 玩家实付总额 | 玩家净变化 | 银行流向玩家/基金 | 基金净变化 | 银行额外补足（已含结算） | 笔数 |', '|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const [kind, e] of Object.entries(summary.economy)) lines.push(`| ${economicName[kind] || kind} | ${e.cashIn} | ${e.cashOut} | ${e.cashDelta} | ${e.bankFlow} | ${e.fundDelta} | ${e.bankSupplement} | ${e.count} |`);
  lines.push('', '自然完赛与截断的逐局收入/支出分布、均值/中位数/P10/P90及极端样本在economyByOutcome；规范资产、完成回合/跳过回合/主动回合、绕圈、现金净变化及利息负债变化在summary.json。操作动作数没有当成个人回合数。', '',
    '## 观察与后续建议', '');
  const risks = summary.comparisons.filter(r => ['明显风险', '观察到趋势'].includes(r.classification.label));
  if (!risks.length) lines.push('- 当前没有满足预设门槛的调参依据；先查看未覆盖、截断、区间不稳定和难触发条目。不能据此宣称规则等强。');
  for (const r of risks) lines.push(`- **观测**：${r.n}人 ${r.id} ${r.classification.label}，条件差${percent(r.effect)}。**可能原因**：候选分布、经营路线或同局竞争。**调参建议**：先审计对应首期选择与逐笔费用/收益，随后另立规则方案；本轮没有直接修改数值。`);
  for (const a of summary.abilities.filter(a => a.usage.lowUsage || a.usage.rarelyEligible)) lines.push(`- ${a.id}：${a.usage.lowUsage ? '具备条件后的使用率偏低，优先检查当前经营策略的主动放弃。' : '观测窗口中资格出现偏少，优先核对获取门槛与对局长度。'}证据 ${evidenceLinks(a.evidence)}。收益不足与能力独立强度不是同一结论。`);
  lines.push('', '## 审计与证据索引', '', '| 人数 | 终止类别 | 稳定代表样本 |', '|---|---|---|');
  for (const item of evidenceIndex.auditSelection) lines.push(`| ${item.playerCount} | ${item.outcome} | ${item.sampleId ? evidenceLinks([item.sampleId]) : '实际批次无此类别，不制造样本'} |`);
  lines.push('', '稳定样本选取不表示已完成审计；实际审计凭据见evidence-index.json的audits。缺失类别、预算不足与未执行项均保留。动作流位于samples/<sampleId>/actions，检查点与结果可回溯到同一有效前缀。', '', '## 适用限制', '');
  for (const limitation of summary.limitations) lines.push('- ' + limitation);
  return lines.join('\n') + '\n';
}
function writeReport(summary, evidenceIndex, store) {
  const report = renderReport(summary, evidenceIndex);
  store.atomic('summary.json', summary); store.atomic('evidence-index.json', evidenceIndex); store.atomic('report.md', report, { raw: true });
  return { report: `${store.dir}/report.md`, summary: `${store.dir}/summary.json`, evidenceIndex: `${store.dir}/evidence-index.json` };
}
async function reportRun(runDir, options = {}) {
  const { config, schedule, manifest } = loadRun(runDir, options), store = openRun(config, { ...options, resume: true });
  const budget = options.budget || openBudget(config, options);
  try {
    const results = store.results(schedule); reconcile(manifest, schedule, results);
    const summary = await aggregate(manifest, results, config, { schedule, allowDebug: config.source === 'debug', budget, onProgress: options.onProgress });
    summary.totalComputeMs = budget.computeMs; summary.computeMs = budget.runComputeMs;
    const evidenceIndex = { source: config.source, configHash: config.configHash, auditSelection: selectAuditSamples(results), samples: results.map(r => ({ sampleId: r.sampleId, groupId: r.groupId, outcome: r.outcome, result: `samples/${r.sampleId}/result.json`, actions: `samples/${r.sampleId}/actions`, position: r.position })), audits: store.audits(), plannedUnexecuted: schedule.filter(s => manifest.samples[s.sampleId].status === 'unstarted').map(s => s.sampleId), pending: schedule.filter(s => manifest.samples[s.sampleId].status === 'pending').map(s => s.sampleId) };
    const work = budget.beginWork();
    try { return { ...writeReport(summary, evidenceIndex, store), data: summary }; } finally { budget.endWork(work); }
  } finally { budget.close(); }
}
module.exports = { renderReport, writeReport, reportRun, percent };
