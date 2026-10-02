# 玩法胜率平衡验证 Tasks

> 文档状态（2026-10-02）：本文批准目标或过程提案保留，当前开发/启动 T1–T82 已完成；正式抽样按用户要求停止，T83 停止，T84/T85 未完成，T86 记录完成但整体验收未完成。新批终止 63 局（42 自然、21 截断、0 异常），2 待恢复；不能把计划 4200 局当作已执行。最新依据见 [进度](progress.md)、[部分验收](acceptance.md)、[停止快照](stopped-summary.json) 与 [项目现状](../项目现状.md)，不自动续跑。

> 版本：1.0｜2026-10-01｜依据已批准spec.md v1.0与plan.md v1.0；共86项任务，整份task.md已获用户“确认”批准。checklist.md已获用户“确认”批准，进入按任务开发。

## 执行约定

- 每项围绕一个编码或人工处理单元，通常2–5分钟；长时间自动测试与正式批次按批准预算运行，其启动、进度核对和结束验收分别列为任务。
- 按依赖与编号执行；本文没有授权并行子代理。每项必须运行验证并记入progress.md，有实际证据才标完成。
- 以下命令中的node/npm均使用准备阶段确认的实际Node 20运行环境。测试名称对应该任务新增行为用例，验证失败先修适配再继续。
- 每组相关任务验证通过后本地提交本轮文件；不批量暂存既有未跟踪文件或大批原始流水，不推送远端。
- 正式服纯规则模块只复用；不修改42格、单骰、获胜条件、费用/收益/机遇数值或玩家入口。需要正式行为修复时保留证据，先修订审批。
- 4200局是固定目标，240分钟/2GiB是上限；未覆盖和不能稳定判强弱的结果必须交付，不自动增加预算或强造自然胜负。

## 文件清单

| 操作 | 文件 | 职责 |
|---|---|---|
| 修改 | `scripts/simulate-balance.js` | 五种本地入口与旧模拟流程替换 |
| 修改 | `package.json` | balance脚本别名，保留现有门禁与依赖 |
| 新建 | `scripts/balance/config.js` | config模块，职责按批准plan |
| 新建 | `scripts/balance/schedule.js` | schedule模块，职责按批准plan |
| 新建 | `scripts/balance/random.js` | random模块，职责按批准plan |
| 新建 | `scripts/balance/canonical.js` | canonical模块，职责按批准plan |
| 新建 | `scripts/balance/session.js` | session模块，职责按批准plan |
| 新建 | `scripts/balance/policy.js` | policy模块，职责按批准plan |
| 新建 | `scripts/balance/observe.js` | observe模块，职责按批准plan |
| 新建 | `scripts/balance/storage.js` | storage模块，职责按批准plan |
| 新建 | `scripts/balance/replay.js` | replay模块，职责按批准plan |
| 新建 | `scripts/balance/batch.js` | batch模块，职责按批准plan |
| 新建 | `scripts/balance/stats.js` | stats模块，职责按批准plan |
| 新建 | `scripts/balance/report.js` | report模块，职责按批准plan |
| 新建 | `test/balance-config.test.js` | 对应行为与集成验证 |
| 新建 | `test/balance-session.test.js` | 对应行为与集成验证 |
| 新建 | `test/balance-policy.test.js` | 对应行为与集成验证 |
| 新建 | `test/balance-observe.test.js` | 对应行为与集成验证 |
| 新建 | `test/balance-storage.test.js` | 对应行为与集成验证 |
| 新建 | `test/balance-replay.test.js` | 对应行为与集成验证 |
| 新建 | `test/balance-stats.test.js` | 对应行为与集成验证 |
| 新建 | `test/balance-server-parity.test.js` | 对应行为与集成验证 |
| 新建 | `test/balance-scenario.test.js` | 对应行为与集成验证 |
| 新建 | `test/helpers/balanceFixtures.js` | 明确受控来源的罕见分支与金额夹具 |
| 新建 | `docs/gameplay-balance/progress.md` | 逐任务进度与证据 |
| 新建 | `docs/gameplay-balance/acceptance.md` | 逐项验收与实际报告索引 |

原始验证输出仅使用plan规定的artifacts/gameplay-balance/<runId>/。既有正式records及当前房间不被本轮批量工具修改。

## 任务分组与执行顺序

| 分组 | 编号 | 完成后验证与提交 |
|---|---|---|
| 准备 | T1–T1 | 本组各验证实际通过，记录证据后只提交本轮文件 |
| 基础 | T2–T11 | 本组各验证实际通过，记录证据后只提交本轮文件 |
| 驱动 | T12–T20 | 本组各验证实际通过，记录证据后只提交本轮文件 |
| 策略 | T21–T35 | 本组各验证实际通过，记录证据后只提交本轮文件 |
| 观察 | T36–T48 | 本组各验证实际通过，记录证据后只提交本轮文件 |
| 保存 | T49–T52 | 本组各验证实际通过，记录证据后只提交本轮文件 |
| 续跑 | T53–T60 | 本组各验证实际通过，记录证据后只提交本轮文件 |
| 统计 | T61–T68 | 本组各验证实际通过，记录证据后只提交本轮文件 |
| 报告 | T69–T70 | 本组各验证实际通过，记录证据后只提交本轮文件 |
| 集成 | T71–T76 | 本组各验证实际通过，记录证据后只提交本轮文件 |
| 验收 | T77–T79 | 本组各验证实际通过，记录证据后只提交本轮文件 |
| 正式运行 | T80–T86 | 本组各验证实际通过，记录证据后只提交本轮文件 |

编号顺序是合法拓扑顺序，下面每项同时明确实际依赖。已有模块验证通过后再接入批次；正式采样在对照、续跑及原回归门禁通过之后开始。

## T1: 建立受保护的开发基线

**文件：** `docs/gameplay-balance/progress.md`  
**依赖：** 无  
**步骤：**
1. 读取已批准spec/plan/task/checklist，列出所有任务及未开始状态；记录当前提交、工作区已有文件和正式规则文件摘要。
2. 确认实际Node 20可执行路径、版本和现有测试/lint/浏览器入口；使用独立测试输出，不连接现有3000端口房间。

**验证：** 运行 `git status --short`、`git log -1 --oneline`、确认运行时的 `node --version`；进度表任务数与本文相同，已有改动和Node 20版本有实际记录。

## T2: 严格解析五种命令行模式

**文件：** `scripts/balance/config.js`、`test/balance-config.test.js`  
**依赖：** T1  
**步骤：**
1. 实现parseArgs：默认debug 20局/种子22/4人，正式、续跑、审计重放、报告模式互斥。
2. 拒绝未知参数、缺值、非整数、非2/3/4人数及正式模式临时调参；新增“参数模式”验证。

**验证：** 运行 `node --test --test-name-pattern="参数模式" test/balance-config.test.js`，合法模式正确，无效输入明确拒绝且不开始运行。

