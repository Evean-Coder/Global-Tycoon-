# 每回合经营与机遇重做 Plan

2026-10-13；基于 spec.md 自审通过，执行授权同 Spec。两个子系统共用版本与验证场景，分别实现经营门禁和强化结算。

## 架构与数据
- activeManagement 保留 LEGACY_REVISION=v1，新增 REVISION=v2。state 接受两者，新服务器开局传v2；v2玩家 opportunities.revision=v2，经济规则由只读配置函数读取，避免旧局被新数值覆盖。
- quota 保留原字段兼容记录；v2只用 usedTurnId 做本回合限次，stockBoughtTotal/ByCity继续记录但不限制。促销活动期间拒绝新活动，活动仍采用原 settlementId 去重、偿清后奖励机制。
- view 增加 mandatory、required、可执行quotes、无项目reason、timeout说明，quote增加建设rentBefore/rentAfter和促销remainingRewards。先依据真实合法报价再计算required；不持久化第二份资格状态。
- 新管理门禁仅约束 roll_dice。底栏「结束回合」原本也发送roll_dice，因此服务端统一拦截。新 management_timeout 仅允许 source=timeout，重新取最低成本合法报价，apply后rollAction，同一次克隆提交。普通客户端不能调用它。
- actionClock v2快速 waiting_roll 45秒，普通90秒；仍使用原decision key，共享经营和掷骰期限。全局封盘原检查先执行。
- 版本和一次性奖励金额放入独立规则模块；economy/stocks按该版本分支进行强化结算，opportunities共用领取金额规则；gameplayCatalog保留旧表并导出新版表，gameView依版本下发。H8按usage机场键记本圈，visitedAirportIds记整局。

## 交互与生命周期
底栏经营→3个类型卡片→类型城市列表→股数/报价确认→原sendAction→服务端normalize→clone apply→snapshot→刷新状态。浏览类型不发动作。选中type为本地草稿，绑定gameId/turn及本人决定；弹窗generation防止迟到回执关闭其他窗口。快照更新时刷新仍打开的经营视图，提交锁只关联未决请求；离开正常阶段关闭该视图。失败展示新报价并要求再次确认。返回保留同类型选择，下一决定清空。

台账移除可点击经营元素，保留只读摘要。纵向手机按钮可分行，横向手机压缩次要摘要、保留经营/掷骰/资产/银行，结束回合已有掷骰等效行为可在小屏隐藏。不缩小地图文字来腾按钮。

## 强化与AI
结算规则逐项对应Spec H1–H12；新版本机场奖励覆盖骰子到达和成功付费/免费飞行，排除机会位移。同一访问当圈去重。应急资金凭据金额按版本校验；换路线不清已有usage及访问事实。原目录生成器输出新版大厅规则，局内采用服务端目录。

AI保留现金储备与收益比较；必做时即使所有正收益候选被储备筛掉，也从服务端可执行报价中选最低支出。步数上限不得绕过门禁。fallback同样处理。调整建设、促销和强化估值参数，避免旧10%上限误判新路线。

## 技术决策与风险
使用现有正常待掷骰阶段，不加互相覆盖的全屏强制弹窗。强制的是完成动作，玩家可先查看银行/资产；掷骰前重新算合法集合。银行操作耗尽现金后可能全不可用，此时按用户「全部不可执行放行」规则处理。

收益条件清楚展示，促销无保证回报。上调强化有有限收益上限；固定数值样例验证上限和成本，不能据此宣称胜率相等。旧规则测试保留v1明确夹具，新规则新建测试，避免把旧兼容测试重写成新预期。

## 覆盖
F1/F3由client/CSS及浏览器测试承担；F2/F4由validation/logic/clock/AI承担；F5/F6由active/economy/stocks/opportunities/catalog承担；F7由state/view/record及兼容测试承担。各功能共享原动作原子提交和去重机制。
