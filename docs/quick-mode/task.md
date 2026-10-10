# 半小时快速模式 Tasks

版本：v1.0。日期：2026-10-10。状态：用户在task审批请求后回复“继续”批准；依据已批准的 [spec](spec.md) 和 [plan](plan.md)，未开始编码。

共48项任务，分七组，按依赖推进。每项实现后执行其验证；验证结果保存在本项目目录，失败修复前不勾选完成。本文的测试名称和新文件是开发约定，不是当前已存在或已通过的证据。

## 1. 文件清单

| 操作 | 文件 | 内容 |
|---|---|---|
| 新建 | `src/quickClock.js` | 单调总时间、节点、关闭和注入时间依赖 |
| 新建 | `src/quickMode.js` | 版本、取消、破产收尾、派息和冻结排名 |
| 修改 | `src/state.js`、`src/assets.js` | 快速元数据与净资产，原资产总览保持 |
| 修改 | `src/actionClock.js`、`src/gameLogic.js` | 快速个人期限、安全成长和自然结束意图 |
| 修改 | `server.js` | 房间模式、总时钟、截止提交门槛和统一结束 |
| 修改 | `src/gameView.js`、`src/record.js` | 公开视图和结果记录 |
| 按实际缺口修改 | `src/opportunityRoutes.js` | 与Q1真实接入的必要契约修正 |
| 修改 | `public/index.html`、`public/style.css`、`public/client.js`、`public/sw.js` | 模式、双计时、净资产、终局与缓存 |
| 新建 | `test/quick-clock.test.js`、`test/quick-mode.test.js`、`test/quick-server.test.js` | QC/QM/QS有限检查 |
| 新建 | `e2e/quick-mode.spec.js` | QB真实页面与三端检查 |
| 按需修改 | `e2e/helpers/browserHarness.js` | 选择模式及开局前注入可控时钟的内部测试入口 |
| 修改 | `test/action-clock.test.js`、`test/record.test.js`、`test/opportunity-routes-server.test.js`、`e2e/opportunity-routes.spec.js`、`e2e/cache.spec.js` | 不删除普通兼容断言，补真实快速集成 |
| 修改 | `rules.md`、`readme.md`、`docs/项目现状.md`、`docs/opportunity-routes/progress.md`、`docs/priority-delivery/progress.md`、`docs/quick-mode/progress.md` | 当前交付及未验证范围 |
| 新建 | `docs/quick-mode/progress.md`、`docs/quick-mode/baseline.md`、`docs/quick-mode/acceptance.md`、`docs/quick-mode/verification-log.md`及`docs/quick-mode/browser-evidence/` | 本批实际进度与可复核证据 |

原工作区市场调研、索引变更和未跟踪历史资料保留。只提交本任务明确修改的文件，不整批加入原`artifacts/`、ZIP、身份凭据或其他阶段日志。

## 2. 验证命令约定

使用Node20及现有依赖，无新增测试框架。开发时先核对实际Node20路径：本机此前路径为`C:/Users/Yifan/AppData/Local/npm-cache/_npx/ebaba8b9e55fd0a9/node_modules/node/bin/node.exe`。用任务变量`$quickNode`保存经核对的可执行路径；路径失效时查找现有Node20，不静默用不兼容运行时。

下面给出精确的同进程运行形式，以避开本机`node --test`子进程权限限制。所有命令在项目根目录运行。

