# 玩法胜率平衡验证 Checklist

> 版本：1.0｜2026-10-01｜依据已批准spec.md v1.0、plan.md v1.0、task.md v1.0；共76项检查，整份清单已获用户“确认”批准。用户停止后按实际证据标记：69项通过（部分范围注明），7项本批未完成/未执行，见acceptance.md；不是全部平衡验证完成。

## 验收约定

- 每项通过运行、观察或证据核对验证；下列命令中的node/npm使用实际Node 20运行环境。
- 按行为验收，不因实现文件重命名改变通过含义。命令和预期测试名称用于定位执行入口，重构时可调整入口但不能降低行为要求。
- 受控分支、debug、audit与formal各有来源；受控证明工具分支正确，不能增加正式自然胜率样本。
- 统计样本不足属于科学结论范围：正确报告证据不足可以满足报告口径检查，但不能把未执行的运行/审计项勾为通过，也不等于证明玩法已平衡。
- 只在取得实际证据后勾选；预算耗尽、中断、缺失终止类别、无法自然完赛、未覆盖物理设备或错误都在acceptance.md注明实际情况。
- 工具实现与原回归通过后再冻结并执行正式批次；4200局目标与240分钟/2GiB预算及首错停止条件保持批准plan版本。

## 配置与计划

- [x] **C1**：实际使用Node 20；已有工作区改动及规则摘要有基线记录，验证工具不连接或改动当前真人房间。（覆盖：AC18；验证：读取真实node版本、基线git状态和规则摘要；对照测试使用独立测试进程。）

- [x] **C2**：五种入口互斥，默认仅debug 20局/种子22/4人；非法参数拒绝且没有启动批次。（覆盖：AC12、AC17；验证：运行 `node --test --test-name-pattern="参数模式|帮助入口" test/balance-config.test.js`，核对实际通过结果。）

- [x] **C3**：五经营配置、机遇评分、逻辑上限、计算/输出预算、统计种子与筛查门槛在正式运行前固定。（覆盖：AC7、AC12、AC16；验证：运行 `node --test --test-name-pattern="偏好配置|运行阈值" test/balance-config.test.js`，核对实际通过结果。）

- [x] **C4**：正式清单共4200局/2240独立种子组，2人六配对/3人四组合/4人同场的全部座位排列不漏不重。（覆盖：AC6、AC7、AC12；验证：运行 `node --test --test-name-pattern="样本矩阵|交错顺序" test/balance-config.test.js`，核对实际通过结果。）

- [x] **C5**：独立组游戏种子无碰撞，组内换位正确共享游戏种子，同偏好保留其决策种子；游戏、本人和报告随机流独立。（覆盖：AC11、AC12、AC16；验证：运行 `node --test --test-name-pattern="随机流|种子标识" test/balance-config.test.js`，核对实际通过结果。）

- [x] **C6**：相关规则/策略/分析源变化会被记录并阻止静默续跑混合；生成时间和输出路径不制造新配置。（覆盖：AC11、AC13、AC17；验证：运行 `node --test --test-name-pattern="指纹" test/balance-config.test.js`，核对实际通过结果。）

## 正式规则与状态

- [x] **C7**：2/3/4人正常开局先完成全员首阶段选择再掷骰，现金、42格和单骰与正式规则一致。（覆盖：AC1、AC18；验证：运行 `node --test --test-name-pattern="正式开局" test/balance-session.test.js`，核对实际通过结果。）

- [x] **C8**：后续选择由正式轮次时点触发，提交锁定，其他人的提交/换组不延长同阶段选择时限。（覆盖：AC1、AC2；验证：运行 `node --test --test-name-pattern="决策时钟" test/balance-session.test.js`，核对实际通过结果；读取自动完整场景中后续阶段记录。）

- [x] **C9**：拍卖、直接购买及转让确认按真正应行动者执行；原回合玩家不能借他人现金行动。（覆盖：AC2；验证：运行 `node --test --test-name-pattern="行动者" test/balance-session.test.js`，核对实际通过结果；运行 `node --test --test-name-pattern="经营对照" test/balance-server-parity.test.js`，核对实际通过结果。）

