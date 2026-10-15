# 股票投资改进 Plan

2026-10-15。对应 spec.md，独立技术设计，已获最终开发批准并实施；见acceptance.md。

## 架构和版本

新增 `src/stockInvestment.js` 管理 `stockInvestmentRevision === 'stock-investment-v2'` 的纯报价、10份台账、来源额度、交易计划及只读指标；新增 `src/stockOffers.js` 管理异步邀请。保留 `src/stocks.js` 作为现有入口的版本分派器，旧代码路径不改规则。

新股票版本独立于仍使用v4的主动经营：`balanced(s)`仍服务原订单和施工，新股票单独判定；不能通过修改一个全局modern/balanced条件把旧股票奖励混入新分红。新局的activeInvestment可保留结构但所有mark/reward/expire新股分支禁用。`activeManagement`在新股版本不生成active_stock_buy候选并拒绝旧动作，原active_order/active_build/skip继续工作。

## D1 状态

- `s.stockInvestmentRevision`：缺省走旧局。
- 每城 `st.units` 固定10条：`{unitId:0..9,holderId:null|string,bankBasis:int,paidCost:int,acquiredSeq:int}`。无主持有为null；从银行买入写实际买价，受让保留/降低bankBasis并重置paidCost为本次实际分摊价。
- `s.stockAcquisitionSeq`：每个取得批次单调序号，unitId用于同批次稳定次序。邀请验证unitId及acquiredSeq，避免卖出再买回复用旧授权。
- `st.holders`及`p.stocks`作为原界面兼容聚合，所有写入只能从units派生；旧局继续原写法。加入开发期断言，聚合计数必须相等。
- `st.price`/`operatingPrice`：新股统一为系统买入参考价；`dividendFund`恒0；`quoteVersion`因实际报价事实改变递增，不因同一快照重发改变。
- 经营记录：`listingRoundIndex`，`roundRent`，`roundRentCount`，最多3条`rentHistoryV2:[{roundId,amount,count}]`；上市当轮不足完整轮，不进入3轮样本，上市后完整轮从下一轮开始计。`lastDividend:{rentalPerShare,bankPerShare,settlementId}`。
- 私人累计 `p.stockLedger`：按cityId记录systemBuyCost/playerBuyCost/bankSaleNet/playerSaleNet/rentalDividends/bankBonuses/opportunityBonuses；以实际成功资金动作更新，不作为权限状态。
- `p.stockTurnQuota:{turnId,boughtCityId,boughtTotal,invitationUsed}`，起点继续`stockWindow.boughtByCity/boughtTotal`，新局阈值4/3/2。首次访问以真实turnId初始化；UI关闭不重置。

## D2 纯计算和资金计划

`stockInvestment.enabled(s)`、`quoteBuy(s,cityId)`、`selectHeldUnits(s,pid,cid,n)`、`quoteBankExit(s,pid,cid,n,mode)`、`planTrade(s,pid,context,orders)`、`planTransfer(s,offer)`、`applyPlan(s,plan,events)`、`viewFor(s,pid)`构成对外接口。mode为ordinary/forcedOwner/clear，ordinary与forcedOwner为90，clear为50。

买价以BigInt一次计算 `round((P+rounded(P,60)*L)*12*activity*mortgage / 1000000)`，最低1。activity为90/100/110/115，mortgage为80/100。须和项目现有`economy.rounded`一致的半入取整；不得对每个中间乘数先截断。

银行单位价 `floor(min(quoteBuy,unit.bankBasis)*rate/100)`，按份逐项求和。邀请价格cash分到n个锁定unit：按unitId排序，每份floor(cash/n)，前cash%n份各加1；取得顺序仍写同批次新acquiredSeq。银行basis为min(source.bankBasis,paidUnitCost)。成交fee=rounded(cash,2)，卖家净cash-fee，买家-cash；手续费单独记银行收入。

