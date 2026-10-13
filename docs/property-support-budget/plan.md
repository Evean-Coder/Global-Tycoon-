# 一次预算选购 Plan

版本REVISION改为property-support-v2，同时enabled识别v1。state按enabled初始化，server沿用REVISION默认启用。v1候选/单城购买/历史quote版本保持。

v2 candidates先判断所有非纽约/上海城市归属，再取未售且非交易占用的对应池；不根据现金过滤高价开放条件。按当前地价及棋盘序排序。本人view提供budgetAmount=20000、budgetPurchase=true、selectionVersion、剩余圈座数、候选单项报价和两高价是否开放。

quoteSelection(state,id,cityIds)检查资格/本人阶段、非空唯一数组、池内城市、总价安全整数、预算现金及圈额度，按棋盘序生成正式选择。selectionVersion绑定本人与回合、价格/产权/挂牌epoch、现金/圈额度、资格和候选池。原action内support_buy携带cityIds及该版本；v1沿用cityId。

gameLogic先验证完整计划，再一次扣总款并循环调用原stocks.transferCity取得产权、初始化上市、禁即时落点建设，最后增加座数/标记使用。不能首城后重新校验资格导致半成品。server原copy-before-apply及重复请求机制保留。

新增独立propertySupportModal，避免原通用弹窗在广播时关闭。主窗口含勾选列表、预算/现金/座数/总价，底部暂不与确认。只绑定本人gameId+turnId；报价变动清选择并提示重选，普通广播无变化不重绘。原请求查询沿activeRequest.retrieve，旧结果不能影响新key。

通知优先于可选经营，旋转/机遇/强制决定优先。关闭后可继续原经营提示；平时不在台账展示。AI对v2使用预算动作格式，可保留原最优单城偏好（多城不是强制）。规则分版本显示，缓存同步。

自审：2026-10-13，按已批准草案覆盖全部Spec，复用原引擎，无新Socket事件。
