# 股票投资改进 Tasks

2026-10-15。对应独立spec.md与plan.md，共26个任务包，用户已最终批准开发，现已实施并完成本地有限验证。证据见acceptance.md；task所列原文件可复用接口而无需无意义改动。

## 文件清单

新增生产文件：`src/stockInvestment.js`、`src/stockOffers.js`、`public/stock-investment-view.js`（共用只读展示与上下文适配器）。

修改生产文件：`src/state.js`、`src/stocks.js`、`src/economy.js`、`src/gameLogic.js`、`src/activeManagement.js`、`src/activeInvestment.js`、`src/actionValidation.js`、`src/actionClock.js`、`src/disconnectPolicy.js`、`src/gameView.js`、`src/assets.js`、`src/quickMode.js`、`src/record.js`、`src/privateReplay.js`、`src/botEvaluation.js`、`src/botPolicy.js`、`src/botScheduler.js`、`src/gameplayCatalog.js`、`server.js`、`public/client.js`、`public/rules-catalog.js`、`public/contextual-rules.js`、`public/index.html`、`public/style.css`、`public/sw.js`、`package.json`、`rules.md`、`readme.md`。

新增验证文件：`test/stock-investment-price.test.js`、`test/stock-investment-units.test.js`、`test/stock-investment-dividend.test.js`、`test/stock-investment-offers.test.js`、`test/stock-investment-socket.test.js`、`test/stock-investment-legacy.test.js`、`e2e/stock-investment.spec.js`。沿用现有test/stocks-v2、stock、募资、自救、AI与终局回归。

## 任务包

### T01 版本和新局结构（已完成）
文件：state.js、stockInvestment.js、server.js。依赖：无。步骤：加入独立股票版本、10份结构与私人统计初始值；新局配对启用；无标志沿旧路径。验证：新/旧局创建固定状态的股数、默认字段和原始序列化兼容。

### T02 报价计算（已完成）
文件：stockInvestment.js、test/stock-investment-price.test.js。依赖：T01。步骤：整数资产价×12%×经营/抵押系数；一次取整、最低1；取消新股旧平滑/限幅。验证：0/1/4房、20城与因子边界，对照numeric-results的基准值及人工样例。

### T03 经营记录与报价失效（已完成）
文件：stocks.js、economy.js、gameLogic.js。依赖：T02。步骤：记录真实正额租金次数/金额；上市当轮排除完整样本；保留3轮；建设/抵押事实变化同步刷新quoteVersion。验证：同一结算重试只计一次，银行奖励不算租金，老报价不能成交。

### T04 份额选择与银行报价（已完成）
文件：stockInvestment.js、test/stock-investment-units.test.js。依赖：T01/T02。步骤：固定units及派生holders，FIFO、90%普通/强制和50%清算报价，逐份取整。验证：混合成本、0成本、部分卖出、聚合一致与超大非法值无溢出。

### T05 市场交易原子计划（已完成）
文件：stockInvestment.js、stocks.js。依赖：T03/T04。步骤：计划库存、现金、份额、次数和账本；买入设置basis/paidCost/seq；失败不写入。验证：先卖后买净资金、报价变动、库存竞争、幂等及失败快照不变。

### T06 回合与起点额度（已完成）
文件：gameLogic.js、actionValidation.js、stocks.js。依赖：T05。步骤：turn/go上下文、2股1城及4股3城单城2，真实回合生命周期初始化；旧stock动作版本隔离。验证：关闭重开、过期context、卖出和重连不恢复已用额度。

### T07 租金及银行股息计划（已完成）
文件：economy.js、stockInvestment.js、test/stock-investment-dividend.test.js。依赖：T04。步骤：租金20/银行40分别取整；城主未发行余数、本人付租净现金、H4原额度纳入同一计划。验证：255模型中的资金样例及真实engine固定状态，无重复派息/提前自救。

### T08 原派息出口版本分派（已完成）
文件：stocks.js、gameLogic.js、activeInvestment.js。依赖：T07。步骤：新GO/转让/清算/终局不补派基础股息；禁用新股30%标记奖励，保留原H4/H5/H6处理。验证：同一收益在经过起点、转让、封盘后不再次到账；旧版相同场景保持原结果。

### T09 募资和自救回收（已完成）
文件：gameLogic.js、actionValidation.js、src/buildFundraising.js、src/purchaseFundraising.js。依赖：T05/T07。步骤：rescue_sell_stock及各募资出口统一按份报价和股数执行；最新现金更新缺口。验证：自救、购地、机场、建房四场景成功卖出指定股数并继续原流程，报价过期不部分扣股。

### T10 城市取得、强制减持和清算（已完成）
文件：stocks.js、gameLogic.js。依赖：T04/T05/T08。步骤：产权交易前预览超2股；按同一90%报价减持；清算先取价再重置城和unit。验证：普通购买、扶持、拍卖、受让及银行清算，价格上涨不绕过basis。

### T11 股票资产与终局（已完成）
文件：assets.js、quickMode.js、gameView.js。依赖：T04/T10。步骤：stockValue为本人银行可变现额；市场参考值另字段；终局取消未成交邀请。验证：买入折价、强制出售守恒、玩家高价倒手/建设不能提高股票的银行估值。

### T12 邀请创建与份额绑定（已完成）
文件：stockOffers.js、actionValidation.js、test/stock-investment-offers.test.js。依赖：T04/T06。步骤：买/卖单城邀请、每回合一次、份额id/seq、报价及上下文绑定；不冻结款项、不改pending。验证：非法target/股数/现金不耗次数，合法重复创建不能绕过限制。