计划包含cashDeltas/unitChanges/quotaChanges/ledgerChanges/stockFacts/invitationChanges/events和状态前置条件：版本、回合/窗口、报价、上市批次、份额所属/取得序次、必要actorRevision。所有加总先safe检查，apply前再次匹配前置条件，一次提交；失败不能写统计或使用额度。不让客户端提交银行basis或指定有利份额绕过FIFO。

普通新股票市场订单可使用现有stock_trade，但必须包含`stockContext:{kind:'turn'|'go',id}`，id为server turnId或windowId；新股请求不接受旧无context协议。银行买入从可售unitId升序分配；同一订单每城只能一种方向，整体卖出收入可支持同批其他城买入，但配额仍按累计买入计算。

## D3 即时租金

`economy.rentAmounts`保留资讯、H6/H11等计算，最后在新股分支调用纯分配助手，分别计算rounded(income,20)、rounded(income,40)及每股floor(/10)。所有存活holder的租金及银行款加入cashDeltas，城主剩额＝income－租金持股支出；城主自身股份和租客同人合并，不能覆盖或重复写delta。

H4只按该holder租金份额计算，读剩余3000额度，奖励和usage变化也进入同一计划。不得在提交后循环reward导致先触发自救或重复扣额度。银行既有rentSupplement、新stockBankBonus、H4Extra独立记录。

`applySettlement`原子提交后，原落点处理按最终现金判自救。租金只计一次roundRent/count；股息、机遇奖励不回灌rentHistory。新股GO只刷新原机遇/圈记录、不settle旧fund；transfer/final/clear新分支也不能重复派发。

## D4 邀请接口和状态机

使用原Socket `action`入口增加动作类型，不新增Socket事件：

- `stock_offer_create:{side:'buy'|'sell',targetId,cityId,shares,cash,stockContext,quoteVersion,listingEpoch}`。
- `stock_offer_reply:{offerId,accept:boolean,offerVersion}`，非当前回合的接收方也可调用，但鉴权必须来自socket对应playerId。
- `stock_offer_cancel:{offerId}`，仅发起者。

状态`stockOffers`中每条：`offerId,version,makerId,buyerId,sellerId,cityId,units:[{unitId,acquiredSeq,bankBasis}],cash,fee,originTurnId,originPhase,originContext,createdAt,expiresAt,listingEpoch,status,reason`。bankBasis不直接出现在公共邀请快照，提供给受让方的是可见的成交后银行回收报价。

create合法后用掉邀请次数、不冻结款项、不改s.pending/phase。expiresAt=min(serverNow+20000,发起决定真实deadline,快速封盘deadline)。等待掷骰阶段/stock阶段原权限继续；若缺可信期限或阶段不合条件则拒绝。

pending→accepted/declined/cancelled/expired/invalidated，终态不可再变。accept前逐项检查截止、发起上下文、双方在线存活、持股上限、足额现金、份额身份/序次、上市批次及安全阶段。房级/抵押/系统参考价改变使邀请失效（防止银行预览变化却按旧确认成交），协商本身不自动改价。卖方买卖其他城市或现金变化不会当然失效，但接受时现金和安全状态需重新验证。

安全检查根据双方的实际决策职责判定，不因无关第三方正在拍卖就无条件锁住所有人；当本人是自救/募资/拍卖出价/产权付款/旧交易确认的责任人则拒绝接受。玩家主动滚动查看、原股票交易草稿本身不算资金保护。

任何离线即使offer终止；因此全员暂停仅沿原规则，无邀请剩余时限续期。server原tick、action前与状态推进后调用sweep。发起者离开原phase/turn/context、封盘立即取消。UI关闭只隐藏，不等于取消；明确“取消报价”才撤销，掷骰/完成股票窗口前显示邀请将结束。终态保留有限回执索引供幂等，活跃列表按现有4玩家约束有界。

普通买卖请求修改来源份额或quoteVersion后及时sweep；一份同时包含目标变动和接受的请求不允许客户端组合，依服务端顺序决定先成功者。

## D5 估值、清算及统计

