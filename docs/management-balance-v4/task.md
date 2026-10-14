> 2026-10-14：用户明确批准开始开发调整后的三路线。四份文档开发授权有效，进入实施与有限验收；不推送。下方设计阶段状态为历史记录。

# 三条主动经营路线平衡 Tasks

状态：T1–T14实施完成，有限验收通过。数值模型与正式引擎验收分别记录。

| 任务 | 文件 | 依赖 | 实施步骤与验证 |
|---|---|---|---|
| T1 版本 | src/managementRules.js、src/state.js、server.js、src/gameplayCatalog.js | 开发确认 | v4默认、旧版保留、初始化私有状态；版本单测 |
| T2 建设冷却与交替 | src/activeManagement.js、src/economy.js | T1 | 保存持久lapEpoch和lastRemoteBuildCityId，三次GO后还需不同目标；别名、失败/取消/等待/普通建设/单城/换机遇/产权/重连/回放边界 |
| T3 建设费用 | src/economy.js | T2 | 目标房级150/200/300/350%，优惠最高30个百分点且实际最低150%；H1/H2/H3/资讯组合、零减额不耗额度及normal旧版回归 |
| T4 订单报价与动作 | src/operatingOrders.js、src/actionValidation.js、src/activeManagement.js、src/gameLogic.js | T1 | 每圈一次、单在途、城市/机场目标、原action内active_order；费用与失败零修改 |
| T5 订单支付 | src/operatingOrders.js、src/gameLogic.js | T4 | 后续两次本人回合开始支付、turnId去重；冻结/监狱/自救/重复prepare验证 |
| T6 订单撤销 | src/operatingOrders.js、src/stocks.js、src/gameLogic.js、src/quickMode.js | T5 | 产权/抵押/出局/挂牌/封盘取消未领收入；旧回执和资产估值回归 |
| T7 主动股数与费用 | src/activeManagement.js、src/stocks.js | T1 | 1–4股、无新增圈额度、0手续费、原20/4上限；真实扣款与额度 |
| T8 股息奖励 | src/activeInvestment.js、src/stocks.js、src/gameLogic.js | T7 | 正常GO实付基础股息30%、圈1500、receipt去重；0股息/H4叠加/本人GO结束过期 |
| T9 奖励股份消减 | src/activeInvestment.js、src/stocks.js、src/gameLogic.js | T8 | 每个卖/转/减/清出口优先消减标记，不继承、不跨挂牌；循环交易无奖励 |
| T10 本人投影 | src/gameView.js、src/activeManagement.js、src/record.js、src/privateReplay.js | T2–T9 | 冷却、订单、奖金与股数仅本人投影；无候选泄漏，版本记录与回放核对 |
| T11 三端界面 | public/client.js、public/contextual-rules.js、public/style.css | T10 | 三类型→目标→确认，费用/次数/取消/冷却常显；保留原底栏顺序与放弃/关闭，PC/平板/短横屏检查 |
| T12 AI | src/botPolicy.js、src/botEvaluation.js | T10 | 现金储备、订单可兑现时间、实际股息和有限冷却评价；固定公开视图和快速尾声不盲投 |
| T13 规则与缓存 | public/client.js、public/index.html、public/sw.js、rules.md、e2e/cache.spec.js | T11 | 分版本说明，版本同步升级，不刷新在玩对局；缓存与旧局回归 |
| T14 完整验收 | test/management-balance-v4.test.js、e2e/management-balance-v4.spec.js、package.json、本目录、readme.md、docs/项目现状.md | T1–T13 | 固定数值/引擎、有限联机、三端、lint/差异/真实证据；不跑海量局；按当前指示不推送 |

## 当前文档阶段的验证

`numeric-probe.cjs`读取现有地价和标准费用/租金函数，使用明确的候选公式比较有限分支，结果写numeric-results.json与numeric-report.md。该脚本不修改src/public/server，不等于实现新玩法。

2026-10-13：Plan自审后审核通过；依赖无环，2026-10-14最终开发批准后已全部完成；原task依赖和文件范围保持，记录/回放沿原通用接口适配。