## T3: 冻结五套经营配置

**文件：** `scripts/balance/config.js`、`test/balance-config.test.js`  
**依赖：** T2  
**步骤：**
1. 写入K1五配置的储备、城市/建设/航班系数和持股比例；写入K3评分及换组规则。
2. 返回独立配置并禁止运行中修改；新增“偏好配置”验证。

**验证：** 运行 `node --test --test-name-pattern="偏好配置" test/balance-config.test.js`，五配置与已批准表一致，修改返回值不影响后续配置。

## T4: 冻结样本、阈值与预算

**文件：** `scripts/balance/config.js`、`test/balance-config.test.js`  
**依赖：** T3  
**步骤：**
1. 写入4200局计划参数、500轮/20000动作、240分钟、60秒片段、2GiB输出及报告随机种子。
2. 写入50000次重采样、9/24/36比较族和K7证据门槛；新增“运行阈值”验证。

**验证：** 运行 `node --test --test-name-pattern="运行阈值" test/balance-config.test.js`，固定数量、预算、阈值及debug来源完整，不接受正式参数覆盖。

## T5: 代码与配置指纹

**文件：** `scripts/balance/config.js`、`test/balance-config.test.js`  
**依赖：** T4  
**步骤：**
1. fingerprintSources只纳入相关规则和模拟/分析源文件、package及锁文件，保存提交和相关未提交状态；排除输出和时间。
2. configHash使用键排序后的规范配置；新增“指纹”验证。

**验证：** 运行 `node --test --test-name-pattern="指纹" test/balance-config.test.js`，源文件或策略变动改变指纹，输出路径/时间不改变配置摘要。

## T6: 独立可追踪随机流

**文件：** `scripts/balance/random.js`、`test/balance-config.test.js`  
**依赖：** T5  
**步骤：**
1. 包装原createRng，记录种子与调用计数；游戏、各玩家和报告流互不影响。
2. 测试原算法输出一致和相同种子重复性；新增“随机流”验证。

**验证：** 运行 `node --test --test-name-pattern="随机流" test/balance-config.test.js`，游戏调用不消耗策略流，计数准确且原算法未改变。

## T7: 语义摘要与标识映射

**文件：** `scripts/balance/canonical.js`、`test/balance-replay.test.js`  
**依赖：** T6  
**步骤：**
1. 实现semanticState/semanticAction/hashCanonical，映射本局及派生标识，移除非玩法时间/连接/未用随机元数据。
2. 保留经济、报价版本、状态修订、阶段与随机进度；新增“语义摘要”验证。

**验证：** 运行 `node --test --test-name-pattern="语义摘要" test/balance-replay.test.js`，仅元数据变化不改变摘要，金额/报价/阶段变化必改变摘要。

## T8: 受控夹具与测试来源隔离

**文件：** `test/helpers/balanceFixtures.js`、`test/balance-session.test.js`  
**依赖：** T7  
**步骤：**
1. 创建具备controlled来源的城市、股票、机遇、债务、时钟和终止场景辅助；不加入正式入口。
2. 受控场景记录来源，正常开局另走原createGameState；新增“场景来源”验证。

**验证：** 运行 `node --test --test-name-pattern="场景来源" test/balance-session.test.js`，受控证据明确标识，正式模块不导入夹具。

## T9: 生成全部经营配对与排列

**文件：** `scripts/balance/schedule.js`、`test/balance-config.test.js`  
**依赖：** T4  
**步骤：**
1. 实现六个两人配对、四个三人组合及四偏好四人同场的全部座位排列。
2. 加入各人数600局中性基线；新增“样本矩阵”验证。

**验证：** 运行 `node --test --test-name-pattern="样本矩阵" test/balance-config.test.js`，正式计划4200局、2240组，每个组合与排列次数准确。

## T10: 稳定种子和样本标识

**文件：** `scripts/balance/schedule.js`、`test/balance-config.test.js`  
**依赖：** T9、T6  
**步骤：**
1. 按K4派生组种子，检查碰撞并确定性增盐；换位保留偏好决策种子。
2. 生成sampleId/groupId，保存最终种子；新增“种子标识”验证。

**验证：** 运行 `node --test --test-name-pattern="种子标识" test/balance-config.test.js`，重复生成计划一致，独立组不重复种子，组内排列正确共用种子。

## T11: 固定交错执行顺序

**文件：** `scripts/balance/schedule.js`、`test/balance-config.test.js`  
**依赖：** T10  
**步骤：**
1. 按实验/种子轮次交错，组内依次执行全部排列；不按胜率结果安排样本。
2. 检查前缀覆盖各人数及实验，保存计划坐标；新增“交错顺序”验证。

**验证：** 运行 `node --test --test-name-pattern="交错顺序" test/balance-config.test.js`，完整排列不漏不重，重复计划顺序相同。

## T12: 正式v2会话初始化

**文件：** `scripts/balance/session.js`、`test/balance-session.test.js`  
**依赖：** T8、T11  
**步骤：**
1. 创建createSession，按正式顺序createGameState、resetDeck、beginOpportunityStage启动2至4人开局。
2. 保存初始化摘要和随机计数；新增“正式开局”验证。

**验证：** 运行 `node --test --test-name-pattern="正式开局" test/balance-session.test.js`，2/3/4人初始现金和棋盘不变，首阶段选择先于首骰。

## T13: 注入确定性决策时钟

**文件：** `scripts/balance/session.js`、`test/balance-session.test.js`  
**依赖：** T12  
**步骤：**
1. 复用createActionClock，提供不等待真实时间的本地定时器；按正式阶段及新决策方式同步。
2. 核对多人选择提交和换组不刷新同阶段时限；新增“决策时钟”验证。

**验证：** 运行 `node --test --test-name-pattern="决策时钟" test/balance-session.test.js`，决策ID/阶段时限正确，无真实长等待或残留计时器。

## T14: 本人视图与审计副本

**文件：** `scripts/balance/session.js`、`test/balance-session.test.js`  
**依赖：** T13  
**步骤：**
1. view复用现有gameView.snapshot，仅移除经营无关元数据；auditSnapshot返回脱离内部引用副本。
2. 验证隐藏候选、未公开选择、随机池及凭据不可见；新增“私有视图”验证。

**验证：** 运行 `node --test --test-name-pattern="私有视图" test/balance-session.test.js`，修改视图不能改内部状态，其他人及未来私有字段不泄漏。

## T15: 真正行动者解析

**文件：** `scripts/balance/session.js`、`test/balance-session.test.js`  
**依赖：** T14  
**步骤：**
1. 机遇阶段选尚未提交的存活参与者；普通、拍卖、直接购买和转让按正式授权者解析。
2. 未识别阶段或无合法参与者形成诊断；新增“行动者”验证。

**验证：** 运行 `node --test --test-name-pattern="行动者" test/balance-session.test.js`，原回合玩家不能代替竞买者或转让买家行动。

## T16: 动作封装及报价校验

