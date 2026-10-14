# 离线推进 Tasks

Plan自审通过。
T1 src/disconnectPolicy.js/src/actionClock.js：只读阻断/保守动作/稳定键与独立job、精准剩余时间；固定fakeClock场景。
T2 src/state.js/gameView.js/record.js/server.js：版本、源校验与内部actor、计时/重连/广播/清理、原子提交；真实Socket与旧局回归。
T3 public/client.js：轻提示、20秒等待与自救原因，在线控件保持；三端有限浏览器。
T4 test/remaining-mechanics.test.js/test/remaining-server.test.js/e2e/remaining-mechanics.spec.js：单人/多人/同步/重断/自救/全离线/快速/旧局竞态。
T5 rules.md/缓存/package.json/本目录及索引：版本文案、lint、限定回归、验收提交。不推送。
依赖T1→T2→T3/T4→T5。

2026-10-14：T项代码与文档实施完成，固定测试文件采用共用场景去重，实际验证见acceptance.md；仅本地提交。
