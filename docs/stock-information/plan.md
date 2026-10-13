# 股票查看入口与本人持股明细 Plan

Spec自审完成。

## 结构与数据
复用stockModal/stockList，新增stockViewMode标明market/trade。openStockMarket在本人stock阶段使用trade，其余使用market；stockReady仍是原交易许可来源。只读用空草稿计算公开资料，不修改stockDraft/stockContext；列表key区分market与真实stockKey，浏览位置也分别记录。

market隐藏买卖步进、交易额度/订单摘要及确认/放弃/转让按钮，显示只读状态、市场统计、资产和新增btnStockClose。真实trade恢复原控件和文案。finishRender在普通广播保持market并刷新公开资料，原本人强制决定/初始选择/路线/结算关闭或覆盖查看，原股票自动窗口显式切回trade。

## 共享持股
将原openBank的portfolio构造抽出appendStockHoldings(body,meP,forBuild,buildCost)。用game.stocks.holders[本人]读取真实股数，沿用原整数报价和银行文案；openAssetOverview在资产摘要之后调用只读形式，openBank继续调用原建房募资形式。原bankDraft、卖股回执和控件原样保留，不赋给资产交易能力。

从只读市场进入资产时收起市场并增加返回市场入口；从真实交易进入资产仍保留“继续买卖股票”。不设置新决定期限或发起查看请求。

## 可用性与缓存
新增关闭按钮复用横屏侧栏44px布局。资源20261013-stock-information-v1、cache v32；不主动刷新在玩页面。F1–F3归属模式渲染/生命周期，F4–F5归属共享portfolio，F6归属样式、缓存与有限浏览器验证。
