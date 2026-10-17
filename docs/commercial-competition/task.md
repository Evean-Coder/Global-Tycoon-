# 主动经营三路线修订 Tasks

2026-10-17。依据[Spec](spec.md)与[Plan](plan.md)，共32项。用户已最终确认实施，32项开发任务已完成；验收范围及C44真机缩放未测限制见acceptance.md。路径以仓库根目录为起点。执行者保留无关工作区文件，发布暂停。

## 文件清单

| 操作 | 文件 | 用途 |
|---|---|---|
| 新建 | `src/managementEconomyRules.js`、`src/commercialCompetition.js`、`src/competitionPreview.js` | 规则开关、竞争生命周期、本人顺序收益预览 |
| 修改 | `src/state.js`、`src/operatingOrders.js`、`src/activeManagement.js`、`src/actionValidation.js` | 初始化、订单、原入口与动作 |
| 修改 | `src/economy.js`、`src/gameLogic.js`、`src/quickMode.js`、`server.js` | 单笔结算、轮边界、结束及请求协议 |
| 修改 | `src/gameView.js`、`src/record.js`、`src/privateReplay.js` | 公私投影、公开记录与私有回放（保留原边界） |
| 修改 | `src/botPolicy.js`、`src/botEvaluation.js` | 现金、收益和期限评估 |
| 新建/修改 | `public/management-economy-view.js`、`public/client.js`、`public/style.css`、`public/index.html`、`public/sw.js` | 共享弹窗、状态保留与缓存 |
| 修改 | `src/gameplayCatalog.js`、`public/contextual-rules.js`、`public/rules-catalog.js`、`rules.md`、`readme.md`、`package.json` | 规则、生成目录与有限验证命令 |
| 新建 | `test/management-economy-orders.test.js`、`test/commercial-competition.test.js`、`test/competition-rent.test.js`、`test/competition-preview.test.js` | 有限核心验证 |
| 新建 | `test/management-economy-boundaries.test.js`、`test/management-economy-socket.test.js`、`test/management-economy-ai.test.js` | 版本、边界、真实请求与AI |
| 新建 | `e2e/management-economy.spec.js`、`docs/commercial-competition/acceptance.md` | 受控浏览器场景与真实证据 |

## T1：新局版本及不变量基础

**文件：** `src/managementEconomyRules.js`、`src/state.js`、`server.js`、`test/management-economy-boundaries.test.js`。
**依赖：** 无。
**步骤：** 定义独立management-economy-v1常量/启用守卫；保持active-management-v4与stock-investment-v2；初始化个人报名圈、竞争状态和机场代次；拒绝非法选项组合，仅新普通/快速局带开关。
**验证：** 显式新局带新字段，未传开关的v4/旧股票夹具逐字段不被迁移；非法组合初始化失败。

## T2：订单报价与现金计划

**文件：** `src/operatingOrders.js`、`test/management-economy-orders.test.js`。
**依赖：** T1。
**步骤：** 新单采用10%夹1000–2000、利润等预付、25%首笔与尾笔补齐；报价列本金/利润及首尾；保留旧paymentEach分支。
**验证：** 21种城市/机场标的对照Spec表，总回款−预付=基础净利；新单最高资讯后2200，旧报价仍原值。

## T3：订单两次付款与取消账目

**文件：** `src/operatingOrders.js`、`test/management-economy-orders.test.js`。
**依赖：** T2。
**步骤：** 保存scheduleRevision/付款索引；每次真实开头只付一次，分别记录本金/利润/资讯；取消清未付本金和尾款，不追回已发；旧单按旧计划继续。
**验证：** 预付2000→500→3500；首笔后抵押净−1500；选择恢复/同turn重入、监狱/冻结回合不漏付或多付。

## T4：订单产权来源与资产操作提示

**文件：** `src/gameLogic.js`、`src/operatingOrders.js`、`public/client.js`、`test/management-economy-orders.test.js`。
**依赖：** T3。
**步骤：** 城市结合listingEpoch与ownershipEpoch；机场两个购买出口及归还/破产出口递增ownershipEpoch；真实产权/抵押出口clean订单；相关确认加“未领本金/尾款取消”说明，不限制原资产权限。
**验证：** 城市/机场失去再买不复活订单；取消首尾风险数字与已发款一致，旧局机场行为不变。

## T5：地区与报名期初始化

**文件：** `src/commercialCompetition.js`、`test/commercial-competition.test.js`。
**依赖：** T1。
**步骤：** 定义五洲、期间ID与R→R+1..R+4；首圈禁发、首期等待条件；首期后固定四轮，跳过也推进下一期时间。
**验证：** 人工轮边界序列证明未开放购地不发布、首次R及R+4/R+8正确，完整轮与本人圈不混淆。

