# 环球资讯、经营机遇与股票优化 Tasks

> 文档状态（2026-10-02）：本阶段已交付，T1–T101 完成，V1–V79 有逐项行为证据；保留批准目标和历史验收数量。后续仅有获批自救上下文修复及验证工具开发；胜率续跑已在累计预算上限停止，描述性报告已交付，代表审计和正式重采样未完成，未证明玩法平衡。当前玩法见 [rules.md](../../rules.md)，最新证据见 [项目现状](../项目现状.md)。

> 版本：1.0｜日期：2026-10-01｜依据：已批准的 spec.md v1.1 与 plan.md v1.0。共 101 项任务，已批准；用户在整份审批请求后回复“继续”，进入验收设计。尚未开始实现。

## 执行约束

- 四份文档全部批准后才编码。按依赖顺序执行，每项聚焦一个行为或接入点，运行所列验证后才能标记完成；测试覆盖财务、状态和网络风险，文档/样式的低影响修改用对应观察即可。
- 为带测试过滤器的任务建立包含所列任务标题或过滤关键词的行为场景；必须实际执行至少一个对应测试，全部跳过不算通过。验证列中的中文分号表示依次运行的独立命令，不作为可直接粘贴的 shell 连接符。
- 测试断言采用 spec 的输入与预期。辅助夹具不增加生产调参接口，不靠删除/跳过原规则验证获得通过。
- 保留工作区已有动作安全修改。T1 保存基线；只提交本轮相关修改，每个通过验证的逻辑相关任务组及时提交，不等到最终交付才一次性提交全部代码。旧图片、demo 和 game.zip 不纳入本轮。
- 任务给出单独的增量验证，后续集成和最终门禁用于已明确的跨组件风险。失败先修复并重跑对应项，不将“预计可用”当作证据。
- 本机当前 Node v24.18.0；Node 20 是独立验收条件。T99 未取得实际 Node 20 验证时不得标通过。
- 执行中若只是需要进一步拆分步骤，可保留原需求、依赖与验证判据补充子步骤；规则、范围、接口或验收变更须修订相关文档并确认。

## 文件清单

| 操作 | 文件 | 职责 |
|---|---|---|
| 新建/更新 | `docs/world-events-augments/progress.md` | 逐项进度、命令输出与实际验收证据 |
| 新建/更新 | `docs/world-events-augments/acceptance.md` | 逐项进度、命令输出与实际验收证据 |
| 新建/更新 | `test/helpers/gameplayFixtures.js` | 固定输入、假时钟或完整场景驱动，仅测试使用 |
| 新建 | `test/gameplay-fixtures.test.js` | 该行为的确定输入与边界验证 |
| 新建/更新 | `src/gameplayCatalog.js` | 五类资讯与十二项机遇固定目录 |
| 新建 | `test/gameplay-catalog.test.js` | 该行为的确定输入与边界验证 |
| 新建/更新 | `src/economy.js` | 费用、奖励、实付成本与结算计划 |
| 新建 | `test/economy.test.js` | 该行为的确定输入与边界验证 |
| 修改 | `src/gameLogic.js` | 原流程挂接与跨模块结算编排 |
| 修改 | `src/state.js` | 规则版本和新状态初始化 |
| 新建 | `test/gameplay-state.test.js` | 该行为的确定输入与边界验证 |
| 新建/更新 | `src/roundFlow.js` | 独立完整轮次及安全续接 |
| 新建 | `test/round-flow.test.js` | 该行为的确定输入与边界验证 |
| 新建/更新 | `src/worldEvents.js` | 资讯袋、地区袋、公开预告与效果 |
| 新建 | `test/world-events.test.js` | 该行为的确定输入与边界验证 |
| 新建/更新 | `src/opportunities.js` | 候选、同步选择及个人额度 |
| 新建 | `test/opportunities.test.js` | 该行为的确定输入与边界验证 |
| 新建/更新 | `src/stocks.js` | 经营报价、股份、分红、窗口及清算 |
| 新建 | `test/stocks-v2.test.js` | 该行为的确定输入与边界验证 |
| 新建/更新 | `src/assets.js` | 统一资产摘要 |
| 新建 | `test/assets.test.js` | 该行为的确定输入与边界验证 |
| 新建 | `test/gameplay-integration.test.js` | 该行为的确定输入与边界验证 |
| 修改 | `test/turn-phases.test.js` | 该行为的确定输入与边界验证 |
| 修改 | `src/actionValidation.js` | 身份、阶段、参数和版本校验 |
| 修改 | `test/action-validation.test.js` | 该行为的确定输入与边界验证 |
| 修改 | `src/actionClock.js` | 同一决定时限及选择共享三十秒 |
| 修改 | `test/action-clock.test.js` | 该行为的确定输入与边界验证 |
| 新建/更新 | `src/gameView.js` | 公共与本人白名单视图 |
| 新建 | `test/game-view.test.js` | 该行为的确定输入与边界验证 |
| 修改 | `server.js` | 房间认证、去重、提交、发布和生命周期 |
| 新建 | `test/network-gameplay.test.js` | 该行为的确定输入与边界验证 |
| 修改 | `test/room-sweep.test.js` | 该行为的确定输入与边界验证 |
| 修改 | `src/record.js` | 结构化经营收支记录 |
| 修改 | `test/record.test.js` | 该行为的确定输入与边界验证 |
| 修改 | `test/gameLogic.test.js` | 该行为的确定输入与边界验证 |
| 修改 | `test/stock.test.js` | 该行为的确定输入与边界验证 |
| 修改 | `test/integration.test.js` | 该行为的确定输入与边界验证 |
| 修改 | `public/client.js` | 状态展示、动作封装及现有流程兼容 |
| 新建/更新 | `e2e/gameplay.spec.js` | 真实浏览器流程或三端可用性验证 |
| 修改 | `public/index.html` | 原生界面节点与静态版本 |
| 修改 | `docs/环球大亨-权威开发文档.md` | 同步已批准的新规则及明确差异 |
| 修改 | `public/style.css` | PC、平板、手机布局及可用性 |
| 修改 | `e2e/responsive.spec.js` | 真实浏览器流程或三端可用性验证 |
| 修改 | `public/sw.js` | 本地素材与新脚本缓存升级 |
| 新建/更新 | `test/helpers/gameplayScenario.js` | 固定输入、假时钟或完整场景驱动，仅测试使用 |
| 新建 | `test/gameplay-scenario.test.js` | 该行为的确定输入与边界验证 |
| 修改 | `e2e/flow.spec.js` | 真实浏览器流程或三端可用性验证 |
| 检查 | `package.json` | 检查部署与依赖，不增加运行时框架或金融服务 |

## 执行分组

| 分组 | 任务 | 交付 |
|---|---|---|
| 基础与状态 | T1–T7 | 对应实现及逐项验证证据 |
| 完整轮次、资讯与选择 | T8–T19 | 对应实现及逐项验证证据 |
| 效果与金额结算 | T20–T28 | 对应实现及逐项验证证据 |
| 股票、分红及资产 | T29–T40 | 对应实现及逐项验证证据 |
| 原规则流程接入 | T41–T56 | 对应实现及逐项验证证据 |
| 校验、网络、计时与记录 | T57–T70 | 对应实现及逐项验证证据 |
| 回归、三端前端与缓存 | T71–T90 | 对应实现及逐项验证证据 |
| 多人场景与最终验收 | T91–T101 | 对应实现及逐项验证证据 |

依赖关系按下述每项的“依赖”字段执行；编号顺序是合法的拓扑顺序。独立计算组件可先完成各自依赖，本轮不默认启用多代理或跨任务并发修改。

## 任务明细

### T1：保存工作区与验证基线

**文件：** `docs/world-events-augments/progress.md`、`docs/world-events-augments/acceptance.md`

**依赖：** 无

**需求：** F10

**步骤：**
1. 记录 git status、已有动作安全修改及未跟踪文件，创建全部任务进度。
2. 记录 Node/npm 实际版本与已有测试结果。
3. 将本轮需求差异与已有失败区分，保留原修改，不提交无关截图或 game.zip。

**验证：** `git status --short；node --version；npm test；npm run lint`；预期：基线、命令退出码和失败原因完整保存；当前发现的 Node 24 不能当作 Node 20 证据。

### T2：建立固定输入与假时钟夹具

**文件：** `test/helpers/gameplayFixtures.js`、`test/gameplay-fixtures.test.js`

**依赖：** T1

**需求：** F10

**步骤：**
1. 提供固定随机、原合法骰袋、假单调时钟和二至四人状态构造。
2. 提供旧状态与新状态构造入口，测试辅助不新增生产 Socket 操作。
3. 每个夹具独立复制，验证两个测试实例不会互相消费袋或时钟。

