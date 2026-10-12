# 银行抵押列表布局 Tasks

依据自审Spec/Plan，开发使用既有统一授权。

- [x] T1 public/client.js：自然流银行容器、独立抵押行，保留动作/补丁/草稿；验证真实抵押。
- [x] T2 public/style.css：自然高度、名称换行、44px按钮，依赖T1；验证三端/低高度横屏。
- [x] T3 e2e/bank-mortgage-layout.spec.js及e2e/mortgage-redemption.spec.js：多资产及外层滚动；依赖T1/T2，回归建房募资。
- [x] T4 public/index.html、public/sw.js、e2e/cache.spec.js、package.json：同步资源/缓存与测试入口；验证缓存/lint。
- [x] T5 readme.md、docs/项目现状.md与acceptance.md：记录证据/限制、更新检查并限定提交；依赖T3/T4。
