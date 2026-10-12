# 银行抵押列表布局 Plan

依据Spec自审通过。

## 架构与接口

F1/AC1由独立抵押行负责：openBank沿原城市、mortgageValue、canOps生成bank-mortgage-list/row，名称安全展示，金额和动作分列。F2/AC2由bank-content负责：自然流容器禁止flex压缩，移除银行ledger-list嵌套滚动，统一由modalBody滚动。不增加状态或请求。

## 交互与技术决策

原状态→原报价/许可→生成银行→patchDisplayNode→恢复外层scrollTop。抵押仍sendAction；保留bankDraft、bankContext与阶段替换（F3/AC3）。增加城市标识用于补丁匹配，其他资产ledger-list保持原布局。窄屏名称换行，按钮44px。资源及PWA同步升级（AC4）。
