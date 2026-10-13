# 操作栏按钮顺序 Tasks

## T1：按钮顺序

文件：`public/index.html`、`public/client.js`、`public/style.css`。依赖：四份文档自审。步骤：DOM与响应同步将主动经营放在资产前；清理手机重复列定位并改为骰子左、经营右。验证：有限四类视口布局、两模式、原资产点击及交易继续位置。

## T2：缓存与记录

文件：`public/index.html`、`public/sw.js`、`e2e/cache.spec.js`、`e2e/action-button-order.spec.js`、`package.json`、本目录、`readme.md`、`docs/项目现状.md`。依赖：T1。步骤：同步v36资源；执行有限布局与缓存验证及lint/差异检查；记录结果，仅本地提交。验证：实际日志和测量。

## 审查

2026-10-13：Plan自审后审查通过，T1→T2，无新规则或大规模模拟。

## 执行状态

T1/T2 已完成，实际结果见 [验收](acceptance.md)。仅本地提交。