**验证：** `node --test --test-name-pattern="建立固定输入与假时钟夹具" test/gameplay-fixtures.test.js`；预期：夹具互不干扰，旧状态缺新增字段也能构造。

### T3：定义五类资讯目录

**文件：** `src/gameplayCatalog.js`、`test/gameplay-catalog.test.js`

**依赖：** T2

**需求：** F3、F8

**步骤：**
1. 写入五类资讯、三轮持续及实际地区元数据。
2. 写入旺淡季百分比/3000上限、建设15%/2000和航班30%等常量。
3. 目录文案使用自然名称，不把地块颜色代替地区。

**验证：** `node --test --test-name-pattern="定义五类资讯目录" test/gameplay-catalog.test.js`；预期：五类与十三种地区变体正确，罗马和悉尼按实际地区区分。

### T4：定义十二项机遇目录

**文件：** `src/gameplayCatalog.js`、`test/gameplay-catalog.test.js`

**依赖：** T3

**需求：** F4、F6、F8

**步骤：**
1. 逐项录入 H1–H12 名称、方向、触发条件、百分比及次数/金额上限。
2. 明确每圈、每完整轮、每机场及一次性奖励的区别。
3. 写入自然条件说明，不提供稀有度或附加候选。

**验证：** `node --test --test-name-pattern="定义十二项机遇目录" test/gameplay-catalog.test.js`；预期：十二项数据与附表B逐项一致，产品文案没有机制标签。

### T5：实现安全金额与取整工具

**文件：** `src/economy.js`、`test/economy.test.js`

**依赖：** T4

**需求：** F7、F12、F13

**步骤：**
1. 按 K3 实现整数分子分母四舍五入及向下取整。
2. 内部中间乘积允许 BigInt，最终只返回安全整数 Number。
3. 覆盖半单位取整、负额现金增减及溢出拒绝。

**验证：** `node --test --test-name-pattern="实现安全金额与取整工具" test/economy.test.js`；预期：派息向下取整与费用四舍五入明确，输出不含 BigInt。

### T6：迁移原基础地产估值

**文件：** `src/economy.js`、`src/gameLogic.js`、`test/economy.test.js`

**依赖：** T5

**需求：** F7、F10

**步骤：**
1. 集中原 cityTotalValue、rentFor、mortgageValue 和标准建房费用。
2. 原规则引擎同名导出委托基础函数，避免循环依赖。
3. 保留未折扣原数值及原高价四级租金规则。

**验证：** `node --test --test-name-pattern="迁移原基础地产估值" test/economy.test.js`；预期：名义房产、原租金与抵押估值不因本轮折扣变化。

### T7：初始化新规则状态及版本

**文件：** `src/state.js`、`test/gameplay-state.test.js`

**依赖：** T2、T4

**需求：** F1、F10

**步骤：**
1. 加入 gameId、ruleVersion、revision、turnId 和本人版本。
2. 初始化轮次/资讯/机遇/股票资金/建造成本等 D1–D4 字段。
3. 新开局生成新身份，旧对象缺版本不追溯补奖，实际开局选择由后续编排接入。

**验证：** `node --test --test-name-pattern="初始化新规则状态及版本" test/gameplay-state.test.js`；预期：二至四人新状态完整，旧对象可识别且不被直接升级。

### T8：追踪本轮要求与回合完成

**文件：** `src/roundFlow.js`、`test/round-flow.test.js`

**依赖：** T7

**需求：** F2

**步骤：**
1. 实现 completeTurn 按 turnId 只完成一次。
2. 初始化本轮存活名单并判断 requiredIds 是否全部完成。
3. 不把子阶段操作或原显示 rounds 当成轮次完成。

**验证：** `node --test --test-name-pattern="追踪本轮要求与回合完成" test/round-flow.test.js`；预期：二至四人完成判定正确，重复完成和子操作不多计。

### T9：处理轮内出局与自动跳过

**文件：** `src/roundFlow.js`、`test/round-flow.test.js`

**依赖：** T8

**需求：** F2、F10

**步骤：**
1. 未行动出局从本轮要求移除，已完成出局不撤销记录。
2. 记录连续监狱、冰冻及超时跳过的各自完成身份。
3. 保存边界身份与续接，重复边界处理不重复推进。

**验证：** `node --test --test-name-pattern="处理轮内出局与自动跳过" test/round-flow.test.js`；预期：首位出局和连续跳过不漏轮，暂停不推进。

### T10：实现五类袋与跨组限制

**文件：** `src/worldEvents.js`、`test/world-events.test.js`

**依赖：** T3、T2

**需求：** F3

**步骤：**
1. 生产沿用现有 rng，测试注入固定源。
2. 每组五类一次，跨组首项排除前组末类再洗剩余。
3. 状态保存服务端队列，不占用骰袋或机会牌序列。

**验证：** `node --test --test-name-pattern="实现五类袋与跨组限制" test/world-events.test.js`；预期：连续两组五类齐全、组间无相邻同类且无无界重试。

### T11：实现旺淡季独立地区袋

**文件：** `src/worldEvents.js`、`test/world-events.test.js`

**依赖：** T10

**需求：** F3

**步骤：**
1. 旺季和淡季分别保存五地区袋。
2. 每类五次地区用完再重洗。
3. 地区来自城市 continent，颜色不参与地区判断。

**验证：** `node --test --test-name-pattern="实现旺淡季独立地区袋" test/world-events.test.js`；预期：两类各自五次覆盖全地区，非洲/欧洲等不串袋。

### T12：实现资讯启动预告与切换

**文件：** `src/worldEvents.js`、`test/world-events.test.js`

**依赖：** T11、T9

**需求：** F2、F3、F4

**步骤：**
1. 未解锁时返回启动条件。
2. 启动首项3轮，完成轮依次2/1/切换，剩1轮才公开下一项。
3. 累计运行六轮并停止终局推进，刚启动边界不算已运行一轮。

**验证：** `node --test --test-name-pattern="实现资讯启动预告与切换" test/world-events.test.js`；预期：C3 时间表逐行匹配，未预告未来数据不进入公开依据。

### T13：计算资讯费用依据与建设额度

**文件：** `src/worldEvents.js`、`test/world-events.test.js`

**依赖：** T12、T5

**需求：** F3、F7

**步骤：**
1. 按实际地区计算旺淡季租金15%及3000截取。
2. 给出建设首成功每轮15%/2000、付费机票30%与平稳无额外效果。
3. 建设用量在新完整轮刷新，只读计算不扣次数。

**验证：** `node --test --test-name-pattern="计算资讯费用依据与建设额度" test/world-events.test.js`；预期：30000租金变33000/27000，免费飞行与机场费不受影响。

### T14：抽取合法三候选组合

**文件：** `src/opportunities.js`、`test/opportunities.test.js`

**依赖：** T4、T2

**需求：** F4

**步骤：**
1. 从目录筛除本人已选及永久耗尽项。
2. 枚举不同三项且至少两方向的组合再随机选取。
3. 重选可排除原三项，暂未拥有相关资产的候选保留条件说明。

**验证：** `node --test --test-name-pattern="抽取合法三候选组合" test/opportunities.test.js`；预期：候选唯一、方向合格、成长型可出现、测试随机可复现。

### T15：建立同时选择阶段

**文件：** `src/opportunities.js`、`test/opportunities.test.js`

**依赖：** T14、T7

**需求：** F4、F5

**步骤：**
1. 实现 beginOpportunityStage 的名单、阶段身份、三候选及 continuation。
2. 全体名单只包含存活参与者。
3. 建立未提交状态，不提前修改 selectedIds 或发钱。

**验证：** `node --test --test-name-pattern="建立同时选择阶段" test/opportunities.test.js`；预期：所有参与者有本人候选，建立阶段不发即时奖。

### T16：锁定本人选择并判定全员完成

**文件：** `src/opportunities.js`、`test/opportunities.test.js`

**依赖：** T15

**需求：** F5

**步骤：**
1. 校验本人名单、当前候选版本和候选归属。
2. 提交后锁定并更新本人版本，不改旁人版本。
3. 全员完成前只改变私有提交值与公共完成布尔。

**验证：** `node --test --test-name-pattern="锁定本人选择并判定全员完成" test/opportunities.test.js`；预期：越权/重复/旧候选均不变，他人合法同时提交仍有效。

### T17：实现全局一次重选

**文件：** `src/opportunities.js`、`test/opportunities.test.js`

**依赖：** T16

**需求：** F4、F5

**步骤：**
1. 校验未提交及本局重选余量。
2. 替换三个候选，排除旧三项和已选，递增候选版本并扣一次。
3. 不重建阶段、截止时刻或本人已选能力。

**验证：** `node --test --test-name-pattern="实现全局一次重选" test/opportunities.test.js`；预期：重选完整替换，后续阶段无第二次，迟到旧确认拒绝。

### T18：管理个人每圈与机场额度

