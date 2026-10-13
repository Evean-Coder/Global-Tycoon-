# 自救身份、原因与无限时 Plan

## 架构与数据

- `actionClock` 在 self_rescue 返回无期限决定：seconds=null、untimed=true；保留key/decisionId/actorId，不创建超时任务；同key同步不产生新决定。pause/resume支持无期限，expired始终false。
- `view/timerPayload` 透传untimed，前端停止计时并显示“自救无时限”或“自救暂停 · 无时限”。其他阶段沿用原时钟。server.defaultAction自救返回null。
- 自救pending增加可选 `payment` 事实：cityId、airportId、recipientId、amount、cardName等；startSelfRescue记录租金、机场、罚款及已知其他款项。gameView安全投影，出售上下文与恢复保留资料。不保存第二份现金/缺口，缺口仍取当前负现金。
- 客户端共用只读原因格式化，窗口顶部与玩家信息显示；旧pending.reason仍可用，无payment时不编造收款人或金额。

## 交互流程

原扣款导致负现金 → 记录原付款事实 → 无期限自救决定 → 抵押/拆房/卖股等原动作 → 现金足额由原引擎继续；主动rescue_done才可负现金破产。出售/拍卖按原独立子决定计时，恢复self_rescue后重新建立无期限决定。AI自救动作、快速总时钟和封盘与原实现兼容。

## 技术决策

无期限使用null及显式标志，不用巨大的伪倒计时；每个真实决定仍有稳定ID，避免部分筹资后回执失效。保留快速模式总时钟，取消自救自动放弃兜底。沿用通用弹窗布局；原因是顶部可见信息，三端一致。版本缓存升级v37。

## 验证与审查

假时间验证长期等待、同key同步与暂停恢复；引擎验证真实租金/机场资料和产权出售恢复；有限联机检查资料、部分卖股、足额与放弃、快速封盘和AI。2026-10-13，Spec自审后审查通过。
