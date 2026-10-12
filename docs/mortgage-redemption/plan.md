# 抵押赎回 Plan

依据Spec，用户统一授权下自审完成。

## 架构与接口

新增src/mortgageRedemption.js只读quote(state,playerId,cityId)，统一本人waiting_roll、无pending、存活、城市归属与抵押、现金足够条件；返回本金、利息、总额、支付后现金、原因及quoteVersion。原两种规则用同样安全整数费用。src/actionValidation.js校验报价与条件；既有无quoteVersion调用兼容，但服务端重算费用与资格；前端总是携带真实报价，旧报价拒绝。

src/gameLogic.js/redeem复用quote一次清偿，不校验落点，不结束回合或建设。不增新阶段；src/gameView.js仅本人quotes.redeem提供报价，旧快照前端可显示费用并依照现有服务端校验操作。

quoteVersion绑定对局、玩家、城市、产权、本金及利息，金额变化需重新确认；无关的公开revision或快速资讯预告不使相同费用失效。现金及当前阶段仍在提交时重验，原请求信封约束身份与决定。

public/client.js的银行、ledgerCityRow及openCityDetail接入赎回按钮与短原因。银行bankContext增加kind=bank/build；只有原本人waiting_roll的bank允许持久查看，建房筹资保留原kind=build及草稿逻辑。相同身份/决定的状态更新复用patchDisplayNode保留滚动；关闭、换阶段或换决定清空，不能覆盖强制决定弹窗。

## 交互与验证

本人待掷骰→银行查看逐城本金/利息→确认赎回→原请求信封/报价/资格重验→一次扣款→快照更新银行→继续原掷骰。错误说明当前条件，费用变化要求按新报价重新操作。快速整局封盘沿原规则优先。

有限单位与Socket验证费用/重复/截止/身份，三端浏览器远程赎回及银行保持；原落点与资金回归更新相应赎回位置断言，不删金额保护。同步规则与PWA版本，无强制刷新。
