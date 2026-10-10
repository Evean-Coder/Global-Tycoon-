# 后续经营机遇：换路线 Tasks

> 当前补验（2026-10-10）：Q1已实现，真实quickClock与封盘入口通过QS10/QS17–QS19、QB10/QB11；原T49–T51已完成。S12–S14的验收目标改由独立快速测试文件中的对应场景验证，未冒称旧同名测试已运行。当前真实证据见[快速验收](../quick-mode/acceptance.md)，下文2026-10-09段落保留历史范围。未推送或部署。

版本：v1.0  
更新：2026-10-09（Asia/Shanghai）  
输入：[已批准spec](spec.md)、[已批准plan](plan.md)  
状态：54项任务已获批准；[checklist v1.0](checklist.md)已生成，已批准，进入开发。

## 执行约定

- 每项聚焦一处行为，按2–5分钟工作单元拆解；时间是粒度参考，不是整项目工期承诺。验证/证据整理以实际耗时记录，不为赶时跳过检查。
- 以下命令中node指已核对的项目Node 20运行时；本机PATH不匹配时使用项目此前确认的Node 20可执行文件。所有命令在项目根目录执行。
- R01–R23、S01–S14、B01–B09为新增测试的名称前缀，测试名采用“编号＋空格＋场景描述”。按名称筛选必须实际执行至少一项且通过，全跳过不算通过；相同编号的断言扩展不统计为新的联机对局。
- 每项实现与对应验证放在同一工作单元，不提前另写大量镜像测试。复用现有gameplayFixtures/browserHarness，受控用例允许建立前置状态；T48/T50联机流程必须通过真实引擎关键触发，不能直接写个人窗口冒充完成。
- 正式部署源码仅依照批准文档改动；状态初始化无新标识保持兼容。不得变更十二项机遇数值、股票费用/分红、离线托管或普通胜负。
- 有限验证不启动balance脚本或大批完整局。本轮目标为23组引擎、14组Socket、9组浏览器指定场景，加现有必要回归；快速依赖未就绪时其真实场景保留未执行。
- 每个相关任务组验证通过后，只提交本轮涉及文件并记录提交ID；不批量加入已有未跟踪材料。此文档不是已开发或已部署记录。

## 外部依赖Q1

Q1为独立快速模式项目：其spec/plan/task/checklist获批，正式整局时钟、独立唤醒、30分钟一次封盘、净资产排名和总剩余时间视图已实现并有真实证据。换路线的批准不替代Q1审批。

T49–T51必须等待Q1；其余可继续开发和验证。Q1缺失时T29–T30只验证适配契约，禁止开放快速入口。普通适用检查通过后可以单独交付，但本项目全部验收仍保留快速未完成项。

## 文件清单

| 操作 | 文件 | 职责 |
|---|---|---|
| 新建 | `src/opportunityRoutes.js` | 六个接口、机会/替换、状态断言 |
| 修改 | `src/state.js`、`src/opportunities.js`、`src/gameLogic.js` | 新局历史、真实触发、原流程接入 |
| 修改 | `src/actionValidation.js`、`src/actionClock.js`、`server.js` | 校验、计时、原子提交、能力与截止 |
| 修改 | `src/gameView.js`、`src/record.js` | 公私视图和结果记录 |
| 修改 | `public/index.html`、`public/client.js`、`public/style.css`、`public/sw.js` | 选择界面、三端、缓存 |
| 核对生成文件 | `public/rules-catalog.js` | 运行`scripts/build-rules-catalog.js --check`；不直接手改生成值 |
| 新建 | `test/opportunity-routes.test.js`、`test/opportunity-routes-server.test.js`、`e2e/opportunity-routes.spec.js` | 指定引擎、Socket、浏览器验证 |
| 必要回归 | `test/opportunities.test.js`、`test/action-clock.test.js`、`test/action-validation.test.js`、`e2e/cache.spec.js` | 旧行为与缓存 |
| 修改/记录 | `rules.md`、`readme.md`、`docs/项目现状.md`、`docs/gameplay-roadmap.md`、`docs/opportunity-routes/progress.md`、`docs/opportunity-routes/acceptance.md` | 真实规则、进度、证据与交付范围 |

## 任务

### T1：登记基线与执行记录

**文件：** `docs/opportunity-routes/progress.md`。  
**依赖：** 无。  
**步骤：**
1. 记录HEAD、工作区已有改动、Node版本和批准文档；建立本任务表的未开始状态，标明Q1尚未就绪。
2. 只记录本轮文件的修改；保留已有未跟踪资料和其他开发成果。

**验证：** `git status --short`；`node --version`；`读取spec/plan审批记录`；预期：基线与批准状态可核对，没有开始改实现。

### T2：初始化启用版本的新局状态

**文件：** `src/state.js`、`test/opportunity-routes.test.js`。  
**依赖：** T1。  
**步骤：**
1. 在现有options入口接收服务端routeRevision/gameMode，按D1–D3建立routeFlow和个人进度。
2. 缺少新标识时保留旧分支；启用快速配置仍须通过服务器Q1门槛。

