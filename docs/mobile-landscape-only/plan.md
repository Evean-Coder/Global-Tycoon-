# 手机仅横屏游玩 Plan

依据Spec自审；用户授权修复既有手机要求，无新增玩法。

## 架构
独立mobile-orientation模块封装手机识别、方向判定、方向请求、最高优先级遮罩与inert恢复。手机依据移动UA/UAData或触控设备短边≤600识别，排除平板触控大屏；方向同时读取物理屏幕与可见窗口，防止竖屏软键盘把窗口压扁误判横屏。PC窄窗不伪装手机。

client每次show、resize、orientationchange、fullscreenchange及visualViewport resize同步阻挡。进入游戏按gameId尝试一次lock；拒绝不循环申请。按钮点击时先调用documentElement.requestFullscreen获得浏览器允许的用户激活，再请求landscape；缺失/拒绝/2秒超时显示手动说明。实际物理方向及视口符合横屏才解除；网页不能切系统设置。离开游戏释放本模块取得的锁与全屏。

最高遮罩为body直接子节点，z-index高于所有现有覆盖层，其余交互根节点inert。状态渲染继续维护背后真实弹窗；方向阻挡不关闭/重建草稿。focus与Tab锁在方向弹窗内，Escape阻止。showOverlay/hideOverlay不能抢走方向弹窗焦点；sendAction和开始请求增加本地阻挡守卫。房主点击开始后保存单次待开始意图，实际横屏后复查房间及权限再发送。

## 布局清理
BoardLayout删除compact布局及位置算法；client删除compactLayout、infoPanel、infoTabs/btnMore、节点搬到竖屏槽的分支。HTML删除竖屏槽和操作Dock；CSS删除compact-game及死short-game规则。保留横屏和桌面/平板环形布局，小横屏内部滚动。删除只服务竖屏棋盘的媒体查询覆盖，保留大厅、房间、通用弹窗小屏样式。

## 测试与缓存
既有游戏行为浏览器测试改在合法横屏手机视口运行，不能通过跳过测试掩盖阻挡；新增专用portrait→gate→landscape测试承担竖屏拒绝、最高优先级、自动接口分支、重连/初始选择/股票草稿和软键盘情况。boot helper在开始前为手机用例旋转，专用测试独立控制。保留PC和平板竖屏检查。

资源20261013-landscape-only-v1，缓存v28；manifest orientation=landscape，声明不能替代运行时门禁。部署暂停，保持本地。

## API资料
[MDN方向锁定](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock)说明移动/全屏限制；[MDN全屏](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)说明需要用户激活。对不支持的浏览器直接手动提示。
