# 购买募资与自救出售验收

日期：2026-10-12。Spec/Plan/Tasks/Checklist依据用户统一授权先独立编写、自审，再实现与验收。

## 问题和修复

1. 购地与机场募资只渲染抵押/拆房，同时动作白名单和引擎不允许该阶段卖股。补充只读资格守卫及原卖股动作阶段许可，复用按当前价变现与原请求去重；前端共用自救数量卖股组件。显示预计收入、实际现金与缺口，足额停止继续筹资卖股，仍须手动确认购买。
2. 自救拆房/出售引擎有限复验正常。实际浏览器直接出售进入等待买方，但公开快照遗漏sellerId，旧页面隐藏卖方弹窗、主要依赖短暂toast。补充公开出售方身份，持续显示卖方等待面板、买方及金额。成交或拒绝后自动恢复真实自救，context/resume仍不公开；没有更改成交或拆房收益规则。

## 实际结果

| 清单 | 结果与证据 |
|---|---|
| C1 | 通过：普通/快速×购地/机场×390×844、768×1024、1440×900共12组实际触控；清算股票禁用并显示原因，无股票显示空态 |
| C2 | 通过：先卖2股现金1000→5000，再卖5股至15000，实时缺口更新，未确认前产权无变化；手动购买成功；取消机场购买保留3000现金；城市取消原拍卖逻辑单位验证 |
| C3 | 通过：数量/现金足额/失效目标/错pending身份/旧报价拒绝无变更；实际Socket同请求只卖一次，非本人拒绝；原deadline保持；两个目标在个人到期及快速封盘拒绝变现 |
| C4 | 通过：引擎拆房、直接出售成功/失败、拍卖成交/流拍恢复上下文；手机点击拆房实际扣一级并到账，卖方显示等待，买方购买/拒绝后正确恢复自救 |
| C5 | 通过：有限服务端与原建房/自救回归、三端浏览器操作、旧PWA缓存升级及lint均通过；没有跑批量对局 |

- 服务端、快照及单位回归：**57/57**。
- 浏览器：**6/6**测试组（新三组包含12种目标/模式/屏幕组合，另含原建房与缓存回归）。
- lint：退出0。

原始日志：[服务端](../../artifacts/purchase-fundraising-unit.txt)、[浏览器](../../artifacts/purchase-fundraising-browser.txt)、[lint](../../artifacts/purchase-fundraising-lint.txt)。

```text
node --test --test-force-exit --test-concurrency=2 test/purchase-fundraising.test.js test/build-fundraising-stock.test.js test/action-validation.test.js test/quick-server.test.js test/gameplay-server.test.js test/gameplay-state.test.js
node --test --test-force-exit --test-concurrency=2 e2e/purchase-fundraising.spec.js e2e/build-fundraising-stock.spec.js e2e/cache.spec.js
node node_modules/eslint/bin/eslint.js src/purchaseFundraising.js src/actionValidation.js src/gameLogic.js src/gameView.js public/client.js test/purchase-fundraising.test.js test/quick-server.test.js e2e/purchase-fundraising.spec.js e2e/cache.spec.js
```

## 验证修正及交付

初次受限环境测试进程spawn EPERM，使用允许启动本地测试子进程的执行权限后通过。浏览器等待出售初验暴露快照缺sellerId，修复后复验通过；测试中一处选择器引号及lint的globalThis写法已纠正，最终日志均无失败。

当前资源`20261012-purchase-funding-v1`、缓存`global-tycoon-v21-purchase-funding`。本地开发与验收完成；尚未推送GitHub或部署Render。服务端部署后才启用购买筹资卖股，缓存升级不强制刷新正在玩的对局。本轮在本机Edge Chromium模拟三端视口，实体微信浏览器及Render公网未实测。
