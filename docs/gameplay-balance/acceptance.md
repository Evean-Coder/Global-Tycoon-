# 玩法胜率平衡验证验收记录

> 文档状态（2026-10-02）：本文批准目标或过程提案保留，当前开发/启动 T1–T82 已完成；正式抽样按用户要求停止，T83 停止，T84/T85 未完成，T86 记录完成但整体验收未完成。新批终止 63 局（42 自然、21 截断、0 异常），2 待恢复；不能把计划 4200 局当作已执行。最新依据见 [进度](progress.md)、[部分验收](acceptance.md)、[停止快照](stopped-summary.json) 与 [项目现状](../项目现状.md)，不自动续跑。

> 开发与正式抽样均已获批准。用户已要求停止继续验证；抽样进程已退出。保存实际计数，正式审计与完整统计未执行项如实保留。

## 回归门禁

Node v20.20.2。九文件89/89（balance-tests.txt）、全项目235/235（full-tests.txt）、lint退出0（full-lint.txt）、四浏览器文件9/9（browser-tests.txt），无跳过。浏览器覆盖自动化视口、缩放和缓存，不声称所有物理设备已测。

## 逐项证据

完整九文件门禁执行了每个相关用例；下表引用用例组与原始日志，受控测试不计正式胜率。

| 项目 | 状态 | 实际证据与范围 |
|---|---|---|
| C1 | 通过 | baseline-status/rules.json、Node20门禁与独立内存对照；真实3000端口未用 |
| C2 | 通过 | balance-config.test.js全部9项通过；balance-tests.txt |
| C3 | 通过 | balance-config.test.js全部9项通过；balance-tests.txt |
| C4 | 通过 | balance-config.test.js全部9项通过；balance-tests.txt |
| C5 | 通过 | balance-config.test.js全部9项通过；balance-tests.txt |
| C6 | 通过 | balance-config.test.js全部9项通过；balance-tests.txt |
| C7 | 通过 | balance-session.test.js全部10项及server-parity7项通过；自然/截断debug完整流水 |
| C8 | 通过 | balance-session.test.js全部10项及server-parity7项通过；自然/截断debug完整流水 |
| C9 | 通过 | balance-session.test.js全部10项及server-parity7项通过；自然/截断debug完整流水 |
| C10 | 通过 | balance-session.test.js全部10项及server-parity7项通过；自然/截断debug完整流水 |
| C11 | 通过 | balance-session.test.js全部10项及server-parity7项通过；自然/截断debug完整流水 |
| C12 | 通过 | balance-session.test.js全部10项及server-parity7项通过；自然/截断debug完整流水 |
| C13 | 通过 | balance-session.test.js全部10项及server-parity7项通过；自然/截断debug完整流水 |
| C14 | 通过 | balance-session.test.js全部10项及server-parity7项通过；自然/截断debug完整流水 |
| C15 | 通过 | balance-session.test.js全部10项及server-parity7项通过；自然/截断debug完整流水 |
| C16 | 通过 | balance-session.test.js全部10项及server-parity7项通过；自然/截断debug完整流水 |
| C17 | 通过 | balance-session.test.js全部10项及server-parity7项通过；自然/截断debug完整流水 |
| C18 | 通过 | balance-policy.test.js全部15项与server-parity7项通过；私有视图/经营/自救/真实行动者覆盖 |
| C19 | 通过 | balance-policy.test.js全部15项与server-parity7项通过；私有视图/经营/自救/真实行动者覆盖 |
| C20 | 通过 | balance-policy.test.js全部15项与server-parity7项通过；私有视图/经营/自救/真实行动者覆盖 |
| C21 | 通过 | balance-policy.test.js全部15项与server-parity7项通过；私有视图/经营/自救/真实行动者覆盖 |
| C22 | 通过 | balance-policy.test.js全部15项与server-parity7项通过；私有视图/经营/自救/真实行动者覆盖 |
| C23 | 通过 | balance-policy.test.js全部15项与server-parity7项通过；私有视图/经营/自救/真实行动者覆盖 |
| C24 | 通过 | balance-policy.test.js全部15项与server-parity7项通过；私有视图/经营/自救/真实行动者覆盖 |
| C25 | 通过 | balance-policy.test.js全部15项与server-parity7项通过；私有视图/经营/自救/真实行动者覆盖 |
| C26 | 通过 | balance-policy.test.js全部15项与server-parity7项通过；私有视图/经营/自救/真实行动者覆盖 |
| C27 | 通过 | balance-observe.test.js全部15项、session逐局结果、stats分层；debug九局逐动作现金/基金对账无误 |
| C28 | 通过 | balance-observe.test.js全部15项、session逐局结果、stats分层；debug九局逐动作现金/基金对账无误 |
| C29 | 通过 | balance-observe.test.js全部15项、session逐局结果、stats分层；debug九局逐动作现金/基金对账无误 |
| C30 | 通过 | balance-observe.test.js全部15项、session逐局结果、stats分层；debug九局逐动作现金/基金对账无误 |
| C31 | 通过 | balance-observe.test.js全部15项、session逐局结果、stats分层；debug九局逐动作现金/基金对账无误 |
| C32 | 通过 | balance-observe.test.js全部15项、session逐局结果、stats分层；debug九局逐动作现金/基金对账无误 |
| C33 | 通过 | balance-observe.test.js全部15项、session逐局结果、stats分层；debug九局逐动作现金/基金对账无误 |
| C34 | 通过 | balance-observe.test.js全部15项、session逐局结果、stats分层；debug九局逐动作现金/基金对账无误 |
| C35 | 通过 | balance-observe.test.js全部15项、session逐局结果、stats分层；debug九局逐动作现金/基金对账无误 |
| C36 | 通过 | balance-observe.test.js全部15项、session逐局结果、stats分层；debug九局逐动作现金/基金对账无误 |
| C37 | 通过 | balance-observe.test.js全部15项、session逐局结果、stats分层；debug九局逐动作现金/基金对账无误 |
| C38 | 通过 | balance-observe.test.js全部15项、session逐局结果、stats分层；debug九局逐动作现金/基金对账无误 |
| C39 | 通过 | balance-observe.test.js全部15项、session逐局结果、stats分层；debug九局逐动作现金/基金对账无误 |
| C40 | 通过 | balance-storage/replay/scenario全部通过；原子失败/前缀修复/独立重放/异版本拒绝；balance-tests.txt |
| C41 | 通过 | balance-storage/replay/scenario全部通过；原子失败/前缀修复/独立重放/异版本拒绝；balance-tests.txt |
| C42 | 通过 | balance-storage/replay/scenario全部通过；原子失败/前缀修复/独立重放/异版本拒绝；balance-tests.txt |
| C43 | 通过 | balance-storage/replay/scenario全部通过；原子失败/前缀修复/独立重放/异版本拒绝；balance-tests.txt |
| C44 | 通过 | balance-storage/replay/scenario全部通过；原子失败/前缀修复/独立重放/异版本拒绝；balance-tests.txt |
| C45 | 通过（边界测试＋实际片段） | storage预算用例通过；正式60秒片段已产生2待恢复，人工中断后流水保留；实际240分钟未耗尽 |
| C46 | 通过 | storage输出预算、异常中断用例通过；Windows初次失败目录保留，有限重试用例通过且九局重跑完成 |
| C47 | 通过 | storage输出预算、异常中断用例通过；Windows初次失败目录保留，有限重试用例通过且九局重跑完成 |
| C48 | 通过 | formal-run.txt及stopped-summary.json：计划/实际/待恢复/组/预算齐全，稳定选取与缺类保存；不表示审计完成 |
| C49 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C50 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C51 | 本批未完成 | 正式基线2/3/4均有结果，但用户停止，尚未生成本批完整座位/区间/资产/局长表；工具统计测试已通过 |
| C52 | 本批未完成 | 固定计划矩阵测试通过，63结果含两人/三人经营；四人交叉2局待恢复，实际缺口见快照，未生成完整比较表 |
| C53 | 本批未完成 | 12项及三阶段分层测试通过；新批完整报告因用户停止未执行 |
| C54 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C55 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C56 | 本批未执行 | 构造测试实际50000次通过；本批用户停止重采样，不能据此写成本批已执行50000次 |
| C57 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C58 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C59 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C60 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C61 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C62 | 通过 | balance-scenario五入口/续跑/完整场景实际执行；受控来源隔离，报告不生成新游戏 |
| C63 | 通过 | balance-tests.txt：89通过，0失败/跳过，实际Node20 |
| C64 | 通过 | full-tests235/235、lint0；规则摘要仅获批actionValidation例外，package无新增生产依赖 |
| C65 | 通过 | browser-tests.txt：四文件9/9；仅自动化视口，物理设备未覆盖 |
| C66 | 通过 | debug-summary.json及debug-n2/n3/n4.txt：修复后九局6自然3截断、零异常；新批提交2405e1b冻结，旧e106b27批次单列保留 |
| C67 | 通过 | formal-registration.json：新批首动作前4200/2240、干净源指纹、文档摘要、策略及种子逐项不变、旧预算保留 |
| C68 | 通过（实际覆盖有限） | 真实formal交错运行后用户要求停止；63终止/2待恢复/4135未执行，23完整组；没有虚称完成全部计划 |
| C69 | 通过 | store.results/reconcile校验唯一结果与原清单；42自然21截断0异常；2待恢复仍保留，累计39.60分钟约83.45MiB，无自动加预算 |
| C70 | 本批未执行 | 用户要求停止，本批仅稳定选取未独立重放；旧版本五类代表审计一致与四类缺失另存，不替代新批审计 |
| C71 | 本批未完成 | 保存stopped-summary.json实际计数及证据位置；用户停止后未运行本批完整--report，不能称完整平衡报告 |
| C72 | 本批代表重放未执行 | 每步现金/基金观察守卫已执行，63终止无观察错误；旧版本代表重放与受控账务测试保留，本批未新增代表审计 |
| C73 | 通过 | 正式数值未调；当前明确证据不足、不是等强/真人胜率结论；规则摘要仅获批actionValidation例外 |
| C74 | 通过 | balance-scenario完整场景实际正常首选/经营/后续阶段/终止/保存/重放/报告通过；旧正式代表五类连续证据保留 |
| C75 | 通过 | scenario续跑与原子检查点失败恢复用例实际执行且通过，结果与连续运行相同、不重复 |
| C76 | 通过（部分验收如实交付） | 76行逐项证据、86任务状态与用户停止记录齐全；显式提交本轮源/测试/文档，原始大批流水未入Git |

## 保护与失败保留

原debug引擎异常development-smoke-20261001-1790842034329、首次正式观察异常及初次Windows占用debug-freeze-1790863388307-n2/n3/n4、新九局debug-verified-1790863611922-n2/n3/n4均保留专用artifacts中，未混入正式、未批量加入Git。获批自救修复证据见rescue-fix-proposal.md与rescue-fix-tests.txt。正式冻结提交与指纹见formal-registration.json；预算与统计门槛保持批准原值。

## 用户停止后的实际范围

新批63局终止：42自然、21截断、0异常；2待恢复，4135未执行，23完整组。累计正式预算39.60分钟，预算未耗尽，停止原因是用户要求。运行进程已确认退出，预算锁已由标准预算读取流程清理。

新批尚未完成C51/C52/C53/C56/C70/C71/C72。用户要求停止继续验证，因此不补跑；checklist保持未勾选。T1–T82的开发/启动步骤已完成，T83用户停止，T84/T85本批未完成，T86记录已完成但完整验收未完成。

当前只能说功能回归及已运行样本未发现新问题。玩法胜率平衡仍证据不足，不能称4200局完成、所有玩法已平衡或不存在任何缺陷。
