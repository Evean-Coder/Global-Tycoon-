# 主动经营三路线修订 Plan

2026-10-17，依据 [Spec](spec.md)，正式技术设计，用户已最终确认开发；实现及验证见acceptance.md。沿 Node.js/CommonJS、Socket.IO 与现有前端，不新增运行时依赖。接口与字段为本轮待实现约定，不能视为已有能力。

## 1. 架构与职责

| 组件 | 文件 | 职责 / Spec覆盖 |
|---|---|---|
| 新规则开关与常量 | 新 `src/managementEconomyRules.js` | `REVISION='management-economy-v1'`、金额/期限常量、`enabled(s)`；F15 |
| 订单 | `src/operatingOrders.js` | 保留旧单，新增分期计划/来源验证/本金利润明细；F2–F3 |
| 竞争领域模块 | 新 `src/commercialCompetition.js` | 发布、基础资格、报名、开标计划、优势生命周期、只读投影；F5–F9、F11 |
| 本人收益预览 | 新 `src/competitionPreview.js` | 复用原租金/股息计划，隔离双分支顺序对照；F12 |
| 原经营入口 | `src/activeManagement.js`、`src/actionValidation.js` | 共用正常回合守卫、引用新报价/提交；F1、F7 |
| 金融与轮边界 | `src/economy.js`、`src/gameLogic.js`、`src/quickMode.js` | 单笔租金、来源、轮末开标、结束优先；F4、F8–F11 |
| 状态、隐私、请求与记录 | `src/state.js`、`src/gameView.js`、`src/record.js`、`src/privateReplay.js`、`server.js` | 新局选项、本人/公开投影、协议与回放；F13–F15 |
| 共用三端界面 | `public/client.js`、新 `public/management-economy-view.js`、`public/style.css` | 原弹窗内增加路线和净额，保留阅读状态；F12–F13 |
| 机器人 | `src/botPolicy.js`、`src/botEvaluation.js` | 使用本人视图、现金储备与期限折价；F14 |

### 依赖方向

规则常量无状态依赖。竞争模块不导入 economy、activeManagement 或 gameView；接受已算好的基础租金/整数计算工具，返回事实或提交计划。economy 调竞争的纯优势计划，仍统一计算原股息。预览模块导入 economy/stockInvestment/竞争纯函数，但仅由 view/报价边界调用；economy 不反向导入预览。activeManagement 与 gameLogic 负责调度，不复制金融引擎。

## 2. 版本与初始化

- 保持现有 `activeManagementRevision='active-management-v4'`，不改成 v5：`managementRules.balanced()` 目前精确判断v4，机遇、AI、旧文案存在相关分支，改名会连带失效。
- 新增独立 `managementEconomyRevision='management-economy-v1'`。`enabled(s)`要求 ruleVersion2、active-management-v4、stock-investment-v2 同时满足。非法组合初始化时拒绝，不悄悄降级。
- `server.NEW_GAME_ECONOMY`给新普通/快速对局带新标记；`createGameState`只有显式标记才初始化。未带标记的测试、旧存档和正在玩的对局保持旧订单与菜单；不迁移未完成订单。
- 新局初始化竞争状态、个人报名圈标记及机场产权代次。城市结合已有 `stocks[cityId].listingEpoch`与新增 `city.ownershipEpoch`验证来源，机场使用新增 `ownershipEpoch`（只在新版本读取）。现有城市上市代次不会在所有产权转让中递增，不能单独拿它代替产权代次。机场买入、筹资确认买入、归还/破产清算每次真实产权变化递增，防止卖掉再买回恢复订单。
- Socket鉴权增加 `managementEconomyProtocol:1`。仅新标记对局需要；旧局仍按原协议。客户端和内部机器人均声明能力，缺失时返回 UPDATE；不得自动重载进行中对局。用原 action 请求/回执，不新增 Socket 事件。

## 3. 数据约定

### 3.1 `state.commercialCompetition`

| 字段 | 约定 |
|---|---|
| `nextPublicationRound` | 首次发布前为null；首次符合条件的轮边界发布R，写R+4；此后每四轮前进，不因无人报名漂移 |
| `currentPeriod` | `{periodId,bidRound,closeRound,activeFromRound,activeThroughRound,publishedRegions,status}`；报名R，轮末R关闭，生效R+1..R+4 |
| `bids` | 本期每人最多一条，含下述不可变字段与终态原因；期末结果存入历史事件，当前待决数组有界 |
| `advantages` | 每人最多一项；`advantageId,periodId,playerId,region,cityId,listingEpoch,ownershipEpoch,startsRound,expiresAfterRound,remainingHits,endedReason` |
| `lastWinnerByRegion` | 最近真正成功赢家；跨流标/跳过不清空 |
| `lastClosedPeriodId` | 阻止重复开标；同价选择和结果一并保存，回放不再调用随机 |