**验证：** `node --test --test-force-exit --test-name-pattern="^R01 " test/opportunity-routes.test.js`；预期：新普通局初始化完整；旧v1/v2局无新触发历史。

### T3：增加一次性领取历史

**文件：** `src/opportunities.js`、`test/opportunity-routes.test.js`。  
**依赖：** T2。  
**步骤：**
1. 只为启用版本玩家初始化oneTimeRewards.H12；准备按来源身份登记首次领取意图的历史工具。
2. 保持原usage、lapEpoch、机场历史和初始换组信用字段含义。

**验证：** `node --test --test-force-exit --test-name-pattern="^R02 " test/opportunity-routes.test.js`；预期：首次可产生6000意图，重复领取无意图，旧局历史不推断。

### T4：完成初始阶段基准登记

**文件：** `src/opportunityRoutes.js`、`test/opportunity-routes.test.js`。  
**依赖：** T3。  
**步骤：**
1. 实现markInitialResolved及返回契约，按已完整结算的阶段依次推进。
2. 第三次为存活玩家建立固定圈基准；重复无变化，越级拒绝。

**验证：** `node --test --test-force-exit --test-name-pattern="^R03 " test/opportunity-routes.test.js`；预期：1/2/3阶段顺序与重复校验通过，基准不漂移。

### T5：实现普通圈阈值与合并

**文件：** `src/opportunityRoutes.js`、`test/opportunity-routes.test.js`。  
**依赖：** T4。  
**步骤：**
1. 实现markLapProgress，按基准之后3/6/9次有效结算登记。
2. 已有待处理或活动机会时保留身份、推进末阈值，不再抽候选。

**验证：** `node --test --test-force-exit --test-name-pattern="^R04 " test/opportunity-routes.test.js`；预期：门槛前不登记；合并最多一份，跳过后不补发旧门槛。

### T6：登记快速初始时点

**文件：** `src/opportunityRoutes.js`、`test/opportunity-routes.test.js`。  
**依赖：** T4。  
**步骤：**
1. 在markQuickDue中实现0/5/10分钟initialDueOrdinal推进。
2. 使用服务端时间上下文；普通不处理，重复和延后回调不重复登记。

**验证：** `node --test --test-force-exit --test-name-pattern="^R05 " test/opportunity-routes.test.js`；预期：允许序号按实际时间推进，未完成阶段不伪装为已完成。

### T7：登记快速后续队列

**文件：** `src/opportunityRoutes.js`、`test/opportunity-routes.test.js`。  
**依赖：** T6。  
**步骤：**
1. 在markQuickDue中登记15/22分钟来源与quickDueMask。
2. 仅为存活玩家登记；按来源排队，重复回调无新增。

**验证：** `node --test --test-force-exit --test-name-pattern="^R06 " test/opportunity-routes.test.js`；预期：两来源各一次，队列顺序与数量受限。

### T8：实现28分钟关闭与取消

**文件：** `src/opportunityRoutes.js`、`test/opportunity-routes.test.js`。  
**依赖：** T5、T7。  
**步骤：**
1. 实现cancelRoutes的个人/全体清理及28分钟仅清队列分支。
2. 总截止/已结束不登记新时点；取消不执行草稿或奖励。

**验证：** `node --test --test-force-exit --test-name-pattern="^R07 " test/opportunity-routes.test.js`；预期：28分钟前后边界准确，已打开选择保留，结束全部清理且幂等。

### T9：抽取并打开个人窗口

**文件：** `src/opportunityRoutes.js`、`src/opportunities.js`、`test/opportunity-routes.test.js`。  
**依赖：** T5、T8。  
**步骤：**
1. 实现tryOpenRouteChoice的候选抽取：三项不同、至少两方向、排除持有项及已领取H12。
2. 成功打开一次移动队列，保存候选快照、固定版本、continuation和route_choose。

**验证：** `node --test --test-force-exit --test-name-pattern="^R08 " test/opportunity-routes.test.js`；预期：候选符合条件；再次同步不抽取、不提供后续换组。

### T10：限制安全入口与单回合打开

**文件：** `src/opportunityRoutes.js`、`test/opportunity-routes.test.js`。  
**依赖：** T9。  
**步骤：**
1. 补齐当前玩家、必要pending、初始完成、rollStartedTurnId和lastOpenedTurnId校验。
2. 入口不满足时返回未打开且不消费队列或随机源；28分钟后拒绝新窗口。

**验证：** `node --test --test-force-exit --test-name-pattern="^R09 " test/opportunity-routes.test.js`；预期：非安全阶段、已掷骰和同回合第二次均不打开。

### T11：实现新旧机遇替换

**文件：** `src/opportunityRoutes.js`、`test/opportunity-routes.test.js`。  
**依赖：** T10。  
**步骤：**
1. 实现resolveRouteChoice确认分支，校验当前机会/候选/持有快照及替换目标。
2. 同步更新新旧项和结果；有效未满额状态允许新增，错误状态不部分修改。

