# 机遇选择时限 Plan

依据：Spec；用户统一授权，自审完成。

## 架构与接口

在src/actionClock.js定义OPPORTUNITY_CHOICE_SECONDS=60，decisionDescriptor的opportunity_choose/route_choose使用同一常量。其他决定及key保持，sync同key分支不补时；server.startTimer已有总余时截断，沿用即可。

客户端沿displayTimer的choiceTimer/routeTimer读取原服务端快照，不增加计时循环。规则速查与rules.md同步，历史路线/快速文档加覆盖索引；静态版本/PWA统一升级。

## 交互

触发原初始/后续选择→服务端新决定最多60秒→本人查看/调整及原确认→全员完成或本人成功后沿原流程推进；无效或重复请求不延时；超时调用原初始首项/后续跳过。封盘优先、出局取消、私人候选及已提交结果不变。

## 验证

固定时钟覆盖两模式/两阶段/暂停和8秒上限；原机会Socket回归更正旧30/20断言，并在跨截止测试用真实新deadline而非写死旧30秒；有限三端浏览器验证选择倒计时和提前完成，原缓存升级回归。只修正确认到期预期，不能删除失效/重复/隐私断言。
