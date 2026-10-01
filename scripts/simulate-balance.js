'use strict';
const { ROOT, parseArgs, buildConfig, fingerprintSources } = require('./balance/config');
const { loadRun } = require('./balance/storage');
const { runBatch, auditSample } = require('./balance/batch');
const { reportRun } = require('./balance/report');
const HELP = `玩法胜率平衡验证（Node 20）

默认开发调试：20局、种子22、4人；不会默认开始正式4200局。
  node scripts/simulate-balance.js --games 3 --seed 22 --players 2
  node scripts/simulate-balance.js --formal --output artifacts/gameplay-balance/<runId>
  node scripts/simulate-balance.js --resume artifacts/gameplay-balance/<runId>
  node scripts/simulate-balance.js --replay artifacts/gameplay-balance/<runId> --sample <sampleId>
  node scripts/simulate-balance.js --report artifacts/gameplay-balance/<runId>

正式计划4200局/2240独立组；单局500完整轮或20000成功动作。
累计正式计算240分钟（含恢复、审计和分析），60秒片段轮转，专用输出最多2GiB。
预算/中断保存为待恢复，不产生胜负；首个工具错误停止批次。原规则数值不变。
五种模式互斥；正式/证据模式禁止--games/--seed/--players临时覆盖。
输出仅接受项目artifacts/gameplay-balance下独立目录，不能覆盖旧批次。
退出码：0完成/帮助，1参数或入口错误，2工具异常，3预算或中断暂停。
`;
async function main(argv = process.argv.slice(2), options = {}) {
  const args = parseArgs(argv), write = options.write || (line => console.log(line));
  if (args.mode === 'help') { write(HELP); return { exitCode: 0, mode: 'help' }; }
  const root = options.root || ROOT, fingerprint = options.fingerprint || fingerprintSources(root);
  const shared = { ...options, root, fingerprint };
  let lastProgress = 0;
  const progress = m => {
    options.onProgress?.(m);
    if (Date.now() - lastProgress < 10000 && !['complete', 'paused'].includes(m.status)) return;
    lastProgress = Date.now();
    const c = m.coverage;
    if (c) write(`进度 ${c.terminated}/${c.planned}；待恢复 ${c.pending}；完整组 ${c.completeGroups}/${c.plannedGroups}；累计计算 ${((m.totalComputeMs || 0) / 60000).toFixed(2)}分钟${m.stopReason ? '；' + m.stopReason : ''}`);
  };
  if (args.mode === 'report') {
    const report = await reportRun(args.runDir, shared); write('报告：' + report.report);
    return { exitCode: 0, mode: args.mode, report };
  }
  if (args.mode === 'replay') {
    const audit = await auditSample(args.runDir, args.sampleId, shared);
    write(audit.ok ? `审计一致：${audit.sampleId}，${audit.checkedRecords}条记录` : `审计${audit.paused ? '暂停' : '不一致'}：${audit.sampleId}`);
    return { exitCode: audit.ok ? 0 : audit.paused ? 3 : 2, mode: args.mode, audit };
  }
  const config = args.mode === 'resume' ? loadRun(args.runDir, shared).config : buildConfig(args, fingerprint);
  const manifest = await runBatch(config, { ...shared, resume: args.mode === 'resume', onProgress: progress });
  const error = ['first_error', 'previous_error', 'tool_failure', 'storage_failure'].includes(manifest.stopReason);
  let report = null;
  // Formal analyses run explicitly after coverage/audits are checked; debug can
  // provide an immediate report with its non-formal source prominently labelled.
  if (config.source === 'debug' && manifest.status === 'complete') { report = await reportRun(config.output, shared); write('调试报告：' + report.report); }
  return { exitCode: manifest.status === 'complete' ? 0 : error ? 2 : 3, mode: args.mode, manifest, report };
}
if (require.main === module) main().then(result => { process.exitCode = result.exitCode; }).catch(error => { console.error('验证入口失败：' + error.message); process.exitCode = 1; });
module.exports = { main, parseArgs, HELP };