**文件：** `src/opportunities.js`、`test/opportunities.test.js`

**依赖：** T16

**需求：** F6

**步骤：**
1. 按 D3 保存次数与 H4/H6 金额额度。
2. 圈刷新只在本人实际起点结算，H3 色组共享。
3. H8机场永久领取记录、一次重选余量不随圈刷新。

**验证：** `node --test --test-name-pattern="管理个人每圈与机场额度" test/opportunities.test.js`；预期：转让、重连、广播不刷新，每圈和每局用途分开。

### T19：统一应用全员或到期选择

**文件：** `src/opportunities.js`、`test/opportunities.test.js`

**依赖：** T17、T18

**需求：** F5、F6、F10

**步骤：**
1. 实现 resolveOpportunityStage，超时补当前左端项。
2. 全体同时转为 selectedIds 并初始化新选能力额度。
3. 移除出局者、优先终局、阶段 resolved 后不再生效。

**验证：** `node --test --test-name-pattern="统一应用全员或到期选择" test/opportunities.test.js`；预期：重选后默认当前首项，全体公开一次，被移除者不获奖。

### T20：计算叠加建房优惠

**文件：** `src/economy.js`、`test/economy.test.js`

**依赖：** T13、T18、T6

**需求：** F6、F7

**步骤：**
1. 实现 quoteBuild 原费基数及资讯/H2/H3 单项优惠。
2. 按资讯→H2→H3截取30%总上限，H3判断同色两座非抵押。
3. 输出正贡献对应额度，零贡献不消耗。

**验证：** `node --test --test-name-pattern="计算叠加建房优惠" test/economy.test.js`；预期：12000的贡献1800/1200/600，最终8400，各正贡献用量一次。

### T21：校验远程施工资格

**文件：** `src/economy.js`、`test/economy.test.js`

**依赖：** T20

**需求：** F6、F7

**步骤：**
1. 远程仅本人 waiting_roll、已选H1、未用本圈额度。
2. 校验自有、非抵押、未满四级和最终费用可支付。
3. 仅远程免落点及 buildReady，其余普通资格不改变。

**验证：** `node --test --test-name-pattern="校验远程施工资格" test/economy.test.js`；预期：原价不足但优惠后足够可远程，越权/无钱/满级不修改。

### T22：保存房级实际费用与返还

**文件：** `src/economy.js`、`test/economy.test.js`

**依赖：** T20

**需求：** F7

**步骤：**
1. 按建房顺序记录实付成本。
2. quoteDemolition 取末级实付60%返还并四舍五入。
3. 缺成本旧房级按原标准认定，产权转移不覆盖成本。

**验证：** `node --test --test-name-pattern="保存房级实际费用与返还" test/economy.test.js`；预期：8400房返5040，普通12000返7200，旧房和转手不套利。

### T23：计算租金优惠及银行补足

**文件：** `src/economy.js`、`test/economy.test.js`

**依赖：** T13、T18、T6

**需求：** F7、F12

**步骤：**
1. 实现 quoteRent 原租金→资讯→H6→H11。
2. 普通股份无基础抵租，机遇金额按本圈余额截取。
3. 输出租客实付、补贴、城主现金、待分红及观察收入。

**验证：** `node --test --test-name-pattern="计算租金优惠及银行补足" test/economy.test.js`；预期：资讯后10000得到7200/2800/8000/2000，抵押零租，机场不入账。

### T24：计算航班折扣与免费情况

**文件：** `src/economy.js`、`test/economy.test.js`

**依赖：** T13、T18、T5

**需求：** F6、F7

**步骤：**
1. 实现 quoteFlight 原票价与资讯/H7优先贡献。
2. 总上限50%，H7原价20%最多1500。
3. 免费航班不扣额度，机场通行费另行处理。

**验证：** `node --test --test-name-pattern="计算航班折扣与免费情况" test/economy.test.js`；预期：5000机票最终2500，免费不耗H7，各金额可解释。

### T25：计算三项起点经营奖励

**文件：** `src/opportunities.js`、`src/economy.js`、`test/economy.test.js`

**依赖：** T18、T7、T5

**需求：** F6

**步骤：**
1. H5核对三座已归属非抵押城市各一股。
2. H9用原机场对应邻城映射，每对1500上限3000。
3. H10城市总数含抵押不超2奖励2000，均按起点身份一次。

**验证：** `node --test --test-name-pattern="计算三项起点经营奖励" test/economy.test.js`；预期：三项条件边界与未持机遇/已出局不触发正确。

### T26：计算稳健股息额外奖励

**文件：** `src/opportunities.js`、`src/economy.js`、`test/economy.test.js`

**依赖：** T18、T5

**需求：** F6、F12

**步骤：**
1. H4只按实收基础股息20%追加。
2. 本圈累计1000，受已用金额截取。
3. 排除保留收益、零头和其它奖，不扣城市资金。

**验证：** `node --test --test-name-pattern="计算稳健股息额外奖励" test/economy.test.js`；预期：200基础得到40追加，接近上限正确，旁人派息不刷新额度。

### T27：计算应急资金与骰子机场奖励

**文件：** `src/opportunities.js`、`src/economy.js`、`test/economy.test.js`

**依赖：** T19、T18

**需求：** F6

**步骤：**
1. H12只在阶段统一生效后发6000一次。
2. H8只认可骰子直接机场及成功出狱骰子，选择前访问不计。
3. 每机场本局一次，飞行/机会位移/重复继续不发。

**验证：** `node --test --test-name-pattern="计算应急资金与骰子机场奖励" test/economy.test.js`；预期：四机场首次奖励各2000，H12重连和重复生效无第二笔。

### T28：提交金额计划与守恒检查

**文件：** `src/economy.js`、`test/economy.test.js`

**依赖：** T22、T23、T24、T25、T26、T27

**需求：** F7、F9、F12

**步骤：**
1. 实现 applySettlement 校验 guards 和安全范围。
2. 同计划现金/待分红/额度/房级成本全部应用或全部拒绝。
3. 成功形成独立结算身份及 effects 明细，失败不记录。

**验证：** `node --test --test-name-pattern="提交金额计划与守恒检查" test/economy.test.js`；预期：后段失败不留前段现金变化，资金与额度明细可对账。

### T29：初始化股份与派生报价

**文件：** `src/stocks.js`、`test/stocks-v2.test.js`

**依赖：** T7、T28

**需求：** F11、F13

**步骤：**
1. 首次经营经营价为地价20%，每城20份。
2. holders权威、玩家stocks镜像、市场余量派生。
3. 公开price始终为G+floor(D/20)，无主清算不可交易。

**验证：** `node --test --test-name-pattern="初始化股份与派生报价" test/stocks-v2.test.js`；预期：地价20000初价4000，D2000报价4100，份额镜像一致。

### T30：更新三轮租金观察窗口

**文件：** `src/stocks.js`、`test/stocks-v2.test.js`

**依赖：** T29、T9

**需求：** F13

**步骤：**
1. 把当前轮有效租金写入最多三轮历史并清零。
2. 无收入轮写0，缺轮按0，移出旧数据。
3. 同完成轮身份不可再写入，正常易主保留历史。

**验证：** `node --test --test-name-pattern="更新三轮租金观察窗口" test/stocks-v2.test.js`；预期：三轮合计及旧收入移出正确，同边界重复不改变历史。

### T31：计算经营目标与每轮涨跌

**文件：** `src/stocks.js`、`test/stocks-v2.test.js`

**依赖：** T30、T5

**需求：** F13

**步骤：**
1. 实现 updateOperatingQuotes 的建设/收入/抵押公式与目标上下界。
2. 每轮朝目标最多上一价10%，租金为0用-5%。
3. 无主/清算停止更新，不由买卖、建房或易主立即涨价。

**验证：** `node --test --test-name-pattern="计算经营目标与每轮涨跌" test/stocks-v2.test.js`；预期：地价20000/两房/R18000目标5400，本轮G4000→4400；上下界正确。

### T32：实现基础派息与保留收益

**文件：** `src/stocks.js`、`test/stocks-v2.test.js`

**依赖：** T29、T26

**需求：** F12、F14、F15

**步骤：**
1. 实现 settleCityDividend 对存活持股按floor(D/20)派发。
2. 余款归在营城主，死者/银行边界归银行。
3. 清零资金、更新上次分红和现金成分，H4追加另记。

**验证：** `node --test --test-name-pattern="实现基础派息与保留收益" test/stocks-v2.test.js`；预期：D2000两股200、H4另40，总基础款守恒，抵押前资金照发。

### T33：管理固定窗口与累计买入

**文件：** `src/stocks.js`、`test/stocks-v2.test.js`

**依赖：** T29

**需求：** F11

