# 玩法胜率平衡验证验收记录

> 最新补充（2026-10-02）：原466局的C56/C70/C72已在用户批准的独立A审查预算内补齐；69比较各实际50000次，六代表9152条记录重放一致，逐类账务匹配。旧240分钟预算、旧报告和下方停止时历史段落保留。当前第二轮执行及证据见[新验收](../balance-review/acceptance.md)。

> 文档状态（2026-10-02）：2026-10-02续跑已在240分钟累计预算上限停止：467开局、466终止（290自然、176截断、0异常），1待恢复、3733未开始，108完整组。描述性报告已导出；本批代表审计及50000次重采样未执行，整体仍部分验收。批准正文及历史记录保留，最新结果见 [续跑汇总](formal-summary-20261002.md)、[进度](progress.md) 和 [验收](acceptance.md)。

> 原开发与续跑已获授权；原累计预算已耗尽，描述性报告导出。代表审计及正式重采样尚未完成，不追加对局。

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
| C45 | 通过（实际预算停止） | 标准续跑在240分钟累计上限自动保存为待恢复，停止边界及报告保存超出285.382ms如实记录；未补胜者或改为逻辑截断 |
| C46 | 通过 | storage输出预算、异常中断用例通过；Windows初次失败目录保留，有限重试用例通过且九局重跑完成 |
| C47 | 通过 | storage输出预算、异常中断用例通过；Windows初次失败目录保留，有限重试用例通过且九局重跑完成 |
| C48 | 通过 | 续跑日志、实际快照和evidence-index记录计划/实际/待恢复/组/预算；六类稳定代表仅选取，未审计 |
| C49 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C50 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C51 | 通过（区间不可估计） | 本批report实验表及formal-summary-20261002.md九座位补充表，胜场/两分母/出局/自然和截断资产/局长齐全；区间实际0次，明确不可估计 |
| C52 | 通过（覆盖未完成） | report及实际快照包含六配对、四三人组合、四人全场，14实验目标/实际/组数；没有把不同实验条件胜率混合排名 |
| C53 | 通过（描述性） | 实际summary保留12机遇、108阶段概览、后期存活/资产层/名次分层，首期中性逐座位比较；所有主要比较证据不足 |
| C54 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C55 | 通过 | balance-stats.test.js全部12项通过（含实际50000整组重采样）；来源、分母、阈值、退化、报告证据均执行 |
| C56 | 独立A补齐 | 原466结果的69比较各实际50000次；普通/校正区间和9/24/36族保留，未降低原证据门槛。原预算耗尽时报告仍保留实际0次 |
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
| C68 | 通过（覆盖有限） | 原批次续跑467开局/466终止/1待恢复/3733未开始/108完整组；225分钟切换未执行，240预算停止偏差如实记录 |
| C69 | 通过 | 标准报告validate/reconcile通过，466唯一结果=290自然+176截断+0异常；原两局已结束，新待恢复933记录与检查点匹配；旧证据未删 |
| C70 | 独立A补齐 | 原本批六类稳定代表9152条记录全部重放一致，随机/观察/终态核对通过；三个异常类别为空；不是旧版本审计替代 |
| C71 | 通过（描述性报告） | 实际--report退出0，report/summary/evidence-index及本地汇总已交付，各人数/路线/机遇/组合和流水索引齐全；区间及审计未完成明确列出 |
| C72 | 独立A补齐 | 原本批六代表逐步重放及逐类账务汇总一致；每类实际首笔与原结构化事件可核对，未发生项不造样本 |
| C73 | 通过 | 正式数值未调；当前明确证据不足、不是等强/真人胜率结论；规则摘要仅获批actionValidation例外 |
| C74 | 通过 | balance-scenario完整场景实际正常首选/经营/后续阶段/终止/保存/重放/报告通过；旧正式代表五类连续证据保留 |
| C75 | 通过 | scenario续跑与原子检查点失败恢复用例实际执行且通过，结果与连续运行相同、不重复 |
| C76 | 通过（部分验收记录） | 76行证据与任务进度更新，73勾选/3未完成；文档、精简快照和日志显式提交，大型原始流水及既有未跟踪文件不提交 |

## 保护与失败保留

原debug引擎异常development-smoke-20261001-1790842034329、首次正式观察异常及初次Windows占用debug-freeze-1790863388307-n2/n3/n4、新九局debug-verified-1790863611922-n2/n3/n4均保留专用artifacts中，未混入正式、未批量加入Git。获批自救修复证据见rescue-fix-proposal.md与rescue-fix-tests.txt。正式冻结提交与指纹见formal-registration.json；预算与统计门槛保持批准原值。

## 10月1日用户停止后的历史范围

新批63局终止：42自然、21截断、0异常；2待恢复，4135未执行，23完整组。累计正式预算39.60分钟，预算未耗尽，停止原因是用户要求。运行进程已确认退出，预算锁已由标准预算读取流程清理。

新批尚未完成C51/C52/C53/C56/C70/C71/C72。用户要求停止继续验证，因此不补跑；checklist保持未勾选。T1–T82的开发/启动步骤已完成，T83用户停止，T84/T85本批未完成，T86记录已完成但完整验收未完成。

当前只能说功能回归及已运行样本未发现新问题。玩法胜率平衡仍证据不足，不能称4200局完成、所有玩法已平衡或不存在任何缺陷。

## 2026-10-02 续跑结束与执行偏差

2026-10-02续跑已在240分钟累计预算上限停止：467开局、466终止（290自然、176截断、0异常），1待恢复、3733未开始，108完整组。描述性报告已导出；本批代表审计及50000次重采样未执行，整体仍部分验收。原批次标准恢复，不新建批次、不重置预算、不改源码/策略/种子。原两局待恢复已正常终止，现有待恢复为新样本s-17e9d82fc8ec791ec896c805：933条完整记录、932步检查点，无不完整末条，摘要一致。

预定225分钟切换审计未执行，恢复监控时原会话已结束，manifest为paused/compute_budget，进程退出、预算锁不存在。采样总计14400001.466ms；报告导出保存另计283.916ms，累计14400285.382ms（超出原上限285.382ms）。保留实际台账，没有扩容、清零、追加对局或伪造完成审计。只导出已保存结果；69项比较的实际completedDraws全部0、reason=compute_budget，区间不可估计。

T83预算停止及覆盖核对完成，4200目标仍有3733未执行；T84未执行；T85描述性报告交付、正式50000次重采样未完成；T86部分验收记录交付。C51/C52/C53/C71表格和索引已交付；C56/C70/C72保留未完成。功能门禁235/235、89/89、lint0、浏览器9/9来自已保存10月1日结果，本次未重跑。最新[汇总](formal-summary-20261002.md)及[结构化快照](resume-summary-20261002.json)，旧停止快照和失败证据不覆盖。