个人 `activeManagement.lastCompetitionBidLap`保存合法报名时本人 `opportunities.lapEpoch`；订单沿用独立 `lastOrderLap`，不互相覆盖。`usedTurnId/skippedTurnId`仍为唯一经营回合标志。

### 3.2 `CompetitionBid`

`{bidId,periodId,playerId,region,cityId,listingEpoch,ownershipEpoch,amount,submittedTurnId,submittedLapEpoch,status,invalidReason}`。

接受后不可修改。`status`为accepted/won/lost/invalid/cancelled；失效与成交不是撤回接口。没有现金保证金、不写负债、不在 pending 新建阶段。每人仅一份待决保证不会在多个地区重复获奖/透支。

### 3.3 新订单

在原单上新增 `scheduleRevision,baseProfit,scheduledPayments:[first,tail],nextPaymentIndex,principalOutstanding,profitPaid,ownershipEpoch`；保留原 `orderId/playerId/targetKind/targetId/listingEpoch/createdTurnId/lastPaidTurnId/startedLapEpoch/cancelledReason`。

新单每次付款按计划与索引取金额，首笔本金分量0，尾笔本金分量upfront。事件独立列 `principal,profit,newsBonus`；按单/付款索引和真实turnId幂等。旧单没有scheduleRevision，继续原paymentEach/paymentsRemaining路径，不能用新公式重算旧单。

### 3.4 `CompetitionQuote`与快照

- 请求所需：`periodId,region,cityId,amount,quoteVersion`。
- 报价返回：`ok,reason,region,cityId,amount,cashRequired,debitNow:0,cashAfterNow,closeRound,startsRound,expiresAfterRound,preview,quoteVersion`。本人圈可用性在报价ok/reason与原self经营quota中体现。
- `cashRequired=amount`用于当前足额检查，但不把 `finalAmount=0`解释为免费，也不套普通经营“即时扣费”分支。开标可能付款的说明单列。
- `preview`含标准租金、名义附加、本人0/1/2次收入分项与扣价净额、数据版本、固定快照假设、亏损提醒。只保留当前报价，不保存第二份真实经济状态。
- `quoteVersion`绑定gameId、规则版本、turnId、本人/时期/地区/城市/来源/amount、经营及圈期名额、现金、房级、发行/持股及本人H4余量、资讯和相关租金口径；其它玩家无关操作不能无理由销毁草稿。合法但过时返回新报价，用户重新确认。
- 同步快照不预生成30档×所有城市的两分支模型：提供每城一次基准收益场景，另给30档金额各自的轻量 `bidTokensByAmount`（quoteVersion，包含出价）。客户端修改出价只做“基准增量−出价”的整数展示，提交对应token；服务端按所选档重算并验版本。无需客户端生成服务端报价token，也不增加报价Socket事件。
- 公共 `competition`只给发布地区/期限、报名者人数身份、生效优势、已公开结果；本人 `self.competition`另给本人的待决不可变报名、可用原因、合格城与预览。未开标bid整对象禁止复制到公共state、events或record。游戏结束未开标的取消信息也不揭示未公开暗价。

## 4. 领域接口与校验

| 接口（计划实现） | 输入→输出与责任 |
|---|---|
| `basicEligible(s,playerId,region,closeRound)` | 不读当前轮到谁；判断存活、城、圈/未决/将生效容量 |
| `publishAtRoundStart(s,roundId,events)` | 轮边界调用；前置firstRoundDone；首次等待条件，其后固定四轮，生成地区集与期间ID |
| `quoteBid(s,playerId,input)` | 纯资格/金额/来源/时期检查与token，返回CompetitionQuote；收益由上层预览模块补齐 |
| `acceptBid(s,playerId,q,events)` | 验证版本；一次写报名/圈/回合标志，不扣现金；仅公共报名通知，无金额/旗舰 |
| `planClose(s,roundId,rng)` | 纯隔离候选中筛真现金/来源、最高价及同价挑战集合，给出一次开标计划 |
| `commitClose(s,plan,events)` | 校验所有前提；扣赢家、发优势、历史、终态结果同提交；无有效报价不改历史 |
| `planRent(s,{cityId,tenantId,baseRent,settlementId})` | 返回附加金额/优势ID/消费一次guard或无效果；只读，不计算股息 |
| `commitRent(s,plan,settlementId)` | 仅economy提交中调用；消耗一次并记来源ID，与其它现金更改共享候选事务 |
| `clean(s,events)` / `cancelAll(s,reason,events)` | 来源/抵押/出局即时失效、封盘取消；不退款；有状态转换才记事件 |
| `publicView(s)` / `selfView(s,playerId)` | 白名单投影；读取不触发clean、付款、随机或发布 |
| `previewOwnerCashflow(s,playerId,cityId)` | read-only投影的有/无优势两分支，顺序2笔；返回累计收入差，不返回他人私人额度 |

