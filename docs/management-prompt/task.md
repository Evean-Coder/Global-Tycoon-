# 回合经营弹窗与主动放弃 Tasks

|任务|文件|依赖/实施|验证|
|---|---|---|---|
|T1|src/managementRules.js,state.js,activeManagement.js,gameView.js|四文档自审；v3及私有放弃事实、稳定回合|新旧版本与资格|
|T2|src/actionValidation.js,gameLogic.js,botPolicy.js|T1；active_skip/超时/AI|资金不变、重复、下一回合、旧v2|
|T3|public/index.html,client.js,style.css,contextual-rules.js|T1–T2；独立高层窗口、自动一次、固定双按钮|类型/子窗口、关闭/放弃、层级|
|T4|public/sw.js,index.html,readme.md,rules.md|T3；版本缓存及行为说明|缓存、文案一致|
|T5|test/management-prompt.test.js,e2e/management-prompt.spec.js及原经营浏览器测试|T1–T4；受控关键场景|有限完整回归、lint|
|T6|docs/management-prompt/checklist.md,acceptance.md|T5；真实证据、本地提交|发布暂停|
|T7|public/client.js,index.html,sw.js,e2e/management-prompt.spec.js及原初始开局/缓存测试|后续F1修订；仅可执行项目自动提示，同步资源及旧断言|空回合、仅机场、资金不足、购地后提示，原正常弹窗与发布回归|
|T8|e2e/mobile-information.spec.js,mobile-playability.spec.js,mobile-landscape-atlas.spec.js,mobile-landscape-only.spec.js,management-prompt.spec.js|T7；受控购地后显式关闭提示，防惯性合成滑动及可选截图目录|CI Chromium有限回归，原动作/滚动/点击断言保留|

进度：T1–T6已完成实现和有限验证。499项单元/服务端检查通过，43组浏览器用例分批验证通过，lint和diff检查通过。本地保存，不推送。详见 [验收记录](acceptance.md)。

后续修订进度：T7空项目不自动提示已通过针对性2组验证，并与股票信息资源v32整合。T8整体CI触屏回归仍待核对，实际日志见eligible-progress.md；当前再次暂停推送。
