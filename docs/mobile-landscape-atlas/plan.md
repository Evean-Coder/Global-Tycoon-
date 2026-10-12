# 手机横屏 Atlas Plan

依据Spec，用户统一授权下自审。

## 架构与接口

public/board-layout.js新增landscape模式：宽560–1200、高≤600且横向；position沿原perimeter算法。compact仍用于竖屏/窄窗。模式为显示配置，不变服务器位置编号。

public/client.js/syncResponsiveLayout按三类模式移动现有唯一节点：横屏boardMap、ledger到boardScale；sidePlayer/sideOthers/infoEvents/infoMore维持右侧可读；actionBar回view-game。模式切换清除浮层内联边界，不复制按钮/数据。boardLayoutMode改用字符串，旋转时重绘标签和格位，ResizeObserver继续重算棋子。

棋盘滑动短提示放在右侧顶部，避免另外占用棋盘高度；旋转回其他布局时归还原位置。

新增placeLandscapeSurfaces，只读外围四角DOM测得内矩形，设置中央地图与资产模块边界。地图contain保持比例，背景补海洋色；资产最大宽和高度受矩形/可见高度约束，模块内部滚动。图层沿原棋子层，外围地块不受浮层遮挡。

CSS landscape-game独立覆盖：顶部紧凑，左棋盘最小宽/行高保留阅读与44px触控，右侧约25–30%，底栏单排四个常用按钮加状态；卡片在右侧内部滚动，资产内部滚动。低高度保留内部棋盘滚动，显示简短提示，不强制旋转。竖屏原compact规则保持。

## 交互与验证

窗口改变→同步节点/模式→重绘原42格→测内矩形→放置地图/资产→重定位棋子，所有查看沿原入口。横屏银行按钮在底栏，经营入口在资产浮层。股票及强制弹窗逻辑不变。

有限浏览器四种横屏、普通/快速、长文字/抵押及旋转/草稿验证；原移动布局测试按新横屏断言更新，不能以隐藏文字通过。保存截图、几何数据；缓存版本同步。