**验证：** `node --test --test-force-exit --test-name-pattern="^R10 " test/opportunity-routes.test.js`；预期：持有最多3项，失败副本无部分替换，新项不是候选则拒绝。

### T12：实现跳过和超时终态

**文件：** `src/opportunityRoutes.js`、`test/opportunity-routes.test.js`。  
**依赖：** T11。  
**步骤：**
1. 实现主动跳过与服务端超时，记录lastResult、清活动窗口并恢复waiting_roll。
2. 结果newId/replacedId为空，原路线、现金和历史不变。

**验证：** `node --test --test-force-exit --test-name-pattern="^R11 " test/opportunity-routes.test.js`；预期：跳过消耗本次机会；超时不默认选第一项；重复处理无新收益。

### T13：验证历史保留与路线断言

**文件：** `src/opportunityRoutes.js`、`src/opportunities.js`、`test/opportunity-routes.test.js`。  
**依赖：** T12。  
**步骤：**
1. 在替换/打开/提交入口核对D8断言；保留换出项usage、整局机场历史和H12事实。
2. 使用真实经济报价检查先用后换回、真正起点恢复及建房成本不回算。

**验证：** `node --test --test-force-exit --test-name-pattern="^R12 " test/opportunity-routes.test.js`；预期：额度不能刷，合法起点仍恢复；机场/H12不重复领奖，buildCosts不变。

### T14：校验确认动作载荷

**文件：** `src/actionValidation.js`、`test/opportunity-routes-server.test.js`。  
**依赖：** T13。  
**步骤：**
1. 增加route_confirm的版本、阶段、候选版本、新旧项及真实行动人校验。
2. 复用现有身份信封，不从玩家载荷接受游戏模式、圈数或历史。

**验证：** `node --test --test-force-exit --test-name-pattern="^S01 " test/opportunity-routes-server.test.js`；预期：非法类型、越权、旧机会及错误旧项不改正式状态。

### T15：限制跳过、超时与其他动作

**文件：** `src/actionValidation.js`、`test/opportunity-routes-server.test.js`。  
**依赖：** T14。  
**步骤：**
1. 增加route_skip和仅timeout来源的route_expire归一化，目标取活动玩家。
2. route_choose只允许这三类动作，拒绝掷骰、抵押、换组及外部伪造超时。

**验证：** `node --test --test-force-exit --test-name-pattern="^S02 " test/opportunity-routes-server.test.js`；预期：必要阶段不可绕过；伪造超时及无效动作不延长决定。

### T16：接入个人决定时钟

**文件：** `src/actionClock.js`、`test/opportunity-routes-server.test.js`。  
**依赖：** T15。  
**步骤：**
1. 决定键加入机会身份；普通30秒、快速20秒，同一窗口保留期限。
2. 回调绑定决定身份，暂停/恢复保留剩余时间，旧回调不得处理新窗口。

**验证：** `node --test --test-force-exit --test-name-pattern="^S03 " test/opportunity-routes-server.test.js`；预期：新决定获得对应时间，同一决定不重置，旧超时失效。

### T17：接入初始结算与首次奖励

**文件：** `src/gameLogic.js`、`test/opportunity-routes.test.js`。  
**依赖：** T4、T16。  
**步骤：**
1. 初始阶段合法完整结算后统一登记H12奖励与事实，再调用markInitialResolved。
2. 旧局保持原初始分支；初始超时仍按原第一候选规则处理。

**验证：** `node --test --test-force-exit --test-name-pattern="^R13 " test/opportunity-routes.test.js`；预期：三阶段基准只建一次；初始H12到账一次且6000，旧规则兼容。

### T18：接入真实起点结算

**文件：** `src/gameLogic.js`、`test/opportunity-routes.test.js`。  
**依赖：** T5、T17。  
**步骤：**
1. 在原真实起点刷新路径调用markLapProgress，保持股息与经营奖励原时序。
2. 登记不覆盖起点股票/落点pending，不用掷骰次数冒充圈数。

**验证：** `node --test --test-force-exit --test-name-pattern="^R14 " test/opportunity-routes.test.js`；预期：有效起点推进，股票和落点仍先完成，没有回算收入。

### T19：记录实际掷骰回合

**文件：** `src/gameLogic.js`、`test/opportunity-routes.test.js`。  
**依赖：** T10、T18。  
**步骤：**
1. 普通掷骰和监狱判定掷骰开始前在副本写rollStartedTurnId。
2. 不改骰袋与结果，下一turnId自然区分；骰后特殊返回不能打开机会。

**验证：** `node --test --test-force-exit --test-name-pattern="^R15 " test/opportunity-routes.test.js`；预期：两种掷骰均记录，旧骰子不妨碍新回合，骰后不能插入。

### T20：接入正常回合准备入口

