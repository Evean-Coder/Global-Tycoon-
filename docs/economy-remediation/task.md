# 长局与投资整改 Tasks

2026-10-05。测试工具部分按自行审批授权通过，顺序执行。

| 任务 | 文件/步骤 | 验证 |
|---|---|---|
| T1 | 本目录四份文档与progress.md | 自审范围及AC覆盖 |
| T2 | scripts/remediation/candidate.js | 精确源码匹配及阶段边界/旧规则 |
| T3 | scripts/remediation/investment-policy.js | 无收益不买、无折价、H5一股、储备/累计上限 |
| T4 | test/remediation.test.js | 必要真实动作预检、候选起点结算、原策略指纹 |
| T5 | scripts/remediation/run.js及独立登记 | 6轨迹硬上限、180秒守卫、实际预算 |
| T6 | 同run.js审查与有限候选对照 | 初始哈希、终局/截断、现金注入 |
| T7 | 本目录results、production-spec.md | 根据证据给出整改规格及未验证项 |
| T8 | 当前索引、进度、验收及相关提交 | 链接、Git范围和旧保护指纹 |

生产规则及正式UI仍需用户批准具体spec；不能把本测试任务自审当成已批准正式修改。
