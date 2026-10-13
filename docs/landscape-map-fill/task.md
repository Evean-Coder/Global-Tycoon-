# 手机横屏中央地图填充 Tasks

| 任务 | 文件 | 依赖/步骤 | 验证 |
|---|---|---|---|
| T1 | public/style.css | 四份文档自审后，改横屏填充及对齐 | 横屏图片覆盖、边界和截图 |
| T2 | public/index.html,public/sw.js,e2e/cache.spec.js | T1；同步资源及缓存版本 | 缓存升级回归 |
| T3 | e2e/mobile-landscape-atlas.spec.js | T1；调整填充预期并记录加载/覆盖，本轮独立证据路径 | 普通/快速四视口、操作与旋转 |
| T4 | docs/landscape-map-fill/acceptance.md,readme.md | T1–T3；布局、缓存、lint及真实结果；本地提交 | scoped diff与发布状态 |

进度：T1–T4完成，实现、有限回归及底部截图均已核验；本次仅本地提交，参见acceptance.md。
