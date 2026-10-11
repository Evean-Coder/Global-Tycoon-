# 主动经营次数提示验收

状态：实现完成；本地有限验收通过。对应 Tasks T1–T10、Checklist C1–C12。

## 实际交付

掷骰附近常显“本回合可经营1项，也可直接掷骰”，并提供直接入口；成功后变为已用，下次本人正常回合恢复。台账、动作栏、经营面板共用只读格式化。

每回合机会与每圈限制明确分列：促销一次、主动买股总4股/同城2股，以及远程施工机遇的首次优惠；不把优惠写成建设次数限制。不强制弹窗、不新增游戏计时、不改变服务端规则。

## 逐项证据

| 清单 | 实际结果与证据 |
|---|---|
| C1/C2/C7/C8/C11 | `e2e/active-management-hints.spec.js`普通/快速×手机/平板/PC：原入口打开、取消保留、原促销真实成功后已用、掷骰推进；受控下一本人回合未过圈恢复机会 |
| C3/C5/C10 | `test/active-management-hints.test.js`深冻结只读输入；可用/已用/无项目/非本人/监狱/冻结/暂停/旧局/缺字段分类；H1未选/未用/已用分别显示 |
| C2/C4/C5/C6 | 原`test/active-management.test.js`及服务端经营回归验证成功一次、失败不消耗、回合恢复、圈额度、真实起点重置与优惠；新增前端不写次数 |
| C6/C9 | 新入口调用原经营函数，掷骰保留原请求；状态只读且共享文案，额度从本人服务端快照读取，不增加公开私人字段 |
| C7–C9 | 三端动作/台账/面板及布局门槛通过，文字直接表达状态，不依赖颜色；原键盘/200%缩放/减少动画与报价/回执验证保持 |
| C12 | 缓存、静态版本及共同门槛通过；发布状态在下方明确记录 |

这是次数解释与可发现性整改；未修改三类经营价格/收益，不重新宣称数值胜率平衡已确认。

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