## T6：基础资格与固定地区

**文件：** `src/commercialCompetition.js`、`test/commercial-competition.test.js`。
**依赖：** T5。
**步骤：** 实现basicEligible与至少两人发布；不按当前回合/瞬时现金错排；固定已发布地区，后来合格者可入；当前优势将于轮末到期允许续报。
**验证：** 两人/三人、圈已用/待决/旧优势容量、后来买城、对手后来失效与空期案例准确。

## T7：暗价报价与轻量token

**文件：** `src/commercialCompetition.js`、`src/activeManagement.js`、`test/commercial-competition.test.js`。
**依赖：** T6。
**步骤：** 合法amount100–3000步长100，正常掷骰/现金/来源/圈/期守卫；输出cashRequired与debitNow=0；每城30档token、收益基准单算，旧报价拒绝并给新事实。
**验证：** 0/99/105/3100、机场/他人/抵押城、现金不足/特殊阶段均失败且状态未变；相邻合法档有效，来源或持股变更使旧token失效。

## T8：合法报名原子接受

**文件：** `src/commercialCompetition.js`、`src/activeManagement.js`、`src/actionValidation.js`、`test/commercial-competition.test.js`。
**依赖：** T7。
**步骤：** 新active_competition_bid明确分支，写不可改bid、报名时lap及usedTurnId；不扣现金、不建pending、不落入promotion兜底；取消/重复按原机制处理。
**验证：** 一次成功后仍可掷骰/独立股票；跨GO同一期不能再报，落选不返圈名额；同请求无多次标记。

## T9：开标、同价与历史

**文件：** `src/commercialCompetition.js`、`test/commercial-competition.test.js`。
**依赖：** T8。
**步骤：** 真实资金/来源过滤后最高价优先；同价先非最近赢家，剩余按原rng均匀选择；一次扣款/优势/历史/结果；最近赢家跨空期保存。
**验证：** A最近赢家时100/100选B、200/100选A、三人同价用受控rng覆盖B/C；失效最高价降序、单份有效/全失效及重复close均正确。

## T10：优势来源、期限与清理

**文件：** `src/commercialCompetition.js`、`src/gameLogic.js`、`test/commercial-competition.test.js`。
**依赖：** T9。
**步骤：** 最大一城/两笔/四完整轮，产权/抵押/出局立即终止；建拆不补次数，赎回不恢复；终止事件一次，不退款或额外估值。
**验证：** R+1前、R+4最后、R+5后及所有失效路径；旧优势最后报名轮可续接但不同时生效。

## T11：单笔租金附加计划

**文件：** `src/economy.js`、`src/commercialCompetition.js`、`test/competition-rent.test.js`。
**依赖：** T10。
**步骤：** planRent只读，保留基础租金，资讯后加min(round(base15%),3000)，再原个人减免与股票计划；guard带优势ID/次数/来源/结算ID。
**验证：** 低价零房、开罗二级、上海四级，旺/淡季、H6/H11下口径准确；本人、途经、预览、机场不触发。

## T12：租金资金、分红和自救提交

**文件：** `src/economy.js`、`src/gameLogic.js`、`test/competition-rent.test.js`。
**依赖：** T11。
**步骤：** 在applySettlement原候选内一次提交现金/股息/H4/银行来源/优势hit；一条租金事实驱动原经营计数，之后用最终净现金判断自救；失败丢候选。
**验证：** 无发行/外部满股/城主2股/租客自身持股、H4接近上限逐笔守恒；毛不足但股息后足够不误进自救；重试/自救继续不多记hit或股息。

## T13：完整轮边界交接

**文件：** `src/gameLogic.js`、`src/commercialCompetition.js`、`test/management-economy-boundaries.test.js`。
**依赖：** T9、T12。
**步骤：** 复用boundaryId，旧租金完成→到期→开标→原股票/资讯→startRound→发布→原机遇继续；监狱/冻结跳回合及出局仍按roundFlow；结果不在恢复重抽。
**验证：** R+4末笔旧优势与R+5新优势无重叠；同步机遇恢复、淘汰与自动跳过不多开标。

## T14：封盘和结束优先

**文件：** `server.js`、`src/quickMode.js`、`src/gameLogic.js`、`test/management-economy-boundaries.test.js`。
**依赖：** T3、T10、T13。
**步骤：** 原总期限动作前/候选提交前门保留；普通结束/快速封盘/解散/闲置结束取消未发款/未成交/未赚优势；不补本金尾款和未赚租金，不写预计资产。
**验证：** 29:59.999到30:00候选竞争失效不扣；已合法付款不退；未开标、首笔后、旧期到期三种封盘榜准确。

## T15：本人收益顺序预览

