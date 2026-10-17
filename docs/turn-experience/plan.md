# 回合体验整合 Plan

日期：2026-10-18。基于独立[Spec](spec.md)，自审完成，待最终开发确认。

## 1. 实现基线与真实缺口

基线提交a38db2b。以下为源码阅读证据，不代表本轮运行验收。

| 已有能力 | 位置 | 本轮处理 |
|---|---|---|
| 三路线及服务端报价 | activeManagement、management-economy-view | 复用；补统一费用／现金／风险层次 |
| 经营放弃与关闭分离 | client的managementDraft、syncManagement | 保留；有项目时required仍阻止直接掷骰，需新局规则门控 |
| 自动提醒有回合键 | managementSeenKey | 保留；补阅读窗口阻挡、重连／重开去重和延迟取消 |
| 股票真实账本 | stockInvestment、StockInvestmentView.facts | 复用；持仓列表目前过滤零持股，补已清仓历史 |
| 订单计划与竞争预览 | operatingOrders、competitionPreview | 复用；不新增预测模型 |
| 事件全局序号及房间事件历史 | server的appendEvents、room.events | 构建只读回顾，不能仅依赖客户端最多500条日志 |
| 阅读节点补丁与横屏布局 | patchDisplayNode、现有样式与board-layout | 复用稳定键更新，补新模块与低高度检查 |

## 2. 架构

### A. 新局回合语义

新建turnExperience模块导出`REVISION='turn-experience-v1'`、`enabled(state)`，要求同时启用现有management-economy-v1和stock-investment-v2。状态记录`turnExperienceRevision`；仅新局配置开启，不迁移旧局。

`activeManagement.required`在新规则下不因可执行项目阻止掷骰；资格、成功一项、显式放弃、圈额度保持原模块负责。actionValidation与gameLogic同时检查版本。`roll_dice`进入原移动逻辑前，若本回合未经营、未放弃且仍在合法经营时点，调用原skip并标记原因`roll`；与掷骰一起在原candidate状态提交。若无经营资格，不补造一次skip。沿原actionId／decisionId／actorRevision，不能客户端先发skip再发roll。

management_timeout仍走原保守跳过与roll；新局AI可直接roll，旧局AI继续处理原required。原股票议价随掷骰取消的处理沿用，不额外补发请求。无需修改任何报价或分红比例。

### B. 真实结果汇总

新增只读汇总模块turnExperience，接收已提交的结构化事件、已有股票账本和当前状态。`room.experienceCache`为可丢弃缓存，不进入资金、资产、请求校验或privateReplay的权威状态。appendEvents赋真实全局id后才喂入；拒绝／回滚／封盘取消的候选事件不进入缓存。

每位玩家最多二十四条最近回执，累计汇总为固定路线及有限标的字段。每次只处理新事件；缓存不存在时从仍保留的room.events单次重建，正常快照仅复制结果。清空房间／新局必须清空缓存。不在浏览器依赖完整事件历史。

股票累计结果直接读取stockLedger，不再对分红事件累加一遍。订单统计order_payment的principal、profit、newsBonus；同一奖金对应的world_order_reward只作消息来源，不重复加总。订单生命周期补orderId；取消事实补尚未返还本金，不能用当前最新订单反推历史。远程施工在原build事件加`managementKind:'remote_build'`、本次房级和真实费用元数据，区分落地建设。商业竞争仅汇总真实开标扣款和competition.surcharge、advantageId，不计算缺乏反事实依据的“个人竞争净利润”。

所有元数据由原成功动作填写，不能从中文text解析。银行流入、玩家现金、估值及结算次数均不受新增摘要字段影响。

### C. 玩家私有快照

state.snapshot与gameView.snapshot均增加可选第四参数`{experience}`并透传；原三参数调用保持可用。server.emitGame按viewer生成当前摘要，放入`self.turnExperience`，禁止在共享out／公共players中混入本人支出或未开标暗价。无上下文的工具快照明确historyAvailable=false，可展示当前报价和既有股票账本。快照及记录导出补顶层turnExperienceRevision，缺字段仍为旧规则。

privateReplay仍记录权威state；记录导出保留原结构化事件。重建回顾时按原事件顺序重放汇总，不能重算成交随机结果或修改state。旧记录缺新增元数据时标注incomplete，不猜原因或归属。

### D. 客户端阅读与决策展示

