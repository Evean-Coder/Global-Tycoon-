# 股票时限与稳定列表验收

状态：实现完成；本地有限验收通过。对应 Tasks T1–T10/T5a/T5b、Checklist C1–C20。

## 实际交付

快速模式新的起点股票窗口提供最多60秒；普通股票60秒不变。原一般决定20秒、自救45秒及机遇时限保持。整局剩余不足60秒时，以整局截止为上限。弹窗内显示同一决定时钟，不新增计时循环。

股票卡片、按钮和已展开说明保持节点身份；同窗口数量变化、报价更新与资料返回保持草稿/滚动参照，新窗口清理旧草稿。买卖互斥仍按原规则处理。

## 逐项证据

| 清单 | 实际结果与证据 |
|---|---|
| C1–C3/C6 | `test/quick-clock.test.js`逐阶段期限；`test/quick-server.test.js`同窗口报价截止不变、新窗口60秒；原校验/窗口测试拒绝失效、重复及非法订单 |
| C4/C5 | QS09真实Socket：5秒后转让、再过5秒拒绝，原窗口剩50秒；接收确认仍最多20秒，总截止取消未成交转让。原转让/时钟回归验证接受及恢复 |
| C7 | 原`test/action-clock.test.js`、`test/gameplay-server.test.js`与快速服务端认证重连/暂停预算回归；同窗口不刷新预算 |
| C8/C9 | 新真实Socket固定时钟：60秒到期离开股票阶段，新窗口重新60秒；整局剩8秒仅给8秒，同刻到期只封盘一次 |
| C10/C11 | `e2e/quick-stock-time.spec.js`手机/平板/PC显示60→50秒；确认订单后真实持股变化并进入原下一阶段；转让编辑返回截止不变 |
| C12–C15 | 玩家规则/速查、历史快速Spec/Plan修订索引和缓存同步；原缓存升级、严格版本失败、离线壳及共同门槛通过 |
| C16/C17 | 普通/快速，320/390/430px触屏：连续买卖加减、到额度禁用；滚动偏移≤2px、城市/按钮节点相同、details保持展开 |
| C18/C19 | 上方长报价文字增高后当前城市位置偏移≤2px；规则/资产/转让返回保持；PC Enter操作后焦点仍在原按钮；原回执回归覆盖新旧窗口隔离 |
| C20 | `e2e/usability-stocks.spec.js`原连续经过起点、报价变化、失败、迟到、重复、未确认及旧v1流程通过；实际资金/持股校验保持 |

所有表中“原回归”均来自本轮实际运行的项目或浏览器输出，不把历史截图当本轮证据。

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