- [x] **C10**：拒绝动作、执行中抛错和部分修改失败均不提交状态；成功动作对应修订仅增加一次。（覆盖：AC2、AC4；验证：运行 `node --test --test-name-pattern="动作校验|原子提交" test/balance-session.test.js`，核对实际通过结果。）

- [x] **C11**：过期封装、候选、费用和股票窗口报价被拒绝，不自动按新价成交或给回购买额度。（覆盖：AC2；验证：运行 `node --test --test-name-pattern="动作校验" test/balance-session.test.js`，核对实际通过结果；运行 `node --test --test-name-pattern="经营对照" test/balance-server-parity.test.js`，核对实际通过结果。）

- [x] **C12**：金额、房级、实际建房成本、机遇额度、股份数量与发行量满足正式经济约束。（覆盖：AC2、AC14；验证：运行 `node --test --test-name-pattern="经济守卫" test/balance-session.test.js`，核对实际通过结果。）

- [x] **C13**：自然完赛必须由正式规则产生唯一存活胜者，正式终局结算只做一次。（覆盖：AC4、AC5；验证：运行 `node --test --test-name-pattern="终止分类|逐局结果" test/balance-session.test.js`，核对实际通过结果；读取自然结果中的结算引用。）

- [x] **C14**：达到500完整轮或20000成功动作仍未自然结束时记截断；没有指定胜者、强制认输、解散或补发收益。（覆盖：AC4、AC5、AC12；验证：运行 `node --test --test-name-pattern="终止分类" test/balance-session.test.js`，核对实际通过结果；对比停止前后现金/基金/资产。）

- [x] **C15**：未支持阶段、非法动作、执行或观察不能核对记异常，保留失败理由、动作和最后有效状态。（覆盖：AC4、AC17；验证：运行 `node --test --test-name-pattern="终止分类" test/balance-session.test.js`，核对实际通过结果；运行 `node --test --test-name-pattern="异常中断" test/balance-storage.test.js`，核对实际通过结果。）

- [x] **C16**：连续正常回合无交易或无破产仍可推进；动作数不能充当回合数，真正无状态进展才属工具错误。（覆盖：AC4、AC15；验证：运行 `node --test --test-name-pattern="经济守卫" test/balance-session.test.js`，核对实际通过结果；运行 `node --test --test-name-pattern="回合观察" test/balance-observe.test.js`，核对实际通过结果。）

- [x] **C17**：策略只能看到当时公开及本人信息；隐藏骰袋/资讯池/他人候选/未公开选择不影响相同本人视图的决策，副本修改不改内部状态。（覆盖：AC3、AC11；验证：运行 `node --test --test-name-pattern="私有视图" test/balance-session.test.js`，核对实际通过结果；运行 `node --test --test-name-pattern="策略隔离" test/balance-policy.test.js`，核对实际通过结果。）

## 经营策略与操作覆盖

- [x] **C18**：中性基线各座位采用相同配置和选择规则；四偏好都能正常购置、建设、投资、飞行、竞买及救援，偏好差异有实际决策依据。（覆盖：AC6、AC7；验证：运行 `node --test --test-name-pattern="策略隔离|购买建设|股票买入|航班决策" test/balance-policy.test.js`，核对实际通过结果。）

- [x] **C19**：主动投资按公开估值和实际储备判断；已发生债务不因保留储备而放弃合法救援。（覆盖：AC7、AC14；验证：运行 `node --test --test-name-pattern="储备估值|债务救援|救援退出" test/balance-policy.test.js`，核对实际通过结果。）

- [x] **C20**：中性候选选择等概率且不换组；偏好按既定分数选本人合法候选，仅满足条件时首阶段换一次组。（覆盖：AC7、AC8；验证：运行 `node --test --test-name-pattern="机遇选择" test/balance-policy.test.js`，核对实际通过结果。）

- [x] **C21**：同分目标使用本人随机源，记忆和理由能解释操作；新回合正确重置，没有建拆/抵押赎回/同窗同城反复买卖循环。（覆盖：AC7、AC11；验证：运行 `node --test --test-name-pattern="决策记忆|股票减持" test/balance-policy.test.js`，核对实际通过结果。）

- [x] **C22**：普通建设、远程、赎回、购买、冻结与监狱流程有合法选择证据，报价/圈额度限制继续生效。（覆盖：AC2、AC7；验证：运行 `node --test --test-name-pattern="回合起手|购买建设|冻结监狱" test/balance-policy.test.js`，核对实际通过结果；运行 `node --test --test-name-pattern="基础对照" test/balance-server-parity.test.js`，核对实际通过结果。）

