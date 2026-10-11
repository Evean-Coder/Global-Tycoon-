# 移动端可玩性与布局重整 Tasks

依据：Spec、Plan。状态：2026-10-11用户统一批准开发；实现与实际验证见 acceptance.md。

| 任务 | 文件 | 依赖 | 步骤 | 验证 |
|---|---|---|---|---|
| T1 [x] | docs/mobile-playability/demo.html、reproduction-notes.md | 无 | 独立离线demo展示竖/横布局、Atlas素材和明确占位；对照截图记录当前高度，设计自审 | 无混用真实回放宣称，布局目标可观察 |
| T2 [x] | public/board-layout.js、test/board-layout.test.js | T1 | 纯布局映射，6×7蛇形/原周边、断点及0–41唯一邻接 | AC3，输入只读、每格唯一 |
| T3 [x] | public/client.js | T2 | renderBoard使用统一映射；棋子和动画使用真实格矩形；resize重新定位 | 首末/转行/飞行/多棋子及动画旋转不跳错格 |
| T4 [x] | public/index.html、public/style.css | T2 | 重新组织棋盘视口和信息区，保留唯一ID；移除被替代的6×17和中央长台账手机覆盖 | AC4/AC5，长文字不裁切 |
| T5 [x] | public/style.css、public/client.js | T4 | 顶部/时间条紧凑布局，适配dvh/低高度；修订fitActionBarPadding测量 | AC1/AC2，真实高度和无遮挡 |
| T6 [x] | public/client.js、public/index.html、public/style.css | T5 | 当前主操作与查看入口分层，横屏动作在侧边；原按钮事件/权限保持 | 原掷骰/结束等真实请求数量不变 |
| T7 [x] | public/client.js、public/style.css | T4/T6 | 精简资产摘要、玩家/资讯/事件区及只读面板状态，move原newsBar；关键错误/离线常显 | AC5/AC6/AC8，不删信息或泄漏私有状态 |
| T8 [x] | public/client.js、public/style.css | T6/T7 | 股票/建房/航班/选择弹窗低高度滚动与焦点、键盘适配 | AC7/AC9，原不飞底部行保持 |
| T9 [x] | test/board-layout.test.js、e2e/mobile-playability.spec.js、e2e/mobile-information.spec.js、e2e/responsive.spec.js | T3/T8 | 纳入新受控视口、真实命中/文字/height检查；更新被明确替代的旧几何断言并保留原可见性验证 | AC1–AC8/AC10，含旋转后动画和草稿 |
| T10 [x] | e2e/mobile-playability.spec.js、e2e/bot.spec.js、原流程浏览器套件 | T9 | 普通/快速、真人/电脑、2–4人有限操作场景，长名/多房/抵押/1589事件规模 | AC8/AC9，真实状态与控件命中 |
| T11 [x] | public/index.html、public/sw.js、package.json、e2e/cache.spec.js | T10 | 新helper加入加载/缓存，统一资源版本，浏览器新测试纳入原门槛 | AC11，新资源不因旧缓存丢失，不强制刷新 |
| T12 [x] | 原lint/test/e2e入口 | T11 | 受影响专项和必要完整项目门槛，修复真实失败，不降低旧行为覆盖 | 原经济/权限/回执回归通过 |
| T13 [x] | docs/mobile-playability/acceptance.md、task.md、checklist.md、readme.md、docs/frontend-atlas/mobile-information-acceptance.md | T12 | 记录高度、截图、有限验证/实体局限、版本与当前提交/部署；旧验收添加修订索引 | 每项据实际结果回填，不宣称历史设计仍现行 |

## 自审与交付

13项任务依赖明确，纯位置测试与真实浏览器命中互补。原个人圈/回合/股票/建设规则不改。证据保存artifacts/mobile-playability/，不要覆盖历史截图作为“新旧同证据”。改动前检查已有未提交文件，保留此前其他开发和用户资料；不提交完整附件记录或个人路径。若其他待批准项组合实施，统一最终资源版本，仍分别记录验收。


## 本轮执行记录

2026-10-11已按实际结果回填；逐项证据、测试命令与环境限制见[验收报告](acceptance.md)。本轮未推送或部署Render。
