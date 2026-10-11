# 2026-10-11玩家反馈整改索引

状态：2026-10-11用户明确批准全部未完成改进并要求继续开发，四个子项目均已完成本地实现与验收。各自Spec/Plan/Tasks/Checklist保持独立；当前证据见各acceptance.md。

| 子项目 | 已覆盖的问题 | 完整开发文档 |
|---|---|---|
| 移动端可玩性 | 竖屏占高、横屏拥挤、中央长台账、信息/操作层级；手机6×7蛇形视觉布局 | [Spec](mobile-playability/spec.md)、[Plan](mobile-playability/plan.md)、[Tasks](mobile-playability/task.md)、[Checklist](mobile-playability/checklist.md) |
| 股票窗口与列表 | 快速20秒过短，改为60秒；两模式加减股数列表跳动 | [Spec](quick-stock-time/spec.md)、[Plan](quick-stock-time/plan.md)、[Tasks](quick-stock-time/task.md)、[Checklist](quick-stock-time/checklist.md) |
| 建房募资卖股 | 有持股列表无卖出操作；增加有限建房筹资权限及实时缺口 | [Spec](build-fundraising-stock/spec.md)、[Plan](build-fundraising-stock/plan.md)、[Tasks](build-fundraising-stock/task.md)、[Checklist](build-fundraising-stock/checklist.md) |
| 主动经营提示 | 明确每回合成功一项，并单列每圈促销/买股/优惠额度 | [Spec](active-management-hints/spec.md)、[Plan](active-management-hints/plan.md)、[Tasks](active-management-hints/task.md)、[Checklist](active-management-hints/checklist.md) |

## 组合开发安排

如用户批准全部：先完成只读经营提示模型及股票稳定更新/筹资服务端许可，再接入移动端统一操作和信息区；保留各子项目有限测试，最终统一资源版本与PWA缓存后跑必要项目门槛。移动端开发先有独立离线demo和指定视口自审，不把旧长棋盘继续缩小当新方案。

四个项目共用client.js/style.css/index.html时按上述依赖顺序实施，避免重复模板、重复计时和多次缓存版本变更。各自任务/清单保留独立验收记录；已有未推送人机策略升级ece6460不包含这些修复，不应写成当前线上已改好。

如果只批准部分，则只实施对应范围；布局不能替代新增募资交易权限的批准。真实证据见各acceptance.md（开发完成后生成），按真实结果回填。推送和Render状态据实际核对，不由文档审批推断已部署。


## 最终本地验收

项目测试468/468，浏览器门槛与股票异常回执33/33，lint通过。四份验收报告：[手机布局](mobile-playability/acceptance.md)、[股票](quick-stock-time/acceptance.md)、[建房筹资](build-fundraising-stock/acceptance.md)、[经营提示](active-management-hints/acceptance.md)。未推送GitHub或部署Render；未实测实体微信浏览器。