**文件：** `scripts/balance/session.js`、`test/balance-session.test.js`  
**依赖：** T15  
**步骤：**
1. 生成稳定步骤actionId及当前gameId/decisionId/actorRevision，复用validateEnvelope和normalizeAction。
2. 检查规范化参与者与提交身份一致、候选/报价/窗口有效；新增“动作校验”验证。

**验证：** 运行 `node --test --test-name-pattern="动作校验" test/balance-session.test.js`，过期封装、报价、候选和越权均拒绝且原状态不变。

## T17: 复制状态后执行与提交

**文件：** `scripts/balance/session.js`、`test/balance-session.test.js`  
**依赖：** T16  
**步骤：**
1. 在结构化复制上gameLogic.apply，拒绝或抛错不提交；成功后增加对应修订并同步时钟。
2. 保存ActionOutcome的动作、事件、随机计数和摘要；新增“原子提交”验证。

**验证：** 运行 `node --test --test-name-pattern="原子提交" test/balance-session.test.js`，部分修改后失败不污染原状态，成功只提交一次。

## T18: 经济不变量与真正停滞

**文件：** `scripts/balance/session.js`、`test/balance-session.test.js`  
**依赖：** T17  
**步骤：**
1. 核对安全整数、房级、实际建房成本、机遇额度、股票金额及发行量，与正式服守卫保持对照。
2. 仅实际无状态进展动作视为错误，正常无交易回合照常；新增“经济守卫”验证。

**验证：** 运行 `node --test --test-name-pattern="经济守卫" test/balance-session.test.js`，非法数量/金额被拒绝，合法无交易推进不被误判。

## T19: 三种终止与逻辑上限

**文件：** `scripts/balance/session.js`、`test/balance-session.test.js`  
**依赖：** T18  
**步骤：**
1. finishIfNeeded优先识别唯一存活者自然胜利，再核对完整轮数/成功动作上限，工具失败单列。
2. 截断不认输、解散或补发收益，winnerId为空；新增“终止分类”验证。

**验证：** 运行 `node --test --test-name-pattern="终止分类" test/balance-session.test.js`，自然/截断/异常分开，恰到上限自然终局仍优先。

## T20: 规范逐局结果与资产分项

**文件：** `scripts/balance/session.js`、`test/balance-session.test.js`  
**依赖：** T19  
**步骤：**
1. 构造GameResult身份、版本、种子、人数、修订、终止原因及错误上下文；资产复用assetSummary。
2. 保存存活与出局状态及当时资产，截断不调用终局函数；新增“逐局结果”验证。

**验证：** 运行 `node --test --test-name-pattern="逐局结果" test/balance-session.test.js`，资产分项可核对，只有自然完赛有胜者且终局结算不重复。

## T21: 策略储备与公开估值

**文件：** `scripts/balance/policy.js`、`test/balance-policy.test.js`  
**依赖：** T3、T14  
**步骤：**
1. 实现实际储备、城市配套/H10成本、建设估值、股票与机场估值；只读传入本人视图。
2. 将储备约束限定主动投资，金额和同分选择可审计；新增“储备估值”验证。

**验证：** 运行 `node --test --test-name-pattern="储备估值" test/balance-policy.test.js`，高租金影响储备，配套改变估值，自救不受主动储备限制。

## T22: 决策理由及本人记忆

**文件：** `scripts/balance/policy.js`、`test/balance-policy.test.js`  
**依赖：** T21、T6  
**步骤：**
1. 实现Decision.reason/nextMemory，标记本回合目标、窗口方向、已提出转让；新阶段正确重置。
2. 同分用本人随机源，避免建拆/抵押赎回或窗口买卖循环；新增“决策记忆”验证。

**验证：** 运行 `node --test --test-name-pattern="决策记忆" test/balance-policy.test.js`，理由有依据，阶段转换清理适当，重复调用无非法循环。

## T23: 三阶段候选选择与换组

**文件：** `scripts/balance/policy.js`、`test/balance-policy.test.js`  
**依赖：** T22  
**步骤：**
1. 中性基线均匀选合法候选且不换组；四偏好按K3基础分、条件加分和机场扣分选择。
2. 首阶段最高分低于60才换组一次，提交锁定；新增“机遇选择”验证。

**验证：** 运行 `node --test --test-name-pattern="机遇选择" test/balance-policy.test.js`，五配置只选本人候选，条件加分/换组/锁定和后期不换组正确。

## T24: 等待掷骰与赎回建设

**文件：** `scripts/balance/policy.js`、`test/balance-policy.test.js`  
**依赖：** T23、T16  
**步骤：**
1. 合法位置先赎回，再比较普通/远程建设估值减费用；无合格投资掷骰。
2. 读取最新报价并遵守H1额度和建设资格；新增“回合起手”验证。

**验证：** 运行 `node --test --test-name-pattern="回合起手" test/balance-policy.test.js`，赎回/建房/远程/掷骰均合法，不把权限当免费建设。

## T25: 城市机场与建设询问

**文件：** `scripts/balance/policy.js`、`test/balance-policy.test.js`  
**依赖：** T24  
**步骤：**
1. 按解锁、圈购买额度、估值、储备及报价处理购置/建设或放弃。
2. 机场邻城及航线偏好按K2估值；不足款但可合法筹资才进入募资；新增“购买建设”验证。

**验证：** 运行 `node --test --test-name-pattern="购买建设" test/balance-policy.test.js`，五配置能正常购买建设，报价变化和资金不足正确处理。

## T26: 冻结与监狱

**文件：** `scripts/balance/policy.js`、`test/balance-policy.test.js`  
**依赖：** T25  
**步骤：**
1. 能保留储备才付款，其余按原阶段冻结跳过或骰子出狱；不读取袋内结果。
2. 验证不同公开现金与监禁状态的合法选择；新增“冻结监狱”验证。

**验证：** 运行 `node --test --test-name-pattern="冻结监狱" test/balance-policy.test.js`，付款/跳过/骰子出狱决策合法，不自动认输。

## T27: 拍卖与直接购买

**文件：** `scripts/balance/policy.js`、`test/balance-policy.test.js`  
**依赖：** T26、T15  
**步骤：**
1. 以实际参与者的估值及现金储备确定最低出价/接受或放弃。
2. 最高竞价者按正式规则结束，不重复加价；新增“竞买决策”验证。

**验证：** 运行 `node --test --test-name-pattern="竞买决策" test/balance-policy.test.js`，非本回合座位也按本人现金决策，圈额度和最低价合法。

## T28: 股票减持与窗口方向

**文件：** `scripts/balance/policy.js`、`test/balance-policy.test.js`  
**依赖：** T27  
**步骤：**
1. 根据储备/股票占比按公开收益减持最少必要股数；记录窗口同城方向。
2. 使用窗口和股份报价版本，不重复卖已清空股份；新增“股票减持”验证。