所有金额用现有安全整数与半入取整口径；不要新建浮点资金路径。计划中的加法与现金全部先校验，再由server已存在的structuredClone候选通过 assertEconomy 后替换真实状态。竞争新增 invariant校验名额、期间、来源、次数范围与金额；异常整份候选丢弃。

## 5. 动作、回执和用户流程

新增原action类型 `active_competition_bid`，字段为上述请求及已有gameId/actionId/decisionId/actorRevision；保留原 active_order/active_build/remote_build/active_skip。

1. 原正常回合服务端生成真实菜单；三路线存在但不可执行时列短原因，全部无项目时不自动弹。竞争未发布不假造可提交项目。
2. 类型页→订单标的 / 施工城市 / 竞争地区与旗舰子页；竞争选城后显示输入档位、0/1/2情景、开标与不冻结提示。
3. 点击提交：仅一次在途，禁重复点击；复用原请求成功缓存。报价过时保留类型、城、价和滚动，展示更新并再次确认；不能自动重投。明示的负预览加一次局部确认，不增加阶段或倒计时。
4. 接受后显示“已报名，轮末开标，尚未扣款”，可关闭继续原掷骰；本回合经营已使用。回执绑定game/turn/period/target，旧回执不能关闭新窗口。相同actionId改payload仍拒绝。
5. `activeManagement.apply`新增显式分支；不能落入现有兜底promotion分支。`normalizeAction`、actor许可、server失败刷新名单加入新动作；复用原时限，不因查看/提交延长。
6. 已报名的普通掷骰和独立股票操作仍可进行，不能把报名本身设为pending阻塞所有人。离线默认不新增竞价；既有报名照常在开标验证。

## 6. 轮边界、租金与结束的调用顺序

### 6.1 完整轮交接

当前 `gameLogic.completeRoundBoundary`以`roundFlow.boundaryId`守重复，然后经营报价→资讯→startRound→可选同步机遇。新增逻辑置于同一边界事务内，不建立另一套时钟：

1. 原最后存活者结束判断、server总期限判断优先；已经结束不进开标。
2. R轮所有合法租金先完成，含R+4旧优势的末笔。
3. 在同一候选内到期旧优势、为closeRound=R的报名plan/commit；保护最近赢家与已开标ID。
4. 保持原股票报价、资讯推进及清建设次数顺序，startRound进入R+1；按新轮号发布到期的新报名期。
5. 再进入原同步机遇/prepareTurn继续；恢复时boundaryId不重复处理。特殊监狱/冻结自动回合和出局调整仍用原roundFlow，不按seatIndex另算轮。
6. server提交候选前保留已有再次检查真实quick截止的门；若期间超时丢弃该候选，封盘真实状态，不提交新中标扣款。记录边界开标阶段结果便于回放，不在恢复时重抽。

### 6.2 一笔租金

在`economy.rentAmounts`保留真正baseAmount：先现有资讯对base的增减，再加竞争planRent附加，再执行原H6/H11和银行补足、stockInvestment.rentPlan。不能把base+B传回整套资讯函数，否则再乘资讯；不复用旧promotion的自救后发银行奖路径。

`applySettlement`在同一候选内验证来源/次数/版本，提交全部现金、银行事实、个人额度、rentCommit和优势消耗；生成一条有 `competition:{advantageId,baseRent,surcharge,hitIndex}` 的城市租金事实。后续businessMissions/roundRent/股票正额收租次数都只观察这一笔。完成后gameLogic按租客最终净现金进入原emergency/self_rescue；恢复、破产和auction继续不得重跑这笔。

### 6.3 预览

根据公开城/股权/资讯与本人私有机遇构造隔离投影：两分支先去掉当前旧优势和待决报名，基准分支无优势，候选分支仅合成所选旗舰的新优势（不能把旧期效果再叠一次）；各自连续两笔，沿真实rentPlan/rentCommit更新副本H4额度，逐笔比较本人现金来源。其它人的私有成本/额度不输出；租客减免由银行补足，不改变城主这一经营收入口径，预览明确不预测租客自身净负担。两次间不假定经过起点刷新。

