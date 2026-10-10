# 快速模式验证日志

2026-10-10：Node20 v20.20.2，同进程执行quick-clock，QC01–QC04共4/4通过，0失败；新模块语法及定向lint通过。

经济组首次QM01–QM09共9/9通过；定向lint发现测试中的structuredClone未限定globalThis，修复后复验再登记任务完成。

G2修复：测试全局名称改为globalThis.structuredClone；QM10按现有引擎返回的events核对破产，而非不存在的changed字段。最终Node20 QM+R-M 43/43通过、0失败，见economy-tests.txt。未修改普通拍卖语义。

G3：QC+R-C 20/20；QS01–QS11最终11/11，日志clock-tests.txt/server-tests.txt。首次QS06未完成后续初始阶段导致陈旧决定，修正场景先合法完成三阶段；QS09补上既有windowId契约。补验证实际转让拒绝回原窗口仍15秒，没有重置到20秒。

G4最终：settlement-view-tests.txt 12/12；server-tests.txt 16/16；ordinary-server-tests.txt 12/12；route-server-tests.txt 13/13。上述数量为各组有效结果，未与先前复跑累加。server/src/test lint和gameView/record语法通过。

G5：首次浏览器启动受spawn EPERM限制；经自动审批在允许的环境运行，最终9/9通过。真实浏览器200%缩放的CSS视口720px、devicePixelRatio=2，无整页横向溢出。手机为模拟视口，未声称实机测试。
