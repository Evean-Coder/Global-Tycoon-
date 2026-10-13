# 棋子半速移动 Tasks

## T1：时长

文件：`public/client.js`、`public/style.css`。依赖：四份文档自审通过。步骤：移动步长110→220ms、视觉过渡0.12→0.24s。验证：有限真实浏览器移动测量、状态排队、减少动画与最终位置。

## T2：缓存

文件：`public/index.html`、`public/sw.js`、`e2e/cache.spec.js`。依赖：T1。步骤：统一版本和v35缓存。验证：缓存升级用例。

## T3：验收记录

文件：`e2e/piece-speed.spec.js`、`package.json`、本目录验收、`readme.md`、`docs/项目现状.md`。依赖：T1/T2。步骤：记录实际结果，lint与差异检查，更新进度，仅本地提交。验证：对应日志与测量。

## 审查

2026-10-13：Plan自审后通过，顺序T1→T2→T3，无大规模模拟。

## 执行状态

T1–T3 已完成，见 [验收](acceptance.md)。仅本地提交。