**文件：** `src/gameLogic.js`、`test/opportunity-routes.test.js`。  
**依赖：** T19。  
**步骤：**
1. 在安全交接处理已到初始阶段，再执行原回合准备；正常到达掷骰前检查后续机会。
2. 监狱跳过不打开，初始continuation不重复完成上一回合或增加turnId。

**验证：** `node --test --test-force-exit --test-name-pattern="^R16 " test/opportunity-routes.test.js`；预期：普通阶段触发不变，回合/利息/费用不重复结算。

### T21：接入冻结和监狱恢复入口

**文件：** `src/gameLogic.js`、`test/opportunity-routes.test.js`。  
**依赖：** T20。  
**步骤：**
1. 冻结缴费、监狱缴费及自动释放完成后检查安全入口，只清已处理对应pending。
2. 缴费不足先沿原自救；监狱判定已掷骰或放弃回合不插入。

**验证：** `node --test --test-force-exit --test-name-pattern="^R17 " test/opportunity-routes.test.js`；预期：各分支先处理原决定，只有真实掷骰前能打开。

### T22：接入出售、自救返回入口

**文件：** `src/gameLogic.js`、`test/opportunity-routes.test.js`。  
**依赖：** T21。  
**步骤：**
1. 检查原出售、自救和非当前玩家出局恢复分支，continuation执行完才判断入口。
2. 不删除未完成股票/拍卖/债务上下文；已掷骰标记继续阻止误插入。

**验证：** `node --test --test-force-exit --test-name-pattern="^R18 " test/opportunity-routes.test.js`；预期：返回流程不死锁，不重复费用，不在原强制决定中显示候选。

### T23：执行确认与奖励意图

**文件：** `src/gameLogic.js`、`test/opportunity-routes.test.js`。  
**依赖：** T11、T22。  
**步骤：**
1. apply接入route_confirm，执行resolveRouteChoice结果和H12意图/领取事实。
2. 同一副本完成现金与新旧路线，按保存continuation恢复当前waiting_roll。

**验证：** `node --test --test-force-exit --test-name-pattern="^R19 " test/opportunity-routes.test.js`；预期：后续首次H12现金增加6000，失败不留下半份状态，回合不重新准备。

### T24：执行跳过和超时恢复

**文件：** `src/gameLogic.js`、`test/opportunity-routes.test.js`。  
**依赖：** T12、T23。  
**步骤：**
1. apply接入route_skip/expire，只允许合法来源及当前身份。
2. 恢复掷骰不再打开本回合第二份，保持原机遇和剩余快速队列。

**验证：** `node --test --test-force-exit --test-name-pattern="^R20 " test/opportunity-routes.test.js`；预期：跳过/超时后可正常掷骰，不强迫换路线或连弹两次。

### T25：接入出局和正常结束清理

**文件：** `src/gameLogic.js`、`test/opportunity-routes.test.js`。  
**依赖：** T8、T24。  
**步骤：**
1. 在合法出局/认输、最后存活者结束和房间结束候选中清理路线机会。
2. 保留已发生奖励与结果，未提交选择不补发现金。

**验证：** `node --test --test-force-exit --test-name-pattern="^R21 " test/opportunity-routes.test.js`；预期：出局/结束清理准确，迟到确认不能复活，原普通胜负不改。

### T26：核对页面能力与新局配置

**文件：** `server.js`、`public/client.js`、`test/opportunity-routes-server.test.js`。  
**依赖：** T25。  
**步骤：**
1. 客户端现有Socket auth声明clientRouteRevision；服务器记录当前连接能力。
2. 启用新局开局前核对全部参与者能力并显式传options；旧在途局不设新门槛，Q1缺失时快速开局拒绝。

**验证：** `node --test --test-force-exit --test-name-pattern="^S04 " test/opportunity-routes-server.test.js`；预期：缺少能力提示刷新；身份仍靠令牌；兼容普通新局可开始，快速未就绪不可开始。

### T27：接入服务器提交与回执

**文件：** `server.js`、`test/opportunity-routes-server.test.js`。  
**依赖：** T26。  
**步骤：**
1. 在复制执行与经济断言流程加入路线结果、奖励断言和routeResult回执；defaultAction为route_choose返回绑定当前机会的route_expire。
2. 提交后同步时钟再缓存/广播；重试原身份返回原结果，改变同一身份内容拒绝。

**验证：** `node --test --test-force-exit --test-name-pattern="^S05 " test/opportunity-routes-server.test.js`；预期：重复确认只替换/领奖一次，旧成功回执不能执行新动作。

### T28：增加个人截止的提交前检查

**文件：** `server.js`、`test/opportunity-routes-server.test.js`。  
**依赖：** T27。  
**步骤：**
1. 确认执行前和提交前核对原个人决定期限；跨期放弃候选并处理原机会超时。
2. 保留原正式状态，不传播失败候选的事件或奖励。

