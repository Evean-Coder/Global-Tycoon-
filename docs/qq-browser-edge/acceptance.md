# 手机横屏内容左移：验收

日期：2026-10-18。用户明确要求所有手机浏览器统一利用左侧空白；已按修订后的四份文档实施。运行代码仅将compact对局页左padding设为0，其余三向值、原棋盘和游戏逻辑保持；缓存v47-landscape-edge。

## 实际验证

- target-results.txt：首轮9项中7项通过，包含缓存升级1项、原手机全图5项及UA检查1项；新增用例中快速模式夹具缺少routeRevision／时钟、股票详情选择器错误，随后修正。失败不追溯标为通过。
- edge-results.txt：中间复验2/3，定位到快速模式时钟未初始化的测试夹具问题。
- edge-verified.txt：修正夹具后新增3/3通过；双模式三视口、左0/8/40/80px共24组几何检查；QQ／普通Android／iOS代表UA仅为模拟，不是真实内核验证。
- 因此本轮9个不同浏览器用例均已有通过证据，重复运行不累加。原全图仍验证PC／平板恢复、横屏门禁、真实5步移动、主要按钮44px、放大回退。
- 新增用例实际比较顶栏left=0、棋盘及底栏left约4px；额外左值不再缩窄内容，右边界保持；上12／右24／底20px仍有效。股票草稿、报价说明展开、同状态广播后的资金及期限保持。
- 完整Lint及本轮diff检查通过。没有新增运行时依赖或游戏规则。

## 视觉与限制

原问题模拟截图evidence/current-inset-40.png与修复后evidence/verified/mobile-landscape-edge/normal-844x382.png已实际查看。新截图左侧利用了原空白，中央地图、资讯／台账、右侧玩家栏及底部按钮保留。

荣耀X50／QQ实体机、真实摄像头遮挡与系统字体缩放未由本轮工具实测；需用户刷新后复看。UA模拟不等于真实QQ或Safari验证。

## 发布

本地验证完成，按默认自动推送约定发布；远端CI及Render最终资源核对另写release.json，未核对前不报告部署完成。

## 完整CI后续处理

f5bc337完整单测和Lint通过，浏览器阶段仅build-fundraising-stock文件级初始化退出，远端注释未包含更深堆栈。该文件本地单独复验2/2通过；继续以真实5秒心跳配合跨模式固定夹具复现，得到server heartbeat读取普通局不存在的quick.status异常，见ci-heartbeat-reproduction.json。

该测试原本已经使用假的行动时钟，却仍使用真实整局心跳；修订为沿现有fakeClock控制快速整局时钟，消除与机器速度有关的异步任务。未修改服务端规则或跳过断言；资金测试再次2/2通过，见funding-ci-verified.txt。本轮不同浏览器检查增至11项，不把重复复验相加。

Render v47的index/style/sw哈希已一致，实际线上临时房间模拟左40px，测得整页左padding0、顶栏0、棋盘/底栏4、42格且无横溢；已解散清理。证据见render-resources.json、render-layout.json及evidence/render-844x382.png。完整CI待本次测试夹具补推复验。

4910aea远端在单测阶段退出，既有注释仅返回exit 1，未提供失败用例，不推测该次根因。相同门禁本地完整621/621通过（full-unit-recheck.txt）。为定位可能的远端问题，CI改为保留单测TAP并连同浏览器失败一起输出失败块及前文；bash pipefail保持，未忽略测试错误。报告脚本以模拟失败日志验证输出，等待远端复验。
