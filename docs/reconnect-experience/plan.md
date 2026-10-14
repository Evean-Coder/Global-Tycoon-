# 离线推进 Plan

Spec自审通过。

1. state增加disconnectRevision，server新局默认disconnect-v1，gameView/record保存版本。旧hasDisconnectedAlive逻辑保留作为旧版本分支，新分支仅全真人离线或当前离线自救阻断；botScheduler因此继续服务在线决策。
2. 新disconnectPolicy模块：阻断判断、必要actor列表、稳定决定键（原decisionDescriptor.key，股票用原窗口/决定身份）、保守动作、调度/只读提示。运行时room保存本回合seen等待截止和连续默认标记；新回合清旧seen，重连清连续标记但同决定截止不清。每job捕获gameId/决定键/actor并在执行前核对最新状态。
3. 新局普通离线不pause原actionClock，另设grace计时器min(20s,原剩余)；使用相同受控now/setTimeout测试接口。持续离线以0延迟排队，避免递归推进。全员离线撤job但保留截止，不执行默认；重连后已耗预算不再补给。
4. runAction增加仅内部调用的offline actor参数，Socket仍不能指定source。离线选择用opportunity_choose和该人的当前版本，只提交该人；普通默认沿原timeout验证。原时钟先到时也采用同样保守离线默认。动作提交后追加offline_default公共原因，记录/去重沿原流程。
5. startTimer、disconnect/reconnect、emitGame、routeTime与idle/finish清理接入；发轻量connectionStatus名单/等待秒数/自救等待。客户端不据此授予动作权限，不遮挡在线者；提示显示在原waitBanner和计时。
6. 自救无自动默认；全员离线pause个人clock，快速clock继续。旧对局原暂停及原timeout保持。测试旧版本显式固定，另测新默认以免将旧断言误当新行为。
