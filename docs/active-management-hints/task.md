# 主动经营次数与提示 Tasks

依据：Spec、Plan。状态：2026-10-11用户统一批准开发；实现与实际验证见 acceptance.md。

| 任务 | 文件 | 依赖 | 实施步骤 | 验证 |
|---|---|---|---|---|
| T1 [x] | public/contextual-rules.js、test/contextual-rules.test.js、test/active-management-hints.test.js | 无 | 新增只读经营状态/额度文案格式化；区分未启用、特殊阶段、已用、可用、无项目及缺字段 | AC1/AC3，深冻结输入，未知字段不虚构许可 |
| T2 [x] | public/client.js、public/index.html（需要节点时） | T1 | renderActionBar添加状态/入口，调用原openActiveManagement；掷骰仍沿原请求 | AC1/AC6，无新动作或确认流程 |
| T3 [x] | public/client.js | T1/T2 | 台账与经营面板复用格式化，拆分回合机会与圈额度；H1优惠单列 | AC2–AC5，合法报价和原数量控件保持 |
| T4 [x] | public/style.css、public/client.js | T2/T3 | 三端紧凑布局、文字/图标强调、键盘关联及触控；不闪烁、不反复toast | AC7，原按钮与计时清晰可用 |
| T5 [x] | test/active-management.test.js、test/contextual-rules.test.js、test/active-management-hints.test.js | T3 | 新回合未过圈恢复、促销/买股/H1圈额度分别耗尽；取消/失败/特殊阶段/重连只读状态 | AC2–AC6，用原真实apply验证后展示 |
| T6 [x] | public/client.js、public/rules-catalog.js（必要条目）、rules.md、readme.md | T3 | 统一每回合成功一项与每圈额外限制，规则入口直接到对应说明 | AC8，文案逐项核对原模块 |
| T7 [x] | public/index.html、public/sw.js、e2e/cache.spec.js | T4/T6 | 同步资源版本和缓存，组合交付仅统一一次最终版本 | 新资源一致，不强制刷新在玩对局 |
| T8 [x] | e2e/active-management-hints.spec.js、package.json | T5/T7 | 纳入原浏览器门槛；普通/快速受控开局，三端看入口→取消→成功一项→已用→原掷骰推进 | AC1/AC2/AC6/AC7，实际状态/请求与布局断言 |
| T9 [x] | 原lint/test/e2e入口 | T8 | 执行受影响专项及必要完整项目门槛，失败先修复 | 不降低覆盖，不跑大量完整对局 |
| T10 [x] | docs/active-management-hints/acceptance.md、task.md、checklist.md、readme.md | T9 | 记录实际结果、截图、命令与版本，回填任务和检查 | 状态、提交、推送和部署据实说明 |

## 自审

10项任务覆盖数据解释、入口、额度分组、三端、真实动作和缓存；生产修改集中于前端，服务器规则不改。实际证据见 acceptance.md，保存在 `artifacts/player-feedback-*.txt`，仅实测通过后打勾。



## 本轮执行记录

2026-10-11已按实际结果回填；逐项证据、测试命令与环境限制见[验收报告](acceptance.md)。本轮未推送或部署Render。