| 代号 | 命令 | 范围 |
|---|---|---|
| Q-C | `& $quickNode -e "require('./test/quick-clock.test.js')"` | 时钟和快速决定时间QC |
| Q-M | `& $quickNode -e "require('./test/quick-mode.test.js')"` | 净资产、结算及视图记录QM |
| Q-S | `& $quickNode -e "require('./test/quick-server.test.js')"` | 正式Socket与可控时间QS |
| Q-B | `& $quickNode -e "require('./e2e/quick-mode.spec.js')"` | 页面与三端QB |
| R-C | `& $quickNode -e "require('./test/action-clock.test.js');require('./test/action-validation.test.js')"` | 原决定身份与校验 |
| R-M | `& $quickNode -e "require('./test/stocks-v2.test.js');require('./test/opportunities.test.js');require('./test/opportunity-routes.test.js')"` | 原经营、初始和普通后续 |
| R-S1 | `& $quickNode -e "require('./test/gameplay-server.test.js')"` | 原真实服务端 |
| R-S2 | `& $quickNode -e "require('./test/opportunity-routes-server.test.js')"` | 原路线服务端及补充集成 |
| R-B1 | `& $quickNode -e "require('./e2e/usability-stocks.spec.js')"` | 股票草稿、确认与转让返回 |
| R-B2 | `& $quickNode -e "require('./e2e/opportunity-routes.spec.js')"` | 原路线界面 |
| R-B3 | `& $quickNode -e "require('./e2e/cache.spec.js')"` | 原缓存升级 |
| R-R | `& $quickNode scripts/build-rules-catalog.js --check` | 公开目录一致 |
| R-L | `& $quickNode node_modules/eslint/bin/eslint.js server.js src scripts public/client.js test e2e` | 现有完整lint |

语法核对使用`& $quickNode --check 文件路径`。浏览器与需要启动子进程的旧记录测试如受沙箱限制，按工具规则申请自动审查执行，保留失败原因和实际命令；不以跳过代替通过。

Q-C/Q-M在各相关任务增补对应有意义场景后执行；Q-S及已有服务端文件分别运行，避免共享监听/清理干扰。浏览器组在UI就绪后执行，期间做页面元素的有限观察。最终回归只覆盖本轮真实风险和规定门槛，不重复启动大规模游戏测试矩阵。

## G1 基线与时钟：T1–T5

### T1 开发基线与进度

**文件：** `docs/quick-mode/progress.md`、`docs/quick-mode/baseline.md`。**依赖：** 四份文档全部批准。

**步骤：** 保存本次开始时的源码提交、Git变更路径、运行时和关键配置；登记48项未执行任务与批准文档，保留原修改和历史资料。

**验证：** 核对记录中的提交、版本及路径与实际一致；只做基线检查，不将现有工作区改动当成此次实现。

### T2 总时钟构造与局身份

**文件：** `src/quickClock.js`、`test/quick-clock.test.js`。**依赖：** T1。

**步骤：** 实现可注入时间/定时器依赖的构造和`start`；关联gameId及墙钟开局时间，正式初始化时间计入本局时长。

**验证：** Q-C，新增QC01：未正式开局不计时，开始后从单调起点推进，不接受非法时长/身份；语法检查新模块。

### T3 只读总时间及墙钟隔离

**文件：** `src/quickClock.js`、`test/quick-clock.test.js`。**依赖：** T2。

**步骤：** 实现`read`；总余时非负，达到30分钟即到期；系统墙钟跳变不改变总期限，读取不重置起点。

**验证：** Q-C，QC02：29:59、30:00、30:01及墙钟前后调整得到正确余时，多次读取不延时。

### T4 节点调度与回调延迟

**文件：** `src/quickClock.js`、`test/quick-clock.test.js`。**依赖：** T3。

**步骤：** 实现下一节点调度及`onAdvance`通知；从当前时间推进到正确下一节点，跨过多个节点仍允许调用方补齐标记，到期不安排后续游戏节点。

**验证：** Q-C，QC03：5/10/15/22/25/28/30分钟及跨节点跳跃有正确通知，没有零延迟循环或重复注册堆积。

### T5 停止、重开及旧回调

**文件：** `src/quickClock.js`、`test/quick-clock.test.js`。**依赖：** T4。

**步骤：** 实现幂等`stop`和固定结束时长；停止取消计时回调，旧gameId回调不能通知下一局。

