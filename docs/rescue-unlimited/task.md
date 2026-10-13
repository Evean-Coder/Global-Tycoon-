# 自救身份、原因与无限时 Tasks

## T1：无期限决定

文件：`src/actionClock.js`、`server.js`。依赖：四份文档自审。步骤：self_rescue无期限；同key稳定；无期限暂停恢复/视图；移除自动放弃。验证：action-clock及快速时钟/封盘有限测试。

## T2：付款资料

文件：`src/gameLogic.js`、`src/actionValidation.js`、`src/gameView.js`。依赖：T1。步骤：记录已知付款事实；出售/拍卖上下文保留资料；安全投影。验证：真实租金、机场、出售恢复与原资金回归。

## T3：三端信息与规则

文件：`public/client.js`、`public/style.css`、`rules.md`。依赖：T1/T2。步骤：共用原因格式化，窗口顶部与玩家面板显示；无期限计时文案；修正规则45秒与无资产自动破产描述。验证：PC/平板/手机有限显示、筹资与放弃场景。

## T4：缓存与验收

文件：`public/index.html`、`public/sw.js`、`e2e/cache.spec.js`、`test/rescue-unlimited.test.js`、`e2e/rescue-unlimited.spec.js`、`package.json`、本目录验收、`readme.md`、`docs/项目现状.md`。依赖：T1–T3。步骤：v37资源同步，必要回归和lint/差异检查，记录结果，仅本地提交。验证：实际日志和有限截图。

## 审查

2026-10-13：Plan自审后审查通过，T1→T2→T3→T4依赖明确，不运行大量完整局。

## 执行状态

T1–T4 已完成，实际结果见 [验收](acceptance.md)。仅本地保存。
