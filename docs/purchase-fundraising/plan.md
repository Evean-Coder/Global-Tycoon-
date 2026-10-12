# 购买募资与自救出售 Plan

依据Spec及用户统一授权，自审完成。

## 模块与数据

actionValidation.phaseAllows及gameLogic.applyCore扩展原rescue_sell_stock允许buy_fundraise；该阶段验证pending.playerId、目标kind、现金缺口、目标仍无主、城数额度与整数shares。不迁移其他动作。现代报价沿stocks.quoteVersion，原rescueSellStock一次更新现金及双份持股；募资不调用finishSelfRescue。

客户端从game.pending.target及真实现金计算缺口，将原自救数量卖股渲染抽为只读UI共用函数，用原sendAction。数量校验、现金预览与不可卖原因一致，交易后重新读快照。购买按钮仍发送原buy_fundraise confirm，取消仍走原取消。

自救出售上下文继续由服务端normalizeAction补全，不相信客户端context。先复验拆房与直接出售/拍卖。src/gameView.js公开pending.sellerId（公开城市所有者身份），其余自救resume/context仍不公开。卖方在direct_sale_ask时显示明确等待面板，成交/拒绝后由快照恢复；不提供重复出售入口。

## 执行及验证

正常购买缺钱→原募资→选择股数→原动作校验/一次变现→现金及缺口重绘→手动完成/取消。查看和失败不补时。复用原请求去重及快速封盘。

有限单位、Socket、三端浏览器覆盖两目标/两模式/数量边界/自救两路径，原建房、自救及动作校验回归；静态资源与PWA缓存统一升级，不主动刷新在玩对局。
