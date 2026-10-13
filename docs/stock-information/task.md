# 股票查看入口与本人持股明细 Tasks

|任务|文件|依赖/实施|验证|
|---|---|---|---|
|T1|public/client.js,index.html|四文档自审；market/trade、只读关闭、生命周期与区分浏览位置|无动作、资料/控件、强制决定|
|T2|public/client.js|T1；抽出原持股构造，资产复用，返回入口|空/多城持股与银行一致、募资控件|
|T3|public/style.css,index.html,sw.js|T1–T2；侧栏按钮与资源v32|三端、缓存|
|T4|e2e/stock-information.spec.js,flow.spec.js,cache.spec.js,landscape-dialogs.spec.js,package.json|T1–T3；有限真实查看/更新/交易/资产/募资回归，截图可写入新证据目录避免历史文件占用|服务端状态及期限不变|
|T5|docs/stock-information/checklist.md,acceptance.md,readme.md,rules.md|T4；记录实际结果、本地提交|不推送，保留此前待核对CI状态|

状态：T1–T5已完成本地实现，13个不同浏览器用例分批复验通过、lint通过；未推送。此前发布CI/合成滑动检查仍独立待核对，不标记整体项目验收完成。
