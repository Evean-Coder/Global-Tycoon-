# 银行抵押列表验收

日期：2026-10-12。本地完成，未推送或部署Render。

## 原因及修复

银行原抵押列表复用弹性ledger-list，在弹窗高度有限且赎回/持股较多时被压缩。现改为自然高度bank-content与独立城市卡片，统一由弹窗内容滚动；名称与金额分行、操作独立44px，禁用原因文字可见。沿原报价、抵押上限与动作处理，不修改服务端规则。

## 实际验证

- C1/C2：320×700、844×280、932×430、768×1024、1440×900，超过10座未抵押城市、1座已抵押及多项持股同时展示。每行至少76px，按钮44px；名称/金额均在行内，无银行列表嵌套滚动或页面横溢。外层可滚至末城、赎回、末项股票和关闭。
- C3：实际抵押东京，现金增加原抵押金额，城市归属不变，原截止不延长，抵押列表/赎回列表更新；上限禁用原因可见。无城市时显示空状态。
- C4：正常与快速三端远程赎回通过，状态更新保留外层位置，强制飞行阶段替换银行。建房募资卖股数量、输入节点、滚动、报价更新及返回建设均通过。
- C5：旧缓存清理、新缓存安装、离线壳通过；lint通过。已目视查看932×430截图，抵押名称/金额与独立按钮清楚可见。

浏览器命令：Node20 --test --test-force-exit --test-concurrency=2 e2e/bank-mortgage-layout.spec.js e2e/mortgage-redemption.spec.js e2e/build-fundraising-stock.spec.js e2e/cache.spec.js，8/8通过。日志：artifacts/bank-mortgage-layout-browser.txt；lint：artifacts/bank-mortgage-layout-lint.txt；尺寸与截图：artifacts/bank-mortgage-layout/。首次lint发现测试未限定window.innerWidth，已修正且重验通过。

资源20261012-bank-layout-v1，缓存global-tycoon-v24-bank-layout。四份独立文档先于实现生成，依据用户既有统一授权自审。验证为本地Edge触屏模拟，不代表已实测微信真机或公网Render。