**验证：** Q-C，QC04：重复stop、停后读时、旧回调和新局起点均正确；停止不把到期余时变为正值。

## G2 经济与封盘：T6–T15

### T6 净资产与抵押负债

**文件：** `src/assets.js`、`test/quick-mode.test.js`。**依赖：** T1。

**步骤：** 添加`netAssetSummary`，复用原总览，分别累加抵押本金和城市利息；保持原函数语义，使用整数安全检查。

**验证：** Q-M，QM01：spec样例146000、抵押借款同增现金和债务、负净资产和本金/利息不重复扣除；原资产总览保持。

### T7 待分红与估值边界

**文件：** `src/assets.js`、`test/quick-mode.test.js`。**依赖：** T6。

**步骤：** 核对含息持股与城主保留收益的防重复；完成后使用派息后的报价；标准建房估值与实际优惠支出分别保留。

**验证：** Q-M，QM02：派息前后、未发行份额、H4实际奖励与优惠建房案例复算；成交本金不列作利润。

### T8 快速状态及版本边界

**文件：** `src/state.js`、`src/quickMode.js`、`test/quick-mode.test.js`。**依赖：** T6。

**步骤：** 实现`enabled`与新快速元数据，要求规则v2及正确版本/模式；普通和旧局不补写快速状态。

**验证：** Q-M，QM03：新快速开启，普通/v1/旧v2不被迁移，错误版本拒绝而不半初始化。

### T9 未成交经营事项取消

**文件：** `src/quickMode.js`、`test/quick-mode.test.js`。**依赖：** T8。

**步骤：** 收集公开取消事项，处理转让、普通/自救出售、无主拍卖和未确认购置；不调用拍卖完成或默认动作，保留已成立产权和负现金。

**验证：** Q-M，QM04：有最高报价仍不成交、不扣买方钱、不补回购；自救不强制破产，原费用不免除。

### T10 取消机遇并保留隐私

**文件：** `src/quickMode.js`、`test/quick-mode.test.js`。**依赖：** T9。

**步骤：** 调用原路线取消入口，清除未完成公共阶段；不把尚未整体生效的提交变成新机遇，不保存私有候选到取消记录。

**验证：** Q-M，QM05：部分提交的初始阶段、未确认路线、H12候选均不发奖，原路线保持，公开取消内容不含私有选择。

### T11 已破产残留城市清算

**文件：** `src/quickMode.js`、`test/quick-mode.test.js`。**依赖：** T9、T10。

**步骤：** 遍历城市真实owner及玩家alive，而非破产者已清空的cities；仅残留破产产权走现有银行清算，队列停止。

**验证：** Q-M，QM06：当前/排队破产城市派息后以经营报价50%清偿存活股东；已成交城不收走，普通卖方不误清算，不重复救济。

### T12 正常派息和一次性结果

**文件：** `src/quickMode.js`、`test/quick-mode.test.js`。**依赖：** T11。

**步骤：** 清算后调用现有终局派息，保留原H4合法奖励；不推进资讯、起点、回合开支或新的经济动作。

**验证：** Q-M，QM07：全部正常城市股息、城主保留收益、额度和除息一致；重复结束不重复派息。

### T13 排名、同分及自然赢家

**文件：** `src/quickMode.js`、`test/quick-mode.test.js`。**依赖：** T6、T7、T12。

**步骤：** 生成冻结ranking、winnerIds和summary；同分名次1/1/3；出局者沿用原反向出局顺序，唯一winner兼容，并列不伪造唯一赢家。

**验证：** Q-M，QM08：正/负值排序、同分、唯一存活者、出局列表与四类结束原因正确。

### T14 封盘完整性与失败幂等

**文件：** `src/quickMode.js`、`test/quick-mode.test.js`。**依赖：** T13。

