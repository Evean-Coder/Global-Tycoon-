# 回合体验整合 Tasks

日期：2026-10-18。基于[Spec](spec.md)与[Plan](plan.md)，待最终开发确认；全部任务尚未实施。

## 文件清单

| 操作 | 文件 | 职责 |
|---|---|---|
| 新建 | src/turnExperience.js | revision、只读事件归约、视图、降级与有界缓存 |
| 修改 | src/state.js、server.js | 新局版本、能力校验、成功事件接入、私有快照与房间清理 |
| 修改 | src/activeManagement.js、src/actionValidation.js、src/gameLogic.js | 新局直接掷骰的原子放弃，旧局门控 |
| 修改 | src/operatingOrders.js、src/economy.js | 在既有事实补明确来源与组成，保持所有资金处理 |
| 修改 | src/gameView.js、src/record.js | 可选本人回顾上下文、版本导出，旧调用降级 |
| 新建 | public/turn-experience-view.js | 纯只读格式化与稳定节点展示 |
| 修改 | public/client.js、public/management-economy-view.js、public/contextual-rules.js | 提醒控制、卡片与持股回顾、状态与规则定位 |
| 修改 | public/index.html、public/style.css、public/sw.js | 本地模块引用、弹窗布局、缓存版本同步 |
| 新建 | test/turn-experience.test.js、test/turn-experience-socket.test.js、e2e/turn-experience.spec.js | 有限归约、动作边界、联机和真实UI流程 |
| 修改 | test/helpers/trackedClient.js、test/gameplay-server.test.js、test/gameplay-scenario.test.js、test/quick-server.test.js、test/travel-expense-server.test.js、test/bot-server.test.js、test/management-economy-socket.test.js、test/opportunity-routes-server.test.js、test/remaining-server.test.js、test/stock-investment-socket.test.js | 已搜索到的启动新局auth增加能力，旧客户端用例显式移除新能力 |
| 修改 | e2e/helpers/browserHarness.js、package.json | 复用真实浏览器开局、有限联机夹具及CI门禁 |
| 修改 | rules.md、docs/gameplay-improvements/summary.md、本目录progress.md／acceptance.md | 本轮规则说明与真实进度／证据 |

已核实public/index.html引用public/style.css；浏览器共用夹具为e2e/helpers/browserHarness.js。AI内部Socket的auth实际位于server.js的runBotDecision，不为此修改botScheduler策略。

## T1：固定基线与映射真实接入点

**文件：** 本目录progress.md、plan.md、task.md。
**依赖：** 最终开发确认。
**步骤：** 记录当时HEAD和本轮相关diff；核实样式、auth、快照及事件append调用，修正入口路径；保留无关工作区文件。
**验证：** rg结果与文件实际存在性一致，所有计划修改入口都有调用者；未改运行逻辑。

## T2：新局版本与状态初始化

**文件：** src/turnExperience.js、src/state.js、server.js。
**依赖：** T1。
**步骤：** 增加turn-experience-v1与enabled；只在兼容经营／股票组合的新局配置开启；旧状态无字段保持原逻辑。
**验证：** 新旧状态固定输入分别命中新／旧分支，错误组合不能启用新语义。

## T3：客户端能力校验

**文件：** server.js（runBotDecision及开局／动作能力校验）、public/client.js、文件清单所列十个测试auth入口。
**依赖：** T2。
**步骤：** 增加turnExperienceProtocol:1；开局、加入已开新局及重连控制检查能力；AI声明能力。更新受影响的真实测试调用，不降低旧局校验。
**验证：** 双Socket旧客户端不能控制新局；新客户端正常；旧局仍能沿原能力约定运行。

## T4：直接掷骰时原子放弃经营

**文件：** src/activeManagement.js、src/actionValidation.js、src/gameLogic.js。
**依赖：** T2。
**步骤：** 新规则required不拦roll；合法roll且经营未使用时同一candidate执行skip(reason=roll)后原roll；已经营／已放弃／无资格不重复skip。保持原股票报价取消及移动路径。
**验证：** 固定有经营场景能直接roll；非法、重复、过期、跨封盘提交无部分消耗；旧局仍按原required处理。

## T5：补订单与远程建设事实元数据

**文件：** src/operatingOrders.js、src/activeManagement.js、src/economy.js。
**依赖：** T2。
**步骤：** 订单开始、回款、取消绑定orderId及实际组成；取消写未领本金。远程build补managementKind、房级前后、真实支出，正常建设保持来源区分。补到原成功事实，禁止制造第二笔金额事件。
**验证：** 原固定金额断言保持，真实取消本金可观察；普通／远程建设区分；失败无新增事实。

## T6：实现有限只读事件归约

**文件：** src/turnExperience.js、test/turn-experience.test.js。
**依赖：** T5。
**步骤：** 实现已提交事件id增量处理、每人24条和固定汇总；订单资讯奖只计一次；竞争报名不记已付；股票累计读原账本；未知元数据标incomplete。
**验证：** 固定序列累计正确；相同事件重送不变；缓存清空重建一致；原state深比较不变。

## T7：房间缓存、恢复与清理

**文件：** server.js、src/turnExperience.js。
**依赖：** T6。
**步骤：** appendEvents赋id后接入归约；缓存缺失单次重建、同事件序号不重扫；新局／解散清理；异常返回资料不可用而不伪造零。
**验证：** 拒绝动作不进缓存，两个房间不串；重连有历史，重复快照不累加；可观测统计证实同游标不重算。

## T8：本人快照与回放上下文