`assets.assetSummary/netAssetSummary`新股stockValue取全部ordinary bankExit总和，提供额外`stockMarketReferenceValue`只展示不加总。所得city/airport报价由原路径输出强制减持预览。`enforceOwnerStockCap`选FIFO超额份额，仍走同一计划；银行清算在清空城市前取价，按clear50限额逐份退款并注销。

用户成本paidCost及累计买入是真实现金口径；bankBasis是反套利限制，不能替代成本指标。受让预览显示：协商总价、手续费承担者、成交后银行回收额、估值变化。最终排名以bankExit估值，取消未成交邀请不产生资产；不按挂牌价、不把预期股息计入净资产。

## D6 界面及私有视图

`gameView`公共stocks仅公开份额总数、holders、系统价、房级/经营指标与最后一次股息；不公开units的basis/paidCost、私人成本或未成交报价。本人self.stockInvestment包含逐城可买、bankExit可选股数报价、真实额度、成本统计、本人相关邀请和接收后预览。

公共player.assetSummary可继续公开最终持股估值合计，不泄漏逐份限制或私人账本。记录结束导出按原策略提供明细，进行中视图/导出同样脱敏。`privateReplay`保留完整元数据便于重放。

`public/client.js`股票组件在turn/go/readOnly三上下文切换，共享key=gameId/playerId/contextId的草稿，列表key=cityId且数量控件不重建。新“收购股份/向玩家出售”复用交易弹窗样式，收件入口不强制覆盖正在操作的窗口；手动打开确认时展示20秒以内剩余期及后果。

新股持仓、银行、资产、自救/各募资共用 `public/stock-investment-view.js` 展示适配器，市场价、银行回收额、股息来源分别标明。信息密度适配现手机横屏全图；旧局渲染读取版本而非客户端全局常量。新增帮助锚点不提交交易。

## D7 AI、协议和接入

AI估值使用公开预测客流和实际20/40股息，参考自己的bankExit、reserve、剩余quick时间。新买入比较现金即时损失及预期实际股息；不以将来卖给银行涨价为利润来源。每次最多有限候选（20城×2份量），收购仅在市场份额不足且预期可接受时考虑。收到offer可独立从scheduler响应，不要求自己是当前回合；reply安全性由服务端同一验证保障。

普通股票投资使用最多24步公开预测与0.98逐步折现，避免用单回合经营的短视角评价长期股息；快速模式仍使用实际剩余时间，清仓损失不重复计入买入折价。该有界参数为本轮实现细化。

AI发起邀请后，scheduler只等待该邀请回复或既定截止；也可主动取消并继续原回合，不能紧接着自动掷骰使刚发出的邀请立即失效。等待不刷新原决定期限，结束后不重复创建同回合邀请。

`server.js`房间创建/开始时启用stockInvestmentRevision；连接/重连声明`stockInvestmentProtocol:2`，新局缺能力拒绝动作并提示升级，不能fallback旧方式。请求幂等沿原requestId/actorRevision；报价过期重试需要新确认，旧成功回执不能用于另一个offer/context。offer回复须单独走当事人权限，不套currentPlayer权限。

PWA资源版本与新协议同步，旧局能继续，新局需新代码；已进行旧局不强刷。新增模块不引入外部依赖。

## 需求映射和技术取舍

F1：state/stocks/activeManagement/activeInvestment版本分派；F2/F3/F5：stockInvestment；F4：economy计划；F6/F7：stockOffers及server时钟；F8：assets/quickMode；F9：gameView/client/record；F10：bot/缓存/兼容。

选择固定10份来源台账，而不是只记平均价，是为了部分卖出、低价转让和倒手时能够精确解释与验证上限。股票净资产使用真实银行变现额，防止把不能直接兑现的市场报价用于快速排名。选择邀请独立于全局pending，避免重复出现股票转让卡住整局的问题。

有限模型只验证价格/钱流/来源不变式和候选收益，不替代正式代码的Socket、时钟、重连、移动端及旧版本测试。