- [x] **C23**：股票卖出与买入遵守当前报价、三城/六股/每城两股累计预算、发行总量和城主四股限制；卖出或转让不重置购买额度。（覆盖：AC2、AC7、AC14；验证：运行 `node --test --test-name-pattern="股票减持|股票买入" test/balance-policy.test.js`，核对实际通过结果；运行 `node --test --test-name-pattern="经营对照" test/balance-server-parity.test.js`，核对实际通过结果。）

- [x] **C24**：转让一城一股及实际买方接受/拒绝合法；拒绝后回原窗口，最多一次提议且不反复无偿赠送或定向资助座位。（覆盖：AC2、AC7；验证：运行 `node --test --test-name-pattern="转让决策" test/balance-policy.test.js`，核对实际通过结果；运行 `node --test --test-name-pattern="经营对照" test/balance-server-parity.test.js`，核对实际通过结果。）

- [x] **C25**：航班依据公开落点估值和实际费用选择；有利才飞、不利可放弃，不读取骰袋或把H8算成飞行奖励。（覆盖：AC2、AC7；验证：运行 `node --test --test-name-pattern="航班决策" test/balance-policy.test.js`，核对实际通过结果；运行 `node --test --test-name-pattern="经营对照" test/balance-server-parity.test.js`，核对实际通过结果。）

- [x] **C26**：拍卖/直接购买、合法募资和股债/抵押/拆房/卖城救援能完成；无合法资产才退出，不为了终局证据主动认输。（覆盖：AC2、AC7；验证：运行 `node --test --test-name-pattern="竞买决策|募资决策|债务救援|救援退出" test/balance-policy.test.js`，核对实际通过结果；运行 `node --test --test-name-pattern="经营对照" test/balance-server-parity.test.js`，核对实际通过结果。）

## 机遇、经济与轮次观察

- [x] **C27**：候选出现、换组、提交与统一生效分别记录，包含选择时资产/存活/名次；未统一生效的选择不计实际奖励。（覆盖：AC8、AC9；验证：运行 `node --test --test-name-pattern="选择观察" test/balance-observe.test.js`，核对实际通过结果。）

- [x] **C28**：H1/H2/H3和资讯建设折扣按资格/额度/真实成功记录；H1没有虚构现金，零贡献不算触发。（覆盖：AC8、AC10、AC14；验证：运行 `node --test --test-name-pattern="建设机遇观察" test/balance-observe.test.js`，核对实际通过结果。）

- [x] **C29**：H4/H5/H6实际奖金、持股奖励和租金优惠可核对，基础股息与城主保留收益区分。（覆盖：AC8、AC10、AC14；验证：运行 `node --test --test-name-pattern="投资机遇观察" test/balance-observe.test.js`，核对实际通过结果。）

- [x] **C30**：H7/H8/H9机票、骰子首次机场和邻城奖励分别核对，免费票、飞行或机会移动不误耗H7/H8。（覆盖：AC8、AC10、AC14；验证：运行 `node --test --test-name-pattern="航线机遇观察" test/balance-observe.test.js`，核对实际通过结果。）

- [x] **C31**：H10/H11/H12按正式条件、圈额度与生效时点观察，抵押城市数量/正城市租金/一次奖励口径正确。（覆盖：AC8、AC14；验证：运行 `node --test --test-name-pattern="防御机遇观察" test/balance-observe.test.js`，核对实际通过结果。）

- [x] **C32**：未满足条件、满足未用、额度耗尽、主动放弃与未知分开；主动放弃有理由，被动自动效果不称为主动放弃，同一机会不虚增。（覆盖：AC8；验证：运行 `node --test --test-name-pattern="使用机会" test/balance-observe.test.js`，核对实际通过结果。）

- [x] **C33**：结构化建设/租金/票务结算能核对各玩家现金、银行补足与基金；优惠和补足不重复累计收益。（覆盖：AC14；验证：运行 `node --test --test-name-pattern="结构化账务" test/balance-observe.test.js`，核对实际通过结果。）

