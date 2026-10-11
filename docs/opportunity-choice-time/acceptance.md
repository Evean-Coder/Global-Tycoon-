# 机遇选择时限验收

日期：2026-10-11。依据用户统一开发授权，Spec → Plan → Tasks → Checklist 独立自审后实施。

## 改动

普通与快速模式的初始及后续同步三选一、个人路线调整，新决定统一60秒。只改变期限常量，不新增奖励、刷新机会或游戏动作。已开始的同份决定保留原截止，提前提交沿原流程推进。初始超时选当前首项，后续超时跳过；快速整局30分钟截止优先。

## 实际验证

| 检查 | 结果与证据 |
|---|---|
| C1 两模式/两阶段60秒及更新不补时 | 通过；固定时钟60→50秒，deadline不变，见新时钟测试与浏览器六组场景 |
| C2 暂停、重连、提前提交/跳过 | 通过；时钟保留剩余；原Socket提交、换组、重连测试继续通过；浏览器双方提前提交后立即待掷骰 |
| C3 原超时和请求保护 | 通过；原初始首项、路线跳过、失效身份、重复回执、私人候选及跨截止原子性测试均保留 |
| C4 整局截止优先 | 通过；两模式/两阶段时钟受控8秒预算；真实快速Socket封盘及同刻/跨截止确认测试证明取消未完成选择、仅封盘一次、无晚到奖励 |
| C5 三端显示和返回 | 通过；390×844、768×1024、1440×900，两模式同步与路线显示60秒，选候选再返回不改变deadline，跳过保留路线；一般和股票时限回归通过 |
| C6 规则、缓存、静态检查 | 通过；规则同步，历史Spec/Plan追加覆盖索引；缓存升级及资源版本检查通过，lint退出0 |

服务端/固定时钟/规则回归 **90/90**，浏览器回归 **25/25**，lint通过。均为有限固定场景，未运行批量完整对局。

原始输出：[单元与Socket](../../artifacts/opportunity-choice-time-unit.txt)、[浏览器](../../artifacts/opportunity-choice-time-e2e.txt)、[独立三端](../../artifacts/opportunity-choice-time-targeted.txt)、[lint](../../artifacts/opportunity-choice-time-lint.txt)。

复现命令（Node20）：

```text
node --test --test-force-exit --test-concurrency=2 test/opportunity-choice-time.test.js test/quick-clock.test.js test/action-clock.test.js test/gameplay-server.test.js test/opportunity-routes-server.test.js test/quick-server.test.js test/opportunity-routes.test.js test/opportunities.test.js
node --test --test-force-exit --test-concurrency=2 e2e/opportunity-choice-time.spec.js e2e/opportunity-routes.spec.js e2e/quick-mode.spec.js e2e/cache.spec.js
node node_modules/eslint/bin/eslint.js src/actionClock.js public/client.js test/opportunity-choice-time.test.js test/quick-clock.test.js test/gameplay-server.test.js test/opportunity-routes-server.test.js test/quick-server.test.js e2e/opportunity-choice-time.spec.js e2e/quick-mode.spec.js e2e/cache.spec.js
```

## 验证过程中修正

新浏览器测试最初跨普通/快速fixture时，遗留的快速心跳访问普通状态；停止旧计时后又因已关闭的测试时钟导致选择被拒绝。修正为完整、未关闭的受控快速时间接口，并等待双方界面实际渲染；最终25项全部通过。此修正仅用于测试fixture，正式快速时钟及动作处理未改。

## 交付与限制

本地开发验收完成。资源版本`20261011-choice-time-v1`，缓存`global-tycoon-v20-choice-time`。未推送GitHub、未部署Render；线上仍须部署并重启服务端才会使用新时限。缓存升级不强制刷新正在进行的对局。三端为本机Edge Chromium模拟视口，实体微信浏览器及Render公网本轮未实测。