**步骤：**
1. 实现 openStockWindow/closeStockWindow 与 prices/版本/身份快照。
2. 买入城市、总股及每城累加不因卖出或中间子阶段刷新。
3. 关闭身份迟到请求拒绝。

**验证：** `node --test --test-name-pattern="管理固定窗口与累计买入" test/stocks-v2.test.js`；预期：三城六股单城两股累计执行，返回同窗口无新额度。

### T34：预检并提交股票整单

**文件：** `src/stocks.js`、`test/stocks-v2.test.js`

**依赖：** T33、T28

**需求：** F11

**步骤：**
1. 实现 planStockTrade 城市单方向、份额及城主四股校验。
2. 按固定公开价允许其它城卖股凑资金，不给城主半款。
3. 抵押可交易，旧报价/身份、超额度、现金不足整笔拒绝。

**验证：** `node --test --test-name-pattern="预检并提交股票整单" test/stocks-v2.test.js`；预期：拆单与卖出再买不可绕限，净筹资成立，非法订单无部分成交。

### T35：校验并提交协商股份转让

**文件：** `src/stocks.js`、`test/stocks-v2.test.js`

**依赖：** T34

**需求：** F11

**步骤：**
1. 沿用每回合一笔/每笔三城/每城一股。
2. 确认时复查双存活、持股、现金和交易资格，抵押可转让。
3. 协商款和所有股份同提交，失败双方无变化。

**验证：** `node --test --test-name-pattern="校验并提交协商股份转让" test/stocks-v2.test.js`；预期：接收方超持或后项不足不部分转移，不产生派息/新窗口额度。

### T36：实现成功产权前派息

**文件：** `src/stocks.js`、`test/stocks-v2.test.js`

**依赖：** T32、T34

**需求：** F14

**步骤：**
1. 实现 transferCity 成交全部预检后同笔先派息后产权转移。
2. 保留股份、G、历史与建造成本，原主死者保留款归银行。
3. 失败不派息、不先用待入股息解锁现金不足成交。

**验证：** `node --test --test-name-pattern="实现成功产权前派息" test/stocks-v2.test.js`；预期：成交前后股份不丢、原主收益正确，失败账务完整不变。

### T37：处理新城主股份上限

**文件：** `src/stocks.js`、`test/stocks-v2.test.js`

**依赖：** T36

**需求：** F11、F14

**步骤：**
1. 产权成功后新城主超过四股部分按派息后价卖出。
2. 统一更新双方镜像与现金。
3. 直接出售和拍卖共用同一上限路径。

**验证：** `node --test --test-name-pattern="处理新城主股份上限" test/stocks-v2.test.js`；预期：新城主六股派息后强卖两股，基础股息不被重复卖价兑现。

### T38：实现归银行股份清算

**文件：** `src/stocks.js`、`test/stocks-v2.test.js`

**依赖：** T32、T37

**需求：** F14

**步骤：**
1. 实现 clearCityToBank 先派存活股息再按G50%付清算款。
2. 清股份、房级、实付成本、资金和历史。
3. 当前listingEpoch内只清一次，出局持股不复活。

**验证：** `node --test --test-name-pattern="实现归银行股份清算" test/stocks-v2.test.js`；预期：G4000/C100两股基础200+清算4000=4200，重复清算零新增。

### T39：重新经营与报价例外保护

**文件：** `src/stocks.js`、`test/stocks-v2.test.js`

**依赖：** T38、T33

**需求：** F11、F13、F14

**步骤：**
1. 重新经营建立新listingEpoch与全新20股/初价/零历史。
2. 实现 refreshWindowCityQuote 仅更新受影响城市价格/资格/版本。
3. 保留windowId和全部累计预算，拒绝旧报价或身份整单。

**验证：** `node --test --test-name-pattern="重新经营与报价例外保护" test/stocks-v2.test.js`；预期：重新经营不恢复旧持股，派息后两股卖价8000+基础200=8200。

### T40：统一新旧资产摘要

**文件：** `src/assets.js`、`test/assets.test.js`

**依赖：** T6、T32、T29

**需求：** F10、F15

**步骤：**
1. 实现 assetSummary 股票含息估值及城主待分配经营收益。
2. 各项分列并求total，资金不同时当作现金。
3. 旧版本沿用既有字段口径，不生成新分红。

**验证：** `node --test --test-name-pattern="统一新旧资产摘要" test/assets.test.js`；预期：无追加奖派息只换资产形态，持自城股票不重复计收益。

### T41：接入可信上下文与失败返回

**文件：** `src/gameLogic.js`、`test/gameplay-integration.test.js`

**依赖：** T28、T19、T39

**需求：** F5、F6、F10

**步骤：**
1. apply增加认证actor/source上下文，原动作资格保留。
2. 选择/重选/remote_build分发至已定义模块。
3. 失败返回rejected/error且不推进回合，结构化事件只随成功候选返回。

**验证：** `node --test --test-name-pattern="接入可信上下文与失败返回" test/gameplay-integration.test.js`；预期：新增动作不能使用当前turnIndex冒充其它参与者，失败原状态不变。

### T42：接入真实租金与自救

**文件：** `src/gameLogic.js`、`test/gameplay-integration.test.js`

**依赖：** T41、T23

**需求：** F7、F12

**步骤：**
1. 城市落点用完整租金计划移除旧持股抵扣。
2. 入账20%资金与roundRent并记录一次身份。
3. 原现金负值进入自救，恢复不重计租金或补贴。

**验证：** `node --test --test-name-pattern="接入真实租金与自救" test/gameplay-integration.test.js`；预期：租客7200/城主8000/资金2000真实变化，债务自救不重复收入。

### T43：接入普通建拆与募资拆房

**文件：** `src/gameLogic.js`、`test/gameplay-integration.test.js`

**依赖：** T41、T22

**需求：** F7、F10

**步骤：**
1. 原普通建造和build_decide使用最终费用判可支付。
2. 普通/自救/募资拆房共用末级实付退款。
3. 保留原资格与续接，去除新版bumpStock建造即涨价。

**验证：** `node --test --test-name-pattern="接入普通建拆与募资拆房" test/gameplay-integration.test.js`；预期：优惠使原价不足者合法建造，三种拆房返还一致且成本随级减少。

### T44：接入主动远程施工

**文件：** `src/gameLogic.js`、`test/gameplay-integration.test.js`

**依赖：** T43、T21

**需求：** F6

**步骤：**
1. remote_build免落点和再次到达，其余资格复核。
2. 支付/升一级/记录成本/扣H1及优惠额度同笔。
3. 保留waiting_roll和原决定，不自动掷骰或结束。

**验证：** `node --test --test-name-pattern="接入主动远程施工" test/gameplay-integration.test.js`；预期：一次远程有效，第二次及过期报价不改变房级/现金/时限。

### T45：接入机票优惠和原债务续接

**文件：** `src/gameLogic.js`、`test/gameplay-integration.test.js`

**依赖：** T41、T24

**需求：** F7、F10

**步骤：**
1. 原flightAction应用最终票费与H7正贡献额度。
2. 原机场落点费、免费飞行和飞行不买机场保持。
3. 不足资金按原债务/自救及移动顺序继续。

**验证：** `node --test --test-name-pattern="接入机票优惠和原债务续接" test/gameplay-integration.test.js`；预期：优惠、免费及机票不足三场景正确，不新增机场购买机会。

### T46：接入起点派息与个人奖励

**文件：** `src/gameLogic.js`、`test/gameplay-integration.test.js`

**依赖：** T32、T25、T41

**需求：** F6、F12

**步骤：**
1. 实现 settleGoEconomy 原GO基础与购买逻辑之外的接点。
2. 只刷本人圈额度，派名下城基础股息后H5/H9/H10。
3. 所有完成后openStockWindow，保留原落点续接。

**验证：** `node --test --test-name-pattern="接入起点派息与个人奖励" test/gameplay-integration.test.js`；预期：本人额度先刷新，其他股东旧额度保持，股价先除息再开窗。

### T47：保留位移来源及机场一次奖励

**文件：** `src/gameLogic.js`、`test/gameplay-integration.test.js`

**依赖：** T27、T46

**需求：** F6

**步骤：**
1. 普通骰子与成功出狱骰子保存原落点身份。
2. 股票子阶段之后继续同落点，H8机场奖在机场费用前。
3. 机会/飞行来源不满足，重复续接不重奖。

**验证：** `node --test --test-name-pattern="保留位移来源及机场一次奖励" test/gameplay-integration.test.js`；预期：跨GO后机场领取一次，飞行和机会移到机场不领取。

### T48：接入市场转让与自救卖股

**文件：** `src/gameLogic.js`、`test/gameplay-integration.test.js`

**依赖：** T34、T35、T46

**需求：** F11

**步骤：**
1. stockTrade/stockTransfer使用整单股票模块与窗口身份。
2. 转让返回原window，取消半购股城主奖励。
3. 自救卖股按当前价、不受普通买入预算及抵押限制。

