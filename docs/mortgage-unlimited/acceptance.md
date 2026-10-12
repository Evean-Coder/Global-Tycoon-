# 取消抵押数量上限验收

日期：2026-10-12。实现与本地验收完成；功能提交f7a234a已推送并在Render核对资源与独立联机检查，证据见deployment.json。完整CI发现两处历史断言未同步，正在修正并补推验收记录。

## 已完成

- C1：正常/快速及旧规则普通局允许第三、第四座抵押；重复同城、非本人和禁止阶段无资金或产权变更。实际Socket同请求重放仅一次放款，非本人/旧身份拒绝，原deadline不延长。
- C2：自救、城市/机场购买筹资和建房筹资均可抵押第三城；8种模式/阶段手机触控场景通过，未自动确认购买或建设。
- C3：普通/快速×手机竖屏320×700、低高度横屏844×280、平板768×1024、PC1440×900×银行/资产/详情，共24组实际第三城抵押通过。提示不再显示两座限额。
- C4：AI正常评估及异常回退能考虑第三城；仍按预估停租、利息及拆房折损选择。当前模拟工具筹资能力同步，不修改历史策略基线或运行完整模拟局。
- C5：服务端/单位/AI/原赎回113/113通过；浏览器共13个不同测试组分批复验通过，lint通过，缓存升级至global-tycoon-v25-mortgage-unlimited，静态版本20261012-mortgage-unlimited-v1。
- C6：f7a234a已推送；Render四个公开资源与本地规范换行后的SHA256一致，自建两人房间创建/加入/机遇提交/掷骰通过并解散。第一次CI失败；见下方修正，不将上线等同CI通过。

## 证据与验证修正

服务端日志artifacts/mortgage-unlimited-unit-final.txt；浏览器初验artifacts/mortgage-unlimited-browser.txt（11通过，新增2组失败）与修正复验artifacts/mortgage-unlimited-browser-final.txt（2/2通过）；lint最终artifacts/mortgage-unlimited-lint-final.txt。

首次单位检查发现测试夹具缺快速路线版本、错误要求原无效动作返回rejected、旧AI固定断言仍假定名额满必须拆房；按现行行为修正，独立金额/非法无变更检查保留。浏览器首次错误假定所有抵押后仍打开弹窗、状态夹具会原地更新及旧建房标题，修正测试后通过；未为通过测试改变生产弹窗或状态逻辑。

本金50%、原利息、每城不可重复抵押、阶段权限、赎回规则和费用均保持。验证为本地Edge模拟视口，不代表已实测微信真机；Render部署会重启服务，内存房间不跨重启保存。

## 完整CI修正

本地复现npm test为487项，485通过/2失败：balance-policy旧断言假定抵押两城后只能拆房；balance-session仍断言同步机遇30秒（现行已批准60秒）。同步测试到实际规则，保留资金、房级、决定ID及不延时检查；两个失败文件25/25复验通过（artifacts/mortgage-unlimited-ci-recheck.txt），未改变生产规则。

完整浏览器门槛40组初验38通过/2失败（artifacts/mortgage-unlimited-ci-browser.txt）：atlas-details仍查旧lrow，修正后5/5通过；横屏夹具没有等待两个人机真实完成初始选择，导致旧阶段与受控状态交错，补齐等待后3/3通过（artifacts/mortgage-unlimited-ci-browser-final.txt）。40个门槛组分批复验通过；未将失败日志写为一次40/40。

另同步旧action-feedback银行选择器并使用已打开的银行，不点击遮罩后的底栏；3/3通过（artifacts/mortgage-unlimited-feedback-final.txt）。所有这些均为测试适配；原慢回执、断线、重复操作与真实资金断言保留。完整线上CI以deployment.json记录，不用本地分批结果冒充远端成功。