**验证：** 运行 `node --test --test-name-pattern="股票减持" test/balance-policy.test.js`，合法减持补足储备，不超持股且同窗同城不反复买卖。

## T29: 股票排序与累计预算

**文件：** `scripts/balance/policy.js`、`test/balance-policy.test.js`  
**依赖：** T28  
**步骤：**
1. 按K2股票估值、H5分散/H6配套优先买入，严格遵守窗口累计预算、发行量及城主上限。
2. 结合卖出所得资金和最新报价，一批同城只一个方向；新增“股票买入”验证。

**验证：** 运行 `node --test --test-name-pattern="股票买入" test/balance-policy.test.js`，三城/六股/每城两股/城主四股限制全满足，所有偏好可合法投资。

## T30: 股票转让发起与买方确认

**文件：** `scripts/balance/policy.js`、`test/balance-policy.test.js`  
**依赖：** T29  
**步骤：**
1. 有减持需求时最多提一次一城一股95%公开股价转让，平分接收方由本人随机源选。
2. 实际买方按估值、储备与资格接受或拒绝，返回原股票窗口；新增“转让决策”验证。

**验证：** 运行 `node --test --test-name-pattern="转让决策" test/balance-policy.test.js`，发起/接受/拒绝身份和金额合法，拒绝不循环或重新给额度。

## T31: 公开落点航班估值

**文件：** `scripts/balance/policy.js`、`test/balance-policy.test.js`  
**依赖：** T30  
**步骤：**
1. 比较停留和合法机场的1至10点公开落点净机会、租金、机票及机场费，应用航线系数。
2. 优于停留且保留储备才飞，免费票/折扣用原报价，H8不当飞行奖励；新增“航班决策”验证。

**验证：** 运行 `node --test --test-name-pattern="航班决策" test/balance-policy.test.js`，有利目标会飞、不利放弃，未读取骰袋，单骰规则不变。

## T32: 合法购置募资

**文件：** `scripts/balance/policy.js`、`test/balance-policy.test.js`  
**依赖：** T31  
**步骤：**
1. 购置值得且合法抵押/拆房可恢复付款与储备时启动募资；选择最少损失目标。
2. 不可完成则取消，可完成才确认，始终读取新状态；新增“募资决策”验证。

**验证：** 运行 `node --test --test-name-pattern="募资决策" test/balance-policy.test.js`，启动/筹资/确认/取消可完成，不错误使用该阶段不允许动作。

## T33: 债务减持与抵押救援

**文件：** `scripts/balance/policy.js`、`test/balance-policy.test.js`  
**依赖：** T32  
**步骤：**
1. 已发生债务先最少足额卖股，再选择合法较低损失城市抵押；无股票或抵押额度时转下一救援分支。
2. 救援不要求保留主动投资储备；新增“债务救援”验证。

**验证：** 运行 `node --test --test-name-pattern="债务救援" test/balance-policy.test.js`，五配置均尽力补缺，股数/金额/抵押最多两座合法。

## T34: 拆房、卖城与无资产结束

**文件：** `scripts/balance/policy.js`、`test/balance-policy.test.js`  
**依赖：** T33  
**步骤：**
1. 按实际拆房报价返款、合格出售/拍卖补债；合法选项穷尽后才rescue_done。
2. 避免重复出售失败目标和拆除抵押城市；新增“救援退出”验证。

**验证：** 运行 `node --test --test-name-pattern="救援退出" test/balance-policy.test.js`，实际成本退款正确，无资产才结束，有资产时不故意破产。

## T35: 策略信息隔离与偏好差异

**文件：** `test/balance-policy.test.js`、`scripts/balance/policy.js`  
**依赖：** T34、T14  
**步骤：**
1. 验证policy没有导入session/observe/storage/batch，隐藏内部状态变更但本人视图相同时决策不变。
2. 用同一公开场景验证偏好改变估值/储备/机遇而所有配置具备基础经营能力；新增“策略隔离”验证。

**验证：** 运行 `node --test --test-name-pattern="策略隔离" test/balance-policy.test.js`，无隐藏信息优势，不通过缺失操作制造偏好差异。

## T36: 观察记录骨架与安全金额

**文件：** `scripts/balance/observe.js`、`test/balance-observe.test.js`  
**依赖：** T20、T8  
**步骤：**
1. 实现observeTransition和Observation/EconomyEntry基础，记录来源、步骤与结算引用。
2. 统一整数核对及重复结算拒绝，不把未知补零；新增“观察骨架”验证。

**验证：** 运行 `node --test --test-name-pattern="观察骨架" test/balance-observe.test.js`，记录可追溯，整数与引用约束生效。

## T37: 候选、提交与统一生效

**文件：** `scripts/balance/observe.js`、`test/balance-observe.test.js`  
**依赖：** T36、T23  
**步骤：**
1. 分别观察候选出现、换组、提交和统一选择生效，保存选择时存活/资产/名次。
2. 未全员结算不算已生效/H12奖励；新增“选择观察”验证。

**验证：** 运行 `node --test --test-name-pattern="选择观察" test/balance-observe.test.js`，三个阶段候选及生效计数可对账，零样本不会消失。

## T38: H1–H3及建设优惠观察

**文件：** `scripts/balance/observe.js`、`test/balance-observe.test.js`  
**依赖：** T37、T24  
**步骤：**
1. 按成功远程动作、建房effects与前置资格/额度分别观察H1/H2/H3和资讯折扣。
2. H1记权限使用无虚构现金，零贡献不算触发；新增“建设机遇观察”验证。

**验证：** 运行 `node --test --test-name-pattern="建设机遇观察" test/balance-observe.test.js`，适用/耗尽/实际折扣分开，叠加金额与费用计划一致。

## T39: H4–H6投资机遇观察

**文件：** `scripts/balance/observe.js`、`test/balance-observe.test.js`  
**依赖：** T38  
**步骤：**
1. 按实际基础股息奖金、GO三城持股奖励和租金折扣观察H4/H5/H6。
2. 区分城主保留收益和股息，H6银行补足不重复计收益；新增“投资机遇观察”验证。

**验证：** 运行 `node --test --test-name-pattern="投资机遇观察" test/balance-observe.test.js`，机遇金额、每圈额度和被动触发条件准确。

## T40: H7–H9航线机遇观察

**文件：** `scripts/balance/observe.js`、`test/balance-observe.test.js`  
**依赖：** T39  
**步骤：**
1. 按付费票折扣、骰子首次机场奖励和GO机场邻城奖励观察H7/H8/H9。
2. 免费票、飞行/机会位移不误触发H8；记录已访问与额度；新增“航线机遇观察”验证。

**验证：** 运行 `node --test --test-name-pattern="航线机遇观察" test/balance-observe.test.js`，奖励/折扣和来源正确，合法机会与未满足条件分开。

## T41: H10–H12防御机遇观察

