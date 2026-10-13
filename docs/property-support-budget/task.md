# 一次预算选购 Tasks

1. T1 src/propertySupport.js、src/state.js：v2池、报价/完整计划与v1兼容；验证固定边界及历史规则。
2. T2 src/actionValidation.js、src/gameLogic.js：批量校验/提交，原循环产权与一次扣款；验证失败原子、重复和上市/圈计数。
3. T3 src/botPolicy.js、src/gameView.js、记录/回放：版本动作与私有view一致；有限AI及回放回归。
4. T4 public/index.html、client.js、style.css：独立弹窗、隐藏常态、勾选/总价、报价变化、重连/迟到回执与提示优先；三端真实浏览器。
5. T5 rules.md、缓存与e2e/cache.spec.js、test/property-support-budget.test.js、e2e/property-support-budget.spec.js、package.json：规则、资源、有限验收；记录acceptance并仅本地提交。

依赖T1→T2→T3/T4→T5。2026-10-13依据草案审批和文档自审权限审查通过；2026-10-14 T1–T5已实施并完成有限验收，见acceptance.md。仅本地保存。
