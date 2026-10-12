# 取消抵押数量上限 Tasks

四份文档按既有授权自审，用户明确批准本轮修改与推送。

- [x] T1 src/gameLogic.js：移除普通与自救数量守卫；新增test/mortgage-unlimited.test.js固定第三/第四城、重复/非法/筹资验证。
- [x] T2 src/botEvaluation.js、src/botPolicy.js、scripts/balance/policy.js：全部合法城市候选、能力估算，更新test/bot-strategy.test.js并新增候选检查；依赖T1。
- [x] T3 public/client.js、rules.md：全入口禁用/显示与速查同步；依赖T1；浏览器实际三端抵押/筹资。
- [x] T4 e2e/bank-mortgage-layout.spec.js：取消旧上限断言，银行第三城与资产/详情/自救/筹资覆盖；public/index.html、sw.js、e2e/cache.spec.js版本同步；依赖T3。
- [x] T5 有限单元/Socket/浏览器回归及lint，完整CI门槛按具体风险执行；依赖T1–T4。
- [ ] T6 readme.md、docs/项目现状.md及acceptance.md更新；限定提交并push main，核实远端与Render静态版本；依赖T5。