**步骤：** 完成`finalize`的状态约束和冻结标识，候选外部状态不改变；失败不生成半结算结果，已闭局重复调用不追加经济事件。

**验证：** Q-M，QM09：非法金额/清算异常的候选不提交，合法终局重复调用现金和事件不变；新模块语法检查。

### T15 快速自然结束意图

**文件：** `src/gameLogic.js`、`test/quick-mode.test.js`。**依赖：** T8、T14。

**步骤：** 快速仅剩一人时标记结束意图，避免提前普通派息；已确认破产不再新开多轮拍卖，保留残留资产供统一收尾。普通分支不变。

**验证：** Q-M，QM10：破产/认输快速自然胜负产生正确意图且无重复派息，普通仍走原结束；R-M检查经营回归。

## G3 房间、时钟与动作：T16–T27

### T16 房间模式配置

**文件：** `server.js`、`test/quick-server.test.js`。**依赖：** T1。

**步骤：** 默认普通，新增setRoomMode权限/枚举校验及roomState模式广播；开局后不可改，结束后可选下一局。

**验证：** Q-S，QS01：两至四人看到一致模式，非房主/非法模式/运行中修改拒绝，配置不生成游戏决定ID。

### T17 开局一致性与页面能力

**文件：** `server.js`、`test/quick-server.test.js`。**依赖：** T8、T16。

**步骤：** 新页面快速能力门槛与原路线能力并存；startGame使用服务端已确认模式，载荷冲突拒绝；失败不清空旧局或启动新时钟。

**验证：** Q-S，QS02：旧快速页面提示刷新、普通能力仍有效；错误模式、人数、权限及重复开始没有第二局。

### T18 开局安装真实总时钟

**文件：** `server.js`、`src/quickClock.js`、`test/quick-server.test.js`。**依赖：** T5、T17。

**步骤：** 安装clock与原read/close provider；初始化时间计入正式开局，原首阶段仍先发生；测试通过模块依赖注入同一时间源，不增加用户可操作的调时事件。

**验证：** Q-S，QS03：真实快速开局与首选择同步计时，原普通无总时钟；clock/provider读值一致。

### T19 服务端原子结束入口

**文件：** `server.js`、`test/quick-server.test.js`。**依赖：** T14、T18。

**步骤：** 实现closeQuickGame：复制、finalize、校验、一次提交和事件；已闭局不重算，失败保留原状态且新动作到期拒绝。

**验证：** Q-S，QS04：真实房间最终状态与Q-M预期一致；结算异常无部分资产改变，重试成功后只结算一次。

### T20 节点和截止优先

**文件：** `server.js`、`test/quick-server.test.js`。**依赖：** T19。

**步骤：** 将节点通知接入时间推进；5/2分钟预告去重；到30分钟先结束，再拒绝成长/default动作；保留provider兼容。

**验证：** Q-S，QS05：跳过多个节点、延迟回调和重复通知都正确；到点无新的起点、租金或回合收费。

### T21 动作执行前及提交前门槛

**文件：** `server.js`、`test/quick-server.test.js`。**依赖：** T20。

**步骤：** 每次新动作开始及状态副本提交前读取总时钟；执行跨截止丢弃副本，从原状态封盘；自然结束意图也受总截止提交门槛。

**验证：** Q-S，QS06：截止前提交成功、到点新请求失败、执行跨截止未提交；现金、骰袋、候选及落点不会来自丢弃副本。

### T22 成功回执终局后可查询

**文件：** `server.js`、`test/quick-server.test.js`。**依赖：** T21。

**步骤：** 原成功回执先查，保留身份和内容指纹；新失败或迟到请求不缓存成成功，旧结果不恢复窗口。

**验证：** Q-S，QS07：已成交请求封盘后重复返回原成功，同ID改内容拒绝；新请求不再成交，重复查询不增加收入。

### T23 快速个人决定时限

**文件：** `src/actionClock.js`、`test/quick-clock.test.js`。**依赖：** T8。