### T13 玩家交易金额和来源继承（已完成）
文件：stockInvestment.js、stockOffers.js。依赖：T05/T12。步骤：总价整数均分、fee2%、basis取较小值、真实成本/ledger累计，一次提交。验证：高价、低价、0元、余数、链式转让、FIFO出售和quote变化全部按spec输出。

### T14 邀请时钟和关闭（已完成）
文件：stockOffers.js、server.js、actionClock.js、disconnectPolicy.js。依赖：T12/T13。步骤：20秒/原决定/quick最早期限；tick/action前sweep；任一离线、掷骰、离开窗口即关闭。验证：假时钟检查不加时、到点前后、暂停/重连不复活，取消接受竞争仅一次。

### T15 回复权限及资金安全（已完成）
文件：actionValidation.js、gameLogic.js、server.js。依赖：T14。步骤：非当前接收者按socket身份reply；本人自救/募资/拍卖/付款保护；原action幂等与actorRevision适配。验证：跨玩家伪造回复被拒、第三方操作不中断、受保护现金不被承诺旧价扣走。

### T16 私有视图和收件列表（已完成）
文件：gameView.js、stockInvestment.js、stockOffers.js。依赖：T07/T11/T15。步骤：公共经营/holders、本人成本/回收/额度、仅双方报价和受让预览。验证：每个座位的快照对照，无他人basis/paidCost/未成交报价泄漏。

### T17 主动经营与股票入口（已完成）
文件：activeManagement.js、public/client.js、public/index.html。依赖：T06/T08/T16。步骤：新股移除重复active_stock_buy；订单/施工照旧；turn/go/readOnly股票入口正确切换。验证：无项目不弹、可跳过、买卖不耗经营、旧局3路线可用。

### T18 共享持仓展示（已完成）
文件：新增public/stock-investment-view.js、public/client.js。依赖：T16。步骤：股票卡、本人资产、银行及募资共享租金/银行/机遇来源、参考价/回收值、成本和收支文本。验证：同状态各入口数值一致，0股/0回收/数据缺失无NaN。

### T19 买卖数量及草稿稳定（已完成）
文件：public/client.js、public/style.css。依赖：T17/T18。步骤：context草稿键、cityId列表复用、逐份合计预览；quote变化重确认、receipt绑定原请求。验证：点击加号/别人行动不跳动，旧回执不关新窗口，返回保留有效草稿。

### T20 玩家议价界面（已完成）
文件：public/client.js、public/stock-investment-view.js、public/style.css。依赖：T15/T18/T19。步骤：收购/出售方向、股数/现金、收到/发出的报价、取消/拒绝/接受、真实有效期与退出预览；收件不强弹遮挡。验证：触屏和键盘完成两方向交易，倒计时结束和阶段离开显示正确原因。

### T21 AI估值和安全回复（已完成）
文件：botEvaluation.js、botPolicy.js、botScheduler.js。依赖：T07/T11/T15/T16。步骤：新股实际分红、退出损失、剩余局时和现金reserve；非本回合响应合法offer；有限候选收购。验证：固定高/低收益、临近封盘、无库存、差报价及被保护阶段选择合理且不读私有信息。

### T22 事件、账本与回放（已完成）
文件：record.js、privateReplay.js、stocks.js、stockOffers.js。依赖：T07/T13/T15。步骤：资金来源、来源台账、次数、邀请终态和统计输出；进行中导出脱敏，结束回放恢复相同现金/份额。验证：小段固定事件回放与实时状态一致，旧记录继续可读。

### T23 协议和缓存（已完成）
文件：server.js、public/client.js、public/index.html、public/sw.js、package.json。依赖：T17/T20/T22。步骤：新协议能力宣告/校验，新静态模块加载及缓存版本同步；加入新增test/e2e入口及共享展示模块lint覆盖。验证：旧客户端不能用旧20股动作操作新局，旧局不中断，新资源可完整缓存且不强刷对局。

### T24 规则和项目说明（已完成）
文件：gameplayCatalog.js、public/rules-catalog.js、public/contextual-rules.js、rules.md、readme.md、docs/stock-investment-v2/progress.md。依赖：T18/T20/T23。步骤：分版本说明10股、20/40、两种额度、basis/回收、协商及取消；明确股息与减租区别，帮助定位。验证：规则数据与真实quote一致，旧局不展示新规则。

### T25 定向回归和真实Socket验证（已完成）
文件：新增所有test/stock-investment-*.test.js、现有募资/自救/股票/AI/快速模式测试。依赖：T21–T24。步骤：执行checklist有限状态；2个真人socket＋1个AI的短流程验证邀请不阻塞、并发回复和实际资金。不跑完整长局。验证：记录命令、数量、结果和失败修复，未执行项不标通过。

### T26 三端观察、验收和待发布状态（已完成）
文件：e2e/stock-investment.spec.js、docs/stock-investment-v2/acceptance.md、progress.md。依赖：T25。步骤：1440×900、768×1024、844×280/932×430覆盖交易/收件/资产/自救；必要lint与旧局回归；整理实际证据。验证：无遮挡、草稿/列表稳定、资金符合预期；按当时用户发布授权处理提交/推送，未核实Render不得称上线。

## 执行依赖

T01→T02→T03；T01/T02→T04→T05→T06；T04→T07→T08；随后T09/T10→T11。T04/T06→T12→T13→T14→T15；T07/T11/T15→T16→T17/T18→T19→T20；T21/T22→T23→T24→T25→T26。此为开发顺序，不授权子代理并行或跳过最终开发确认。
