# 三条主动经营路线平衡 Plan

## 版本和架构

`managementRules`新增v4为新局REVISION，保留v3可选/v2必选/v1历史识别，现代机遇数值仍相同。`state`为v4初始化扩展经营状态，server新局默认引用REVISION；旧局不迁移。快照/记录保存版本，现有私人状态回放继续核对。

## 数据与接口

- `activeManagement.lastRemoteBuildLap`与`lastRemoteBuildCityId`持久化上次成功远程建设的本人 `opportunities.lapEpoch`和城市标识。不能放入每圈归零字段；只有成功远程建设才能同时更新，普通建房、换机遇、产权变化和等待不修改。`quote`提供下一允许圈、`remoteBuildLapsRemaining`及同城限制原因；active_build与remote_build同校验同提交，失败不消耗记录。单城玩家只能继续普通落点建设。
- `quoteBuild(mode=active)`在v4按目标houseLevel+1取倍率[150,200,300,350]，名义费用=rounded(base,multiplier)。优惠预算为min(rounded(base,30),名义费用-rounded(base,150))，按原H1→资讯→H2→H3顺序扣减，只消耗实际非零优惠。实际最低rounded(base,150)，一级优惠零消耗。报价提供标准费、目标房级、名义倍率、优惠及实际费；普通normal/旧版本不改。
- v4订单独立模块 `operatingOrders`，状态含orderId、playerId、targetKind、targetId、listingEpoch、createdTurnId、upfront、paymentEach、paymentsRemaining、lastPaidTurnId、startedLapEpoch、cancelledReason。`active_order`新增原action事件内动作，不能用旧active_promote制造订单。
- `quoteOrder`只读验证本圈次数、在途订单、产权、抵押与现金；`startOrder`一次扣款；`settleAtTurnStart`在原prepareTurn身份/turnId确定后支付，同一turn只付一次，首次必须晚于createdTurnId。包括监狱/冻结的本人回合开始，其他玩家回合不支付。
- `cancelInvalidOrders`在原产权变化/抵押/破产/封盘处处理；成功购买新同名城市或挂牌不得复活旧单。未付订单不计资产估值，封盘取消后不补现金。
- v4股票 `stockBoughtTotal`仅保留已买股数资料，不新增圈上限；一次1–4，仍每回合一项。新增 `activeInvestment`，含购买圈、每城挂牌epoch/奖励股份数、bonusPaid和已处理派息receiptId；每个购买圈奖励上限1500。
- `rewardActiveDividend`只接stocks正常 `reason=go` 的基础现金派息，不以H4奖励为基础；数额=round(perShare×有效奖励股份×30%)，剩余额度不足截断。派息去重采用原settlementId。
- 所有股票卖出/转让/强制减持/清算出口调用 `reduceRewardShares`，优先扣奖励股份；新持有人不继承。挂牌epoch变化取消标记。
- 本人GO目前先refresh再结算自有城股息：v4在refresh前保留旧购买圈标记，允许本次本人起点中的正常自有城派息按旧圈1500预算计算，整个GO结算结束后 `expireInvestmentAtGo` 清除旧标记。不能在refresh时先丢资格或先刷新预算导致双领。

## UI与AI

`view`只投影本人冷却/订单/奖励股数及原因。客户端根据版本显示“经营订单 / 主动买股 / 远程建设”，旧局保留促销；股票子窗口1–4股，逐项显示金额、剩余圈额度和奖励说明。冷却期间仍可打开建设子窗口看原因，不自动弹全不可执行窗口。原放弃/关闭按钮保留。

AI沿用本人视图、动态现金储备和未来收入评价：订单估计两次本人回合能否发生及目标被清算风险；股息奖金只计预期实收并受有效份额/1500上限限制；建设不能透过旧别名避开冷却，不因最低支出自动强买。快速尾声对订单未结收入按无法收取处理。

## 流程与安全

服务端真实状态→报价→玩家主路线/目标选择→原请求包与决定身份→再次验证→一次提交→广播原状态/事件。现金或库存变化要求重新确认。订单和股息是已发生的银行奖励，未发生收入不进入资产；重复request/回放不能多领。规则缓存与资源版本实施时统一升级。

## 验证与决策

先用只读数值模型对比当前v3和候选v4：短/中/长、低/中/高价格、无租/本人成交活跃/投资目标活跃/双方活跃、股价下跌/平稳/上涨，以及H1/H2/H3叠加。模型不能代替生产引擎验收。实施后有限边界测试和一个联机场景，不做胜率海量模拟。

本方案降低建设频率而保留永久收益，订单提供可预期短期现金，投资取决于股价和真实派息。2026-10-13在Spec自审后通过；等待最终开发确认。