**文件：** `src/competitionPreview.js`、`test/competition-preview.test.js`。
**依赖：** T11、T12。
**步骤：** 构造公开资料＋本人私有额度投影，有/无优势双副本各顺序两笔；共用真实rentPlan/commit口径，分列城主/股息/机遇差额；出价只做减法。
**验证：** 上海城主2股H4余700得3280/6480而非6560；出3000净−3000/+280/+3480；深比较原state不变且不读隐藏骰子/其他暗价。

## T16：公开与本人快照

**文件：** `src/gameView.js`、`src/commercialCompetition.js`、`test/commercial-competition.test.js`。
**依赖：** T7、T9、T15。
**步骤：** 白名单投影公共地区/参赛身份/已公开结果/生效优势；本人给真bid、资格和每城基准预览/token；view不得clean或消耗状态。
**验证：** A/B/旁观者快照前后深等状态；开标前B看不到A金额/旗舰，开标后仅约定信息公开，不带他人stockLedger成本。

## T17：Socket协议与失败回执

**文件：** `server.js`、`public/client.js`、`test/management-economy-socket.test.js`。
**依赖：** T8、T16。
**步骤：** 新局校验managementEconomyProtocol=1，内部bot同步；复用envelope/成功缓存；失败刷新名单加新动作，过时响应不提交；不添加Socket事件。
**验证：** 原action请求成功、同ID改内容拒绝、同ID重试复用、旧协议仅新局UPDATE、非本人及过期决定不能报名。

## T18：三路线主界面与订单展示

**文件：** `public/management-economy-view.js`、`public/client.js`、`public/index.html`。
**依赖：** T3、T16。
**步骤：** 共用原类型→子页，增加商业竞争，订单首/尾/本金风险，保留施工信息、主页面左右footer及行动栏顺序；无项目不自动弹，中央不增经营按钮。
**验证：** 浏览器受控新旧局渲染，新单不显示错误“等额两笔”，旧单旧菜单无变化；关闭查看与放弃经营含义不同。

## T19：竞价子页与草稿生命周期

**文件：** `public/management-economy-view.js`、`public/client.js`。
**依赖：** T17、T18。
**步骤：** 地区→旗舰→档位与净额，未扣/亏损确认/临近封盘说明；按game/turn/period保留输入焦点、展开及滚动；token更新要求再确认，旧回执不关闭新窗口。
**验证：** 外人操作不跳列表；新快照变价不自动提交；已报名不可改但可继续掷骰；时期结束解释后收起失效子页。

## T20：三端布局与可访问操作

**文件：** `public/style.css`、`public/management-economy-view.js`、`public/client.js`、`e2e/management-economy.spec.js`。
**依赖：** T19。
**步骤：** 沿现有仅横屏规则，以头/内容滚动/页脚布局，避免卡片内多层定高压缩；金额、原因、时间常显，键盘焦点顺序可达。
**验证：** 1440×900、768×1024、932×430、844×280分别截图测量；能滚到全文、点击首尾目标与页脚，横屏低高度无遮盖；平板系统缩放200%/减少动画有限观察。

## T21：规则定位和风险说明

**文件：** `src/gameplayCatalog.js`、`public/contextual-rules.js`、`public/rules-catalog.js`、`rules.md`、`readme.md`。
**依赖：** T18、T19。
**步骤：** 版本化规则，注明本人圈/完整轮差别、报价与实收、资讯非保证、15%与股息；沿原生成脚本更新规则目录、场景自动锚点。
**验证：** 从订单/竞争/租金详情打开定位正确，返回保留草稿；搜新版文案不残留新单2300或旧强制轮换。

## T22：AI订单与施工比较

**文件：** `src/botEvaluation.js`、`src/botPolicy.js`、`test/management-economy-ai.test.js`。
**依赖：** T3、T16。
**步骤：** 订单本金/利润分离、首尾风险与快速剩余时间折价；保留远程施工真实费用、冷却及同城限制；只用自身view。
**验证：** 现金边缘/即将结束/不稳定资产跳过订单，充足且可收款可接；施工守原限制，不从预付本金制造收益。

## T23：AI竞价与默认跳过

**文件：** `src/botEvaluation.js`、`src/botPolicy.js`、`test/management-economy-ai.test.js`。
**依赖：** T15、T16、T22。
**步骤：** 有界候选，按未来可能扣费留现金，公开到访机会与真实实收评价，不默认3000或必报名；无时限兑现机会则跳过，已报名不重报。
**验证：** 固定值得参与/不值得/临近封盘/对手先后位置场景；只改变被隐藏的暗价或骰序时相同本人view得相同动作。

## T24：经济记录、私有回放与不变量

