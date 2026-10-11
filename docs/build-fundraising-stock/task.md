# 建房募资卖股 Tasks

依据：Spec、Plan。状态：2026-10-11用户统一批准开发；实现与实际验证见 acceptance.md。

| 任务 | 文件 | 依赖 | 步骤 | 验证 |
|---|---|---|---|---|
| T1 [x] | test/action-validation.test.js、test/build-fundraising-stock.test.js | 无 | 创建固定建房费7200/现金1000/4股2000样例，标明阶段/位置/buildReady；枚举非法筹资情况 | AC1–AC3/AC7，先有独立预期 |
| T2 [x] | src/actionValidation.js、test/build-fundraising-stock.test.js | T1 | 有限开放build_decide的rescue_sell_stock，校验建房资格、缺口、显式shares及报价；self_rescue保持原规则 | 非建房/足额/错位置/满级/抵押/失效持股不通过 |
| T3 [x] | src/gameLogic.js、test/build-fundraising-stock.test.js | T2 | 同步原引擎阶段保护，出售复用一次结算；建房日志区分，self_rescue才执行原自救结束 | 卖2股两次真实现金/持股/缺口；原phase和优惠保持 |
| T4 [x] | test/quick-server.test.js、原Socket夹具 | T3 | 真实身份动作、重复/迟到/失败回执、建房期限与快速总截止 | AC4/AC6/AC8：只变现一次，封盘不能成交 |
| T5 [x] | public/client.js | T3 | 本人合法建房银行持股卡添加数量输入/加减、预计收入和卖出按钮，复用sendAction | 整数及持股上限，非建房银行仍只读 |
| T6 [x] | public/client.js、public/style.css | T5 | 引入只读导航上下文，真实状态更新保持筹资页；局部更新现金/报价/缺口、股数、焦点与滚动 | 不足→2200→0，足额后禁用卖股，返回手动建房 |
| T7 [x] | public/client.js、rules.md、readme.md、public/client.js中的规则主题（目录数据未变） | T6 | 建房帮助解释有限卖股与不可回滚；当前“买卖必须起点”文案补明确例外 | AC9：普通银行、自救、起点及建房权限表述一致 |
| T8 [x] | public/index.html、public/sw.js、e2e/cache.spec.js | T7 | 同步静态版本和缓存名；若组合交付与股票窗口项目合并一次资源版本 | 不刷新在玩的对局，相关新资源可加载 |
| T9 [x] | e2e/build-fundraising-stock.spec.js、e2e/atlas-details.spec.js、package.json | T4/T8 | 增加现有浏览器门槛，普通/快速三端固定卖股→更新缺口→返回→建设；原抵押建房回归 | 真实股数、收入、优惠、房级和时钟均正确 |
| T10 [x] | 原test/e2e/lint入口 | T9 | 校验、引擎、Socket、原自救/起点及必要完整项目门槛；失败修复后记录 | 无扩大未批准权限或降低覆盖 |
| T11 [x] | docs/build-fundraising-stock/acceptance.md、task.md、checklist.md、readme.md | T10 | 记录真实结果、证据和有限覆盖，逐项回填；注明是否提交/推送/部署 | 文档与实际状态一致 |

## 文件核对与执行

已用rg核对原校验文件为test/action-validation.test.js；新固定场景、服务端和浏览器测试均纳入项目原自动发现或显式浏览器入口。实际证据见 acceptance.md，保存在 `artifacts/player-feedback-*.txt`；不得把新增权限伪装成只改按钮。保留工作区原rules.md等已有改动，只提交本轮差异。仅实际通过后勾选。



## 本轮执行记录

2026-10-11已按实际结果回填；逐项证据、测试命令与环境限制见[验收报告](acceptance.md)。本轮未推送或部署Render。
