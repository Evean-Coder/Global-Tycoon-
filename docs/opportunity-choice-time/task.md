# 机遇选择时限 Tasks

依据Spec/Plan，用户统一授权。

- [x] T1 src/actionClock.js：统一60秒常量；固定时钟验证两模式、两阶段及原期限。
- [x] T2 test/opportunity-choice-time.test.js、test/gameplay-server.test.js、test/opportunity-routes-server.test.js、test/quick-clock.test.js、test/quick-server.test.js：更正期限、补到期及总余时边界；保留真实身份/回执/隐私保护。
- [x] T3 public/client.js、rules.md、readme.md、docs/项目现状.md及历史Spec/Plan索引：同步文案与覆盖关系。
- [x] T4 e2e/opportunity-choice-time.spec.js、e2e/opportunity-routes.spec.js、e2e/quick-mode.spec.js、e2e/cache.spec.js：三端60秒、返回不延时、提前确认；原回归。
- [x] T5 public/index.html/public/sw.js/e2e/cache.spec.js：统一新资源版本和缓存，运行有限测试及lint。
- [x] T6 acceptance.md：记录真实结果/有限环境/推送状态，回填任务与检查，保存本地提交。

依赖：T1→T2/T3→T4→T5→T6。

验收证据见[acceptance.md](acceptance.md)，本地完成，尚未推送或部署。