- [x] **C34**：股份成交、转让、分红、保留收益、超持强卖和清算核对现金/股份/基金；买入非收入，自持分红和保留不双计。（覆盖：AC14；验证：运行 `node --test --test-name-pattern="股票账务" test/balance-observe.test.js`，核对实际通过结果。）

- [x] **C35**：GO、机会奖励/罚款及同一步分红/机遇奖金逐笔分解，缺少结构化旧分支有可核对规则依据而非只猜文案或总现金差。（覆盖：AC14；验证：运行 `node --test --test-name-pattern="起点机会账务" test/balance-observe.test.js`，核对实际通过结果。）

- [x] **C36**：城市/机场购置、拍卖、直接出售、抵押赎回、利息/冻结/监狱及救援返款区分银行和玩家转移，实际建房成本退款正确。（覆盖：AC14；验证：运行 `node --test --test-name-pattern="经营救援账务" test/balance-observe.test.js`，核对实际通过结果。）

- [x] **C37**：完整轮、个人实际回合、连续跳过、GO绕圈与出局能逐项核对；股票/拍卖多个动作仍计同回合。（覆盖：AC15；验证：运行 `node --test --test-name-pattern="回合观察" test/balance-observe.test.js`，核对实际通过结果。）

- [x] **C38**：远程/建设、持股/防御、机场/邻城三组合的出现、真实触发及收益有流水，小样本保留而不强行排强弱。（覆盖：AC10、AC16；验证：运行 `node --test --test-name-pattern="观察汇总" test/balance-observe.test.js`，核对实际通过结果；运行 `node --test --test-name-pattern="分层比较|风险分类" test/balance-stats.test.js`，核对实际通过结果。）

- [x] **C39**：规范资产分项与现金、基金核对，经济注入/收入/支出/转移/估值分别呈现；未知金额阻止精确收益结论。（覆盖：AC14、AC17；验证：运行 `node --test --test-name-pattern="逐局结果" test/balance-session.test.js`，核对实际通过结果；运行 `node --test --test-name-pattern="观察汇总" test/balance-observe.test.js`，核对实际通过结果。）

## 保存、重放与成本

- [x] **C40**：输出只在项目内验证专用目录，新批次不覆盖已有不匹配内容；越界、生产目录及链接到保护目标被拒绝。（覆盖：AC13、AC18；验证：运行 `node --test --test-name-pattern="输出保护" test/balance-storage.test.js`，核对实际通过结果。）

- [x] **C41**：原子配置、检查点、结果与清单在崩溃边界一致；无有效终止结果不得标样本完成，重复样本不覆盖。（覆盖：AC13、AC17；验证：运行 `node --test --test-name-pattern="原子保存|批次清单" test/balance-storage.test.js`，核对实际通过结果。）

- [x] **C42**：完整动作/理由/观察分段压缩后重读一致；损坏段、不完整末条保留审计，有效前缀不删除且不重复纳入。（覆盖：AC11、AC13、AC17；验证：运行 `node --test --test-name-pattern="分段流水" test/balance-storage.test.js`，核对实际通过结果；运行 `node --test --test-name-pattern="恢复审计" test/balance-replay.test.js`，核对实际通过结果。）

- [x] **C43**：异配置/规则/策略/相关代码版本拒绝静默续跑，生成标识映射可核对但经济版本不同不能自动按新价继续。（覆盖：AC11、AC13；验证：运行 `node --test --test-name-pattern="原子保存" test/balance-storage.test.js`，核对实际通过结果；运行 `node --test --test-name-pattern="重放差异" test/balance-replay.test.js`，核对实际通过结果。）

- [x] **C44**：同配置种子逐步重放动作、金额、阶段、记忆、终止和随机计数相同；恢复重新执行策略随机调用，审计不增加正式样本。（覆盖：AC11、AC13、AC17；验证：运行 `node --test --test-name-pattern="策略重放|恢复审计" test/balance-replay.test.js`，核对实际通过结果。）

- [x] **C45**：60秒片段/240分钟累计预算导致保存与续跑，不变成胜者或逻辑截断；恢复重放计入总耗时但不吞掉继续执行片段。（覆盖：AC12、AC13；验证：运行 `node --test --test-name-pattern="计算预算" test/balance-storage.test.js`，核对实际通过结果；读取正式累计耗时与停止原因。）