新增纯展示turn-experience-view：由self.turnExperience、原报价、StockInvestmentView.facts生成状态条、六条最近收支和展开回顾。市场及资产持股卡共用事实；市场不额外列大量历史卡，资产里通过“当前持仓／已清仓记录”切换，零持股且账本无任何活动的城市不出现。

经营卡统一顺序：用途／可选数→实际支出与现金→条件／风险→确认。远程建设直接用报价rentBefore／rentAfter；竞争保留现有顺序情景预览；订单两笔与本金风险保留。未知字段显示“资料暂不可用”，禁止NaN与假零。

以稳定标的id与回执id补丁更新，捕获并恢复当前focusKey、details状态、scrollTop和草稿；仅数据真正变化时改动对应节点。收支状态用aria-live=polite、aria-atomic，聚合为“新增N条收支”，不逐条打断读屏，不自动移焦。入口标注“仅含经营与分红”，不声称能对账所有购地、税费等现金变化。

## 3. 数据与接口约定

### D1：版本与请求

权威state增加可选turnExperienceRevision。新客户端auth增加turnExperienceProtocol:1；新规则开局要求真人均支持，AI内置适配。缺能力旧客户端收到简短升级提示，不能加入或重连控制新语义局；已有旧局继续原路径。新字段不改变既有Socket事件和动作载荷。旧记录缺revision保持旧规则。

### D2：汇总缓存

`{gameId,lastEventId,players:{[playerId]:{recent:Receipt[24],orderTotals,remoteTotals,competitionTotals,historyAvailable,incompleteReasons}}}`。按事件id单调处理，已经处理的id忽略；重建从原始有序事件执行同一归约器。

Receipt：`{id,eventId,settlementId?,turnId?,kind,targetId?,cashIn?,cashOut?,principal?,profit?,newsBonus?,nominalSurcharge?,status,reason?}`。仅确定为真实的金额才填；不适用与未知保留缺省，展示层不得统一补零。订单回款以settlementId去重；其他事实以已提交eventId去重，缓存只允许按序增量，不接受任意历史事件重复投喂。

金额按原safe整数工具相加。摘要计算失败不能伪造零结果；清空失效缓存后重建，仍失败则本次返回historyAvailable=false，不影响权威资金提交，并记录诊断原因。

同笔租金的分红事实与city_rent可能同时包含本人的现金变化：分红回执只取instant_stock_dividend，竞争回执仅报告名义附加／触发与整笔收款的参考关系，不再将city_rent.cashDeltas叠加为第二笔分红。路线汇总各自有口径，不提供跨路线相加的虚假利润总数。

### D3：本人视图

`self.turnExperience={revision,historyAvailable,incompleteReasons,recent,totals,turn:{key,canRoll,managementStatus,canManage,hasExecutable,reason}}`。recent最多24条；初显取前6条。totals分订单／远程建设／竞争；股票数据沿self.stockInvestment.cities，避免第二份统计。

对外部玩家从已公开事件中的公共结果推导，仅在其自己的self输出其本人实际收支。开标前不缓存公开暗价；本人现有self.competition.bid继续负责等待中报名，不计入累计支出。

### D4：自动提醒状态

键为gameId＋playerId＋turnId。内存seen与sessionStorage标记只管理提醒，不决定经营许可；sessionStorage不可用时安全降级为当前页面一次。每局最多保留当前玩家最近两个键，遇新gameId清理，禁止存token、报价或资金。

syncManagement依次判断：版本／阶段→本人资格→使用／放弃→已读键→方向阻挡／动作等待／动画→强制窗口及任意已打开的阅读窗口→可执行项目。被窗口挡住时不预先标seen；真正自动显示或手动打开时标seen。直接roll、成功经营、显式skip、turnId变化使旧提醒失效。

### D5：报价确认与失效

沿原服务端quoteVersion与股票basis。发生改变保留输入，提示重新核对，不能点击原按钮直接提交未展示的新报价。提交不确定时沿原retrieve查回执，关闭或重开不造新请求。当前目标失效仍可返回类型列表，不自动替玩家选择另一个目标。

### D6：缺资料和旧局

新局要求元数据完整。旧局不显示新规则的直接掷骰文案；只展示有依据的只读信息。旧回放缺少orderId、取消本金或施工来源时显示历史不完整，不用当前产权、房级或现金倒推过去。缓存不持久化、不加入资产；重启进程后仍遵守当前项目已有房间存续策略，不新增存档承诺。

