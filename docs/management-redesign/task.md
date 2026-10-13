# 每回合经营与机遇重做 Tasks

2026-10-13；四份文档先行并自行交叉审查，依据用户执行授权开发。每项完成须记录验证证据。

| 任务 | 文件 | 依赖 | 步骤与验证 |
|---|---|---|---|
| T1 | src/managementRules.js,state.js,gameplayCatalog.js,gameView.js | 无 | 新旧版本、参数与目录；检查旧夹具与新快照 |
| T2 | src/activeManagement.js | T1 | 三类报价及促销规则、required视图；固定费用与次数测试 |
| T3 | src/actionValidation.js,gameLogic.js,actionClock.js,server.js | T2 | 掷骰门禁、可信超时原子经营、快速45秒；伪造/全不可用/计时测试 |
| T4 | src/economy.js,stocks.js | T1 | H1–H7/H9–H11结算、优惠叠加；逐项边界与原版回归 |
| T5 | src/opportunities.js,opportunityRoutes.js,gameLogic.js | T4 | H8访问与H12凭据；刷新/换路线不重复领取测试 |
| T6 | src/botPolicy.js,botEvaluation.js | T2–T5 | 必选fallback、新收益估值；有限策略固定场景 |
| T7 | public/client.js,contextual-rules.js | T2–T5 | 单入口、两级选择、前后费用与效果、请求生命周期；浏览器选择返回执行 |
| T8 | public/style.css | T7 | 四种布局操作栏与弹窗；320/768/1440/844×280检查 |
| T9 | scripts/build-rules-catalog.js,public/rules-catalog.js,rules.md,readme.md | T1–T8 | 新版规则、版本说明、生成目录；同步校验 |
| T10 | public/index.html,sw.js,e2e/cache.spec.js | T7–T9 | 缓存版本同步；缓存回归 |
| T11 | test/management-redesign.test.js,e2e/management-redesign.spec.js | T1–T10 | 固定数值、幂等、超时、AI、三端受控场景；不运行大量整局 |
| T12 | docs/management-redesign/checklist.md,acceptance.md | T11 | lint及必要回归，真实验收结果、风险、提交本轮相关文件 |

进度：T1–T12均完成。费用/规则/回执/布局与回归证据见 acceptance.md；文档自审已逐项核对。
