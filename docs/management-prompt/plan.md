# 回合经营弹窗与主动放弃 Plan

Spec自审通过，继承用户修订授权。

## 版本与服务端
managementRules.REVISION=v3，保留REQUIRED_REVISION=v2和LEGACY=v1。modern接受v2/v3，同样的经营数值和强化；optional仅v3。state接受三版本，新局使用v3，并为v3新增skippedTurnId。quote/eligible对v3已放弃回合拒绝；view新增optional/skippedThisTurn，暴露本人原因和稳定turnId。required在有合法项目且未执行/放弃时仍阻挡掷骰。

active_skip复用原action事件和gameId/decisionId/actorRevision/actionId协议，限定本人正常待掷骰且经营尚未处理；一次记录skippedTurnId和management_skipped事件，不改资金/经营圈额度。重复请求走原回执缓存。v3 management_timeout先skip（未处理时）再roll，单次克隆提交；v2继续最低支出。AI的无正收益/储备不足/步数到限及fallback改为可放弃，版本依据服务端私有视图。

## 客户端窗口
独立managementModal/managementBody/managementFooter，复用两级类型/城市渲染，不再占通用modal。managementGeneration防旧回执；草稿key使用gameId/self/turnId，按本地seenKey记录本回合已自动呈现或已关闭。首次正常回合在finishRender完成原pending与强化渲染之后sync；afterReceipt及恢复状态也同步。若金融强制决定、暂停、动画或横屏阻挡优先，延后显示；横屏解除后下一次同步仍可显示，未主动关闭不标记已看。

主界面底部left active_skip/right close；子界面left back/right close。footer在可滚动body之外，2列、最小44px。放弃回执成功收起；关闭仅隐藏。阶段变更、非本人、已经营/放弃自动收起；同回合广播只刷新已打开视图，不重开关闭窗口。主动规则帮助置于经营之上，退出规则仍见经营；底层通用查看不抢焦点。

## 优先级与缓存
orientationGate > 用户主动打开的rules > managementModal > 普通modal/股票/机遇（仅在正常经营阶段显示）。Tab焦点规则加入经营层；横屏模块按现有body根inert覆盖新层。资源20261013-management-prompt-v1、缓存v29，新服务器开局v3。旧局不迁移。

## 覆盖与验证
F1/F3/F4由client与浏览器承担；F2/F5/F6由服务端/AI/固定场景承担；F7由版本、旧v2测试、规则和缓存承担。旧经营收益测试固定到v2，新增v3测试验证可放弃，而不是重写历史预期。