**验证：** `node --test --test-name-pattern="接入市场转让与自救卖股" test/gameplay-integration.test.js`；预期：真实持股镜像/净现金正确，转让拒绝和成功续接均保留额度。

### T49：接入直接出售产权结算

**文件：** `src/gameLogic.js`、`test/gameplay-integration.test.js`

**依赖：** T37、T40、T48

**需求：** F10、F14

**步骤：**
1. 成交全部资格成功后统一调用transferCity。
2. 原买方全价/卖方80%、购置次数与buildReady保持。
3. 派息及成本保留，普通成交结束回合、自救返回原自救。

**验证：** `node --test --test-name-pattern="接入直接出售产权结算" test/gameplay-integration.test.js`；预期：股份和实付成本保留，失败无提前派息，原回合续接正确。

### T50：接入拍卖成交与流拍

**文件：** `src/gameLogic.js`、`test/gameplay-integration.test.js`

**依赖：** T49、T38

**需求：** F10、F14

**步骤：**
1. 拍卖成功使用相同产权派息/新主上限。
2. 流拍归银行调用clearCityToBank，原卖方收款及估值规则保留。
3. 队列与自救ctx继续原流程，不插选择。

**验证：** `node --test --test-name-pattern="接入拍卖成交与流拍" test/gameplay-integration.test.js`；预期：成功不即涨G，流拍清算一次，连续城市与自救续接不丢。

### T51：接入破产认输清算

**文件：** `src/gameLogic.js`、`test/gameplay-integration.test.js`

**依赖：** T50、T40、T9

**需求：** F2、F10、F14

**步骤：**
1. 先明确原出局及本人持股作废、停止能力。
2. 抵押城/认输归银行统一清空，其余原拍卖队列保留。
3. 救济金与原排名先后保留并使用统一资产摘要，本轮要求更新。

**验证：** `node --test --test-name-pattern="接入破产认输清算" test/gameplay-integration.test.js`；预期：死者不因派息复活，活股东清算款正确，首位出局不漏轮。

### T52：接入回合完成安全边界

**文件：** `src/gameLogic.js`、`test/turn-phases.test.js`

**依赖：** T51、T30、T31、T42、T43、T44、T45、T47

**需求：** F2、F10、F13

**步骤：**
1. 原endTurn/advanceTurn完成后接completeTurn与边界。
2. 购买/股票/募资/拍卖/自救内部不计轮。
3. 保存原继续点，原rounds、抵押计息和晚期收费不换语义。

**验证：** `node --test --test-name-pattern="接入回合完成安全边界" test/turn-phases.test.js`；预期：二至四人轮次及首位出局覆盖，原计息与晚期监狱断言保留。

### T53：接入连续跳过边界检查

**文件：** `src/gameLogic.js`、`test/turn-phases.test.js`

**依赖：** T52

**需求：** F2

**步骤：**
1. 原短期监狱循环每跳过一人记turnId完成。
2. 跨安全边界时先暂停循环处理资讯/选择，再继续下一人。
3. 冰冻和超时回合结束复用同路径，不重复原费用。

**验证：** `node --test --test-name-pattern="接入连续跳过边界检查" test/turn-phases.test.js`；预期：多人连跳不越过选择，暂停恢复没有重复利息或监狱费用。

### T54：接入资讯与阶段二三

**文件：** `src/gameLogic.js`、`test/gameplay-integration.test.js`

**依赖：** T53、T12、T13、T19

**需求：** F2、F3、F4

**步骤：**
1. 实现processRoundBoundary收入/报价→资讯→选择→新轮顺序。
2. 首圈解锁后第一个安全边界启动并做第二次选择。
3. 运行六轮先切资讯再第三次选择，终局及清算优先。

**验证：** `node --test --test-name-pattern="接入资讯与阶段二三" test/gameplay-integration.test.js`；预期：启动3/2/1/切换与六轮选择顺序匹配，无中途插入。

### T55：接入选择奖励与下一回合恢复

**文件：** `src/gameLogic.js`、`test/gameplay-integration.test.js`

**依赖：** T54、T27

**需求：** F4、F5、F6

**步骤：**
1. 全员/到期统一结果后执行H12等即时奖，保存公开选择事件。
2. 恢复原continuation并建立新轮要求/建设优惠用量。
3. 旧阶段重复和出局移除只处理一次。

**验证：** `node --test --test-name-pattern="接入选择奖励与下一回合恢复" test/gameplay-integration.test.js`；预期：三次选择不漏不重，立即奖金与公开结果同步，不改变单骰。

### T56：统一正常终局残余经济

**文件：** `src/gameLogic.js`、`test/gameplay-integration.test.js`

**依赖：** T55、T32、T40

**需求：** F10、F14、F15

**步骤：**
1. 实现settleFinalEconomy停止资讯和待选结果。
2. 结清存活股息/城主保留收益及现有H4额度，再调用原排名。
3. finalSettlementDone防重复，不刷新圈或GO奖励。

**验证：** `node --test --test-name-pattern="统一正常终局残余经济" test/gameplay-integration.test.js`；预期：最后存活者和多城残余资金归零，基础派息无资产翻倍。

### T57：校验身份与动作版本

**文件：** `src/actionValidation.js`、`test/action-validation.test.js`

**依赖：** T41

**需求：** F5、F10

**步骤：**
1. normalizeAction接context认证身份，拒绝客户端actor/source。
2. 新版校验gameId/actionId/decisionId/actorRevision安全格式。
3. 旧版接受原协议，新版缺协议返回刷新提示。

**验证：** `node --test --test-name-pattern="校验身份与动作版本" test/action-validation.test.js`；预期：非法/旧对局/越权不进入规则，其他参与者动作不使本人失效。

### T58：校验候选与共享阶段权限

**文件：** `src/actionValidation.js`、`test/action-validation.test.js`

**依赖：** T57、T55

**需求：** F5

**步骤：**
1. 加入opportunity_choose仅本人选/换可用。
2. 候选版本、阶段、提交锁和重选条件完整校验。
3. 普通动作暂停、内部到期来源不可伪造。

**验证：** `node --test --test-name-pattern="校验候选与共享阶段权限" test/action-validation.test.js`；预期：跨玩家候选、迟到旧组选项和伪造默认动作均拒绝。

### T59：校验费用股份与整单资格

**文件：** `src/actionValidation.js`、`test/action-validation.test.js`

**依赖：** T57、T44、T48

**需求：** F6、F7、F11

**步骤：**
1. 原建房/航班动作复核报价版本与最终费用。
2. 市场/转让按窗口、城市报价/经营身份及累计预算校验。
3. 新remote_build与自救卖股采用批准资格，失败不结束决定。

**验证：** `node --test --test-name-pattern="校验费用股份与整单资格" test/action-validation.test.js`；预期：旧报价整单无部分修改，优惠后可负担不被原价拒绝。

### T60：增加三十秒共享决定

**文件：** `src/actionClock.js`、`test/action-clock.test.js`

**依赖：** T58

**需求：** F5

**步骤：**
1. opportunity_choose决定键使用gameId/stageId并给30秒。
2. 不纳入候选版本/提交人数/当前turnIndex。
3. 假时钟验证重选提交不续时，暂停恢复和旧回调保护。

**验证：** `node --test --test-name-pattern="增加三十秒共享决定" test/action-clock.test.js`；预期：30秒、剩余毫秒及默认时点正确，原90/60秒保持。

### T61：实现公共白名单视图

**文件：** `src/gameView.js`、`src/state.js`、`test/game-view.test.js`

**依赖：** T40、T13、T55

**需求：** F5、F8、F15

**步骤：**
1. snapshot转委托gameView按阶段重建公共pending。
2. 输出当前资讯/公开预告/已生效机遇/完成状态/资产摘要。
3. 不输出私有阶段、候选、未公开未来、令牌/序列/内部continuation。

**验证：** `node --test --test-name-pattern="实现公共白名单视图" test/game-view.test.js`；预期：本人、他人、无身份三视角公共字段一致且敏感字段不存在。

### T62：实现本人报价与权限视图

**文件：** `src/gameView.js`、`test/game-view.test.js`

**依赖：** T61、T59、T60

**需求：** F5、F7、F8

**步骤：**
1. self保存本人的候选/提交、额度、预算、本人版本及可用报价。
2. decision含gameId/id/剩余秒与暂停。
3. 只读访问不扣用量或改变状态，无身份没有self。

**验证：** `node --test --test-name-pattern="实现本人报价与权限视图" test/game-view.test.js`；预期：他人拿不到本人候选，费用依据与规则相同，暂停快照可恢复。

### T63：增加有界成功请求去重

**文件：** `server.js`、`test/network-gameplay.test.js`

**依赖：** T59、T60、T62