- [x] **C46**：2GiB输出限额或写入失败停止新动作并保留记录，不删除用户或旧批次文件；实验用小注入上限验证。（覆盖：AC12、AC13、AC18；验证：运行 `node --test --test-name-pattern="输出预算" test/balance-storage.test.js`，核对实际通过结果。）

- [x] **C47**：正式首个执行/对账/重放错误保留并停止排查，原异常不会被成功重跑覆盖；中断明确标记待恢复。（覆盖：AC4、AC12、AC13、AC17；验证：运行 `node --test --test-name-pattern="异常中断" test/balance-storage.test.js`，核对实际通过结果。）

- [x] **C48**：进度列计划/实际/待恢复/完整组/预算；审计样本按稳定编号选取，不按有利结果挑选，缺失终止类别如实说明。（覆盖：AC12、AC13、AC17；验证：运行 `node --test --test-name-pattern="审计选取" test/balance-replay.test.js`，核对实际通过结果；读取正式进度和审计索引。）

## 统计与报告口径

- [x] **C49**：汇总只纳入指定正式批次的一次有效计划结果；受控/debug/audit、重复/缺失/异版本不能静默混入。（覆盖：AC5、AC17；验证：运行 `node --test --test-name-pattern="统计来源" test/balance-stats.test.js`，核对实际通过结果。）

- [x] **C50**：已终止数等于自然＋截断＋异常，自然胜场和完赛数一致；待恢复另列，两种胜率有正确分母，零自然完赛显示不可计算。（覆盖：AC5；验证：运行 `node --test --test-name-pattern="胜率分母" test/balance-stats.test.js`，核对实际通过结果。）

- [ ] **C51**：2/3/4人中性基线座位表包含胜场/两种胜率/区间/出局/资产/局长；条件参考1/n，开局参考完赛率/n。（覆盖：AC6、AC16；验证：运行 `node --test --test-name-pattern="胜率分母|分层比较" test/balance-stats.test.js`，核对实际通过结果；核对各人数正式表。）

- [ ] **C52**：四偏好的六配对、四三人组合和四人全场分别汇总，并列目标/实际排列与组数，不混固定座位优势。（覆盖：AC7、AC16；验证：运行 `node --test --test-name-pattern="样本矩阵" test/balance-config.test.js`，核对实际通过结果；核对正式组合表与清单。）

- [ ] **C53**：十二机遇零样本仍列出，首阶段随机中性样本按座位标准化；后期按人数/阶段/存活/固定资产层与名次另表。（覆盖：AC8、AC9、AC16；验证：运行 `node --test --test-name-pattern="分层比较" test/balance-stats.test.js`，核对实际通过结果；核对正式12项分阶段表。）

- [x] **C54**：现金/收益/资产和局长按自然、截断等分别描述均值/中位/P10/P90/极端样本，不平均四舍五入的比例或把未知当零。（覆盖：AC14、AC15；验证：运行 `node --test --test-name-pattern="描述统计" test/balance-stats.test.js`，核对实际通过结果。）

- [x] **C55**：重采样抽取整组保留同局玩家与全部依赖排列，实验组合分层，独立组不足不得冒充更多样本。（覆盖：AC16；验证：运行 `node --test --test-name-pattern="整组重采样" test/balance-stats.test.js`，核对实际通过结果。）

- [ ] **C56**：正式重采样次数50000且报告种子固定；普通95%与族内校正区间区分，比较数恒为9/24/36。（覆盖：AC16；验证：运行 `node --test --test-name-pattern="比较区间" test/balance-stats.test.js`，核对实际通过结果；读取正式analysis配置及区间元数据。）

- [x] **C57**：零必要分母、有效重采样率低于99%、区间退化或组不足时明确区间不稳定；不输出假精确度或减少比较数。（覆盖：AC5、AC16；验证：运行 `node --test --test-name-pattern="比较区间|证据门槛" test/balance-stats.test.js`，核对实际通过结果。）

- [x] **C58**：主要比较按K7完整覆盖/自然样本/完赛率/独立组/机遇座位分母门槛判断；未完成组和慢局不得选择性删除后声称显著。（覆盖：AC12、AC16；验证：运行 `node --test --test-name-pattern="证据门槛" test/balance-stats.test.js`，核对实际通过结果。）