**验证：** `node --test --test-force-exit --test-name-pattern="^S06 " test/opportunity-routes-server.test.js`；预期：截止前成功、等于截止/执行跨期超时跳过；非法请求不刷新时间。

### T29：接入总时间适配与截止优先

**文件：** `server.js`、`test/opportunity-routes-server.test.js`。  
**依赖：** T28。  
**步骤：**
1. 按计划依赖契约接收服务端快速时间/封盘提供者；缺失时仍禁用快速。
2. 总截止先于新动作、个人超时和提交前检查；普通上下文不引入总时限。

**验证：** `node --test --test-force-exit --test-name-pattern="^S07 " test/opportunity-routes-server.test.js`；预期：受控提供者可验证截止适配，失败副本不提交；明确登记为适配测试而非真实快速验收。

### T30：提交服务端时点推进

**文件：** `server.js`、`test/opportunity-routes-server.test.js`。  
**依赖：** T29。  
**步骤：**
1. 时间推进复制状态调用markQuickDue，并按安全入口决定是否打开；仅有变化才提交revision。
2. 仍有效的决定不重置；待掷骰窗口竞争按服务器已提交先后处理，离线只登记/失效。

**验证：** `node --test --test-force-exit --test-name-pattern="^S08 " test/opportunity-routes-server.test.js`；预期：延后/重复回调不增机会，掷骰先提交后不撤销，系统登记不无故改actorRevision。

### T31：恢复连接与迟到超时处理

**文件：** `server.js`、`test/opportunity-routes-server.test.js`。  
**依赖：** T30。  
**步骤：**
1. 重连身份接管后先核对总截止，再恢复原窗口/剩余时间；旧能力页面提示更新并拒绝新动作。
2. 个人回调核对机会/决定身份；房间清理取消计时，不重新抽候选。

**验证：** `node --test --test-force-exit --test-name-pattern="^S09 " test/opportunity-routes-server.test.js`；预期：原候选与时限恢复，全员离线总截止仍可处理，旧回调与身份不能重做。

### T32：输出公开进度与本人窗口

**文件：** `src/gameView.js`、`test/opportunity-routes.test.js`。  
**依赖：** T24、T31。  
**步骤：**
1. 增加版本、模式和白名单routeProgress；本人增加self.route/self.routeChoice，初始self.choice保持。
2. 候选、草稿只向本人；使用历史来自原字段；旧局不输出假历史。

**验证：** `node --test --test-force-exit --test-name-pattern="^R22 " test/opportunity-routes.test.js`；预期：本人/其他玩家/无viewer投影正确，公共pending与事件无候选。

### T33：记录确定结果与版本

**文件：** `src/record.js`、`test/opportunity-routes.test.js`。  
**依赖：** T25、T32。  
**步骤：**
1. 记录启用版本/模式、确定结果和取消原因，沿用公开事件流水。
2. 不写候选或草稿，旧记录保持可读，不把未成交选择记录为取得。

**验证：** `node --test --test-force-exit --test-name-pattern="^R23 " test/opportunity-routes.test.js`；预期：结果能核对，隐私字段不存在，重复结束不生成第二份结果。

### T34：建立个人选择容器

**文件：** `public/index.html`、`public/client.js`、`e2e/opportunity-routes.spec.js`。  
**依赖：** T32。  
**步骤：**
1. 新增独立个人选择容器与渲染入口，按本人routeChoice显示；初始choiceModal保持原用途。
2. 其他玩家只显示简短处理提示；退出阶段隐藏新容器。

**验证：** `node --test --test-force-exit --test-name-pattern="^B01 " e2e/opportunity-routes.spec.js`；预期：仅本人看到可操作候选，初始同步界面未被替代。

### T35：渲染候选与完整历史说明

**文件：** `public/client.js`、`e2e/opportunity-routes.spec.js`。  
**依赖：** T34。  
**步骤：**
1. 渲染三项候选完整效果、当前持有、usage与机场/H12领取说明。
2. 后续无换组按钮；H12按个人确认到账解释，不修改数值目录。

**验证：** `node --test --test-force-exit --test-name-pattern="^B01 " e2e/opportunity-routes.spec.js`；预期：效果/历史可读，新选择只改草稿，服务端现金/期限不变。

### T36：完成替换比较与跳过入口

**文件：** `public/client.js`、`e2e/opportunity-routes.spec.js`。  
**依赖：** T35。  
**步骤：**
1. 选新项后选旧项并显示失去/获得的差异；满额无旧项时不能提交。
2. 明确确认/跳过后果，返回上一步只改本地页面，新增仅对应服务端合法未满额状态。

**验证：** `node --test --test-force-exit --test-name-pattern="^B02 " e2e/opportunity-routes.spec.js`；预期：本人可比较、修改和确认；跳过不会删除持有项。

### T37：绑定草稿身份与状态恢复

**文件：** `public/client.js`、`e2e/opportunity-routes.spec.js`。  
**依赖：** T36。  
**步骤：**
1. 以游戏/本人/机会/候选版本保存草稿，同一有效窗口状态更新保留。
2. 窗口变化、终态、出局或结束清理；不以旧骰子动画重开选择。

