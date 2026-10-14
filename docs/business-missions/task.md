# 经营任务 Tasks

Plan自审通过。
T1 src/businessMissions.js/state.js/gameView.js：版本、资格/目标/承接/放弃/完成、券与期限私有状态。
T2 src/actionValidation.js/gameLogic.js/economy.js/stocks.js/record.js：原action内请求、settlement观察、coupon报价与一次消费、GO/出局/封盘；有限资金测试。
T3 public/index.html/client.js/contextual-rules.js/style.css：任务入口/详情/状态/规则，保持阅读和主操作顺序。
T4 src/botPolicy.js：可达/储备/尾盘自愿策略，仅本人view。
T5 test/remaining-mechanics.test.js/test/remaining-server.test.js/e2e/remaining-mechanics.spec.js：固定边界、去重回放、有限两人真实操作、三端。
T6 缓存/规则/目录/文档：同步版本、lint、真实验收和本地提交。
依赖T1→T2→T3/T4→T5→T6。

2026-10-14：T项代码与文档实施完成，固定测试文件采用共用场景去重，实际验证见acceptance.md；仅本地提交。
