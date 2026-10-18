# 手机横屏内容左移 Tasks

日期：2026-10-18。用户已明确纠正目标，按下列7项任务实施。

| 任务 | 文件与步骤 | 验证 |
|---|---|---|
| T1 | 本目录evidence：保留原0／40px现状截图和几何 | 已完成现状复现；不宣称真机读取 |
| T2 | 本目录spec／plan／task／checklist：将范围修订为所有手机横屏左侧0额外边距 | 已按用户指示自审；去掉QQ分支及开关草案 |
| T3 | public/style.css：仅compact游戏页padding-left设0，其余三向保持 | 对照差异，原布局与信息不隐藏 |
| T4 | e2e/mobile-compact-board.spec.js：将左安全区断言更新为左4px／右底原值 | 原5项全图／真实移动／缩放用例通过，不删除其他断言 |
| T5 | e2e/mobile-landscape-edge.spec.js（新增）、package.json：双模式三尺寸、代表UA及四种左值、草稿／广播／几何 | 固定有限局势，记录截图与真实测量；依赖T3 |
| T6 | public/index.html、public/sw.js、e2e/cache.spec.js：统一v47与查询版本 | 缓存升级、必要门禁／PC回归、Lint及diff检查；依赖T4/T5 |
| T7 | 本目录acceptance／progress、改进索引：真实验收、提交推送、CI及Render核对 | 只提交相关文件，未测真机单列；依赖T6 |

保留无关工作区文件。必要发布门禁失败先修复，不追加无关玩法或大量整局测试。