**验证：** `node --test --test-force-exit --test-name-pattern="^B03 " e2e/opportunity-routes.spec.js`；预期：重新渲染和重连保留有效草稿，新窗口不沿用旧选项。

### T38：绑定原请求与迟到回执

**文件：** `public/client.js`、`e2e/opportunity-routes.spec.js`。  
**依赖：** T27、T37。  
**步骤：**
1. 沿用sendAction身份/等待反馈，路线请求增加原窗口匹配与查询原载荷。
2. 回执只释放匹配请求，资产/持有只从快照更新；断线与未确认有不同提示。

**验证：** `node --test --test-force-exit --test-name-pattern="^B04 " e2e/opportunity-routes.spec.js`；预期：重复点击不产生第二动作，旧回执不关闭新选择或覆盖新草稿。

### T39：完善资料返回和焦点

**文件：** `public/client.js`、`public/index.html`、`e2e/opportunity-routes.spec.js`。  
**依赖：** T38。  
**步骤：**
1. 规则/详情返回恢复同一有效选择，期间超时则显示当前状态。
2. 新容器接入现有键盘焦点约束，关闭资料不发送跳过，不操作股票返回上下文。

**验证：** `node --test --test-force-exit --test-name-pattern="^B05 " e2e/opportunity-routes.spec.js`；预期：资料返回不改服务端/期限；过期弹窗不复活；键盘能完成选择。

### T40：调整PC比较布局

**文件：** `public/style.css`、`e2e/opportunity-routes.spec.js`。  
**依赖：** T39。  
**步骤：**
1. 为候选、旧项与比较区安排桌面层级，倒计时固定在选择视图可见处。
2. 内容溢出只在容器滚动，避免遮挡确认/跳过入口。

**验证：** `node --test --test-force-exit --test-name-pattern="^B06 " e2e/opportunity-routes.spec.js`；预期：1440×900下完整效果可查看，按钮和倒计时可达。

### T41：调整平板横竖布局

**文件：** `public/style.css`、`e2e/opportunity-routes.spec.js`。  
**依赖：** T40。  
**步骤：**
1. 平板断点重排卡片与比较区，保留原状态和操作顺序。
2. 限制弹窗高度，内容滚动而不是整页横向溢出。

**验证：** `node --test --test-force-exit --test-name-pattern="^B06 " e2e/opportunity-routes.spec.js`；预期：768×1024与1024×768均可完成确认/跳过，无整页横向溢出。

### T42：调整手机短横屏布局

**文件：** `public/style.css`、`e2e/opportunity-routes.spec.js`。  
**依赖：** T41。  
**步骤：**
1. 适配568×320和812×375，候选/说明可滚动，核心按钮至少44×44 CSS像素。
2. 保留横屏提示与原棋盘文字；选择视图不藏倒计时。

**验证：** `node --test --test-force-exit --test-name-pattern="^B06 " e2e/opportunity-routes.spec.js`；预期：短横屏能读完整说明、点旧项和确认；没有整页横向溢出。

### T43：验证缩放与键盘可达性

**文件：** `public/style.css`、`public/client.js`、`e2e/opportunity-routes.spec.js`。  
**依赖：** T42。  
**步骤：**
1. 必要时修正焦点顺序、200%缩放滚动与减少动画支持。
2. 动画不作为成功标志，输入反馈和倒计时始终可获取。

**验证：** `node --test --test-force-exit --test-name-pattern="^B07 " e2e/opportunity-routes.spec.js`；预期：键盘和200%缩放可确认/跳过，减少动画时状态处理顺序不变。

### T44：显示普通进度与快速说明

**文件：** `public/client.js`、`e2e/opportunity-routes.spec.js`。  
**依赖：** T32、T43。  
**步骤：**
1. 读取服务端进度显示普通下次剩余圈数、快速预定时点/排队/失效原因。
2. 总剩余时间与个人决定时间分开；未接入Q1不伪造正式快速计时入口。

**验证：** `node --test --test-force-exit --test-name-pattern="^B08 " e2e/opportunity-routes.spec.js`；预期：显示与真实阈值一致，28分钟失效说明清楚，旧局不显示新进度。

### T45：同步版本规则与帮助

**文件：** `public/client.js`、`public/rules-catalog.js`、`rules.md`、`e2e/opportunity-routes.spec.js`。  
**依赖：** T44。  
**步骤：**
1. 规则按routeRevision说明两模式触发、替换、跳过及历史；H12区分初始与后续到账。
2. 保留原生成规则目录，不手改十二项数值；运行现有生成器check，若仅动态说明变化无需改生成文件。

**验证：** `node --test --test-force-exit --test-name-pattern="^B08 " e2e/opportunity-routes.spec.js`；`node scripts/build-rules-catalog.js --check`；预期：本局规则解释一致，生成目录与源一致，旧局帮助无新规则。

