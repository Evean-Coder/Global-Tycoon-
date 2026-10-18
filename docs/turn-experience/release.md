# 回合体验整合：发布记录

日期：2026-10-18。18项开发任务已完成；34/36项验收观察完成，C25真机200%缩放和C35真人试玩仍未测。

## 提交与门禁

- 1857a11：可选经营、单次提醒、统一投入风险、股票清仓历史与本人收支回顾。
- b0e8c6f：中央地图与棋子几何观察修复，PWA v46／20261018-turn-experience-r2。
- 8ac5055：浏览器视口切换等待实际绘制，证据目录隔离，CI失败诊断。
- 上述提交均已推送origin/main；远端SHA已核对为8ac50551af054f383aebca0a5c1ab9f4c4827013。
- [完整GitHub CI](https://github.com/Evean-Coder/Global-Tycoon-/actions/runs/39110035304)：成功。安装、Lint、完整单元测试与完整82项浏览器清单均通过。最后的发布文档提交不再改变运行代码；本记录引用此已验证提交。

## Render实际核对

[线上游戏](https://global-tycoon-abx0.onrender.com/)的index.html、sw.js、style.css、client.js、turn-experience-view.js五项文件，归一化换行后的SHA256均与本地一致。缓存为global-tycoon-v46-turn-experience。

自有临时人机房间完成创建、加入AI、正式开局、选择初始机遇、新规则历史可用与直接掷骰验证。请求成功且actorRevision推进；随后解散房间，清理回执成功。未操作玩家现有房间。

原始证据：

- artifacts/deployment/8ac5055-release.json：最终成功CI步骤、五项本地／线上哈希。
- artifacts/deployment/b0e8c6f-live-smoke.json：新规则、历史可用、直接掷骰与房间清理。
- ci-repair.md：早期失败、定位及复验；失败结果保留。

## 验证边界

453个不同有限引擎／联机用例和82个不同浏览器用例已验证，重复运行不累加；完整远端CI结果单列。真实设备系统200%缩放、真实玩家三问试玩及屏幕阅读器实际发声未测，不宣称全部真实体验已验收。
