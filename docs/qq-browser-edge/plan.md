# 手机横屏内容左移 Plan

日期：2026-10-18。以用户“不要只对QQ，内容左移占掉空白”的指示为准，自审后实施。

## 基线与实现

基线dac9340。只修改public/style.css中body.compact-game.game-active的四向padding：顶部仍--compact-safe-top，右侧仍--compact-safe-right，底部仍--compact-safe-bottom，左侧明确0。保留原--compact-safe-left来源供模拟或后续诊断，实际整页不再消费它。

现有header及view-game会随body可用宽度扩展；view-game原4px边距不变，游戏主区3:1比例继续。原ResizeObserver／requestPieceLayout按新实际锚点计算中央图片、资讯／台账及棋子。无需改client、mobile-orientation、board-layout、资金或联机逻辑，也不新增UA判断、开关及存储。

只作用于游戏中的手机横屏compact类；大厅、普通平板／PC样式、最高方向门禁保持。左右不做负位移，内容通过容器宽度重排以保持右边界。

## 数据与接口

无服务端数据、请求、规则版本、事件或新增UI状态。顶部／右侧／底部CSS安全区值仍按浏览器上报值执行；左侧安全区原值仅不用于该页面padding。原渲染与阅读恢复路径不修改。

## 验证

新增有限浏览器用例：同一页面模拟0／8／40／80左边距，严格比较header、boardWrap、actionBar和右边缘，验证释放宽度。代表QQ／普通Android／iOS UA只用于证明没有品牌分支，不宣称覆盖真实浏览器内核。双模式三尺寸复用原夹具；股票数量草稿、资讯展开、广播、地图和棋子位置使用原真实状态。

原mobile-compact-board安全区断言改为新的明确目标：左约4px、右24px和底20px仍保留；原真实移动、最小尺寸和权限断言保持。PC／平板及方向门禁复用必要原用例。

## 缓存与发布

统一资源查询版本20261018-landscape-edge，PWA缓存global-tycoon-v47-landscape-edge，更新index.html、sw.js及cache.spec.js；保留精确版本缓存和不强制刷新在玩局策略。

按AGENTS.md仅提交本轮代码、文档和证据并推送，核对CI和Render三项资源。真机未执行不能写通过。四份文档以本轮用户纠正作为实施授权，不重复询问已明确的修复目标。
