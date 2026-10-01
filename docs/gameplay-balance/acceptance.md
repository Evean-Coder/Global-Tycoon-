# 玩法胜率平衡验证验收记录

> 开发与正式抽样均已获批准。当前正式批次执行中，终局覆盖、审计及报告项未提前标为通过。

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
| C45 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |
| C46 | 通过 | storage输出预算、异常中断用例通过；Windows初次失败目录保留，有限重试用例通过且九局重跑完成 |
| C47 | 通过 | storage输出预算、异常中断用例通过；Windows初次失败目录保留，有限重试用例通过且九局重跑完成 |
| C48 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |
| C49 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C50 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C51 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |
| C52 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |
| C53 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |
| C54 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C55 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C56 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |
| C57 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C58 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C59 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C60 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C61 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C62 | 通过 | balance-scenario五入口/续跑/完整场景实际执行；受控来源隔离，报告不生成新游戏 |
| C63 | 通过 | balance-tests.txt：88通过，0失败/跳过，实际Node20 |
| C64 | 通过 | full-tests235/235、lint0；规则摘要仅获批actionValidation例外，package无新增生产依赖 |
| C65 | 通过 | browser-tests.txt：四文件9/9；仅自动化视口，物理设备未覆盖 |
| C66 | 通过 | debug-summary.json及debug-n2/n3/n4.txt：九局6自然3截断、零异常；提交e106b27冻结 |
| C67 | 通过 | formal-registration.json：首动作前4200/2240、版本/文档摘要和240分钟/2GiB核验通过 |
| C68 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |
| C69 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |
| C70 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |
| C71 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |
| C72 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |
| C73 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |
| C74 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |
| C75 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |
| C76 | 待执行/核对 | 正式抽样/稳定审计/报告完成后核对；当前未标通过 |

## 保护与失败保留

原debug引擎异常development-smoke-20261001-1790842034329、首次正式观察异常及初次Windows占用debug-freeze-1790863388307-n2/n3/n4、新九局debug-verified-1790863611922-n2/n3/n4均保留专用artifacts中，未混入正式、未批量加入Git。获批自救修复证据见rescue-fix-proposal.md与rescue-fix-tests.txt。正式冻结提交与指纹见formal-registration.json；预算与统计门槛保持批准原值。

## 当前限制

T1–T81完成，T82执行中，T83–T86待执行。尚无足够正式证据宣称平衡，也没有确认任何玩法强弱。