**需求：** F5、F6、F11

**步骤：**
1. 按认证玩家保存128成功指纹与回执，新gameId清空。
2. 先身份核对再返回成功重复，同id不同内容拒绝。
3. 窗口淘汰由版本拒旧，失败不入成功缓存。

**验证：** `node --test --test-name-pattern="增加有界成功请求去重" test/network-gameplay.test.js`；预期：重复远程/交易只一次款，同id变内容和换玩家复用均不执行。

### T64：接入提交时钟投影统一发布

**文件：** `server.js`、`test/network-gameplay.test.js`

**依赖：** T63

**需求：** F5、F9、F10

**步骤：**
1. runAction校验→副本→不变量→提交事件/版本。
2. 同步决定时钟后逐玩家投影，失败不碰时钟。
3. 回执与快照版本一致，内部可信来源不能由raw决定。
4. 为测试固定随机与假时钟提供仅内部可注入的依赖；生产默认仍使用现有随机与单调时钟，不通过 Socket、URL 或玩家数据接受调参。

**验证：** `node --test --test-name-pattern="接入提交时钟投影统一发布" test/network-gameplay.test.js`；预期：失败副本无现金变动，成功每人正确self/decision，旧通知可识别。

### T65：统一首次与再次开局

**文件：** `server.js`、`test/network-gameplay.test.js`

**依赖：** T64、T55

**需求：** F1、F4

**步骤：**
1. startGame创建新身份后立即beginOpportunityStage首次选择。
2. 同房重开清理旧记录/事件/窗口缓存/去重/时钟并建立新状态。
3. 不加玩法开关，旧动作身份无法命中新开局。

**验证：** `node --test --test-name-pattern="统一首次与再次开局" test/network-gameplay.test.js`；预期：两次开局都三选一且普通掷骰暂停，旧gameId请求拒绝。

### T66：执行可信超时批量默认

**文件：** `server.js`、`test/network-gameplay.test.js`

**依赖：** T65、T60

**需求：** F5

**步骤：**
1. 共享选择到期一次补齐未提交者并调用统一resolve。
2. 边界请求实际截止后拒绝、到期队列接管，不重置计时。
3. 原defaultAction仍对应原阶段，内部超时带决定保护。

**验证：** `node --test --test-name-pattern="执行可信超时批量默认" test/network-gameplay.test.js`；预期：全员同阶段结束，重选后当前左项默认，迟到选择无额外奖励。

### T67：统一掉线和重连投影

**文件：** `server.js`、`test/network-gameplay.test.js`

**依赖：** T66

**需求：** F5、F10

**步骤：**
1. 替换disconnect原公共整份广播为逐身份投影。
2. 暂停共享与原时钟、重新认证接管身份并恢复精确状态。
3. 全存活在线才续计，生命周期移除更新阶段要求。

**验证：** `node --test --test-name-pattern="统一掉线和重连投影" test/network-gameplay.test.js`；预期：已提交/未提交重连均不重抽、不刷新预算或发奖，旁观不泄密。

### T68：接入解散与生命周期终局

**文件：** `server.js`、`test/network-gameplay.test.js`、`test/room-sweep.test.js`

**依赖：** T67、T56

**需求：** F5、F10、F14

**步骤：**
1. 正常终局/解散/闲置清扫生成记录前调用统一经济终局。
2. 终局动作一次提交、排名后record，暂停中房主可解散。
3. 保持原清扫时限/房主权限，不新建持久对局系统。

**验证：** `node --test --test-name-pattern="接入解散与生命周期终局" test/network-gameplay.test.js`；预期：待选中解散不发未生效奖，残余派息与排名一致且清扫不重结算。

### T69：生成新版结构化对局记录

**文件：** `src/record.js`、`test/record.test.js`

**依赖：** T68、T40

**需求：** F9、F15

**步骤：**
1. record去除依赖gameLogic估值，使用assets。
2. 写v2/ruleVersion/公开资讯和已选机遇/资金收支/股价原因。
3. 记录没有私有未生效结果和未来袋，v1兼容。

**验证：** `node --test --test-name-pattern="生成新版结构化对局记录" test/record.test.js`；预期：基础分红/追加/保留款/清算分别可核对，旧记录没有虚构字段。

### T70：聚合经营收益与优惠统计

**文件：** `src/record.js`、`test/record.test.js`

**依赖：** T69

**需求：** F9、F15

**步骤：**
1. 从结算身份汇总实际经营现金、股息、额外奖及节省费用。
2. 新字段不靠解析文字，重复广播不重复统计。
3. 日志自然文字不出现机制标签，落盘失败不再次派奖。

**验证：** `node --test --test-name-pattern="聚合经营收益与优惠统计" test/record.test.js`；预期：单次事件统计一致，基础及追加不混为同额现金，错误落盘可留房间记录。

### T71：完成规则与网络回归

**文件：** `test/gameLogic.test.js`、`test/stock.test.js`、`test/integration.test.js`、`docs/world-events-augments/progress.md`

**依赖：** T70

**需求：** F1、F10

**步骤：**
1. 按批准变化调整旧开局/分红/股价断言和合法夹具。
2. 保留原42格/单骰/计息/监狱/房间以及动作安全场景。
3. 运行全部test目录并记录证据，失败修复后才进入前端整合。

**验证：** `$gameTestFiles = @(Get-ChildItem -LiteralPath test -Filter '*.test.js' | ForEach-Object FullName)；node --test @gameTestFiles`；预期：全部规则及网络测试通过，无删除或跳过未改规则测试。

### T72：建立版本化动作发送入口

**文件：** `public/client.js`、`e2e/gameplay.spec.js`

**依赖：** T71、T62

**需求：** F5、F10

**步骤：**
1. 统一生成actionId及从self/decision取版本，旧rule走原格式。
2. 成功回执后更新本人版本，失败保留当前操作与错误。
3. 忽略旧gameId/旧revision通知，回执不泄露他人信息。

**验证：** `node --test --test-name-pattern="版本化动作发送入口" e2e/gameplay.spec.js`；预期：正常/失败/重复发送均不自扣金额，重连后可正确发新版本请求。

### T73：迁移普通动作与银行入口

**文件：** `public/client.js`、`e2e/gameplay.spec.js`

**依赖：** T72

**需求：** F7、F10

**步骤：**
1. 迁移掷骰、原阶段确认及银行/资产操作直发位置到统一入口。
2. 报价确认带服务端版本，原按钮含义不变。
3. 系统缩放和减少动画继续原状态处理顺序。

**验证：** `node --test --test-name-pattern="普通动作与银行入口" e2e/gameplay.spec.js`；预期：创建/加入/原操作与错误反馈可完成，失败不会关闭强制选择。

### T74：迁移股票草稿及成功后结束

**文件：** `public/client.js`、`e2e/gameplay.spec.js`

**依赖：** T73

**需求：** F11、F15

**步骤：**
1. 订单携windowId、各城市报价版本及经营身份。
2. 成功回执后以新本人版本stock_done，失败保留草稿。
3. 展示净收付/累计余量，不自动改价成交。

**验证：** `node --test --test-name-pattern="股票草稿及成功后结束" e2e/gameplay.spec.js`；预期：非法/旧报价草稿不提前结束窗口，成功成交后原续接正确。

### T75：迁移转让发起与接受确认

**文件：** `public/client.js`、`e2e/gameplay.spec.js`

**依赖：** T74

**需求：** F11、F15

**步骤：**
1. 原发起/接受使用统一发送入口，展示股份及协商款。
2. 确认回执后按原阶段续接，失败双方UI不伪造成交。
3. 不把转让当新股票窗口或刷新次数。

**验证：** `node --test --test-name-pattern="转让发起与接受确认" e2e/gameplay.spec.js`；预期：接受/拒绝/失败三条真实Socket路径可观察，预算保持。

### T76：增加同步选择可访问节点

**文件：** `public/index.html`、`public/client.js`、`e2e/gameplay.spec.js`

**依赖：** T75

**需求：** F5、F8

**步骤：**
1. 复用强制弹窗机制建立三候选原生按钮、确认和重选。
2. 展示名称、条件、剩余时间、本人提交及公共完成状态。
3. 提交仅关闭可编辑状态，全员完成后再关闭阶段弹窗。

**验证：** `node --test --test-name-pattern="同步选择可访问节点" e2e/gameplay.spec.js`；预期：仅见本人三项，提交后等待清楚，Enter可选，普通动作被暂停。

### T77：展示资讯摘要与完整预告

**文件：** `public/index.html`、`public/client.js`、`e2e/gameplay.spec.js`

**依赖：** T76

**需求：** F3、F8

**步骤：**
1. 棋盘区域增加环球资讯摘要，包含未启动条件和3/2/1轮信息。
2. 只展示服务端公开preview。
3. 点击打开完整地区效果，不遮地块及原操作。