### T46：更新资源版本与严格缓存

**文件：** `public/index.html`、`public/sw.js`、`e2e/cache.spec.js`。  
**依赖：** T45。  
**步骤：**
1. 同步CSS/JS/规则目录URL、CACHE名和CORE列表；版本在本次发布前统一登记。
2. 新核心版本失败不能ignoreSearch取旧同名脚本，Socket请求不缓存。

**验证：** `node --test --test-force-exit e2e/cache.spec.js`（本轮增加缓存版本/失败场景，复用原有限测试）；预期：旧缓存可更新，新核心失败不会混载旧脚本，离线不假装成功。

### T47：验证页面版本兼容流程

**文件：** `test/opportunity-routes-server.test.js`、`e2e/opportunity-routes.spec.js`。  
**依赖：** T26、T31、T46。  
**步骤：**
1. 验证缺少能力的新局参与者被提示刷新，以及旧在途对局不被新门槛阻挡。
2. 验证旧页面重连新局保留身份/数据但需刷新才能新操作；声明能力不绕过身份校验。

**验证：** `node --test --test-force-exit --test-name-pattern="^S10 " test/opportunity-routes-server.test.js`；`node --test --test-force-exit --test-name-pattern="^B09 " e2e/opportunity-routes.spec.js`；预期：兼容反馈明确，没有候选重抽、额外时间或身份丢失。

### T48：完成普通两人有限联机流程

**文件：** `test/opportunity-routes-server.test.js`。  
**依赖：** T33、T47。  
**步骤：**
1. 通过真实开局/初始选择/有效起点与原必要动作进入后续机会，再确认或跳过并继续另一玩家。
2. 用受控随机序列/时间加速；不得直接写activeChoice或route_choose冒充触发，不跑整局直到最终赢家；继续行动后断线重连核对已确认路线与当前流程。

**验证：** `node --test --test-force-exit --test-name-pattern="^S11 " test/opportunity-routes-server.test.js`；预期：取得后续机会与下一玩家操作均真实完成，公开状态不泄露候选。

### T49：接入真实快速核心

**文件：** `server.js`、`src/gameLogic.js`、`test/opportunity-routes-server.test.js`。  
**依赖：** T30、T48、Q1。  
**步骤：**
1. 将实际快速核心的时间/独立唤醒/一次封盘入口接入已完成适配。
2. 快速初始阶段按0/5/10分钟替代普通触发，但资讯与完整轮次仍正常推进；Q1缺失时任务记依赖未完成。

**验证：** `node --test --test-force-exit --test-name-pattern="^S12 " test/opportunity-routes-server.test.js`；预期：使用真实核心按序进入初始选择，普通触发不变；不能以假提供者记通过。

### T50：完成快速两人有限联机流程

**文件：** `test/opportunity-routes-server.test.js`。  
**依赖：** T49。  
**步骤：**
1. 真实快速开局包含初始选择，控时推进至15/22分钟并在安全入口处理。
2. 核对个人队列、每回合一次与总时钟独立；不直接篡改窗口，不真实等待30分钟。

**验证：** `node --test --test-force-exit --test-name-pattern="^S13 " test/opportunity-routes-server.test.js`；预期：快速成长/换路线可完成，仍在股票或自救时不打断。

### T51：验证快速边界竞争

**文件：** `test/opportunity-routes-server.test.js`。  
**依赖：** T50。  
**步骤：**
1. 真实快速核心覆盖28分钟队列清理、活动窗口保留，以及30分钟前/等于/执行跨截止确认。
2. 覆盖全员离线与个人超时同时到期：封盘一次，不追加H12，不恢复游戏；封盘后重连核对结束状态与结算。

**验证：** `node --test --test-force-exit --test-name-pattern="^S14 " test/opportunity-routes-server.test.js`；预期：封盘与个人处理唯一，已有合法提交保留，迟到候选全部无效。

### T52：执行一次必要回归与静态检查

**文件：** `test/opportunity-routes.test.js`、`test/opportunity-routes-server.test.js`、`e2e/opportunity-routes.spec.js`、`test/opportunities.test.js`、`test/action-clock.test.js`、`test/action-validation.test.js`、`e2e/cache.spec.js`。  
**依赖：** T48。  
**步骤：**
1. 运行本轮R/S/B和缓存指定场景及原初始/时钟/校验必要回归，再对改动JS运行语法与lint检查。
2. Q1缺失时快速适用项保留未完成；不得用大量完整模拟或修正截断阈值凑通过。

**验证：** 执行下方V-FINAL的指定回归、语法与lint命令；浏览器仅运行本轮与缓存指定场景。；预期：全部已执行适用项通过，错误先修；快速真实集成缺口明确登记。

### T53：整理规则与真实验收证据

