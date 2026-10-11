# 人机经营策略升级验收

日期：2026-10-11。状态：用户已确认按四份方案开发；实施和验收完成，仅本地提交，尚未推送或部署。

## 实施结果

新增 `src/botEvaluation.js` 只读评估模块，更新 `src/botPolicy.js` 的经营、股票、飞行、转让、竞拍、机遇、自救和募资判断。服务器提供与真人相同的公开快速时限，并仅在原动作成功后记忆卖出事实；本人快照补充原主动经营次数事实 `usedThisTurn`。继续通过原动作入口和校验执行，不修改价格、收益、胜负、倒计时或调度规则。

普通模式预测最多8步；快速模式按公开剩余时间和轮次速度缩短视野。现金储备为向上取整的 `6000 + 0.6 × 下一步最高已知费用 + 2 × 下一轮开支`；收入按每步0.92折扣。股票风险约束为总持仓不超过正总资产25%、单城10%，同时遵守原股数和窗口额度。未知牌序、他人机遇候选及隐藏骰袋不参与决策。

## 实际验证

| 检查 | 最终结果 | 证据 |
|---|---|---|
| 评估、策略、原政策、调度和真实服务端专项 | 73通过，0失败 | [targeted.txt](../../artifacts/ai-strategy/targeted.txt) |
| 完整项目测试，与 `npm test` 相同入口 | 459通过，0失败 | [full-tests.txt](../../artifacts/ai-strategy/full-tests.txt) |
| 原六组浏览器门槛，与 `npm run test:e2e` 相同入口 | 13通过，0失败 | [e2e.txt](../../artifacts/ai-strategy/e2e.txt) |
| 原项目 ESLint 门槛 | 退出码0，无诊断 | [lint.txt](../../artifacts/ai-strategy/lint.txt) |
| 固定语义场景对照 | 36场景全部符合独立预期；相较0f6d3cc有16个动作改变、20个保持 | [fixed-scenarios.json](../../artifacts/ai-strategy/fixed-scenarios.json) |
| 普通/快速真实服务器受控轨迹 | 各6个记录决定、7个成功电脑回执（包括初始选择），指定阶段完成后停止 | [server-trajectories.json](../../artifacts/ai-strategy/server-trajectories.json) |
| 100个固定快照性能 | CPU P50/P95/最大为0/16/31ms；实际耗时P95约4.83ms、最大约12.04ms | [performance.json](../../artifacts/ai-strategy/performance.json) |

性能环境：Node v20.20.2、Windows、Intel Core i7-14650HX；每个快照4人20城，覆盖经营、股票、自救、机遇，100个快照不是100局。Windows进程CPU计时粒度较粗，短样本可能显示0，不能解释为零计算成本。CPU P95低于50ms目标；本地性能不代表Render网络响应。

固定场景通过改变风险、票价、资产、时间、基金和机遇事实检查行为，而非用实现评分作为预期答案。检查含卖股精确补缺、合法额度、同窗口不回购、产权转移、募资可行性、输入不可变和记忆隔离；必要场景调用原规范化、动作引擎或服务器入口。改变的16个动作符合场景事先定义的理由，没有发现安全场景退化。

有限联机覆盖购买、股票、自救、飞行及原阶段恢复，普通和快速各设最多24个决定上限，实际各记录6个。另有封盘、结束、真人离线/重连、重复任务和旧对局隔离检查。三端浏览器实际运行1440×900、768×1024、390×844的添加/移除电脑、开局、选择、掷骰和思考提示流程，无新增页面错误或横向溢出。

## 可重复命令

使用实际Node20执行以下与项目门槛一致的入口，输出保存至上表目录：

```powershell
$aiNodeExe = 'C:/Users/Yifan/AppData/Local/npm-cache/_npx/ebaba8b9e55fd0a9/node_modules/node/bin/node.exe'
& $aiNodeExe --test test/bot-evaluation.test.js test/bot-strategy.test.js test/bot-policy.test.js test/bot-scheduler.test.js test/bot-server.test.js
& $aiNodeExe --test --test-force-exit
& $aiNodeExe --test --test-force-exit e2e/flow.spec.js e2e/gameplay.spec.js e2e/responsive.spec.js e2e/cache.spec.js e2e/mobile-information.spec.js e2e/bot.spec.js
& $aiNodeExe node_modules/eslint/bin/eslint.js server.js src scripts public/client.js test e2e
git diff --check
```

## 校对和修复记录

原策略“固定建设/从不飞”的两处默认动作断言，改为收益值得和不值得的明确场景，保留原动作规范化覆盖。新增机遇预算场景最初夹具已持有第三城，修正持股夹具后检查缺少预算时的真实预期，未修改游戏规则。

核对原引擎后，技术设计和估值明确：城市转让结清原股息基金但保留已有股份；抵押利息按每完整轮5%本金计。对应回归通过，未改变正式规则。

## 清单与范围

C1–C22由评估、固定策略、原政策及真实服务端测试验证；C23为原调度/生命周期；C24为36个场景对照；C25为100快照性能；C26为两条有限联机轨迹；C27为三端电脑浏览器流程；C28为完整项目门槛；C29为本记录及README、初版验收索引。任务T1–T20及清单C1–C29已回填。

这是有限预测和固定场景的决策升级：监狱后续移动、未知卡牌位移和未来经营采用有限近似，不学习对手、不使用外部模型、不读取隐藏随机结果。当前证据说明指定决策改善和流程可用，不等同于总体胜率或最优策略证明。没有运行大量完整对局；本轮尚未上线。
