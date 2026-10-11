# 主动经营次数与提示 Plan

依据：spec.md。状态：2026-10-11用户统一批准开发；实现与实际验证见 acceptance.md。

## 1. 核对与架构

`src/activeManagement.js/eligible` 用 `usedTurnId !== turnId` 判断每回合机会；`quota` 用本人 `opportunities.lapEpoch` 管理促销和主动买股圈额度。`view` 提供本人available、usedThisTurn、quota、quotes。`public/client.js/renderLedger` 当前只在台账生成入口及一句说明；`openActiveManagement` 合并了回合规则与圈规则。本轮不修改上述资格/额度计算。

新增只读状态格式化函数于 `public/contextual-rules.js`，供 `renderActionBar`、`renderLedger`、`openActiveManagement` 复用；动作区增加状态与明确按钮，仍调用现有 `openActiveManagement`，候选确认仍走原动作和报价。使用原规则速查入口。

## 2. 数据与接口

输入：当前gameId/turnId、本人ID、本人phase/决定关系、activeManagementRevision、self.activeManagement及本人机遇usage/selectedIds。输出：status、label、detail、canOpen、hasExecutableQuote、quotaTexts。只是展示模型，不得被用于服务端许可或生成第二份状态。

状态依次判断：未启用/旧局→结束/非本人或特殊阶段→已用→未用且可执行→未用但暂无项目。`usedThisTurn` 为当前本地升级提供的只读事实；兼容旧快照时仅在quota.usedTurnId和turnId均存在时比较，未知不猜已用。原available为阶段资格，`quotes.some(q=>q.ok)`判断目前存在可执行项目，但仍须提交时服务器校验。

促销剩余由quota.promotionStartedLap读取，主动买股总剩余 `max(0,4-stockBoughtTotal)`、同城剩余由stockBoughtByCity和原单城上限读取。远程施工优惠仅本人选中H1时展示，次数从本人usage读取；不把其已用当作主动建设禁令。缺字段明确未确认，不编造剩余次数；旧局直接采用原规则说明。

## 3. 交互与状态更新

真实快照→原动画/渲染顺序→格式化本人经营状态→动作区与台账显示同一状态→点击经营复用现有面板。进入面板上方用“本回合机会”“本圈额度”分组，候选可用性及报价沿原值。

成功快照显示已用；失败/取消沿原回执，不把展示点击当成交。新个人回合根据真实turnId恢复提示；过起点仅显示原quota更新，客户端不重置计数。进入特殊阶段、终局或换局清理当前展示，不增加提醒定时器或Socket消息。

直接掷骰调用原处理，不弹出确认、不自动经营。暂无可执行项目可打开只读面板解释原因，提交仍受原报价/按钮禁用限制。资料返回不改变草稿、决定或时间。

## 4. 视觉与技术决策

- 动作区增加紧凑的一行状态和“主动经营”按钮，与掷骰处于同一可见操作区域；有机会用已有黄铜强调色/图标，已用和不可用用文字状态，禁止闪烁或持续波动。
- 无强制弹窗、全屏遮罩或重复toast。使用aria描述连接按钮和状态；常显状态不每秒播报。
- 三端按现有Grid重排：窄屏允许提示换行，操作按钮不收缩到不可点按；手机仍竖屏，不恢复横屏逻辑。台账与动作区共享解释，不能各自计算额度。
- 修改提示资源后同步静态查询版本/PWA缓存；若与其他待批准问题一起交付，采用一个最终版本且分别记录验收。不强制刷新在玩对局。
- 原服务器和AI规则保持。验证采用固定回合/个人圈成对状态与原真实成功动作，而非只测字符串；浏览器只跑受控场景。

## 自审

架构、只读状态、额度分组和入口覆盖F1–F6；没有混用完整轮、本人回合、本人一圈或H1优惠次数。数据缺失不擅自许可，经济模块无需改动。
