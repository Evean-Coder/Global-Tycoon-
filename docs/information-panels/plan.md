# 资讯面板、阅读状态与规则定位 Plan

Spec自审后通过，2026-10-14。

1. boardScale下增加atlasPanels容器，newsBar和ledger为两个等分子面板。placeBoardSurfaces按真实棋盘内框定位容器宽86%、高72%，居中；全部屏幕同构，保留原地图覆盖和棋子层。移除ledger独立绝对定位规则，新闻和台账滚动分开。
2. renderNews构造真实DOM，用现有patchDisplayNode原位更新；details使用稳定身份，保留open及newsBar.scrollTop。显示本人的地区城市和机场影响列表，不新增服务端经济计算；描述采用原world.active.description。
3. 同一gameId的资产/城市/地块阅读上下文保存kind、target、decisionId，不保存第二份状态。快照进入renderPending前在非本人决定或同一决定/正常待掷骰时用原渲染器刷新资料，恢复details、滚动和焦点；本人新决定、终局、关闭或新gameId清除。银行继续复用原DOM更新；外层统一保留同一弹窗展开和位置。
4. openRulesTopic扩展可选段落anchor。organizeRules增加news、management、support、routes段落身份；上下文按可见原弹窗/标题/阶段及地块种类选择。规则仍只读，不触发游戏动作。
5. 内容身份优先使用id/data和稳定summary；金额改变不改变身份。无效焦点不恢复到已禁用控件。修改资源版本与PWA缓存，不主动刷新在玩对局。

边界：股票既有草稿和原位渲染不重写；自己新决定不能被只读资料遮住。不得以保留DOM为理由沿用旧价格或权限。无需新增事件数值。