**文件：** `scripts/balance/observe.js`、`test/balance-observe.test.js`  
**依赖：** T40  
**步骤：**
1. 观察轻资产GO奖励、H11正城市租金额度及H12统一生效的一次奖励。
2. 抵押城计H10城数，机场费不算H11，被动结算不算主动放弃；新增“防御机遇观察”验证。

**验证：** 运行 `node --test --test-name-pattern="防御机遇观察" test/balance-observe.test.js`，H10/H11/H12适用、耗尽和真实奖励均正确。

## T42: 主动放弃及未知可用性

**文件：** `scripts/balance/observe.js`、`test/balance-observe.test.js`  
**依赖：** T41、T22  
**步骤：**
1. 只有对应实际决策及理由才标主动放弃，区分未满足条件、满足未使用、耗尽。
2. 按实际决策/结算时点统计机会，未知明确标记，不重复计相同未改变机会；新增“使用机会”验证。

**验证：** 运行 `node --test --test-name-pattern="使用机会" test/balance-observe.test.js`，被动和主动解释正确，多次读取不虚增机会。

## T43: 结构化建房租金票务流水

**文件：** `scripts/balance/observe.js`、`test/balance-observe.test.js`  
**依赖：** T42  
**步骤：**
1. 拆分正式cashDeltas/fundDeltas、费用、effects与银行补足，保留结算引用。
2. 核对玩家现金与基金变化，优惠不与补足重复累计；新增“结构化账务”验证。

**验证：** 运行 `node --test --test-name-pattern="结构化账务" test/balance-observe.test.js`，租金/基金/银行/费用差额完整对账。

## T44: 股票、股息、保留与清算流水

**文件：** `scripts/balance/observe.js`、`test/balance-observe.test.js`  
**依赖：** T43  
**步骤：**
1. 记录买卖、转让、基础分红、H4、保留收益、超持强卖及清算，各自标记现金来源。
2. 购入资产不当收入，玩家转移非注资，自持分红与保留不双计；新增“股票账务”验证。

**验证：** 运行 `node --test --test-name-pattern="股票账务" test/balance-observe.test.js`，股息/交易/清算的现金、股份和基金全部核对。

## T45: GO、机会奖励与罚款分解

**文件：** `scripts/balance/observe.js`、`test/balance-observe.test.js`  
**依赖：** T44  
**步骤：**
1. 用动作、前后移动/牌组/奖励状态及已核对分支拆解GO、机会奖励/罚款和机遇注资；不只解析文案。
2. 覆盖一次动作同时GO、分红及机会结算，保留重构来源与整数对账；新增“起点机会账务”验证。

**验证：** 运行 `node --test --test-name-pattern="起点机会账务" test/balance-observe.test.js`，多笔现金变化逐项解释，无法核对时形成观察错误。

## T46: 购置、竞拍、抵押与救援流水

**文件：** `scripts/balance/observe.js`、`test/balance-observe.test.js`  
**依赖：** T45  
**步骤：**
1. 核对城市/机场购置、拍卖、直接出售、抵押赎回、冻结/监狱/利息及拆房救援现金。
2. 区分银行流与玩家转移、实际建房成本退款，未知不猜收入；新增“经营救援账务”验证。

**验证：** 运行 `node --test --test-name-pattern="经营救援账务" test/balance-observe.test.js`，金额与资产/现金差一致，多阶段成交不重复。

## T47: 轮次、跳过、绕圈与出局

**文件：** `scripts/balance/observe.js`、`test/balance-observe.test.js`  
**依赖：** T46  
**步骤：**
1. 以turnId/roundFlow及玩家前后状态核对真实完成/跳过回合、完整轮与GO绕圈。
2. 单动作连续跳过多玩家和出局缩短本轮分别记录，不用动作数或文案猜轮数；新增“回合观察”验证。

**验证：** 运行 `node --test --test-name-pattern="回合观察" test/balance-observe.test.js`，股票/拍卖多动作仍同回合，连续跳过和出局核对正确。

## T48: 机遇组合与逐局经济汇总

**文件：** `scripts/balance/observe.js`、`test/balance-observe.test.js`  
**依赖：** T47  
**步骤：**
1. 实现summarizeObservations，覆盖12项/三个阶段/三个组合及零样本条目，保留资格和真实金额分母。
2. 按结算引用去重并核对现金账、资产账、银行与基金；新增“观察汇总”验证。

**验证：** 运行 `node --test --test-name-pattern="观察汇总" test/balance-observe.test.js`，逐项汇总能回溯流水，未知金额阻止精确收益结论。

## T49: 专用输出路径保护

**文件：** `scripts/balance/storage.js`、`test/balance-storage.test.js`  
**依赖：** T5  
**步骤：**
1. openRun只允许项目内专用目录，拒绝项目根/records/public/src/scripts/.git及越界/链接目标。
2. 新批次不可覆盖已有不匹配文件，恢复校验配置与代码；新增“输出保护”验证。

**验证：** 运行 `node --test --test-name-pattern="输出保护" test/balance-storage.test.js`，越界和保护目录拒绝，已有文件内容保持完整。

## T50: 原子配置清单与结果保存

**文件：** `scripts/balance/storage.js`、`test/balance-storage.test.js`  
**依赖：** T49、T11  
**步骤：**
1. 先保存config/schedule/manifest，原子写入检查点和唯一sampleId结果。
2. 故障注入验证临时文件不能被当成完整结果，配置不一致拒绝；新增“原子写入”验证。

**验证：** 运行 `node --test --test-name-pattern="原子写入" test/balance-storage.test.js`，部分落盘不标完成，重复或异版本结果不覆盖。

## T51: 完整流水分段与压缩

**文件：** `scripts/balance/storage.js`、`test/balance-storage.test.js`  
**依赖：** T50、T48  
**步骤：**
1. appendAction写入紧凑完整动作/理由/观察/摘要，封闭段用内置gzip保存，检查点只引用前缀位置。
2. loadEvidence校验段摘要和记录完整性，不完整末条作为审计另存；新增“流水分段”验证。

**验证：** 运行 `node --test --test-name-pattern="流水分段" test/balance-storage.test.js`，压缩重读一致，损坏/末条截断可诊断且有效前缀不删。

## T52: 输出占用与写入故障

**文件：** `scripts/balance/storage.js`、`test/balance-storage.test.js`  
**依赖：** T51  
**步骤：**
1. 累计验证专用输出占用，达到2GiB或写入失败停止新动作并保留原因/已有证据。
2. 测试使用小型注入上限，不实际写满2GiB；新增“存储预算”验证。

**验证：** 运行 `node --test --test-name-pattern="存储预算" test/balance-storage.test.js`，限额和错误不覆盖/删除旧证据，可报告已有完成量。

## T53: 逐步策略与动作重放

**文件：** `scripts/balance/replay.js`、`test/balance-replay.test.js`  
**依赖：** T35、T48、T51  
**步骤：**
1. replayGame按原种子正常开局，重做每次本人策略决策及引擎动作，核对语义动作、事件/观察和计数。
2. 恢复本人记忆，不跳过策略随机调用；新增“逐步重放”验证。

