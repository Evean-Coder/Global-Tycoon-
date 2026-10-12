# 抵押赎回 Tasks

依据Spec/Plan及用户统一开发授权，自审完成。

- [x] T1 src/mortgageRedemption.js、src/actionValidation.js、src/gameLogic.js统一资格与费用，移除落点限制；test/mortgage-redemption.test.js验证安全及经济结果。
- [x] T2 src/gameView.js新增本人赎回报价；public/client.js银行、资产行、城市详情接入，区分bank/build持久视图，验证滚动和强制阶段不被覆盖。
- [x] T3 test/gameLogic.test.js更新赎回位置预期，test/gameplay-server.test.js和test/quick-server.test.js验证重复、身份、计时和封盘；e2e/mortgage-redemption.spec.js三端完整流程。
- [x] T4 rules.md/public/client.js规则、readme.md/docs/项目现状.md同步；public/index.html/public/sw.js/e2e/cache.spec.js和package.json登记新缓存/浏览器测试。
- [x] T5 有限服务端、浏览器、原建房及lint验证，回填checklist/acceptance，保存本地提交。

依赖T1→T2→T3→T4→T5。

实际结果与部署状态见[acceptance.md](acceptance.md)。
