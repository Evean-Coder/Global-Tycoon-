> 发布补记（2026-10-17）：用户已明确要求“推送”，本轮发布暂停解除。以下未推送说明记录开发验收当时的状态；本次GitHub推送及Render同步结果以实际发布回执为准。

# 主动经营三路线：本地开发与验收

2026-10-17。用户在四份文档完成后明确“开始吧”，随后要求继续未完成开发。本轮已完成本地实现。**当前不推送；未核实GitHub CI、真机或Render上线版本。**

## 已实现内容

- 新局显式启用management-economy-v1，保持原v4守卫与股票v2；旧局、旧订单不迁移。
- 订单预付1000–2000、基础净利等于预付，下一次本人回合领25%利润，再下次返本金和余利；有原资讯时最高净利2200。本金、利润、奖金分列，抵押/失去产权/结束取消未领部分。
- 远程建设原四档费用、最低150%、三次本人GO冷却与连续同城限制保持。
- 商业竞争按五洲、至少两名基本合格者发布；每四完整轮一期，暗价100–3000/步长100，每人每期及每本人圈一次；提交不扣现金，轮末按真实资金/来源开标。最高价优先，同价挑战者优先，剩余随机，历史跨空期保存。
- 赢家一座旗舰在随后四完整轮、最多两笔正式租金享基租15%附加、单笔最多3000。与资讯相加、沿原股票分配和个人减免，整笔结算后才判断净现金自救；未赚收益不估值、不补偿。
- 本人0/1/2次净收益预览沿两个分支顺序消耗H4额度，不机械翻倍。上海四级、城主2股/H4余700案例为3280与6480累计，出3000后为−3000/+280/+3480。
- 三路线主界面→目标子窗口，竞争先选旗舰再出价；保留左放弃/右关闭查看、掷骰右侧经营按钮和无项目不弹。报价变化需重新确认，负估算可主动再次确认；刷新保留出价、展开与阅读位置。
- 本地资源query统一20261017-management-economy、PWA v44；AI比较延后回款、真实增收、现金储备与封盘期限；记录公开事实，完整私有journal仍仅服务端落盘。

## 验证结果

| 范围 | 结果 | 证据 |
|---|---|---|
| 新规则、订单、竞争、股息、顺序预览、边界、AI、真实Socket | **33/33通过** | [engine-final.txt](engine-final.txt) |
| 旧v4、经营提示、完整轮、旧股票、即时股息、AI、私有回放、quick与bot相邻回归 | **72/72通过** | [regression-tests.txt](regression-tests.txt) |
| 本轮界面四用例＋缓存迁移＋原按钮顺序 | **6/6通过** | [browser-final.txt](browser-final.txt) |
| 最后规则文案修复复验 | 四视口对应的原用例通过（其余3例按名称过滤跳过，不增计数） | [rules-final.txt](rules-final.txt) |
| 项目Lint | 通过，退出0 | [lint.txt](lint.txt)（无诊断输出） |
| 生成规则目录 | `scripts/build-rules-catalog.js --check`退出0 | 与源目录一致 |
| 文档结构与覆盖 | 编号、前置依赖、21项AC、54项观察及链接检查 | [document-audit-results.json](document-audit-results.json) |

合计111个不同定向测试/浏览器用例；重复复验不叠加计数。未运行大量完整对局。旧设计模型15项与本次实现测试分开，不计入111。

Node20运行位置：`C:/Users/Yifan/AppData/Local/npm-cache/_npx/ebaba8b9e55fd0a9/node_modules/node/bin/node.exe`。

核心命令（在仓库根目录；node指上述运行时）：

```powershell
node --test --test-force-exit --test-concurrency=1 test/management-economy-orders.test.js test/commercial-competition.test.js test/competition-rent.test.js test/competition-preview.test.js test/management-economy-boundaries.test.js test/management-economy-ai.test.js test/management-economy-socket.test.js
node --test --test-force-exit --test-concurrency=1 test/management-balance-v4.test.js test/management-prompt.test.js test/round-flow.test.js test/stock-investment-dividend.test.js test/stock-investment-legacy.test.js test/stock-investment-ai.test.js test/private-replay.test.js test/quick-mode.test.js test/quick-server.test.js test/bot-server.test.js
node --test --test-force-exit --test-concurrency=1 e2e/management-economy.spec.js e2e/cache.spec.js e2e/action-button-order.spec.js
node node_modules/eslint/bin/eslint.js server.js src scripts public/client.js public/management-economy-view.js public/stock-investment-view.js public/board-layout.js public/board-presentation.js test e2e
node scripts/build-rules-catalog.js --check
node docs/commercial-competition/document-audit.cjs
```