**验证：** 运行 `node --test --test-name-pattern="逐步重放" test/balance-replay.test.js`，相同前缀动作、金额、记忆、状态和所有随机流一致。

## T54: 新标识映射与版本差异

**文件：** `scripts/balance/replay.js`、`test/balance-replay.test.js`  
**依赖：** T53  
**步骤：**
1. 提交重建会话有效的阶段/报价/窗口标识，仅映射同一语义标识，不接受不同经济版本。
2. ReplayCheck定位首个差异并保留上下文；新增“重放差异”验证。

**验证：** 运行 `node --test --test-name-pattern="重放差异" test/balance-replay.test.js`，生成标识差异可重放，修改金额/动作/计数或源指纹会明确失败。

## T55: 中断前缀核验与审计隔离

**文件：** `scripts/balance/replay.js`、`scripts/balance/storage.js`、`test/balance-replay.test.js`  
**依赖：** T54、T52  
**步骤：**
1. 核对完整动作超前于检查点情况并补齐，未知/损坏动作不强制继续。
2. 独立audit尝试不覆盖正式结果，不重复纳入样本；新增“恢复审计”验证。

**验证：** 运行 `node --test --test-name-pattern="恢复审计" test/balance-replay.test.js`，不同崩溃位置可恢复，原异常与审计成功分别保存。

## T56: 完整逐局决策循环

**文件：** `scripts/balance/batch.js`、`test/balance-scenario.test.js`  
**依赖：** T55、T20  
**步骤：**
1. 连接会话/本人策略/观察/保存，成功动作落盘后检查点更新，直至自然/逻辑截断/工具异常。
2. 正常开局所有阶段由正式引擎推进，不直接跳回合或补奖；新增“自动对局”验证。

**验证：** 运行 `node --test --test-name-pattern="自动对局" test/balance-scenario.test.js`，从首次选择真实经营至合法终止，局数及终止理由有完整记录。

## T57: 计划执行与终止状态对账

**文件：** `scripts/balance/batch.js`、`test/balance-storage.test.js`  
**依赖：** T56  
**步骤：**
1. 按计划交错运行，逐局结果完成后再提交清单，已完成样本不重算。
2. 实际开局、待恢复、终止类别、独立组进度分别统计；新增“批次清单”验证。

**验证：** 运行 `node --test --test-name-pattern="批次清单" test/balance-storage.test.js`，无漏算/重复，清单完成有唯一有效结果。

## T58: 片段轮转与累计计算预算

**文件：** `scripts/balance/batch.js`、`test/balance-storage.test.js`  
**依赖：** T57  
**步骤：**
1. 实现60秒执行片段、恢复重放计入240分钟总预算；等待/挂起不误作游戏终止。
2. 注入短预算验证暂停保存和轮转，新版本重跑预算继续累计；新增“计算预算”验证。

**验证：** 运行 `node --test --test-name-pattern="计算预算" test/balance-storage.test.js`，预算暂停不是截断/胜负，恢复不重置累计耗时或丢样本。

## T59: 首错停止与有序中断

**文件：** `scripts/balance/batch.js`、`test/balance-storage.test.js`  
**依赖：** T58  
**步骤：**
1. 首个非法动作/对账失败/重放不一致保存异常并暂停，不大量跳过失败继续统计。
2. 处理SIGINT/片段结束等边界，保留有效前缀和最后完整检查点；新增“异常中断”验证。

**验证：** 运行 `node --test --test-name-pattern="异常中断" test/balance-storage.test.js`，原失败和已完成结果保留，未完成明确待恢复。

## T60: 进度通知与审计样本选取

**文件：** `scripts/balance/batch.js`、`test/balance-replay.test.js`  
**依赖：** T59  
**步骤：**
1. onProgress显示计划/终止/待恢复、耗时、预算及组完成量。
2. 按每人数稳定样本编号选首个自然/截断/异常审计，类别缺失如实记录；新增“审计选取”验证。

**验证：** 运行 `node --test --test-name-pattern="审计选取" test/balance-replay.test.js`，选择不按有利结果，审计不增加正式样本。

## T61: 汇总来源与唯一性校验

**文件：** `scripts/balance/stats.js`、`test/balance-stats.test.js`  
**依赖：** T57、T4  
**步骤：**
1. aggregate检查配置/版本/来源/样本唯一性和清单完整性，受控/debug/audit默认不纳入。
2. 缺失、重复或异版本不静默合并，旧异常不能由重跑成功覆盖；新增“统计来源”验证。

**验证：** 运行 `node --test --test-name-pattern="统计来源" test/balance-stats.test.js`，有效样本一次计数，非法混入和覆盖被拒绝。

## T62: 终止对账与两种胜率

**文件：** `scripts/balance/stats.js`、`test/balance-stats.test.js`  
**依赖：** T61  
**步骤：**
1. 核对终止数、胜场、实际开局和待恢复；分别显示开局占比及自然条件胜率。
2. 零自然完赛条件胜率为null，座位开局均匀参考用完赛率/n；新增“胜率分母”验证。

**验证：** 运行 `node --test --test-name-pattern="胜率分母" test/balance-stats.test.js`，已知胜负/截断/异常/待恢复计数正确，零分母无假零胜率。

## T63: 经济、局长与分位数

**文件：** `scripts/balance/stats.js`、`test/balance-stats.test.js`  
**依赖：** T62  
**步骤：**
1. 整数累计后求均值、中位数/P10/P90与极端索引；自然、截断及未知观察分别处理。
2. 轮数与动作数分开，钱的收入/转移/费用/估值分开；新增“描述统计”验证。

**验证：** 运行 `node --test --test-name-pattern="描述统计" test/balance-stats.test.js`，手工可核对样本金额/分位数准确，缺失未当作零。

## T64: 阶段、座位与机遇组合分层

**文件：** `scripts/balance/stats.js`、`test/balance-stats.test.js`  
**依赖：** T63  
**步骤：**
1. 按人数/组合、选择阶段、存活/资产固定层及名次分层；12机遇和三组合保留零条目。
2. 首阶段机遇按座位等权标准化选与未选差值；新增“分层比较”验证。

**验证：** 运行 `node --test --test-name-pattern="分层比较" test/balance-stats.test.js`，晚期不混首期，座位标准化与必要分母空值正确。

## T65: 整组分层重采样

**文件：** `scripts/balance/stats.js`、`test/balance-stats.test.js`  
**依赖：** T64、T6  
**步骤：**
1. 以独立种子组为抽样单位，保留组内全部排列/玩家，按原实验组合分层，固定报告种子。
2. 同一重复组抽中多次按权重累计而非当新样本；新增“整组重采样”验证。

**验证：** 运行 `node --test --test-name-pattern="整组重采样" test/balance-stats.test.js`，强相关构造样本保持依赖，同报告种子输出相同。

