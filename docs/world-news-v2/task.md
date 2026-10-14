# 环球资讯玩法增强 Tasks

Plan自审通过。
T1 src/worldEvents.js/gameplayCatalog.js/state.js/gameView.js/server.js：版本/参数/目录，保持袋与轮次。
T2 src/economy.js/operatingOrders.js/record.js：真实报价和临时支持，去重及边界验证。
T3 src/botEvaluation.js/public/client.js/rules-catalog.js/生成脚本：真实参数/说明/预期，保留旧局。
T4 test/remaining-mechanics.test.js/e2e/remaining-mechanics.spec.js（与任务/离线共用固定场景）：有限金额矩阵/订单/三端/旧局/封盘。
T5 rules/缓存/索引/本目录：lint及实际验收，本地提交不推送。
依赖T1→T2→T3→T4→T5。

2026-10-14：T项代码与文档实施完成，固定测试文件采用共用场景去重，实际验证见acceptance.md；仅本地提交。