**验证：** `node --test --test-name-pattern="资讯摘要与完整预告" e2e/gameplay.spec.js`；预期：启动前条件和运行/预告/平稳状态明确，不显示未来未公开项。

### T78：展示已选机遇与主动入口

**文件：** `public/client.js`、`e2e/gameplay.spec.js`

**依赖：** T77

**需求：** F6、F8

**步骤：**
1. 资产与其他玩家视图显示已生效能力，本人显示额度。
2. 远程施工列合格城市与不可用原因并按原生按钮操作。
3. 强制弹窗期间不启用主动能力，不引入旁人私有候选。

**验证：** `node --test --test-name-pattern="已选机遇与主动入口" e2e/gameplay.spec.js`；预期：本人主动动作可触达，其他人仅见生效项与自然说明。

### T79：展示城市租金与资讯明细

**文件：** `public/client.js`、`e2e/gameplay.spec.js`

**依赖：** T78

**需求：** F7、F8、F12

**步骤：**
1. 城市详情展示标准租金/资讯影响/可核对最终租金。
2. 付款记录说明个人减免、银行补足及完整入账。
3. 抵押零租和机场费用分别说明，移除旧基础股权抵扣文案。

**验证：** `node --test --test-name-pattern="城市租金与资讯明细" e2e/gameplay.spec.js`；预期：界面明细与10000→7200示例一致，纯持股不显示租金折扣。

### T80：展示建拆房最终费用

**文件：** `public/client.js`、`e2e/gameplay.spec.js`

**依赖：** T79

**需求：** F6、F7、F8

**步骤：**
1. 普通建房和远程展示原费/各贡献/最终费。
2. 按钮资金资格用服务端最终可用性，拒绝原因明确。
3. 拆房展示本级实际返还，资产名义价值不替换为实付成本。

**验证：** `node --test --test-name-pattern="建拆房最终费用" e2e/gameplay.spec.js`；预期：8400建房及5040退款可见，转手成本保留，非法报价不能确认。

### T81：展示机票与机场费用边界

**文件：** `public/client.js`、`e2e/gameplay.spec.js`

**依赖：** T80

**需求：** F7、F8

**步骤：**
1. 飞行确认区分原票价/资讯/H7/最终票价。
2. 免费航班明确免费且不耗用量，机场费单列。
3. 保持原不飞/飞行选择和资金不足续接反馈。

**验证：** `node --test --test-name-pattern="机票与机场费用边界" e2e/gameplay.spec.js`；预期：5000→2500明细可读，免费和机场费无误导。

### T82：展示报价原因与实际历史股息

**文件：** `public/client.js`、`e2e/gameplay.spec.js`

**依赖：** T81

**需求：** F13、F15

**步骤：**
1. 股票列表显示当前价/原因/上次基础股息/本人持股。
2. 详情显示G、待分红及经营依据，历史分红非承诺。
3. 除息下降明确发放分红、抵押可交易及清算状态有理由。

**验证：** `node --test --test-name-pattern="报价原因与实际历史股息" e2e/gameplay.spec.js`；预期：报价4500→4400解释派息，订单数量单价总額与服务器一致。

### T83：共用服务端资产摘要

**文件：** `public/client.js`、`e2e/gameplay.spec.js`

**依赖：** T82

**需求：** F10、F15

**步骤：**
1. 资产卡/详情/玩家信息/结算使用AssetSummary。
2. 待分配经营收益单列且不能支付，股票含息不再额外加预计股息。
3. 旧状态缺摘要时沿用原兼容显示。

**验证：** `node --test --test-name-pattern="服务端资产摘要" e2e/gameplay.spec.js`；预期：多处总资产相同，无H4时基础派息前后总额不凭空增加。

### T84：展示结构化收益和旧记录

**文件：** `public/client.js`、`e2e/gameplay.spec.js`

**依赖：** T83、T70

**需求：** F9、F15

**步骤：**
1. 结算与记录显示公开资讯/已选机遇/实际收益/节省。
2. 区分基础股息、机遇额外、保留收益、清算。
3. 旧v1查看无虚构奖或模式标签。

**验证：** `node --test --test-name-pattern="结构化收益和旧记录" e2e/gameplay.spec.js`；预期：v1/v2均可查看，未生效选择及他人候选无泄露。

### T85：更新自然规则说明

**文件：** `public/client.js`、`docs/环球大亨-权威开发文档.md`、`e2e/gameplay.spec.js`

**依赖：** T84

**需求：** F8、F11、F12、F13、F14

**步骤：**
1. 更新三次选择时点/资讯三轮预告/十二项自然条件。
2. 说明20股、实际租金分红、简单买卖额度、除息和清算。
3. 产品预置文案不含F8禁止术语，开发文档内部术语允许。

**验证：** `node --test --test-name-pattern="自然规则说明" e2e/gameplay.spec.js`；预期：规则与实际动作一致；只扫描产品固定文案，不审查用户昵称。

### T86：适配PC资讯与三候选布局

**文件：** `public/style.css`、`e2e/responsive.spec.js`

**依赖：** T85

**需求：** F8

**步骤：**
1. 沿用海面蓝/暖白/少量金色，三候选和资讯摘要有清晰层级。
2. PC完整42格、地图资产卡与原操作不遮挡。
3. 长名称与效果可滚动，不改变既有棋盘比例。

**验证：** `node --test --test-name-pattern="PC资讯与三候选布局" e2e/responsive.spec.js`；预期：常见PC视口42格可见，新入口没有覆盖棋盘或操作。

### T87：适配平板横竖屏

**文件：** `public/style.css`、`e2e/responsive.spec.js`

**依赖：** T86

**需求：** F8

**步骤：**
1. 平板横竖屏重排候选/资讯/资产与股票。
2. 保持原棋盘总览及触控尺寸。
3. 竖屏长明细弹窗可滚动且确认可达。

**验证：** `node --test --test-name-pattern="平板横竖屏" e2e/responsive.spec.js`；预期：横竖屏不横向溢出，所有候选/金额/按钮可读可达。

### T88：适配320至430手机

**文件：** `public/style.css`、`e2e/responsive.spec.js`

**依赖：** T87

**需求：** F8

**步骤：**
1. 320/375/430候选纵排，摘要精简并提供全明细。
2. 保持42格完整一屏宽总览，操作和固定入口不挡地块。
3. 处理安全边距/滚动/横向溢出。

**验证：** `node --test --test-name-pattern="320至430手机" e2e/responsive.spec.js`；预期：三个宽度无整页横滚，三候选/报价/确认皆可触达。

### T89：验证焦点缩放与减少动画

**文件：** `public/client.js`、`public/style.css`、`e2e/responsive.spec.js`

**依赖：** T88

**需求：** F8

**步骤：**
1. 选择/详情沿用焦点进入、Tab限制、关闭恢复与原生键盘按钮。
2. 实际浏览器200%与减少动画检查关键流程。
3. 证据区别模拟视口/实际缩放/实体设备，未测实体不宣称通过。

**验证：** `node --test --test-name-pattern="焦点缩放与减少动画" e2e/responsive.spec.js`；预期：键盘可选择确认和查看明细，缩放可操作，减少动画不改变状态时序。

### T90：更新静态版本及客户端缓存

**文件：** `public/index.html`、`public/sw.js`、`e2e/gameplay.spec.js`

**依赖：** T89

**需求：** F1、F10

**步骤：**
1. 客户端和CSS版本URL与SW缓存标识一并更新。
2. 保留本地世界地图/海面素材与原离线壳。
3. 旧缓存升级取到新脚本，旧协议请求新局得到刷新提示。

**验证：** `node --test --test-name-pattern="静态版本及客户端缓存" e2e/gameplay.spec.js`；预期：升级后不混用旧协议，新规则无外部行情/新运行时依赖。

### T91：验证二至四人选择与轮次边界

**文件：** `test/network-gameplay.test.js`、`docs/world-events-augments/acceptance.md`

**依赖：** T90

**需求：** F2、F5

**步骤：**
1. 二至四人真实Socket覆盖同步提交、重选、到期与首位出局。
2. 抓各连接消息核对公共/私有字段和同一计时身份。
3. 验证连续跳过及重连决定稳定，保存输入和观察结果。

**验证：** `node --test --test-name-pattern="二至四人选择与轮次边界" test/network-gameplay.test.js`；预期：人数边界、消息隐私和共享时间有可重复证据。

### T92：验证清算终局与异常重放

**文件：** `test/network-gameplay.test.js`、`test/record.test.js`、`docs/world-events-augments/acceptance.md`

**依赖：** T91

**需求：** F5、F6、F9、F11、F14

**步骤：**
1. 覆盖清算中/选择中掉线、暂停解散和重复终局。
2. 远程、股份转让、订单、派息、清算分别重放/过期/越权。
3. 现金/份额/资金/额度/记录均无部分或重复提交。

