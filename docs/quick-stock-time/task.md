# 股票操作时限与列表稳定性 Tasks

依据：spec.md、plan.md。状态：2026-10-11用户统一批准开发；实现与实际验证见 acceptance.md。

## 文件与有序任务

| 任务 | 文件 | 依赖 | 步骤 | 验证 |
|---|---|---|---|---|
| T1 [x] | src/actionClock.js、test/quick-clock.test.js | 无 | 导出股票60秒常量；仅快速stock使用，逐类期限测试调整 | AC1：股票60秒，其余期限及同决定收紧保持 |
| T2 [x] | server.js、test/quick-server.test.js | T1 | 股票窗口预算使用统一常量；同窗口保留截止；更新QS09并增加新窗口检查 | AC2/AC3：报价不刷新，转让5秒后拒绝恢复55秒；完整5+5秒样例恢复50秒 |
| T3 [x] | test/quick-server.test.js、test/action-clock.test.js | T2 | 补充60秒到期、整局仅剩8秒、同时截止及过期返回 | AC5/AC6：只封盘或沿原股票结束，资金和下一阶段正确 |
| T4 [x] | test/quick-server.test.js、test/gameplay-server.test.js | T2 | 核验认证重连、离线暂停/恢复、旧窗口及换局预算隔离 | AC8：同窗口不补时，总截止仍生效 |
| T5 [x] | public/index.html、public/client.js、public/style.css | T2 | 股票弹窗增加相邻时间提示，复用原displayTimer与循环；开启/暂停/终局同步 | AC4：提示与原决定时间一致，三端不遮挡操作 |
| T5a [x] | public/client.js、public/style.css（仅必要布局稳定修订） | T5 | 将renderStock拆成稳定城市节点的创建/更新；复用预览更新全部额度及费用，保留按钮/details/委托 | AC9/AC10：两模式加减不重建列表，展开与节点身份保持，额度全局变化正确 |
| T5b [x] | public/client.js | T5a | 核对真实滚动容器，补充同窗口浏览参照及高度变化补偿；禁用焦点防滚动、资料返回恢复、新窗口清理 | AC9–AC11：中部/底部及返回无跳顶，手动滚动不被延时恢复覆盖 |
| T6 [x] | public/client.js、public/rules-catalog.js（仅相关现有条目）、rules.md、readme.md、docs/quick-mode/spec.md、docs/quick-mode/plan.md | T5 | 核对并更新玩家快速时限说明；原Spec/Plan添加本次批准后修订索引，历史验收结果保留 | AC7：不再把股票算在一般20秒中，无重复矛盾文案 |
| T7 [x] | public/index.html、public/sw.js、e2e/cache.spec.js | T5b/T6 | 同步资源查询版本和缓存名，沿用原升级流程 | 新页面资源一致，进行中对局不主动刷新 |
| T8 [x] | e2e/quick-stock-time.spec.js、package.json、e2e/usability-stocks.spec.js（复用原回执场景） | T3–T7 | 加入原浏览器门槛；三端倒计时，普通/快速手机长列表的加减、触达额度、已展开说明、状态更新及资料返回；原交易回执场景必要回归 | AC2/AC4/AC6/AC9–AC11；滚动偏移、卡片/按钮身份与现金/持股实际断言 |
| T9 [x] | 原测试与lint入口 | T8 | 先运行受影响时钟、快速服务端、股票和客户端流程，再执行原项目必要发布门槛 | 无降低原覆盖；失败先修复再记录 |
| T10 [x] | docs/quick-stock-time/acceptance.md、checklist.md、task.md、readme.md | T9 | 记录实际命令、数量、时间边界、截图/输出、提交与部署状态，按证据回填 | 文档不把计划写成已通过，不声称已上线 |

## 执行与自审

共12项任务（T1–T10及T5a/T5b）。仅实施本轮范围，保留人机升级和其他工作区改动。按依赖执行，实际验证后再勾选。先检查当前测试夹具的时钟和身份，不虚构不存在的测试辅助文件。T8加入现有浏览器入口，避免新增测试未被CI执行。实际证据见 acceptance.md，保存在 `artifacts/player-feedback-*.txt`，不运行大量完整对局。移动滚动证据包含点击前后容器偏移和当前城市位置，不能只保存顶端截图。



## 本轮执行记录

2026-10-11已按实际结果回填；逐项证据、测试命令与环境限制见[验收报告](acceptance.md)。本轮未推送或部署Render。
