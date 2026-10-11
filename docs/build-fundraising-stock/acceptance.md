# 建房募资按数量卖股验收

状态：实现完成；本地有限验收通过。对应 Tasks T1–T11、Checklist C1–C15。

## 实际交付

本人正常落点建房且现金不足时，募集资金页允许选择持股数量出售；服务端和引擎共用建房资格校验。普通银行仍为持股查看，购地募集资金不获得新卖股权限。

筹资成交后留在当前面板，更新现金、持股和真实缺口；达到建设金额后停止继续筹资出售，玩家返回自行确认建设。取消/超时不回滚已成交股份，不自动建设，不延长原决定。

## 逐项证据

| 清单 | 实际结果与证据 |
|---|---|
| C1–C4/C9 | `test/build-fundraising-stock.test.js`：明确整数股数、持股、报价、阶段、产权、位置、抵押目标、满级及buildReady保护；清算拒绝；历史/现代原卖股规则通过 |
| C2/C5 | 费用7200、现金1000、4股每股2000：卖2股→5000现金、缺2200；再卖2股→9000、缺0，房级仍0；手动建房后现金1800、房级1 |
| C5优惠 | H2样例费用6480；筹资不消费优惠，真正建设后消费一次，现金7000→520 |
| C6/C12 | `e2e/build-fundraising-stock.spec.js`：真实成交后保持面板、足额提示；低高度844×280长持股列表中，报价2000→2100保留股数/输入节点/滚动≤2px，卖2股现金5200、缺2000 |
| C7/C8 | `test/quick-server.test.js`真实Socket同actionId重放只出售一次、原截止不变；个人20秒到期后拒绝旧请求，保留已卖现金；快速总截止后禁止新出售 |
| C10 | 原自救/股市/抵押与建房测试、`e2e/atlas-details.spec.js`真实筹资返回流程及共同门槛通过；客户端按对局/决定清理上下文，未确认时只允许查询原请求 |
| C11 | 普通/快速分别在390×844、768×1024、1440×900运行选择股数→两次出售→真实缺口→返回→手动建设 |
| C13–C15 | 规则速查/银行文案明确建房不足的有限例外；独立共享资格模块无资金副作用；版本/缓存、lint、项目和浏览器门槛通过，记录发布限制 |

资金和股数判断由实际服务端状态验证，非示例文本断言。缺口与预计收入分开，未确认回执不自动另发卖股。

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