**步骤：** 新快速版本一般20秒、自救45秒、初始30秒、后续20秒；sync增加可选总预算，同一决定只收紧，不改变旧调用。

**验证：** Q-C，QC05：所有决定类别及总预算边界；同一键/ID不延长，暂停/恢复也受预算，R-C普通90/60秒保留。

### T24 服务端预算与超时回调

**文件：** `server.js`、`test/quick-server.test.js`。**依赖：** T21、T23。

**步骤：** sync/恢复/广播传递实际总预算；个人超时回调先查整局截止；暂停个人时不取消总clock。

**验证：** Q-S，QS08：个人到期和总截止同刻只封盘；资料、无效动作、重试不重计；普通原时钟流程保持。

### T25 快速股票和转让期限

**文件：** `server.js`、`test/quick-server.test.js`；界面时间读取在T37接入。**依赖：** T24。

**步骤：** 核对股票子面板共用原窗口期限，合法新接收确认采用新决定；返回购买仅按真实阶段恢复，不因切换界面改服务器时间。

**验证：** Q-S，QS09：股票窗口、报价变化、转让返回及迟到确认不延时；原额度不重置，截止不成交未确认转让。

### T26 初始机遇安全入口

**文件：** `src/gameLogic.js`、`server.js`、`test/quick-server.test.js`。**依赖：** T15、T20、T24。

**步骤：** 补安全成长检查和明确continuation；0/5/10分钟按序进入，不重放整段prepareTurn，不重复监狱释放/收费。

**验证：** Q-S，QS10：等待掷骰可合法进入；自救、交易、冻结/监狱必要决定不被截断；延迟阶段按序结算。

### T27 后续时点与28/30分钟

**文件：** `server.js`、必要的`src/opportunityRoutes.js`、`test/quick-server.test.js`。**依赖：** T26。

**步骤：** 复用15/22机会调度和本人安全入口；28分钟仅关闭未打开机会，30分钟全面取消；不改普通三圈规则。

**验证：** Q-S，QS11：真实provider下机会仅生成一次、每本人回合最多领取一次；28/30边界、跳过、历史和隐私正确。

## G4 视图、记录与生命周期：T28–T34

### T28 净资产及冻结结果视图

**文件：** `src/gameView.js`、`test/quick-mode.test.js`。**依赖：** T13。

**步骤：** 快速追加公开净资产和quickResult，时间仍由server提供；普通旧局字段保持，私有候选和凭据不投影。

**验证：** Q-M，QM11：不同身份看到同一资产/结果但只见本人候选，公开输出无骰袋、候选列表或身份令牌。

### T29 快速记录冻结

**文件：** `src/record.js`、`test/quick-mode.test.js`。**依赖：** T28。

**步骤：** 记录quick版本、结束时长、原因、明细、同分和取消清算；使用冻结endedAt，原记录字段保持。

**验证：** Q-M，QM12：记录与结果金额/名次完全一致，重复构建结束时间不变，旧v1/v2不补假净资产。

### T30 自然结束、记录和广播

**文件：** `server.js`、`test/quick-server.test.js`。**依赖：** T15、T19、T29。

**步骤：** 合法动作产生结束意图后统一收尾，再生成记录广播；emitGame/finalizeGame不覆盖quick原因，不重复派息。

**验证：** Q-S，QS12：唯一存活者提前结束，破产收尾和所有玩家收到的记录一致，重复emit不改变金额和原因。

### T31 离线到期与重连

**文件：** `server.js`、`test/quick-server.test.js`。**依赖：** T24、T30。

**步骤：** 重连先读取总时长，已到期先结束再投影；保留当前正式个人暂停，任何断线都不暂停clock。

**验证：** Q-S，QS13：一人/全员离线仍30分钟封盘，运行中重连看到同一结果；个人暂停余时与整局余时分开。

### T32 解散及无人清理

