# 主流直板手机连续适配 Tasks

日期：2026-10-26。24项任务。前置调研与自审已完成；用户已批准，实施进行中。

| 任务 | 文件／实施步骤 | 依赖与验证 |
|---|---|---|
| T1 | 本目录research、viewport-matrix及evidence：核对厂商比例、可见区域文档和原布局 | 已完成；106组现状、4组稳定复测，区分瞬态和持续缺陷 |
| T2 | public/phone-layout.js新增：有限值输入、standard/short/constrained候选、地图模式和字号／区域预算 | T1；纯函数不改输入，568×260及阈值±1不误入滚动 |
| T3 | public/client.js、mobile-orientation.js：集中测量布局／可见视口、安全区、缩放与方向；合并事件与接口缺失回退 | T2；工具栏／键盘／全屏模拟、scale>1不抵消放大；不新增服务端动作 |
| T4 | public/style.css、client.js：根尺寸与实际主区预算，保留左对齐，移除挤压与持续测量反馈 | T3；同一坐标系、400ms稳定、无裁切或持续振荡 |
| T5 | public/style.css、client.js：弹性侧栏宽度，窄栏键值上下排列、长名换行、自然滚动 | T4；完整棋盘优先，侧栏／更多的真实资料都可读 |
| T6 | public/style.css、client.js renderBoard：编号完整横排，按格子尺寸单行／上下层，保留简称和图标／归属 | T5；42格全部类别、10–41编号、三字名、四席归属无重叠 |
| T7 | public/client.js placeBoardSurfaces/renderPieces：复用实际锚点，地图与原棋子尺寸位置匹配新预算 | T6；四角与中心矩形误差≤1px，同格／移动终点／原半速不变 |
| T8 | public/index.html、client.js、style.css：44px主操作、短顶栏纯状态、更多规则与全屏尝试 | T4；双期限仍可见，原按钮顺序、全屏失败仍可玩 |
| T9 | public/client.js、style.css：自动scroll与手动zoom分开，恢复默认视图和原因 | T2/T8；小→大自动恢复，用户放大不被广播取消，宽／高两个方向都判断 |
| T10 | public/style.css、client.js：大厅／房间可见区域与键盘滚动，方向门禁只在对局入口生效 | T3；两方向创建／加入、模式选择、开始与键盘焦点可达 |
| T11 | public/style.css、index.html：通用弹窗可见矩形、正文与有界操作区预算 | T3/T8；标题、末项、44px操作、低高度正文不压零，无卡片套滚动 |
| T12 | public/style.css、client.js renderStock：股票列表和侧栏／底栏按空间组合 | T11；加减、确认、转让返回、募资股票、列表位置和草稿不丢 |
| T13 | public/style.css、client.js：机遇／换路线／经营／竞争／扶持的列数、正文与返回布局 | T11；所有候选与底部操作可到达，不改变选择顺序和期限 |
| T14 | public/style.css、client.js：银行／资产／自救／规则／记录与回顾长内容 | T11；缺口、持股数量、抵押行和详情末项可读，原金额与权限不变 |
| T15 | public/client.js原patch／read context：视口变化只更新布局，不整页重建 | T10–T14；展开、滚动、焦点、输入／竞争价、晚回执和重连保持 |
| T16 | public/index.html、client.js：只读适配信息、原因与用户主动复制 | T9/T15；无自动请求，诊断字段白名单，不含token／身份／私有资料 |
| T17 | test/phone-layout.test.js新增；必要board-layout／presentation／orientation回归 | T2–T9；阈值、连续输入、无效值、纯性、自动恢复、非手机、缩放测试 |
| T18 | e2e/phone-aspect.spec.js新增：504组布局、代表截图及几何汇总 | T5–T9/T17；单个固定局势复用，正常域全图、所有受限域按钮可达，不计为504场游戏 |
| T19 | e2e/phone-viewport.spec.js新增：地址栏、可见视口偏移、键盘、缩放、安全区、宽屏手机与PC对照 | T3/T10/T17；模拟与真实浏览器API标注，默认左对齐及其他边距不重复扣 |
| T20 | e2e/phone-dialogs.spec.js新增；沿用股票／经营／自救夹具 | T11–T15；各弹窗族成对覆盖及两个有限联机流程，所有实际请求与时限核对 |
| T21 | e2e/helpers/browserHarness.js、scripts/run-phone-layout-checks.js新增、package.json及.github/workflows/ci.yml：选择Chromium／WebKit及专用检查 | T18–T20；默认旧用例保持Chromium，WebKit代表检查独立进程、安装失败不得记通过 |
| T22 | public/index.html/sw.js、e2e/cache.spec.js、rules.md/readme.md：新模块及v48／查询版本、适配边界说明 | T16/T21；缓存升级、精确版本、离线壳及不强刷旧局 |
| T23 | 必要现有e2e与单测、Lint及目录生成检查；只改与新需求冲突的旧布局断言并保留行为标准 | T17–T22；原移动／草稿／方向门禁／PC回归；具体失败先定位再重测，不跑大量整局 |
| T24 | 本目录acceptance／progress、改进索引及发布回执：真实结果、未测设备、提交推送和Render核对 | T23；只提交相关文件，完整CI与资源／临时房间核实，实体机未测不能勾选 |

执行按依赖推进。T1调研已执行不代表新功能验收通过；T2–T24按本轮用户授权执行。物理摄像头、真实QQ／微信／Safari系统键盘与系统显示放大由实体机观察单列。

## 执行记录（2026-10-27）

T1–T23已完成：实现文件及证据见acceptance.md；纯布局6项、全量单测627项、全量浏览器95项、独立WebKit10项均通过，Chromium504／WebKit32组合分别记录。T24本地验收记录已整理，推送及CI／Render核对进行中；实体机项不算已验证。