## T66: 普通与族内校正区间

**文件：** `scripts/balance/stats.js`、`test/balance-stats.test.js`  
**依赖：** T65  
**步骤：**
1. 正式50000次重采样计算普通95%与尾概率0.05/(2m)区间，固定9/24/36族。
2. 有效计算率<99%/零分母/退化返回不稳定，不减少m挑比较；新增“比较区间”验证。

**验证：** 运行 `node --test --test-name-pattern="比较区间" test/balance-stats.test.js`，比较数/尾概率/重复性正确，小样本和退化不产生虚假确定结论。

## T67: 样本与覆盖证据门槛

**文件：** `scripts/balance/stats.js`、`test/balance-stats.test.js`  
**依赖：** T66  
**步骤：**
1. 按K7检查计划完整性、独立组/自然样本/完赛率、每座位机遇分母及异常。
2. 缺计划、未完成组、不足自然样本降级为证据不足；新增“证据门槛”验证。

**验证：** 运行 `node --test --test-name-pattern="证据门槛" test/balance-stats.test.js`，边界值准确，未完赛领先不能填补自然样本。

## T68: 强弱、长局与低触发警报

**文件：** `scripts/balance/stats.js`、`test/balance-stats.test.js`  
**依赖：** T67  
**步骤：**
1. 应用5/10个百分点与普通/校正区间判明显风险、趋势、未发现或不足，保留幅度方向。
2. 按K7长局/触发/资格警报区分经营选择与能力风险，组合不足不排名；新增“风险分类”验证。

**验证：** 运行 `node --test --test-name-pattern="风险分类" test/balance-stats.test.js`，门槛与区间边界正确，无显著差异不宣称等强。

## T69: 中文汇总与明确分母

**文件：** `scripts/balance/report.js`、`test/balance-stats.test.js`  
**依赖：** T68、T50  
**步骤：**
1. writeReport输出report.md/summary.json/evidence-index.json，呈现实际数量与限制及版本配置。
2. 展示两种胜率、自然/截断/异常/待恢复、经济局长和各人数比较，不只展示赢家；新增“中文报告”验证。

**验证：** 运行 `node --test --test-name-pattern="中文报告" test/balance-stats.test.js`，零自然胜率不可计算显示清楚，报告数据和汇总一致。

## T70: 机遇、组合与证据建议

**文件：** `scripts/balance/report.js`、`test/balance-stats.test.js`  
**依赖：** T69  
**步骤：**
1. 展示12项所有阶段/三个组合的样本、条件、触发、金额及未知，引用代表性流水。
2. 风险建议分观测、可能原因和调参建议，注明策略/存活/小样本/校正限制；新增“报告证据”验证。

**验证：** 运行 `node --test --test-name-pattern="报告证据" test/balance-stats.test.js`，不足条目保留，无因果或真人胜率夸大，索引能找到证据。

## T71: 接入批次、续跑、重放和报告入口

**文件：** `scripts/simulate-balance.js`、`scripts/balance/config.js`、`test/balance-scenario.test.js`  
**依赖：** T60、T70  
**步骤：**
1. 替换旧模拟主流程，保留--games/--seed/--players为debug；按plan分派五模式，不导入生产server。
2. CLI错误返回明确状态，预算暂停和异常可区分；新增“命令入口”验证。

**验证：** 运行 `node --test --test-name-pattern="命令入口" test/balance-scenario.test.js`，默认不开始正式4200局，五入口可运行且来源正确。

## T72: npm入口与帮助说明

**文件：** `package.json`、`scripts/simulate-balance.js`、`test/balance-config.test.js`  
**依赖：** T71  
**步骤：**
1. 增加balance脚本别名及--help说明模式/输出/上限，保留现有三测试门禁及依赖。
2. 帮助不执行游戏，不改变生产依赖；新增“帮助入口”验证。

**验证：** 运行 `node --test --test-name-pattern="帮助入口" test/balance-config.test.js`，帮助展示准确，package运行时依赖与原版本一致。

## T73: 正式服开局与普通动作对照

**文件：** `test/balance-server-parity.test.js`、`test/helpers/balanceFixtures.js`  
**依赖：** T72  
**步骤：**
1. 在独立测试进程创建内存房间、身份、固定随机与时钟，隔离记录持久化。
2. 将选择/换组/掷骰/正常购置建设分别交本地与runAction，比较状态、修订、报价及现金；新增“基础对照”验证。

**验证：** 运行 `node --test --test-name-pattern="基础对照" test/balance-server-parity.test.js`，合法状态一致，测试不操作现有房间或正式记录。

## T74: 股票、参与者与拒绝对照

**文件：** `test/balance-server-parity.test.js`、`test/helpers/balanceFixtures.js`  
**依赖：** T73  
**步骤：**
1. 对照股票买卖/转让、远程、航班、竞买、募资/自救与终局，核对真实参与者。
2. 对照过期/非法/部分修改失败拒绝及原状态；清理测试连接计时器；新增“经营对照”验证。

**验证：** 运行 `node --test --test-name-pattern="经营对照" test/balance-server-parity.test.js`，原有所有关键分支与本地执行一致，非法动作无污染。

## T75: 正式开局保存、重放与汇总端到端

**文件：** `test/balance-scenario.test.js`、`docs/gameplay-balance/acceptance.md`  
**依赖：** T74、T70  
**步骤：**
1. 至少一局从正常首选择真实经营到自然或预设逻辑上限截断，不注入胜者或机遇。
2. 保存流水/结果后独立重放并重新报告，核对状态/金额/分类；新增“完整场景”验证。

**验证：** 运行 `node --test --test-name-pattern="完整场景" test/balance-scenario.test.js`，起点到合法停止的真实证据和重放/报告完全一致。

## T76: 中断、恢复与重新报告端到端

**文件：** `test/balance-scenario.test.js`、`test/balance-storage.test.js`  
**依赖：** T75  
**步骤：**
1. 在检查点各落盘边界中断小批次，恢复并与连续运行比较；已完成样本不重算。
2. 计入恢复时间/输出预算，报告模式不运行新对局；新增“续跑场景”验证。

**验证：** 运行 `node --test --test-name-pattern="续跑场景" test/balance-scenario.test.js`，连续与续跑终止/语义结果一致，无重复正式样本。

## T77: 运行新增全部验证

**文件：** `docs/gameplay-balance/progress.md`、`docs/gameplay-balance/acceptance.md`  
**依赖：** T76  
**步骤：**
1. 实际Node 20运行所有balance-*.test.js，保存测试结果、失败修复及重跑证据。
2. 核对策略隔离、对照、重放、统计各门禁均执行，不以跳过测试当通过。

**验证：** 运行 `node --test --test-force-exit test/balance-*.test.js`（若Windows不展开通配符则显式传入九个已列测试文件）；所有用例实际通过且无跳过，日志有真实Node版本。

## T78: 现有规则、联机及静态回归