**文件：** `server.js`、`test/quick-server.test.js`。**依赖：** T30、T31。

**步骤：** quick解散/闲置先走统一结束，不再普通总资产排序；记录真实结束性质；清扫移除前检查总截止优先。

**验证：** Q-S，QS14：解散/清理不把负债高者排首，不写成正常完赛；已到点先封盘，原普通清理保持。

### T33 重开与旧回调隔离

**文件：** `server.js`、`test/quick-server.test.js`。**依赖：** T18、T32。

**步骤：** 全部结束/销毁路径清理个人、节点与心跳；新开局清理旧结果和缓存，回调校验局身份。

**验证：** Q-S，QS15：旧deadline/广播不会关闭新局，新局时间从0开始；测试退出后无残留房间计时器。

### T34 轻量时间校正

**文件：** `server.js`、`test/quick-server.test.js`。**依赖：** T20、T33。

**步骤：** 每5秒发quickTimeUpdate；只读时间不增加状态修订/决定身份，不作完整快照；终局停发旧局校正。

**验证：** Q-S，QS16：多次校正不改变决定ID和窗口；离线后无发送对象仍正常截止；结束、重开无旧包污染。

## G5 原生三端界面：T35–T42

### T35 房间模式选择

**文件：** `public/index.html`、`public/style.css`、`public/client.js`、`e2e/quick-mode.spec.js`。**依赖：** T16、T17。

**步骤：** 原生模式控件和说明，非房主只读；Socket声明快速能力，状态以roomState确认；保留横屏提示。

**验证：** Q-B，QB01：房主切换，另一端看到同一模式，非房主和旧页面限制清楚；真实开局采用确认模式。

### T36 配置与开始反馈

**文件：** `public/client.js`、`e2e/quick-mode.spec.js`。**依赖：** T35、T33。

**步骤：** 模式设置显示等待/失败，旧回执不能覆盖新配置；重开使用既有开始请求反馈和当前模式，不直接emit绕过。

**验证：** Q-B，QB02：重复点击、失败、状态先到回执晚到、重开普通/快速均无第二笔开始或静默失败。

### T37 独立总计时

**文件：** `public/index.html`、`public/style.css`、`public/client.js`、`e2e/quick-mode.spec.js`。**依赖：** T34、T35。

**步骤：** 独立总计时和5/2预告；读取权威包以本地单调插值，只显示到0等待结果；忽略旧局或倒退时间包。

**验证：** Q-B，QB03：双时钟分列，个人暂停时总时钟继续；插值不自行结算，不因时间包重置股票或机遇草稿。

### T38 净资产卡和明细

**文件：** `public/client.js`、`public/style.css`、`e2e/quick-mode.spec.js`。**依赖：** T28、T37。

**步骤：** quick显示当前净资产及负债组成，现金单列；原总资产可查看但标签不同，股票实付仍按现金。

**验证：** Q-B，QB04：抵押后总资产与净资产区分、负值正常显示、余额不足不能因高净资产成交；普通仍原总览。

### T39 终局与并列显示

**文件：** `public/client.js`、`public/style.css`、`e2e/quick-mode.spec.js`。**依赖：** T30、T38。

**步骤：** 使用冻结排名和全部赢家，显示原因、时长、资产明细与取消事项；记录未收到也可显示权威结果。

**验证：** Q-B，QB05：并列第一正确、解散原因不混淆；无gameRecord先显示结果，记录到达后不改名次。

### T40 记录、回放及再开局

**文件：** `public/client.js`、`e2e/quick-mode.spec.js`。**依赖：** T29、T36、T39。

**步骤：** 记录下载/回放展示真实quick数据；缺债务的旧记录说明未记录，不重新推算；重开清除旧记录与结束面板。

**验证：** Q-B，QB06：下载内容与结果一致，旧记录无假排名，重开无旧原因/计时/草稿残留。

### T41 三端、键盘与缩放

