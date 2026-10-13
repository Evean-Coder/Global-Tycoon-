# 手机横屏居中台账 Tasks

## T1：布局和滚动

文件：`public/client.js`、`public/style.css`。依赖：四份文档自审完成。步骤：横屏宽高取地图72%，中心对齐；移除最大宽度和视口高度限制；内容维持自然高度及内部滚动。验证：有限四视口比例、中心、内边界与滚动测量。

## T2：资源缓存

文件：`public/index.html`、`public/sw.js`、`e2e/cache.spec.js`。依赖：T1。步骤：统一资源版本和 v34 缓存。验证：旧缓存升级用例。

## T3：验收与进度

文件：`e2e/mobile-ledger-centered.spec.js`、`package.json`、本目录验收、`readme.md`、`docs/项目现状.md`。依赖：T1/T2。步骤：真实开局、受控长内容、触屏资产/地块、PC恢复；保存截图，执行布局/缓存回归和lint；更新记录，仅本地提交。验证：实际输出、截图与差异检查。

## 审查

2026-10-13：Plan 自审后审核通过，T1 → T2 → T3 顺序明确，验证覆盖全部需求。

## 执行状态

T1–T3 已完成，见 [实际验收](acceptance.md)。仅本地提交，未推送。
