# 手机横屏弹窗整体整改 Tasks

Spec/Plan自审完成。

|任务|文件|依赖与实施|验证|
|---|---|---|---|
|T1|public/index.html|包装stock工作区、侧栏，规则按钮移标题，保留节点id|原处理器和电脑顺序|
|T2|public/style.css,client.js|T1；横屏头尾、股票分栏、三卡阅读、自然高度正文、城市行、自救摘要与可展开原说明|四短横屏尺寸及末项|
|T3|public/index.html,sw.js,e2e/cache.spec.js|T2；统一资源/cache v30|缓存升级|
|T4|e2e/landscape-dialogs.spec.js,package.json|T1–T3；受控长列表，各弹窗族截图和可点击检查|原股票/机遇/自救/银行/经营流程|
|T5|docs/landscape-dialogs/checklist.md,acceptance.md,readme.md,docs/项目现状.md|T4；视觉复核及必要回归/lint；记录真实结果|本地提交，不推送|

进度：T1–T5已完成；新增4组覆盖四种短横屏，原有22组浏览器回归通过，受影响的股票/筹资/自救又复验通过，lint通过。仅本地保存，详见[验收](acceptance.md)。
