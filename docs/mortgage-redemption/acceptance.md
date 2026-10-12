# 抵押赎回验收

日期：2026-10-12。依据用户统一授权，四份开发文档独立自审后实现。

## 原因与修复

旧逻辑要求赎回时站在抵押城市，但落到自有抵押城市直接结束回合；银行及资产行也未提供赎回。现在本人正常待掷骰可赎回任意自有抵押城市，银行、资产行和详情显示入口及费用。

统一只读报价给出本金、累计利息、合计与支付后现金；前端携带真实报价，服务端重验当前资格。费用变化拒绝旧确认，无关资讯/revision变化不使相同费用失效。原无报价调用仍受实时资格与费用校验，兼容既有合法动作。

一次偿还只清除该城本金/利息与抵押，保留产权、房屋和另一城负债；恢复收租，不自动建房，不消耗经营次数或推进回合。银行kind=bank/build分别恢复，正常银行仅同一待掷骰决定保持并更新；新阶段由原强制弹窗接管。

## 实际检查

| 检查 | 结果与证据 |
|---|---|
| C1 | 通过：普通/快速×390×844、768×1024、1440×900，站在起点也能从银行赎回上海；手机资产行及地块详情入口实点验证 |
| C2 | 通过：房2上海本金22000、利息500、合计22500，现金50000→27500；不足/非本人/非抵押/错误阶段/失效费用拒绝；本人报价不公开到其他人的self |
| C3 | 通过：赎回后保留上海产权和房2、恢复正额租金，东京抵押和900利息保留；回合ID/phase/pending和经营次数不变；原本金5%计息回归通过 |
| C4 | 通过：正常与快速真实Socket重试只清偿一次、非本人拒绝、原deadline不变；正常断线重连保留余额及剩余预算，原回执仍可查询；快速封盘拒绝新赎回，两种先后顺序净资产均71500且封盘一次 |
| C5 | 通过：银行更新余额/负债/城市状态，滚动容器位置保留；阶段变为飞行后替换银行；原购地/机场募资、建房筹资、缓存升级及lint均通过 |

**服务端/单位99/99、浏览器9/9组、lint退出0。** 没有运行批量完整对局。

日志：[服务端](../../artifacts/mortgage-redemption-unit.txt)、[浏览器](../../artifacts/mortgage-redemption-browser.txt)、[lint](../../artifacts/mortgage-redemption-lint.txt)。

```text
node --test --test-force-exit --test-concurrency=2 test/mortgage-redemption.test.js test/gameLogic.test.js test/action-validation.test.js test/gameplay-server.test.js test/quick-server.test.js
node --test --test-force-exit --test-concurrency=2 e2e/mortgage-redemption.spec.js e2e/purchase-fundraising.spec.js e2e/build-fundraising-stock.spec.js e2e/cache.spec.js
node node_modules/eslint/bin/eslint.js src/mortgageRedemption.js src/actionValidation.js src/gameLogic.js src/gameView.js public/client.js test/mortgage-redemption.test.js test/gameLogic.test.js test/gameplay-server.test.js test/quick-server.test.js e2e/mortgage-redemption.spec.js e2e/cache.spec.js
```

## 复验记录与限制

浏览器初验纠正了手机银行须通过“更多”进入的测试路径，及快速fixture中未完成初始机遇的状态；补充费用稳定报价验证，避免无关revision变化造成相同费用被拒。银行城市列表自身也可滚动，按真实容器验证保留位置。最终有限回归全部通过。

资源`20261012-redemption-v1`，缓存`global-tycoon-v22-redemption`。本地完成，尚未推送GitHub或部署Render；上线须更新前后端并重启服务。三端使用本机Edge Chromium模拟视口，实体微信和Render公网本轮未实测。抵押两座上限、本金比例、计息、破产和AI策略本轮未改。
