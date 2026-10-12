# 购买募资与自救出售 Tasks

依据Spec/Plan；用户统一开发授权，自审完成。

- [x] T1 新增src/purchaseFundraising.js资格只读守卫；src/actionValidation.js、src/gameLogic.js扩展原卖股阶段，验证数量与原报价；test/purchase-fundraising.test.js证明失败不变更。
- [x] T2 public/client.js共用数量卖股，接入购买募资和原自救；src/gameView.js补齐公开出售方身份；保持实时现金/缺口、明确等待出售；三端浏览器复验。
- [x] T3 保留test/build-fundraising-stock.test.js的无效购买目标阶段断言；新增e2e/purchase-fundraising.spec.js及test/quick-server.test.js有限Socket回归，验证去重、截止与自救出售/拆房。
- [x] T4 rules.md、readme.md、docs/项目现状.md同步；public/index.html/public/sw.js/e2e/cache.spec.js版本一致，package.json登记浏览器测试。
- [x] T5 运行有限服务端/浏览器/lint，回填checklist和acceptance，保存本地提交。未部署不能标记上线。

依赖T1→T2→T3→T4→T5。

实际结果和部署状态见[acceptance.md](acceptance.md)。