**文件：** `docs/gameplay-balance/progress.md`、`docs/gameplay-balance/acceptance.md`  
**依赖：** T77  
**步骤：**
1. 运行项目完整测试和lint，保存命令、版本、数量和实际结果。
2. 失败先核对适配是否引起回归；不改正式规则数值消除差异，必要正式行为修复先修订。

**验证：** 实际Node 20运行 `npm test`、`npm run lint`，均成功且无隐藏跳过；既有用例继续执行。

## T79: 原有浏览器与缓存回归

**文件：** `docs/gameplay-balance/progress.md`、`docs/gameplay-balance/acceptance.md`  
**依赖：** T78  
**步骤：**
1. 运行现有四个浏览器测试入口，验证玩法/三端/缩放/缓存原行为不变。
2. 保存结果及能力范围，不将受控浏览器场景当平衡自然样本。

**验证：** 运行 `npm run test:e2e`，四测试文件全部执行并通过；保存实际结果及未覆盖物理设备限制。

## T80: 独立debug批次与版本冻结

**文件：** `docs/gameplay-balance/progress.md`、`docs/gameplay-balance/acceptance.md`  
**依赖：** T79  
**步骤：**
1. 用--games/--seed/--players在2/3/4人各运行小批次，验证完整工具链和实际耗时/压缩占用；来源debug。
2. 核对K1–K8和源指纹，确认工具无错后冻结正式版本；不因胜率结果调策略或减少上限。

**验证：** 运行每人数 `node scripts/simulate-balance.js --games 3 --seed 22 --players N`（N逐一取2、3、4），来源/终止/报告可核对，无工具异常；估计只用于运行提示，不改变固定预算。

## T81: 登记正式计划与累计预算

**文件：** `docs/gameplay-balance/progress.md`、`docs/gameplay-balance/acceptance.md`  
**依赖：** T80  
**步骤：**
1. 创建新正式runId，写config/schedule/manifest及运行前指纹，验证4200局/2240组和互斥参数。
2. 登记240分钟/2GiB及止错条件，明确旧批次/调试不混入，保存批准文档版本。

**验证：** 在首局正式动作前检查落盘清单，数量、配置、种子与批准plan一致，尚无伪造结果。

## T82: 启动正式交错抽样

**文件：** `docs/gameplay-balance/progress.md`、`docs/gameplay-balance/acceptance.md`  
**依赖：** T81  
**步骤：**
1. 运行--formal命令，按冻结清单执行，后台片段持续显示进度并保存证据。
2. 遇到首错先保留异常并排查适配；工具修复另立版本并累记预算，规则修复先修订。

**验证：** 启动 `node scripts/simulate-balance.js --formal --output artifacts/gameplay-balance/<实际runId>`；实际有正式样本结果与进度，來源/配置不变，debug不进入。

## T83: 续跑至预定停止并核对覆盖

**文件：** `docs/gameplay-balance/progress.md`、`docs/gameplay-balance/acceptance.md`  
**依赖：** T82  
**步骤：**
1. 按已有进度续跑，在全部计划完成、累计预算/存储上限、工具错误或中断时按K5停止。
2. 记录各实验目标/实际/待恢复、自然/截断/异常、独立完整组及不足；不补胜者、删错局或延长预算。

**验证：** 读取实际manifest与结果核对唯一sampleId、停止原因及累计耗时/占用；4200目标未完成必须明确列出缺口，不标为完成抽样。

## T84: 正式代表样本审计重放

**文件：** `docs/gameplay-balance/progress.md`、`docs/gameplay-balance/acceptance.md`  
**依赖：** T83  
**步骤：**
1. 按K8稳定选取每人数实际首个自然/截断/异常审计；不存在的类别如实记录并引用受控分类验证。
2. 核对金额/动作/随机计数/终止，并保存audits；不覆盖或增加正式结果，审计计入剩余计算预算。

**验证：** 用 --replay/--sample 运行实际选中样本，ReplayCheck一致；若预算不足未能审计，明确验收未完成及原因。

## T85: 生成实际平衡报告与建议

**文件：** `docs/gameplay-balance/acceptance.md`、`docs/gameplay-balance/progress.md`  
**依赖：** T84  
**步骤：**
1. 用保存证据生成中文报告和结构化汇总，按样本门槛报告明显风险/趋势/不足/未发现。
2. 核对12项、各路线/座位/组合、经济局长和限制；正式数值未改，建议单独列出。

**验证：** 运行 --report，实际计数与原始逐局结果相符；零/不足样本不下强弱结论，引用可复现证据。

## T86: 逐项清单验收与交付

**文件：** `docs/gameplay-balance/acceptance.md`、`docs/gameplay-balance/progress.md`  
**依赖：** T85  
**步骤：**
1. 按批准checklist逐项写实际证据和通过/未通过；未覆盖设备、预算未完成、无法自然完赛及错误均如实记录。
2. 保存精简报告索引，分组本地提交只选本轮源/测试/文档，原始大批流水不批量提交；检查工作区保护文件摘要。

**验证：** 检查验收表每项有运行或观察证据，git diff --check无错误；实际规则/生产入口摘要与基线一致，所有残留未通过项在交付中列出。

## 设计覆盖自检

| plan组件或要求 | 任务 |
|---|---|
| A1 批次编排与恢复 | T9、T10、T11、T49、T50、T51、T57、T58、T59 |
| A2 正式驱动 | T12、T13、T14、T15、T16、T17、T18、T19、T20、T73、T74 |
| A3 经营策略 | T21、T22、T23、T24、T25、T26、T27、T28、T29、T30、T31、T32、T33、T34、T35 |
| A4 观察与经济 | T36、T37、T38、T39、T40、T41、T42、T43、T44、T45、T46、T47、T48 |
| A5 统计与报告 | T61、T62、T63、T64、T65、T66、T67、T68、T69、T70 |
| 复现与成本 | T6、T7、T5、T52、T53、T54、T55、T60 |
| 端到端与正式验收 | T75、T76、T77、T78、T79、T80、T81、T82、T83、T84、T85、T86 |

以上文件清单覆盖plan中全部13个脚本入口/模块、package别名、9个验证文件及受控夹具；任务验证有明确命令或实际输出核对，不包含待补步骤。所有依赖指向前序任务，无环。

## 审批与后续

本轮四份文档均已获用户批准，开发按86项任务执行。当前状态、实际验证和正式批次见progress.md及acceptance.md；不以计划目标代替实际完成量。

## 2026-10-01批准的限定修订

用户已批准[自救出售修订](rescue-fix-proposal.md)：允许从真实服务端pending补全规范化sell_city的自救上下文，并验证拍卖/直接出售的恢复与拒绝原子性。仅修复已复现缺陷，价格、收益、额度和获胜条件按原规则；旧debug异常证据保留，正式批次以修复后的冻结指纹开始。补充R1–R4任务及六项检查，原86项任务与76项清单不因本修订降低要求。
