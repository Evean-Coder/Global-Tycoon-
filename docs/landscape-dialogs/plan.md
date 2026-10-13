# 手机横屏弹窗整体整改 Plan

Spec自审完成。用户要求修复现有界面，沿用本地发布暂停。

## 架构与接口
只改变public DOM与CSS布局。保留所有原id、action与处理函数；股票原列表节点、草稿、窗口身份及回执照旧。增加stock-workspace/stock-sidebar包装，原stockHint移入侧栏；stockTitle/stockTimer/btnStockRules同标题行，四交易按钮在侧栏底部。电脑/平板以display:contents恢复原顺序布局，窄横屏使用两列。

通用modalBody仍为唯一正文滚动容器，直接子节点flex:none，min-height:0、flex:1，标题flex:none。横屏宽度适应视口，行、现金摘要和控件使用自然高度；长城市名称允许换行，筹资/自救每城独立卡片。

自救缺口与现金包装为rescue-overview并列展示，原欠款/债务来源/费率完整保留在rescue-explanation中，横屏默认折叠、其他屏幕默认展开。html的text-size-adjust设100%，防浏览器二次自动放大正文，系统缩放继续可用。初始机遇长描述加入键盘焦点，完整内容可滚动阅读；顶部说明简化为完整的三选一、提交生效和超时规则。

choiceCards在横屏以3列单行填满剩余高度；卡片标题/方向/选择按钮不收缩，描述独立滚动且可触屏/键盘阅读。route-body保留单正文滚动，紧凑头尾，按钮44px。经营窗保留专用正文滚动和固定左右footer。

## 屏幕与优先级
沿用landscape-game分类，CSS覆盖选择器明确作用于modal，避免被旧.modal .mh/.mf、媒体查询覆盖。280px短高度也适用。进一步以低高度宽屏媒体查询覆盖移动浏览器桌面网页视口。最高orientationGate继续阻挡操作；旧局界面可复用新布局但规则不改。

## 数据与交互
无新增服务端数据或动作。股票侧栏显示原资金/额度/草稿，不重算许可；DOM包装不重新创建列表，不改变patchDisplayNode锚点。查看、缩放、关闭、返回不续时。choice描述仅改变滚动位置，不改默认项或选择期限。

## 技术决策与覆盖
F1/F4用自然高度与单正文滚动；F2保留节点的Grid两列；F3三卡内容滚动、按钮独立；F5资源20261013-landscape-dialogs-v1/cache v30。实际测量各内容高度、点击命中、可滚动到末项；多种截图视觉复核。必要旧回归覆盖股票草稿/自救/缓存/缩放，不重复无关单位测试。
