# 经营任务 Plan

Spec自审通过。

1. businessMissions模块管理p.businessMission={active,lastAcceptedLap,coupon,lastResult,seq}，新局版本初始化；候选根据当前已知资产/现金只读筛选。accept/abandon沿原action，仅本人waiting_roll，quoteVersion包含任务记录、现金、turnId、本人产权条件；其他玩家不能承接。
2. observeSettlement在econ.applySettlement成功后根据q.kind==='build'且q.managementMode!=='active'或q.kind==='flight'且finalAmount>0判断；状态owner/cash≥6000，完成生成一次coupon，active置空，lastResult持久。快照只给本人，公共事件只报道已发生完成，不广播候选/进度。
3. couponOffer返回只读折扣计划；econ按原H1/资讯/H2/H3后追加建设券、机票原优惠后追加券，使用相同总上限/最低费预算；q保存couponId和实际减额，commit在同一资金/房级提交后消费。没有实际优惠不消费，原失败或报价变化不发权益。
4. onGo放在原settleGo全部派息/奖励之后处理，lapEpoch与expiresAtLap稳定；出局/封盘clear，只读估值忽略coupon。任务/券状态进入privateReplay，公共record仅版本与完成/使用事件统计。
5. 独立只读任务窗口复用通用modal和阅读上下文，侧栏入口和资产概要显示状态；承接/放弃显式确认，不影响主动经营/骰子按钮顺序。规则上下文property/tasks。AI只有预期正常建设或飞行可达且足够储备/时间时承接，不修改既有投资行为来刷任务。
6. 测试普通/远程、飞机正额/免费、现金、券叠加、两次GO、去重/失败/封盘、私有和旧局；有限回放/真实Socket/三端。
