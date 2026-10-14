# 环球资讯玩法增强 Plan

Spec自审通过。

1. state/worldRevision新局world-news-v2；worldEvents.effectRules(s)统一只读数值，catalogForWorld按版本给名称描述；draw仍原类型袋/地区袋/remaining3。
2. economy.quoteRent/quoteBuild/quoteFlight读取版本参数，建设沿原offer预算，不绕过150%底线，机票叠加券/H7/资讯共用60%。旧版继续15%/3000、15%/2000、30%及原上限。
3. operatingOrders.settleAtTurnStart先按原order一次付base，再由当前stable且worldRevision计算extra=min(round(base,10),150)，纳入同一个turn去重，独立world_order_reward事件/统计；不改order.paymentEach，UI明示临时额外支持。
4. snapshot公开worldRevision，客户端按真实catalog/报价说明，AI worldRent/费用预测同步数值并受实际持续期限制。规则目录静态新局说明与旧局snapshot目录区分，缓存升级。
5. 独立矩阵涵盖20城/房级/正负事件/优惠、无所有权、免费、订单重复与零收入；快速封盘及旧版有限回归，三端阅读不重置。