- [x] **C59**：座位5/偏好及机遇10个百分点与普通/校正区间条件共同决定风险；不足/趋势/未发现分开，无显著差异不称等强。（覆盖：AC16；验证：运行 `node --test --test-name-pattern="风险分类" test/balance-stats.test.js`，核对实际通过结果。）

- [x] **C60**：截断≥20%、自然局长P90≥250及机遇低使用/难满足警报按既定样本阈值触发；中断局不作整局不能触发，组合不足不排名。（覆盖：AC10、AC15、AC16；验证：运行 `node --test --test-name-pattern="风险分类" test/balance-stats.test.js`，核对实际通过结果。）

- [x] **C61**：中文报告的数量/比例/金额与结构化汇总一致，观测、原因、建议及策略/后期存活/截断/近似区间限制就近说明。（覆盖：AC16、AC17；验证：运行 `node --test --test-name-pattern="中文报告|报告证据" test/balance-stats.test.js`，核对实际通过结果。）

## 回归与环境

- [x] **C62**：命令行五入口可实际运行，帮助不启动游戏，报告模式不生成新对局；批量入口不启动生产服务或保存正式对局记录。（覆盖：AC17、AC18；验证：运行 `node --test --test-name-pattern="命令入口|续跑场景" test/balance-scenario.test.js`，核对实际通过结果。）

- [x] **C63**：实际Node 20运行九个新增验证文件，所有用例执行并通过，保留日志，无跳过或预期冒充实际。（覆盖：AC18；验证：显式传入九个balance验证文件运行node --test --test-force-exit，记录版本、数量与退出码。）

- [x] **C64**：完整既有规则/联机回归与lint实际通过，无新增生产依赖，正式规则/金额/单骰/棋盘/玩家入口与基线一致。（覆盖：AC18；验证：实际Node 20环境运行npm test与npm run lint，核对规则摘要及package依赖差异。）

- [x] **C65**：现有四个浏览器测试文件全部通过，三端、缩放、缓存及原交互可用；未测物理设备范围如实说明。（覆盖：AC18；验证：运行npm run test:e2e，保留四文件实际输出和限制。）

## 正式批次与交付

- [x] **C66**：2/3/4人各有debug小批次真实结果，工具无错后冻结版本；debug场景不计正式样本或机遇胜率。（覆盖：AC1、AC12、AC17；验证：各人数运行--games 3 --seed 22并核对来源、流水、结果和版本记录。）

- [x] **C67**：首个正式动作前配置/计划/种子/版本/阈值/预算已落盘，且与批准plan一致。（覆盖：AC12、AC17；验证：核对正式config、schedule、manifest及时间顺序，目标4200局/2240组。）

- [x] **C68**：实际启动正式交错批次，2/3/4人数与计划各实验有可核对的执行/缺口；按预定原因停止，未完成4200目标如实列出，不虚称全部抽样完成。（覆盖：AC6、AC7、AC12；验证：运行--formal/必要续跑并读取实际清单、独立组和停止原因，不用受控样本补数。）

- [x] **C69**：实际原始结果唯一且数量可核对，所有截断/异常/待恢复保留；没有按有利结果删局、补奖或自动增加预算。（覆盖：AC5、AC12、AC17；验证：核对全部正式sampleId、结果类别、audit/attempt关联与累计240分钟/2GiB。）

- [ ] **C70**：每人数实际存在的首个自然/截断/异常代表样本按稳定编号审计重放并一致；不存在类别及预算内未完成审计明确列出。（覆盖：AC11、AC17；验证：运行--replay/--sample，核对ReplayCheck、原始结果未被替换及缺失说明。）

- [ ] **C71**：最终中文报告交付胜率/完赛率/截断/异常/触发/收益/局长及各人数路线机遇组合，索引可追溯到配置和逐局流水。（覆盖：AC6、AC7、AC8、AC9、AC10、AC15、AC17；验证：运行--report，逐表与实际summary及evidence-index核对。）

- [ ] **C72**：真实代表性对局的GO、奖励、建设、租金/银行、分红/保留、交易、清算等金额可逐项核对；未发生项引用独立受控验证而不假称本局发生。（覆盖：AC14、AC17；验证：重放实际代表流水并核对前后现金/基金/资产，分类说明证据来源。）