最初受沙箱spawn EPERM限制的测试未计为产品测试结果；获准使用测试子进程后运行以上有限集合。浏览器使用本地无头Edge与受控本地服务，资产/轮号准备是夹具，实际按钮、Socket身份/回执、租金处理走真实路径。

## AC与检查覆盖

| AC / 清单 | 实际依据 |
|---|---|
| AC1–AC4；C1–C9 | 新订单21类标的、首尾/资讯、本圈与同时一单、真实冻结/监狱prepare、来源恢复；旧v4完整费用/优惠/冷却回归；银行/自救/出售风险文案源码核对 |
| AC5–AC8；C10–C20 | 两人/三人发布、后来获得城市、圈/期/容量、不可变报名、范围、真实资金降序、同价受控rng端点、重复请求与close |
| AC9–AC12；C21–C32 | 低价/上海封顶与资讯相加、非触发源、0/部分/全10股、H4/个人减免、现金守恒、最终净额自救、R+4续接、结束与真实提交前封盘 |
| AC13–AC15；C33–C39 | 顺序H4副本、城主留存/银行/本人股息、预览前后state深等、UI旧token拒绝保草稿、负额再次确认、公私快照与公开记录 |
| AC16–AC17；C40–C47 | 类型/目标/报名流程、无项目、关闭查看、四视口、外人刷新不跳、规则定位、键盘与减少动画；**C44真机系统缩放未测** |
| AC18–AC20；C48–C52 | AI成本/隐藏信息隔离、双真人Socket、非当前玩家离线不阻塞报名、重连、bot真实runAction、旧客户端提示、旧局/回放、缓存迁移与离线壳 |
| AC21；C53–C54 | 以上最终日志、截图、测量与限制，未发布，未把设计模型或浏览器模拟说成线上/真机结果 |

部分未变出口以相邻回归与源码核对共同覆盖；不存在所有浏览器、所有随机种子或平均胜率已验证的承诺。

## 三端观察

四个主视口1440×900、768×1024、932×430、844×280，逐个打开类型页、订单与竞争子页，验证全文可滚动、首尾目标和页脚可达、规则返回不丢草稿。截图与真实边界值见 [measurements.json](evidence/measurements.json)。

- [932×430类型页](evidence/types-932x430.png)
- [844×280竞争详情滚动到底](evidence/competition-844x280.png)
- [1440×900竞争详情](evidence/competition-1440x900.png)
- [200%等效布局空间](evidence/tablet-200-percent-layout.png)：384×512 CSS像素、2倍设备像素比、桌面触控条件，模拟768×1024屏幕在2倍显示下的可用布局预算。**不是实际设备系统设置或浏览器原生200%缩放。**

截图已查看；小高度横屏正文为单滚动区，关键页脚保持可达，按钮44CSS像素。C44真实设备系统缩放仍未验证，保持未勾选；其余53项按上述自动证据与源码核对记录完成。真机浏览器旋转、软键盘与不同系统字体仍需实机观察。

## 开发中发现并修复

1. 规范化动作不携带内部listingEpoch，首次报名曾错误保存空来源，导致合法报名开标失效；现在仅用服务端重新计算的fresh报价写来源，真实Socket闭环验证通过。
2. 城市上市代次不随所有产权转让变化；新增city.ownershipEpoch与上市代次共同验证，机场亦按真实产权变更记录代次，转出再买回不恢复。
3. 修改出价时曾把不同金额token误判成报价更新，下一次刷新提示消失导致横屏列表上跳23px；改为城市＋金额存token，真实更新提示持续保留，四视口刷新滚动值一致。
4. 窗口跨个人回合后关闭旧上下文曾未在同次同步打开新上下文；先关闭过期窗口再按本回合条件打开，避免漏掉正常经营提示。
5. 初次缩放场景夹具依赖自动恢复会话、以及原生下拉框Enter打开菜单造成验证不成立；改为显式身份重连与正确键盘顺序后复验通过，未以调宽断言掩盖问题。
6. 股票规则页尾仍保留“本局只有订单与施工”的旧说明；按management-economy版本区分文案，新增断言后四视口复验通过。

早期失败日志留作过程记录，以engine-final/browser-final最终通过结果为准。真实quick截止在动作前及候选后均单独验证，未提交的中标费用不会扣除。

## 交付与限制

运行功能与32项开发任务已完成，本地变更可审阅。53项本地检查完成、1项实机缩放观察待验证；不能声称全部54项或AC17所有平台条件均已通过。没有进行大量整局平衡模拟，无法据此保证平均局时、胜率或所有策略收益已经均衡。工作区原有无关文件保留。

**未推送、未触发Render发布、未确认线上版本。**