**文件：** src/state.js、src/gameView.js、src/record.js、server.js、test/turn-experience.test.js。
**依赖：** T7。
**步骤：** state.snapshot与gameView.snapshot透传第四可选参数；self.turnExperience与本人权限绑定；快照与记录导出版本。无上下文标历史不可用；利用导出事件重建只读摘要，privateReplay保持权威状态原样。
**验证：** 两人私有摘要隔离、未开标暗价不泄漏、旧三参数调用有效；导出事件重建结果一致。

## T9：纯展示与账目标签

**文件：** public/turn-experience-view.js、test/turn-experience.test.js。
**依赖：** T8。
**步骤：** 实际支出／到账／本金／利润／估值格式化；缺字段不补假零；竞争附加不命名净利润；使用安全文本节点。
**验证：** 固定受赠、卖出、回款与缺字段输入无NaN；含估值标签明确；恶意名称作为文字显示。

## T10：提醒与窗口优先级

**文件：** public/client.js。
**依赖：** T4、T9。
**步骤：** 新局以稳定回合键记录提醒；同页面与sessionStorage只保存最近键；任意阅读／强制决定／方向提示阻挡时延迟；手动打开也标seen；直接roll与阶段结束取消旧提醒。
**验证：** 无项目不弹；有项目一次；关闭、刷新、重连不重弹；阅读不被抢；存储不可用可正常操作。

## T11：经营卡与底栏状态

**文件：** public/management-economy-view.js、public/client.js、public/contextual-rules.js。
**依赖：** T10。
**步骤：** 三路线按费用／现金／触发／风险顺序展示；新版底栏允许直接roll；左放弃右关闭保持。保留类型→目标，失效原因、草稿与报价重新确认。
**验证：** 三路线各一固定报价及变化场景；关闭后可直接roll，显式skip不可再经营；底栏掷骰／经营顺序保持。

## T12：持仓与清仓历史

**文件：** public/client.js、public/stock-investment-view.js、public/turn-experience-view.js。
**依赖：** T9。
**步骤：** 复用facts提供当前持仓／已清仓记录切换；不改变买卖按钮或可买量；系统／玩家支出、回收、费用与股息均按已有ledger口径。资金筹集页仍只列实际可卖持股。
**验证：** 全卖后有历史、回购后回当前持仓；受赠回收0，筹资列表仍可卖且不混入历史记录。

## T13：最近收支与回顾窗口

**文件：** public/client.js、public/turn-experience-view.js、public/index.html。
**依赖：** T8、T9。
**步骤：** 资产信息新增小入口，初显6条／展开24条；只读路线汇总；非阻塞新增N条提示；竞争名义附加、订单本金和真实收款分清。
**验证：** 发生本人分红与订单付款时出现一次，不弹确认、不移焦；断线恢复，零新事件不提示。

## T14：稳定阅读与规则定位

**文件：** public/client.js、public/management-economy-view.js、public/turn-experience-view.js、rules.md。
**依赖：** T11、T12、T13。
**步骤：** 按标的／回执稳定键补丁更新；保留草稿、details、焦点、滚动；对应主题规则入口及返回状态；文案区分回合／圈／完整轮。
**验证：** 另一玩家实际操作后当前帮助和数量不变；目标失效禁用，返回路径仍可用；规则定位正确。

## T15：三端低高度样式

**文件：** T1核实的原样式入口、public/index.html。
**依赖：** T14。
**步骤：** 标题／可滚正文／底部操作，压缩重复文字并折叠详情；保留原棋盘与中央布局；常驻入口不扩大台账；键盘焦点和减少动画处理。
**验证：** 指定六尺寸不重叠或横溢，底部可达，触控32px；保留42格信息与原操作顺序。真机缩放单独记录。

## T16：有限动作与联机验收

**文件：** test/turn-experience.test.js、test/turn-experience-socket.test.js。
**依赖：** T3–T8。
**步骤：** 验证直接roll、回执不确定重试、隐私、事件恢复、新旧语义、AI／超时和封盘。使用固定局势，少量真实Socket动作，完成后清理测试房间。
**验证：** 相应测试全部通过且真实账目与对照保持；失败先修复，不跳过失败断言。

## T17：完整UI场景与回归

**文件：** e2e/turn-experience.spec.js、package.json、本目录acceptance.md。
**依赖：** T10–T16。
**步骤：** 五局势覆盖核心体验链，指定一个双真人联机与一个人机回合；刷新／清仓／手机滚动／帮助完整流程；纳入test:e2e。运行相关既有经营、股票、资讯、缓存及布局回归。
**验证：** 记录实际命令、截图、数量与限制；玩法试玩三问单列，未测不得勾选。

## T18：版本文案、缓存与发布

**文件：** public/sw.js、public/index.html、rules.md、本目录progress.md／acceptance.md、docs/gameplay-improvements/summary.md。
**依赖：** T17。
**步骤：** 同步PWA版本／模块列表／URL；检查旧局兼容；Lint、目录一致性、git diff检查；仅提交本轮文件，按默认约定推送；核对GitHub CI和Render文件及自有临时房间，清理后报告真实状态。
**验证：** 缓存回归通过，在玩对局不强刷；推送SHA与origin一致；未核对上线不声称完成，未测真机／玩家试玩明确列出。

## 执行顺序与边界

T1→T2→T3／T4／T5→T6→T7→T8→T9→T10→T11／T12／T13→T14→T15→T16→T17→T18。

按依赖逐项实施，复验只针对剩余风险及CI门禁，不引入大量完整对局。每项确认通过后再勾选，不能把本任务文档的完成当作代码完成。
