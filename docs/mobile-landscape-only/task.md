# 手机仅横屏游玩 Tasks

|任务|文件|依赖与步骤|验证|
|---|---|---|---|
|T1|public/mobile-orientation.js|文档先行；设备/方向判定、锁定与手动兜底|纯判定与接口缺失/拒绝/成功|
|T2|public/index.html,style.css|T1；最高遮罩、inert与焦点|触控/Tab/Escape/层级|
|T3|public/client.js|T1–T2；进入/重连/旋转/开始守卫|不发动作、只开始一次、恢复草稿|
|T4|public/board-layout.js,style.css,index.html,client.js|T3；删除全部竖屏对局实现|源码扫描、环形/PC平板|
|T5|public/sw.js,manifest.webmanifest,index.html,e2e/cache.spec.js|T4；版本同步与新模块缓存|缓存升级|
|T6|test/board-layout.test.js,test/mobile-orientation.test.js,e2e/mobile-landscape-only.spec.js,e2e/helpers/browserHarness.js及相关布局用例|T1–T5；合法手机横屏回归及专门阻挡测试|有限单位、浏览器、lint|
|T7|docs/mobile-landscape-only/acceptance.md,checklist.md,readme.md|T6；真实证据、本地提交|不推送|

进度：T1–T7完成；实现、500项单位/服务端和42组浏览器回归通过，最终结果及限制见acceptance.md。仅本地提交。
