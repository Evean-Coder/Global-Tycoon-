# 手机横屏完整棋盘 Tasks

2026-10-14。Spec/Plan自审通过；用户已批准开发，后续按保持原布局指示修订；各项实际结果见acceptance.md。

| ID | 文件/职责 | 步骤与依赖 | 验证 |
|---|---|---|---|
| T1 | public/board-layout.js | 增加compact模式，全部模式复用原12×11坐标和四角；输出四角锚点 | 42位置唯一、完整周长、邻接闭环；原默认映射不变 |
| T2 | public/board-presentation.js（新增） | 全量短名、属性图标、owner颜色/席位、安全完整标签；只读输入 | 全格表、四玩家/无主/变更、深冻结快照无修改 |
| T3 | public/client.js | 复用手机识别，compact/原模式切换；先布局再测量，取消旧滚动位置 | 手机与PC/平板切换，默认类别与原门禁一致；依赖T1 |
| T4 | public/client.js renderBoard | 常显编号/短名/图标、产权色条，原详情及aria全名 | 所有城市/机场/特殊格、转让及银行收回；依赖T2/T3 |
| T5 | public/style.css | 独立compact格样式，真实全屏网格尺寸、32×15px地块/8px最窄短名底线，删除此模式旧最小板宽高 | 五目标视口普通/快速42格及无滚动；依赖T3/T4 |
| T6 | public/client.js placeBoardSurfaces | 改用布局锚点，中心世界地图实际矩形铺满；PC原位置保持 | 六视口边界、无灰缝、背景加载，PC与tablet对照；依赖T1/T5 |
| T7 | public/index.html/style.css | 紧凑顶栏、两类期限与状态；底44px按钮，原骰/经营/资产/银行顺序 | 顶44/底44及总100px预算、名字/原因/快速时钟不挤板；依赖T5 |
| T8 | public/index.html/client.js | 保留原中央资讯/台账与右栏，仅缩小；更多打开时暂移DOM、关闭恢复、原handler复用，不复制行动 | stock、missions、玩家/记录/定位/规则/认输/解散入口；依赖T7 |
| T9 | public/client.js 信息reader | 资讯/资产/玩家/事件阅读，广播刷新真实值并保持展开/焦点/滚动；原强制决定接管 | 对手广播、本人新决定、重连和旧回执；依赖T8 |
| T10 | public/client.js 详情 | 原地块详情补短名对应全名、产权文字、色组、同格玩家 | 42格只读、可见信息范围、关闭返回焦点；依赖T4/T9 |
| T11 | public/client.js/style.css 棋子 | 紧凑棋子/同格聚合表示，移动与静止布局一致、真实终点、220ms保留 | 1–4人同格/移动、转屏、queued状态/减少动画；依赖T5/T10 |
| T12 | public/client.js/style.css | 更小空间/系统放大回退与“放大地图”；resize合并，无权限/期限变化 | 安全区、地址栏变化、200%缩放和关闭回全图；依赖T7/T11 |
| T13 | test/board-layout.test.js、test/board-presentation.test.js（新增） | 几何/短名/归属只读固定输入；保留PC旧位置测试 | 精确映射、42邻接、转让/清算、未知owner中性 |
| T14 | e2e/mobile-compact-board.spec.js（新增） | 五视口双模式、四位玩家、点击所有类别、真实一段移动及信息广播 | AC1–AC7，截图/几何/交互日志；依赖T6–T13 |
| T15 | e2e/mobile-landscape-atlas.spec.js/mobile-playability.spec.js/mobile-information.spec.js/information-panels.spec.js/responsive.spec.js | 更新旧手机滚动/右栏/中央大台账断言为新需求，保留PC、门禁、详细资料、股票/资金流原验证 | 每项失败定位，不能只删旧检查；必要原浏览器回归；依赖T14 |
| T16 | public/index.html/sw.js、package.json、rules.md/readme.md、改进索引与本目录 | 同步资源/缓存/测试入口/实际验收记录，有限回归/lint，提交相关文件 | 目录/缓存版本一致，升级不强刷在玩局；真机与线上结果分开记录 |

执行顺序T1/T2→T3/T4→T5→T6/T7→T8/T9/T10→T11/T12→T13/T14→T15→T16。T1–T16完成并在本地验收；549项规则检查及现行69个不同浏览器场景分批通过，lint通过。证据路径写入钩子的文件锁已修复并重跑，不将其当作玩法失败。未更改服务端玩法代码；发布暂停。
