# 手机信息缺失修复验收

日期：2026-10-11。状态：本地修复与限定验收完成；用户已要求推送。本文件记录本地验收结果，Render部署结果需另行核对。

## 复现与原因

真实双真人1v1与真人/电脑1v1都能复现，和电脑策略无关。390px下滚动容器高度569px，默认Grid将第一行分配为17.0312px，棋盘实际高1368px；侧栏顶部121.0312px，棋盘底部1462px。侧栏存在于状态与DOM，却被后绘制的棋盘和台账覆盖。仅检查文字存在、display属性或是否可滚动到无法识别这一问题。

新回归在修复前两项均失败（320px侧栏不在棋盘之后）。修改内容高度行后两项通过，同时以elementFromPoint验证信息实际未被遮挡。

## 已修复

- 1080px以内Grid按内容高度排列，玩家、事件和原有操作位于完整棋盘之后。
- 手机台账显示真实本人名称；资产数字、四类统计、查看/经营入口与说明分层，取消遗留窄屏隐藏规则。
- 地图仍完整显示，手机棋盘42格保持原顺序。提示明确玩家与事件位于棋盘下方。
- 静态URL更新为20261011-mobile-info-v1，缓存更新为global-tycoon-v16-mobile-info；不主动刷新进行中的对局。

## 验证

Node20运行以下6个测试文件，17项全部通过：

```text
node --test --test-force-exit e2e/mobile-information.spec.js e2e/atlas.spec.js e2e/atlas-details.spec.js e2e/active-management.spec.js e2e/bot.spec.js e2e/cache.spec.js
```

包括真人与人机320/390/430/768px下方信息真实可见、查看/缩放不提交动作或更换决定；既有三端地图、价格、棋子、股票转让返回、自救数量和缺口、建房募资、主动经营、200%缩放、AI开局及缓存升级流程。

证据：`evidence/mobile-information-human.json`、`evidence/mobile-information-bot.json`；`evidence/phone-center-human.png`、`evidence/phone-center-bot.png`与`evidence/phone-information-human.png`、`evidence/phone-information-bot.png`。

验证范围是本地Edge/Chromium手机视口与触屏模拟；未声称已在用户实际手机浏览器或Render新版本验证。此次未改引擎、玩法、AI决策、Socket事件或计时规则。
