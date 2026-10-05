# 有限预算平衡检验 Tasks

2026-10-03。依据spec/plan，测试自审授权下通过。

| 任务 | 文件与步骤 | 依赖 | 验证 |
|---|---|---|---|
| T1 | 本目录四份文档、progress.md：登记批准范围与自审，建立任务实际状态 | 无 | 覆盖F/AC且无占位 |
| T2 | scripts/light-balance/control.js：哈希、PID锁、阶段与总预算、恢复和输出上限 | T1 | 注入墙钟/恢复不重置、已完成拒覆盖 |
| T3 | scripts/light-balance/cases.js：fixture、资金/股票12例 | T2 | 固定清单数量、预期与实际及失败证据 |
| T4 | 同cases.js：经营与身份/轮次12例 | T3 | 正常资格与费用、对称映射 |
| T5 | 同cases.js：12机遇 | T4 | 每项有真实作用、额度/条件明确 |
| T6 | 同cases.js：5资讯+7组合 | T5 | 折扣上限、基金、时序、资格核对 |
| T7 | scripts/light-balance/branches.js：12对fixture/首动作，共用策略、10轮/160动作限制 | T6 | 起点一致、两个分支独立、失败不补胜者 |
| T8 | scripts/light-balance/run.js：旧摘要读取、登记、分阶段运行、报告与旧保护摘要 | T7 | 独立目录端到端可追溯，0完整局 |
| T9 | test/light-balance.test.js及本目录tool-tests.txt/lint.txt | T8 | 守卫、恢复、数量/来源、至少一对短分支；必要lint |
| T10 | 实際登记并执行；本目录run-log.txt/results.json/results.md | T9 | 48例/12对实际数与缺口、程序累计≤20分钟 |
| T11 | scripts/light-balance/verify.js、本目录checklist/progress/acceptance、README与项目现状 | T10 | 只核对已保存流水/状态/预算/指纹；链接、真实结果、有限结论 |
| T12 | 相关工具与文档Git提交，大型旧流水保持原样 | T11 | 相关改动独立提交，失败证据不隐藏 |

按T1→T12执行。开发不计测试程序预算；真实案例试跑/重验计入同一台账。不启动完整局，除非有另行登记的具体必要复现且符合提案共享上限。

执行中的限定工具修复：control.js复用既有原子替换有限重试，repair.js只补失败分支并保留原登记；run.js生成摘要引用且不完整时标为partial。受控案例/分支输入与生产规则未变。审批依据、失败及恢复见progress.md和results.md。