**文件：** `public/index.html`、`public/style.css`、`public/client.js`、`e2e/quick-mode.spec.js`。**依赖：** T35、T37、T38、T39。

**步骤：** PC、平板横竖屏和手机短横屏重排控件；关键入口至少44像素，保持文字、滚动、焦点和双时钟可读。

**验证：** Q-B，QB07：1440×900、1024×768、768×1024、568×320、812×375及实际浏览器200%缩放；无整页横向溢出，必要入口可键盘/触控完成；保存尺寸与图片。

### T42 终局优先于动画及旧面板

**文件：** `public/client.js`、`e2e/quick-mode.spec.js`。**依赖：** T39、T41。

**步骤：** 权威结束消息直接终止视觉排队，关闭股票/转让/公共及后续机遇，清理待提交内容；减少动画设置仍执行状态恢复。

**验证：** Q-B，QB08：封盘时动画/各旧面板不阻挡结果；迟到消息不复活入口，正常决定返回行为保持。

## G6 帮助、缓存和真实集成：T43–T46

### T43 静态与缓存升级

**文件：** `public/index.html`、`public/sw.js`及必要的`e2e/cache.spec.js`、`e2e/quick-mode.spec.js`。**依赖：** T42。

**步骤：** 按plan允许的实际日期更新静态版本为`20261010-quick-mode`，缓存`global-tycoon-v11-quick`；清单匹配真实文件，保留安装失败隔离。

**验证：** Q-B，QB09及R-B3：旧v10升级后模式、帮助和脚本一致；资源失败不启用半套新页面，不宣称缓存可离线联机。

### T44 两模式规则说明

**文件：** `public/client.js`、`rules.md`，目录变化时才生成`public/rules-catalog.js`。**依赖：** T43。

**步骤：** 解释总时限、个人时限、截止取消、负债净资产、除息和同分，以及快速机会时点；保留旧局适用说明。

**验证：** R-R及Q-B规则观察：两模式文字与实际状态一致；不提前显示经营任务/股票经营预期已交付。

### T45 有限真实快速流程

**文件：** `test/quick-server.test.js`、`e2e/quick-mode.spec.js`、按需`e2e/helpers/browserHarness.js`。**依赖：** T27、T31、T34、T42、T44。

**步骤：** 真实房间和Socket开局，以内部注入时间推进0/5/10、15/22、28/30；真实合法完成选择、经营、待成交决定及重连。不将夹具替换状态当成连续经营证据。

**验证：** Q-S的QS17及Q-B的QB10：一条两人有限流程完整成功、候选私有、结果唯一；清理时钟和连接，不等待真实30分钟。

### T46 补路线项目真实Q1依赖

**文件：** `test/opportunity-routes-server.test.js`、`e2e/opportunity-routes.spec.js`、`docs/opportunity-routes/task.md`、`docs/opportunity-routes/checklist.md`、`docs/opportunity-routes/progress.md`、`docs/opportunity-routes/acceptance.md`。**依赖：** T45。

**步骤：** 执行T49–T51及原快速未执行验收，用真实quickClock/finalize替代仅受控provider的结论；只在有证据后更新原等待/部分通过项。

**验证：** Q-S的QS18、Q-B的QB11及R-S2/R-B2：成长、后续、28关闭、30取消与结算均真实集成；旧普通路线证据保留，不把mock通过写成正式联机通过。

## G7 回归与交付：T47–T48

### T47 必要回归与静态检查

**文件：** 第1节列出的实现和测试文件、`docs/quick-mode/verification-log.md`。**依赖：** T46。

**步骤：** 运行Q-C/Q-M/Q-S/Q-B最终组，以及R-C/R-M/R-S1/R-S2/R-B1/R-B2/R-B3/R-R/R-L；检查所有修改JS语法。服务端、浏览器按文件串行批次，避免重复监听冲突。