每次输出累计ownerRetained/rentalDividend/bankDividend/perkBonus差值；出价净额0次=-bid、1次=一次差-bid、2次=两次累计差-bid。上海四级、仅城主2股、H4剩700，应得3280/6480增量，出3000净额-3000/+280/+3480。预览前后原state深相等，不记录真实结算ID、不刷新真实股票或抽随机。

### 6.4 取消与封盘

城市真实transfer/clear、mortgage、出局出口调用竞争clean；订单沿源校验同步clean。机场新增ownershipEpoch覆盖两个购买出口和两个归还出口。普通finishGame、quick.finalize、解散/清理终止未付订单与未开奖/有效优势；没有清算价格或退款。正式封盘榜只用原已实现资产，不加预计利润。不得把clean混进snapshot导致读操作写状态。

## 7. UI、规则和缓存

- 新 `management-economy-view.js`只读格式化/DOM辅助，保留原弹窗和按钮标识。订单去掉新单“每次paymentEach”旧文案，改三项金额与取消风险；旧单仍按旧信息显示。
- 竞争页面将标题/关键期限、内容、固定可达页脚分区，内容为唯一纵向滚动区；卡片不各自固定成过小滚动盒。小高度横屏允许内容滚动，输入和确认按钮不被页脚盖住；PC、平板不共用手机超大字号。
- 页面状态按gameId/turnId/periodId保存当前类型、旗舰、金额、展开说明、scrollTop和焦点。新快照对稳定键更新文案，读取者的展开/滚动不重建；真实周期结束或目标失效才收起目标并解释，不保留失效提交权限。
- 竞争公共状态以可查看摘要接入原资讯/事件区，不新增遮挡棋盘的大模块；不改中央两模块布局、地图比例或地块结构。
- `gameplayCatalog/contextual-rules/rules-catalog`增加版本化订单/竞争规则与位置锚点；银行/股票/租金说明展示同一事实，不复制一套交易许可。
- `public/index.html`引入共用模块；`public/sw.js`和实际资源query同步新缓存版本与本地模块。沿已有更新提示策略，不主动刷新对局。脚本名以实际引用文件为准；修改package.json lint覆盖新纯模块。

## 8. AI与隐私/记录

AI只读gameView本人投影；订单按真实首笔/尾笔和可达回合计收益，不把本金当利润。竞价将可能支付bid计入现金储备成本，比较0/1/2当前情景、公开对手位置与剩余完整轮，不用6000上限保证收益。候选有限城市×30档上界，先筛安全现金/预览正值并减少到有意义档位；不为每条候选重复整局推演。负预览可给人类战略选择，AI无充分公开收益时跳过。quick近封盘折价到不报名/不接单。

公共事件分 `competition_opened/bid_accepted/period_closed/advantage_hit/advantage_ended`；bid_accepted不含秘密，period_closed仅公开已开标事实与简短无余额原因。费用去向银行单列，订单本金/净利/资讯分列。`record.js`纳入新revision与公开结果，pending暗价不导出。`privateReplay`现有完整state journal继续仅落服务端磁盘，不发客户端；记录已选同价结果，重放应用事实与哈希，不重掷。成功请求缓存、actorRevision与decisionId行为保持。

## 9. 技术决策与验证

| 决策 | 选择与原因 |
|---|---|
| 新版启用 | 独立revision，保持v4精确守卫，旧局不迁移 |
| 推进方式 | 沿完整轮边界，无新phase/socket事件/时钟 |
| 金融提交 | 单候选、单租金计划；股息与优势一起提交，之后自救 |
| 估算 | 双副本顺序对照真实分配，避免H4上限和本人持股算错 |
| 报名资金 | 足额校验不冻结，开标再验，界面与AI都列未来成本 |
| 产权 | 城市listingEpoch＋ownershipEpoch、机场ownershipEpoch，抵押即时取消 |
| 轮换 | 最高价优先、同价非最近赢家优先、余下随机；历史持久 |
| 验证量 | 固定边界/现金守恒/旧局回归，1条双Socket流程+1条机器人流程、四视口；不跑大批整局 |

自审覆盖：F1→入口/请求；F2–F3→订单；F4→原建设回归；F5–F9→竞争/轮末；F10→economy/stock；F11→生命周期/结束；F12→预览；F13→三端投影；F14→AI/离线；F15→版本/记录/缓存。不存在待定规则字段；实施中的命名调整需保持以上可观察行为并更新文档。

按 [Tasks](task.md) 实施，[Checklist](checklist.md)逐项填真实证据；设计模型15项只能支持设计算术，不能勾开发验收。