**文件：** `src/record.js`、`src/privateReplay.js`、`server.js`、`test/management-economy-boundaries.test.js`。
**依赖：** T12、T13、T16。
**步骤：** 新规则、订单本金/利润/奖金、竞价成本/触发/结束记账；私有journal只落服务端；新增assert守名额、来源、金额与次数，异常全候选回滚。
**验证：** 公开记录无未开标暗价/私人成本；私有回放重建终态与哈希、胜者不重抽，插入非法金额后原状态不变。

## T25：本地资源与PWA版本

**文件：** `public/index.html`、`public/sw.js`、`public/client.js`、`package.json`。
**依赖：** T20、T21。
**步骤：** 核对实际脚本路径、缓存清单/query一起更新，新前端模块加入lint；保留更新提示、不强制刷新进行中游戏。
**验证：** 加载新资源无404；旧缓存更新后显示新版，新局能力齐全；运行中不触发location reload或丢草稿。

## T26：有限核心回归整理

**文件：** 新订单/竞争/租金/预览测试及`test/management-balance-v4.test.js`、`test/round-flow.test.js`、`test/stock-investment-dividend.test.js`。
**依赖：** T4、T13、T15。
**步骤：** 跑新增固定场景及最小必要金融/轮边界回归；失败修复到具体原因，不改断言掩盖错误；保留旧fixture开关。
**验证：** 定向文件全部通过、资金守恒和新旧分支有证据；不调用含大量平衡局的npm test或全量模拟。

## T27：双真人有限Socket流程

**文件：** `test/management-economy-socket.test.js`。
**依赖：** T14、T17、T24。
**步骤：** 真实两Socket连接到受控本地room，同地区合法暗价→重复/过时请求→轮末开标→合格租金→断线重连；少量指定动作，直接夹具准备资产和轮号，不跑整局。
**验证：** 彼此秘密不泄漏，现金只扣一次，轮次/时钟不重置，租金和股息事实一笔、重连待决真状态恢复。

## T28：机器人有限服务端流程

**文件：** `test/management-economy-ai.test.js`、`test/bot-server.test.js`。
**依赖：** T17、T23、T24。
**步骤：** 真人＋机器人受控报名/可跳过流程，经原scheduler和runAction，不用绕规则写资金；检查协议与失败退让。
**验证：** bot合法执行或明确跳过，无重试死循环、无隐藏信息、未拖住真人；只跑指定用例。

## T29：交互与四视口浏览器验证

**文件：** `e2e/management-economy.spec.js`、`docs/commercial-competition/evidence/`。
**依赖：** T20、T21、T25、T27。
**步骤：** 共用有限受控状态验证主/子页、更新与回执、外人刷新、股票后净额、两类关闭和无项目；按T20四视口观测，不重复跑所有历史截图套件。
**验证：** 记录实际截图/测量与操作结果，列表不跳、按钮可达，不能用截一张主页面代替竞价/订单子页验证。

## T30：旧局、期限和缓存必要回归

**文件：** `test/management-economy-boundaries.test.js`、`test/stock-investment-legacy.test.js`、`test/management-prompt.test.js`、`e2e/management-economy.spec.js`。
**依赖：** T14、T25、T29。
**步骤：** 旧v1–v4菜单/订单、stock-v2未启用新规则、初始机遇/路线选择、自救/全员离线、quick结束门和缓存升级的有限相邻用例；仅因实际风险补测。
**验证：** 原行为/时钟不迁移、不新增强制竞价，未玩完旧局可继续；区分已测与真机/Render未测。

## T31：Lint与文档一致性

**文件：** 所有本轮文件、`docs/commercial-competition/{spec,plan,task,checklist}.md`。
**依赖：** T26、T28、T30。
**步骤：** 执行项目lint、git diff --check；核对三端/规则/记录公式、AC覆盖与版本；只修本轮问题，保留无关工作区文件。
**验证：** 无本轮lint/空白错误，21项AC都有实际证据或明确未通过，数值不引用已撤回稿。

## T32：验收记录与交付

**文件：** `docs/commercial-competition/checklist.md`、`acceptance.md`、`progress.md`、`docs/gameplay-improvements/summary.md`。
**依赖：** T31。
**步骤：** 清单按真实证据勾选，记录命令/结果/有限局面/局限；说明未测真机与线上；报告本地完成状态，继续暂停发布。
**验证：** 清单与证据逐项对应，无未解决失败冒充完成；不把“设计模型15通过”当新增实现通过，不推送或声称Render部署。

## 执行顺序

T1 → T2 → T3 → T4；T1 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13 → T14。

T11/T12 → T15；T7/T9/T15 → T16 → T17 → T18 → T19 → T20 → T21 → T25。

T3/T16 → T22 → T23；T12/T13/T16 → T24；满足各依赖后执行T26、T27、T28，再T29 → T30 → T31 → T32。箭头表示依赖，不授权创建子代理或并行改同文件。