**验证：** 所有本轮必要断言通过，0失败；日志区分最终有效结果、失败修复与跳过，数量不重复相加。若某个旧测试因环境受限不能执行，保留限制并处理该风险，不删除断言。

### T48 验收记录与进度同步

**文件：** `docs/quick-mode/progress.md`、`docs/quick-mode/acceptance.md`、`docs/priority-delivery/progress.md`、`readme.md`、`docs/项目现状.md`、`docs/opportunity-routes/progress.md`、`docs/opportunity-routes/acceptance.md`。**依赖：** T47。

**步骤：** 逐项登记checklist及AC1–AC32实际证据、资源版本、源码提交和未测范围；更新快速交付状态和后续离线/P1排期，分组明确文件提交。

**验证：** 检查需求—设计—任务—清单—证据一致、本地链接存在、Git差异仅本轮文件；实际游戏规则对应代码；不把本地提交写成GitHub/Render已上线，不以有限场景宣称胜率平衡。

## 3. 执行顺序与提交分组

| 分组 | 任务 | 前置与完成门槛 |
|---|---|---|
| G1 | T1–T5 | 四份文档批准；时钟QC01–QC04有效通过 |
| G2 | T6–T15 | 基线就绪；经济QM01–QM10及对应普通经营检查通过 |
| G3 | T16–T27 | 按各任务依赖接入；QC05、QS01–QS11通过 |
| G4 | T28–T34 | 冻结结果和统一入口就绪；QM11–QM12、QS12–QS16通过 |
| G5 | T35–T42 | 服务端接口就绪；QB01–QB08及三端观察通过 |
| G6 | T43–T46 | 界面就绪；QB09–QB11、QS17–QS18及真实路线依赖通过 |
| G7 | T47–T48 | 所有适用任务实现；必要回归、逐项验收和文档一致 |

依赖只指向已编号的前序任务，无循环；同一文件的修改按序进行，不要求并行代理。每组验证通过后只提交明确的本组文件，保留原工作区内容；如同一组较大，可按已完成任务形成更小提交，不跳过验证。

T47最终门槛用于确认本轮组合风险，T48用于真实记录；任何任务未完成或失败时不得提前写“快速模式交付完成”。当前经营任务、股票经营说明和新离线托管都未在这48项内实现。

## 4. 需求与任务覆盖

| Spec | 任务 | 重点 |
|---|---|---|
| F1 | T8、T16–T18、T35–T36 | 模式、能力、一致开局 |
| F2 | T2–T5、T18、T20、T31、T34、T37 | 总时限与提示 |
| F3 | T23–T25、T37 | 阶段时限及预算 |
| F4 | T9–T10、T19–T22、T25、T42 | 取消与提交边界 |
| F5 | T11、T15、T19、T30 | 破产收尾 |
| F6 | T6–T7、T12、T38 | 净资产与派息 |
| F7 | T13、T15、T30、T32、T39 | 同分及结束性质 |
| F8 | T26–T27、T45–T46 | 快速成长与路线 |
| F9 | T14、T19–T22、T28–T34、T40、T42 | 幂等、恢复与记录 |
| F10 | T28、T35–T42 | 资产与三端 |
| F11 | T8、T17、T28–T29、T43–T44、T47–T48 | 旧局、帮助、缓存、普通 |
| N1 | T6–T7、T14、T19–T22、T47 | 原子性及安全金额 |
| N2 | T1、T8、T43–T44、T47–T48 | 技术栈与版本维护 |
| N3 | T35–T42 | 触控、键盘、缩放、动画 |
| N4 | T1、T45–T48 | 有限验证、真实证据 |

## 5. 审批状态

spec、plan已批准。2026-10-10用户在task审批请求后回复“继续”，批准本任务拆解。[checklist](checklist.md)已于2026-10-10批准，覆盖AC1–AC32及集成约束；四份文档已批准，按本文开始实施。
