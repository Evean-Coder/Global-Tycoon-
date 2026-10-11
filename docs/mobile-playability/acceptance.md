# 移动端可玩性验收

状态：实现完成；本地有限验收通过。对应 Tasks T1–T13、Checklist C1–C17。

## 实际交付

手机采用6列7行紧凑蛇形路线，编号0–41和原单骰/落点规则保持；取消中央长台账，资产/玩家/资讯/事件/更多分区查看。地图在更多区按3:2完整显示；PC中央地图完整显示，海洋色补齐矩形边缘。

竖屏底部为紧凑动作栏；意外横屏或低高度时动作放在右侧，棋盘在左侧内部滚动。无强制横屏或旋转阻挡；正常PC/平板保持周边棋盘。

## 实测尺寸

以下为布局稳定后的CSS尺寸，安全区另计，浏览器工具栏不计入应用顶部。

| 视口 | 顶部品牌/整局时间 | 棋盘视口高 | 信息区高 | 操作栏高 |
|---|---|---|---|---|
| 320×568 | 42/28 | 238 | 140 | 100 |
| 390×844 | 42/28 | 528 | 140 | 86 |
| 430×932 | 42/28 | 616 | 140 | 86 |
| 844×390 | 24/22 | 332 | 332 | 146，侧边 |
| 844×280 | 24/22 | 222 | 222 | 146，侧边 |

竖屏实际验证棋盘底≤信息区顶、信息区底≤动作栏顶且动作栏底在视口内；横屏验证左右分区不叠盖。以前6×17至少1326px的线路缩为7行（每行至少88px，长文字时按内容增高），移除地图中央长资产卡。旧用户截图只能判断拥挤现象，无法从图片像素推导旧CSS视口的准确高度；不编造精确前后占高差。

## 逐项证据

| 清单 | 实际结果与证据 |
|---|---|
| C1/C2 | `e2e/mobile-playability.spec.js`实测上表；320宽额外检查三个区域不重叠；七种视口无整页横向溢出、地块/标签实际触屏点击 |
| C3/C4 | `test/board-layout.test.js`42格唯一邻接；浏览器首末/转行详情，4个同格棋子旋转定位；动画途中resize后到真实第7格；原飞行真实动作回归 |
| C5/C6 | 原mobile-information保留完整名称、房级、抵押、玩家资产等文字/裁切检查；3:2独立地图contain完整显示；净资产/总资产按当前模式状态取值 |
| C7/C8 | 资产/玩家/资讯/事件/更多逐个切换并实际触达；1589条合成事件压力仍有限渲染，未把它称为用户原局重放 |
| C9/C10 | 原responsive验证九视口旋转后股票草稿/服务端状态/截止不变；低高度建房股数/焦点节点/滚动保持，真实出售和返回；844×280滚动后实际点击底部不飞 |
| C11/C12 | 真人双人、人机、4人固定状态及原连续经营浏览器流程通过；普通/快速共用展示；原创建/加入/选择/掷骰/股票/资产/建设/飞行/自救/结算行为校验保持 |
| C13/C14 | PC1440×900、平板768×1024/1024×768和九视口回归；两种期限、错误/离线原回归，真实200%默认缩放、键盘焦点和减少动画通过 |
| C15/C16 | 只修订被新Spec替代的旧手机几何断言，保留名称/产权/私有数据/真实点击；新helper纳入页面/PWA，旧缓存升级/严格版本失败/图片加载失败后备通过 |
| C17 | 本报告记录旧几何、实测量、截图与限制；实体微信/软键盘明确未实测，不标作通过 |

## 可核对的界面

[手机390×844](../../artifacts/mobile-playability/390x844.png)、[小屏320×568](../../artifacts/mobile-playability/320x568.png)、[横屏844×390](../../artifacts/mobile-playability/844x390.png)、[低高度844×280](../../artifacts/mobile-playability/844x280.png)、[量测JSON](../../artifacts/mobile-playability/measurements.json)。

[九视口与缩放量测](../../artifacts/mobile-playability/responsive/measurements.json)；[独立离线布局样例](demo.html)。截图是实际本地测试页面，离线样例金额/人物是标明的占位信息。

## 验证环境与发布状态

2026-10-11，本地 Node 20、真实 Socket.IO 服务及 Edge/Chromium 触屏模拟；Chrome 单独验证真实 200% 默认页面缩放。采用固定状态和有限操作，不跑大量完整对局，不据此推断整体胜率平衡。

共同门槛：项目测试 468/468；最终浏览器门槛（原11文件及股票回执回归）33/33通过，见[输出](../../artifacts/player-feedback-e2e.txt)；[lint](../../artifacts/player-feedback-lint.txt) 退出码0。新代码和资源已统一为 `20261011-playability-v1` / `global-tycoon-v18-playability`。

本轮为本地交付，未推送 GitHub，未部署或验证 Render。服务端须重启后载入修改；缓存升级沿原流程，进行中的对局不强制刷新。未实测用户实体手机、微信内置浏览器、实体软键盘和 Render 网络响应。

共同命令：

```text
node --test --test-force-exit --test-concurrency=2
node node_modules/eslint/bin/eslint.js server.js src scripts public/client.js public/board-layout.js public/contextual-rules.js test e2e
npm run test:e2e
node --test --test-force-exit e2e/usability-stocks.spec.js
```

[项目测试输出](../../artifacts/player-feedback-unit.txt)；[最终专项补验](../../artifacts/player-feedback-final-targeted.txt)。