**验证：** `node --test --test-name-pattern="清算终局与异常重放" test/network-gameplay.test.js test/record.test.js`；预期：账务、记录及倒计时一致，所有终局资金守恒。

### T93：建立多人完整流程驱动

**文件：** `test/helpers/gameplayScenario.js`、`test/gameplay-scenario.test.js`

**依赖：** T92、T2

**需求：** F1、F10

**步骤：**
1. 通过真实创建/加入/开局和action驱动，不提供生产调参端点。
2. 固定随机与合法骰袋，按收到的self/decision决定合法动作。
3. 有界步骤保护与完整流水，失败输出最后阶段和输入。

**验证：** `node --test --test-name-pattern="建立多人完整流程驱动" test/gameplay-scenario.test.js`；预期：驱动可复现且未直接篡改已开始对局的金额/股权来伪造流程。

### T94：覆盖开局首圈资讯启动

**文件：** `test/gameplay-scenario.test.js`

**依赖：** T93

**需求：** F1、F2、F3、F4

**步骤：**
1. 完整场景从新房间和首次三选一开始。
2. 合法动作绕首圈并完成购置开放，在安全边界启动首资讯和第二选择。
3. 记录事件时点及不提前购置的观察证据。

**验证：** `node --test --test-name-pattern="覆盖开局首圈资讯启动" test/gameplay-scenario.test.js`；预期：无需改生产规则即可重走启动条件及两次选择。

### T95：覆盖完整经营与第三选择

**文件：** `test/gameplay-scenario.test.js`

**依赖：** T94

**需求：** F3、F4、F6、F7、F11、F12、F13

**步骤：**
1. 继续同一场景真实收租、股票买卖及派息，执行一次优惠主动操作。
2. 完成六个资讯轮，核对预告/切换及第三选择。
3. 保存金额明细、候选公开时点与报价除息证据。

**验证：** `node --test --test-name-pattern="覆盖完整经营与第三选择" test/gameplay-scenario.test.js`；预期：AC23经营段全部真实动作完成，附表每项另有对应单测。

### T96：覆盖完整场景重连和结算

**文件：** `test/gameplay-scenario.test.js`

**依赖：** T95

**需求：** F5、F9、F10、F14、F15

**步骤：**
1. 在同一场景一次真实断线及认证重连，保留选择或当前决定。
2. 按原合法出局/结束路径终局，结清分红生成记录。
3. 核对资产摘要、记录一次性与全部观察结果。

**验证：** `node --test --test-name-pattern="覆盖完整场景重连和结算" test/gameplay-scenario.test.js`；预期：从创建到终局连续可重复，未凭测试直接改账务取得结果。

### T97：完成真实浏览器联机流程

**文件：** `e2e/flow.spec.js`、`e2e/gameplay.spec.js`

**依赖：** T96

**需求：** F1、F5、F8、F10、F15

**步骤：**
1. 旧创建/加入/单骰/资产/银行/规则/解散/记录场景加入开局选择。
2. 新浏览器场景操作本人候选/重选/股票/主动入口并抓私有消息。
3. 错误不会提前关弹窗或结束窗口，复用现有浏览器依赖。

**验证：** `npm run test:e2e；node --test e2e/gameplay.spec.js`；预期：真实浏览器核心流程通过，原单骰及身份保密断言保持。

### T98：归档三端实测证据

**文件：** `e2e/responsive.spec.js`、`docs/world-events-augments/acceptance.md`

**依赖：** T97

**需求：** F8

**步骤：**
1. 运行PC、平板横竖与320/375/430共至少七类视口。
2. 保存截图/布局测量及长文本、强制弹窗观察。
3. 注明实际缩放和实体设备状态，模拟夹具只证明界面布局不替代多人完整流程。

**验证：** `node --test e2e/responsive.spec.js`；预期：AC13每种视口及键盘缩放有明确通过/失败记录。

### T99：验证Node20及依赖约束

**文件：** `package.json`、`docs/world-events-augments/acceptance.md`

**依赖：** T98

**需求：** F10

**步骤：**
1. 定位实际可用Node20运行时并记录绝对路径/版本。
2. 使用该运行时启动并完成规则及关键联机场景。
3. 检查没有新增前端框架/运行时依赖或金融外部请求，缺实际20证据时保持未通过。

**验证：** `先设置已核实的 $gameNode20Exe 绝对路径；& $gameNode20Exe --version；$gameTestFiles = @(Get-ChildItem -LiteralPath test -Filter '*.test.js' | ForEach-Object FullName)；& $gameNode20Exe --test @gameTestFiles；以该运行时在独立测试端口启动并验证 /healthz 和新开局`；预期：必须获得实际Node20证据，当前Node24结果仅作本机验证。

### T100：执行最终测试与按清单验收

**文件：** `docs/world-events-augments/progress.md`、`docs/world-events-augments/acceptance.md`

**依赖：** T99

**需求：** F1、F2、F3、F4、F5、F6、F7、F8、F9、F10、F11、F12、F13、F14、F15

**步骤：**
1. 执行批准checklist全部条目，覆盖AC1–AC23及效果表。
2. 运行全套测试/lint/浏览器门禁，失败修复后重跑对应风险。
3. 记录实际命令/输入/观察，不把未测设备或平衡当通过。

**验证：** `npm test；npm run lint；npm run test:e2e；执行 checklist.md`；预期：所有必需门禁通过且证据可回查，未通过项不得标完成。

### T101：核对变更归属并交付

**文件：** `docs/world-events-augments/acceptance.md`、`docs/world-events-augments/progress.md`

**依赖：** T100

**需求：** F9、F10

**步骤：**
1. 核对规格覆盖、原安全改动保留与实际验收结果。
2. 逻辑相关组完成验证后按skill提交相关变更，不收无关资源。
3. 输出简明交付说明、证据和实际限制，不承诺平衡胜率。

**验证：** `git diff --check；git status --short；审阅 acceptance.md 与提交范围`；预期：交付范围清楚，所有任务与验收证据一致。

## AC1–AC23 任务覆盖

| 验收标准 | 主要任务 |
|---|---|
| AC1 | T65、T3、T4、T85、T90 |
| AC2 | T8、T9、T52、T53、T91 |
| AC3 | T12、T54、T94 |
| AC4 | T10、T11、T61、T95 |
| AC5 | T13、T23、T24 |
| AC6 | T14、T15、T17、T54、T95 |
| AC7 | T16、T19、T60、T66、T76 |
| AC8 | T67、T91、T96 |
| AC9 | T4、T18、T20、T25、T26、T27 |
| AC10 | T21、T44、T18 |
| AC11 | T20、T22、T24、T43 |
| AC12 | T23、T42、T28 |
| AC13 | T86、T87、T88、T89、T98 |
| AC14 | T34、T35、T39、T48、T74、T75 |
| AC15 | T32、T26、T46 |
| AC16 | T30、T31、T39、T82 |
| AC17 | T36、T37、T38、T39、T49、T50、T51 |
| AC18 | T40、T56、T68、T83、T69 |
| AC19 | T69、T70、T82、T84 |
| AC20 | T71、T73、T97、T96 |
| AC21 | T28、T57、T58、T59、T63、T92 |
| AC22 | T7、T90、T99、T84 |
| AC23 | T93、T94、T95、T96、T97、T91 |
## 非功能需求与技术组件覆盖

| 范围 | 主要任务 |
|---|---|
| N1 动作一致性 | T28、T41、T57、T63、T64、T92 |
| N2 金额与资产 | T5、T23、T32、T38、T40、T83 |
| N3 隐私与恢复 | T61、T62、T60、T67、T91 |
| N4 三端 | T86、T87、T88、T89、T98 |
| N5 部署兼容 | T7、T69、T84、T90、T99 |
| N6 可重复证据 | T2、T93、T96、T100、T101 |

plan 的 A1–A7 分别由完整轮次、资讯/机遇、经济、股票/资产、网络、前端、记录/验证分组承接。D1–D5、I1–I3、C1–C10 和 K1–K12 的实现及观察点均在相应任务中出现；S1 报价例外由 T39/T59/T74 及 AC14/AC16 的验证承接。

## 拆解自检

- 全部 101 项均具有文件、依赖、具体步骤与验证方式；依赖无环且不引用不存在的任务。
- F1–F15、N1–N6 与 AC1–AC23 均有任务覆盖；附表 A 五类及附表 B 十二项逐项计算/集成验证。
- 八个新增规则模块与原服务端、前端、缓存及记录均列入文件清单；没有扩充玩法池、金融接口、前端框架或模式选择。
- 本任务拆解是实施安排，不代表当前代码已经实现或测试通过。最终证据记录在 progress.md 与 acceptance.md，并以批准的 checklist.md 逐项验收。