**文件：** `rules.md`、`readme.md`、`docs/项目现状.md`、`docs/gameplay-roadmap.md`、`docs/opportunity-routes/progress.md`、`docs/opportunity-routes/acceptance.md`。  
**依赖：** T52。  
**步骤：**
1. 按批准checklist记录逐项实际结果、命令、版本和三端证据，维护规则/开发入口。
2. 区分普通可交付与全部验收；T49–T51未通过不得宣称快速完成，保留历史报告与原统计口径。

**验证：** 逐条对照批准checklist的结果/证据；运行现有规则目录`--check`并核对项目索引链接。；预期：证据能逐条追溯，测试重复运行不计新场景，未完成依赖明确。

### T54：核对交付状态与提交范围

**文件：** `docs/opportunity-routes/progress.md`、`docs/opportunity-routes/acceptance.md`，以及本轮文件清单中的实际改动文件。  
**依赖：** T53。  
**步骤：**
1. 对照task/checklist核对实际完成与未完成项；所有适用验证通过的组按本轮路径提交。
2. 核对git diff，不纳入旧未跟踪资料；记录提交ID和实际部署状态，没有上线验证不写已上线。

**验证：** `git diff --check`；`git status --short`；`阅读验收结论`；预期：本轮变更可审阅，未完成快速依赖不会被总完成状态覆盖。

## 执行顺序与组提交

| 组 | 任务 | 完成依据 |
|---|---|---|
| G0 基线 | T1 | 记录批准文档及现有工作区 |
| G1 状态/调度 | T2–T13 | R01–R12通过后提交该组 |
| G2 引擎/时钟 | T14–T25 | S01–S03、R13–R21通过后提交该组 |
| G3 服务端/投影 | T26–T33 | S04–S09、R22–R23通过后提交该组 |
| G4 三端/兼容 | T34–T48 | B01–B09、缓存、S10–S11通过后提交该组 |
| G5 快速集成 | T49–T51＋Q1 | S12–S14真实快速证据通过后提交该组；无Q1保留未完成 |
| G6 验收/登记 | T52–T54 | checklist记录与实际已执行范围一致 |

按T1至T54顺序执行即可满足内部依赖；T49–T51等待Q1时继续T52–T54的普通适用部分，文档登记部分完成，不能将整个项目关闭为全部验收通过。

## V-FINAL：一次必要回归

先运行新增指定测试（已具备Q1时包含真实快速场景），浏览器另执行，避免把同一场景反复执行当成新增数量：

```powershell
node --test --test-force-exit test/opportunity-routes.test.js test/opportunity-routes-server.test.js test/opportunities.test.js test/action-clock.test.js test/action-validation.test.js
node --test --test-force-exit e2e/opportunity-routes.spec.js e2e/cache.spec.js
node scripts/build-rules-catalog.js --check
node --check src/opportunityRoutes.js
node --check server.js
node --check public/client.js
node node_modules/eslint/bin/eslint.js src/opportunityRoutes.js src/state.js src/opportunities.js src/gameLogic.js src/actionValidation.js src/actionClock.js server.js src/gameView.js src/record.js public/client.js test/opportunity-routes.test.js test/opportunity-routes-server.test.js e2e/opportunity-routes.spec.js
git diff --check
```

对其余实际改动JS补充一次语法检查。原有lint基线问题与本轮新增问题分别记录；新增错误先修，不能静默关闭检查规则。Q1缺失时真实快速场景明确显示依赖未就绪且不算通过，普通检查仍执行。上述命令在开发后运行，本次任务文档阶段尚未执行。

## 计划覆盖

| 设计职责 | 任务归属 |
|---|---|
| A1版本与历史；D1–D3 | T2–T8、T13、T17–T18、T26 |
| A2个人调度；D4；I1–I3 | T4–T12、T19–T24、T30、T49–T50 |
| A3原子/计时；D5–D6；I4–I6 | T14–T16、T23–T31、T51 |
| A4公私视图/记录；D7–D8 | T13、T25、T32–T33、T48 |
| A5三端/规则；I7 | T34–T47、T53 |
| A6限定验证/依赖；I8 | 各项指定R/S/B验证、T48–T54、Q1门槛 |
| K1–K7技术与流程 | T2–T44及对应断言/回归 |
| K8缓存/能力 | T26、T31、T46–T47 |
| K9有限验证；K10交付 | T1、T48–T54、外部依赖说明 |

## 文档核对与审批状态

任务编号、文件、依赖、步骤及验证方式均已填写；内部依赖只指向前置任务，Q1明确属于独立项目。方法名与plan六个模块接口一致；生成目录保持现有生成链，不额外改经济目录。正式任务审批前只完成文档核对，没有写实现或运行游戏测试。

- spec v1.0、plan v1.0已获批准；plan整份审批请求后用户回复“继续”，记录为批准。
- 本task v1.0于2026-10-09整份审批请求后收到用户“继续”，记录为批准；checklist.md已批准，按任务开发。验收设计按AC23补齐T48/T51重连证据步骤，规则与实现范围不变。
- 四份文档全部批准后才按任务开发；快速核心、经营任务、股票经营预期仍独立推进。