## 4. 交互流程

1. 开头强制机遇／路线／自救等沿原优先级处理；横屏方向提示最高。
2. 本人waiting_roll收到快照：先更新真实状态与稳定阅读节点。无项目仅更新底栏；有项目且安全、未见过时显示经营主界面一次。
3. 选类型→目标→核对成本／条件→原动作提交成功，关闭经营，展示非阻塞收支；或者关闭查看继续观察，或者左键放弃。
4. 直接掷骰：服务端在同一候选动作放弃未用经营并走原roll；失败不提交任一部分；成功进入原移动与落点。
5. 在任何玩家回合，新的本人分红／回款仅增量更新摘要与提示。展开的回顾、规则与股票草稿不跳动。
6. 重连：先恢复权威状态与完整可用摘要，再恢复阅读窗口；已见的同回合经营不自动打开。封盘先结束操作，回顾保持只读。

## 5. 三端布局约束

维持既有整体棋盘，不新增侧栏与折叠全局面板。常驻区只用一行经营状态和一个最近收支入口。弹窗纵向结构为标题／正文滚动／底部操作，不固定正文像素高度；容器min-height:0，正文overflow:auto。

验证PC1440×900、平板1024×768、手机932×430／844×390／844×280／568×320。手机正文不小于12px，触控区域不小于32×32CSS像素；按钮可换行但不能盖住正文。系统200%缩放另观察，未真机验证不能替换为已通过；浏览器等效缩放单独记结果。保留减少动画偏好。

## 6. 规则保持表

| 路线／系统 | 保持值 | 本轮交互变化 |
|---|---|---|
| 订单 | 预付1000–2000、基础净利等预付；首笔25%利润，尾笔本金＋余利；每圈一次、同时一单 | 分离本金／利润，取消风险和历史清楚 |
| 远程建设 | 目标级150%／200%／300%／350%，优惠后最低150%，三次起点冷却、不能连续同城 | 展示租金前后值和实付，不归因整笔未来租金 |
| 商业竞争 | 100–3000步长100，原四轮节奏／两次，基础15%每笔3000上限 | 保留情景预览，区分中标支出／名义附加／实际收款 |
| 股票 | 总10股、城主2／外部4；租金20%＋银行40%，来源上限退出 | 明细统一、清仓历史可查 |
| 其他 | 预算扶持、正常落点、资讯、特殊决定和封盘策略 | 规则定位与阅读不打断 |

## 7. 技术决策与风险

| 决策 | 理由与边界 |
|---|---|
| 新局revision门控直接roll | 确为语义变化，旧局回放不能偷偷改变 |
| 经营skip与roll同一服务端动作 | 避免两请求之间超时或重试导致部分生效 |
| 复用账本，事件缓存可重建 | 防止浏览器断线漏账及复制第二套金融结算 |
| 竞争不展示“实际新增净利润” | 当前事实不含无优势时的反事实实收，名义附加不能冒充利润 |
| 不改数值、不自动推荐 | 先定位理解与操作障碍；收益不足另以试玩证据立项 |
| 只同步本人有权知道的摘要 | 避免私有支出和暗价外泄 |
| 按固定场景验收 | 不跑大量完整局，自动证据不替代玩家乐趣判断 |

Spec覆盖：A负责F1/F10/F11；D与交互负责F2/F3/F7/F8/F9；B/C负责F4/F5/F6；固定场景与Checklist负责F12。N1–N4贯穿身份、读模型与布局。

## 8. 验证及发布

新增有限纯归约／服务端动作／双Socket／浏览器用例，复用现有经营、股票、资讯、规则、手机和缓存回归。记录真实命令与数量，不运行大规模整局模拟。开发后跑Lint、规则目录一致性及必要CI门禁；失败先修复。

缓存版本与本地脚本URL同步升级，不强制刷新正在玩的局。最终开发确认后才改运行代码；默认自动推送约定有效，文档提交与将来的代码发布均只包含本轮文件。GitHub推送、CI和Render版本／临时测试房间核对分开记录，未核实不能报告上线。真机与真实玩家试玩无人可用时保留未测项，可交付已核实的实现，但不能声称整体体验验收全部通过或玩法已证明有趣。