- [x] **C73**：不足证据的玩法只交付实际观察与复核建议；正式数值未调，报告不声称真人胜率或所有玩法已等强。（覆盖：AC12、AC16、AC18；验证：核对最终结论与K7门槛、样本/预算/策略限制及基线规则摘要。）

## 端到端与验收记录

- [x] **C74**：至少一局正常2至4人某人数开局→首选择→正常经营→实际后续阶段→自然终局或预设逻辑截断→保存→独立重放→报告核对，具有真实连续流水。（覆盖：AC1、AC2、AC4、AC11、AC17、AC19；验证：运行 `node --test --test-name-pattern="完整场景" test/balance-scenario.test.js`，核对实际通过结果；查看对应连续证据，未到达罕见分支另列受控证据。）

- [x] **C75**：小批次中断→保存→重放恢复→完成→重生成报告，与不中断执行的语义结果一致，已完成样本不重复计数。（覆盖：AC11、AC13、AC17；验证：运行 `node --test --test-name-pattern="续跑场景" test/balance-scenario.test.js`，核对实际通过结果。）

- [x] **C76**：验收表每项有实际证据和通过/不通过，问题与重跑保留；86项任务有进度记录，本轮提交不夹带既有文件或原始大批流水。（覆盖：AC17、AC18；验证：核对acceptance/progress、git diff --check与显式提交文件清单，未通过项在最终交付列明。）

## 验收标准覆盖

| spec验收标准 | 清单条目 |
|---|---|
| AC1 | C7、C8、C66、C74 |
| AC2 | C8、C9、C10、C11、C12、C22、C23、C24、C25、C26、C74 |
| AC3 | C17 |
| AC4 | C10、C13、C14、C15、C16、C47、C74 |
| AC5 | C13、C14、C49、C50、C57、C69 |
| AC6 | C4、C18、C51、C68、C71 |
| AC7 | C3、C4、C18、C19、C20、C21、C22、C23、C24、C25、C26、C52、C68、C71 |
| AC8 | C20、C27、C28、C29、C30、C31、C32、C53、C71 |
| AC9 | C27、C53、C71 |
| AC10 | C28、C29、C30、C38、C60、C71 |
| AC11 | C5、C6、C17、C21、C42、C43、C44、C70、C74、C75 |
| AC12 | C2、C3、C4、C5、C14、C45、C46、C47、C48、C58、C66、C67、C68、C69、C73 |
| AC13 | C6、C40、C41、C42、C43、C44、C45、C46、C47、C48、C75 |
| AC14 | C12、C19、C23、C28、C29、C30、C31、C33、C34、C35、C36、C39、C54、C72 |
| AC15 | C16、C37、C54、C60、C71 |
| AC16 | C3、C5、C38、C51、C52、C53、C55、C56、C57、C58、C59、C60、C61、C73 |
| AC17 | C2、C6、C15、C39、C41、C42、C44、C47、C48、C49、C61、C62、C66、C67、C69、C70、C71、C72、C74、C75、C76 |
| AC18 | C1、C7、C40、C46、C62、C63、C64、C65、C73、C76 |
| AC19 | C74 |

## 证据与审批

实施时将每项实际命令、退出码、摘要/流水/报告位置、失败和重跑结果写入docs/gameplay-balance/acceptance.md；原始证据在artifacts/gameplay-balance/<runId>/，正式记录目录不作本轮验证输出。

四份文档均已批准并按任务执行。2026-10-01用户要求停止继续验证；当前未执行项保留，进度和实际范围见progress.md/acceptance.md。没有玩法已平衡结论。

## 2026-10-01批准的限定修订

用户已批准[自救出售修订](rescue-fix-proposal.md)：允许从真实服务端pending补全规范化sell_city的自救上下文，并验证拍卖/直接出售的恢复与拒绝原子性。仅修复已复现缺陷，价格、收益、额度和获胜条件按原规则；旧debug异常证据保留，正式批次以修复后的冻结指纹开始。补充R1–R4任务及六项检查，原86项任务与76项清单不因本修订降低要求。

## 用户停止后的验收范围

本批63终止/2待恢复/4135未执行。C51/C52/C53/C56/C70/C71/C72本批未完成或未执行；测试工具覆盖不替代本批正式报告与审计。已停止抽样进程，不自动恢复。
