# 第二轮平衡检验 Task

状态：实施文档按测试自行审批授权自审通过。按顺序执行，结果写progress与acceptance。

- T1 登记用户批准、自审与旧证据保护摘要；建立独立阶段目录/台账。
- T2 实现独立控制器的预算守卫、锁、原版本核对与退出恢复；文件scripts/review-balance.js、scripts/review-balance-sampling.js。逐类注解由scripts/review-balance-economy.js补充；B限定报表修复入口scripts/review-balance-calibration-report.js保留失败与原台账。
- T3 实现A六代表重放、终态核对与逐笔观察证据；复用原replay模块。
- T4 执行A原结果统计并保存独立报告；核对实际50000及原比较族。
- T5 实现C作用域与统计适配；文件scripts/balance-review-stats.js。
- T6 增加预算切换、恢复、不覆盖旧证据、300矩阵/版本和统计验证；文件test/balance-review.test.js。
- T7 B实际12局校准及吞吐记录，运行新增工具验证；核对首错规则。
- T8 根据B估计，在C首动作前冻结300计划或预登记完整组缩减方案，版本与种子独立。
- T9 C实际采样自动停止/切换，独立审计代表并生成报告；不依赖手动中断。
- T10 验证摘要/分母/分类及旧保护哈希，更新checklist与acceptance、readme和项目现状。独立核对入口scripts/review-balance-verify.js，玩家使用口径scripts/review-balance-player-usage.js；不追加对局。
- T11 提交相关代码与文档，原始大流水不整批提交；记录真人与未登记D阶段缺口。

依赖：T1→T2→T3→T4；T5/T6在新C执行前完成；T7→T8→T9→T10→T11。每项验证以实际命令/输出为证，未完成不勾选。
