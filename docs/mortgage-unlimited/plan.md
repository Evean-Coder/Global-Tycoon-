# 取消抵押数量上限 Plan

依据Spec自审通过。

## 架构与接口

F1：移除gameLogic普通/自救抵押的MORTGAGE_MAX守卫；保留ownership、mortgaged、phase及原sendAction/normalizeAction/请求去重。不增加请求或存档字段。
F2：client.js移除台账/详情/银行/筹资mgCount禁用逻辑；计数仅展示，无限制提示替换现有限额文案。rules.md与规则速查同步。
F3：botEvaluation.liquidation和botPolicy.fallback不以两座过滤抵押，筹资仍有限循环；模拟工具的当前抵押能力估算同步，不修改历史bot-policy-v1基线。
F4：静态版本与PWA递增，限定提交，推送main；检查远端提交、GitHub CI及Render页面资源版本。

部署核对附带scripts/verify-mortgage-release.js：四个资源SHA256按LF规范化比对，仅自建临时房间开局/提交机遇/一次掷骰后解散，并保存deployment.json。完整CI中历史断言按现行60秒/无限抵押及独立银行行同步，不改生产逻辑。

## 交互与技术决策

本人合法阶段→原抵押动作→原50%放款与标记→同步现金/缺口/列表。全城抵押后无更多候选，重复同城/其他玩家城市仍拒绝，不影响赎回。前端更新采用既有补丁/草稿流程。服务端规则变化在部署后生效；Render更新可能重启现有内存房间，交付明确提示。
