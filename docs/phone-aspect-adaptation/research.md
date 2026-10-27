# 直板手机适配调研与现状诊断

日期：2026-10-26。基线dda4c80。本文件是设计依据，不是新版本验收报告。

## 1. 覆盖比例，不按品牌硬编码

以下为厂商公开规格中的代表机型，包含仍在使用的旧直板机与较新直板机；不是销量榜或穷尽机型清单。约比值按分辨率长边÷短边×9计算，厂商的标称比例可能取整。物理分辨率不能直接作为网页内容尺寸。

| 比例族 | 代表与规格 | 来源 |
|---|---|---|
| 约16:9 | iPhone SE第三代，1334×750 | [Apple](https://support.apple.com/en-ie/111866) |
| 18:9 | Xperia XZ3，2880×1440 | [Sony](https://www.sony.com/electronics/support/mobile-phones-tablets-mobile-phones/xperia-xz3/specifications) |
| 18.5:9 | Galaxy S8，2960×1440 | [Samsung](https://news.samsung.com/global/galaxy-s8-display-earns-displaymates-highest-ever-a-grade) |
| 19:9 | Galaxy S10e，2280×1080 | [Samsung](https://developer.samsung.com/galaxy-emulator-skin/galaxy-s.html) |
| 19.5:9 | Galaxy S25 Ultra，3120×1440 | [Samsung](https://www.samsung.com/uk/smartphones/galaxy-s/galaxy-s25-ultra-titanium-jetblack-256gb-certified-re-newed-sm5s938bakdeub/) |
| 约19.6:9 | iPhone 17，2622×1206，计算约19.57:9 | [Apple](https://www.apple.com/iphone-17/specs/) |
| 约19.8:9 | OPPO Find X8，2760×1256，计算约19.78:9 | [OPPO](https://www.oppo.com/cn/smartphones/series-find-x/find-x8/specs/) |
| 约19.9:9 | 荣耀X50，2652×1200，计算19.89:9 | [荣耀](https://www.honor.com/cn/phones/honor-x50/spec/) |
| 约20:9 | vivo X200，2800×1260；Xiaomi 15，2670×1200 | [vivo](https://www.vivo.com.cn/vivo/param/x200)、[Xiaomi](https://www.mi.com/ae-en/product/xiaomi-15/specs/) |
| 约20.1:9 | Pura 80 Pro，2848×1276，计算约20.09:9；Pixel 9 Pro厂商称20:9，2856×1280 | [华为](https://consumer.huawei.com/cn/phones/pura80-pro/specs/)、[Google](https://support.google.com/pixelphone/answer/7158570?hl=en) |
| 21:9 | Xperia 1 V，厂商标称21:9 | [Sony](https://www.sony.co.uk/electronics/support/mobile-phones-tablets-mobile-phones/xperia-1-v-256gb/specifications) |

实现必须连续响应宽高，不能只接受表内几个精确比例。22:9作为额外压力采样，不声称有对应主流机型。物理尺寸相同的手机，显示缩放、浏览器工具栏与键盘也可造成不同网页可见区域。

## 2. 浏览器依据

- 布局视口与可见视口可能不同；地址栏、键盘和手势缩放不应只靠屏幕分辨率推断。[Chrome开发者文档](https://developer.chrome.com/blog/viewport-resize-behavior/)、[CSSOM View](https://drafts.csswg.org/cssom-view/#the-visualviewport-interface)。
- 动态视口单位有不同含义；保留不支持新单位／接口时的尺寸回退。[CSS Values](https://drafts.csswg.org/css-values-4/#viewport-relative-lengths)。
- 满屏背景和重要交互控件的安全边距可以分别处理。延续用户已批准的整页左对齐，不重新引入左侧整条空白；真实切口遮挡需实机观察，不能由模拟推断没有遮挡。[WebKit](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)。
- 全屏能力与限制由浏览器决定，提供用户主动尝试入口，失败不能阻断游戏。[Fullscreen标准](https://fullscreen.spec.whatwg.org/)。

## 3. 已执行的现状扫描

evidence/current-matrix.json：单个本地固定局势、106组尺寸；不是106台手机或106场完整对局。

- 80组显示概览，26组进入当前强制滚动模式。进入滚动不等于全部是缺陷，需要结合空间是否足够判断。
- 106组中两位地块编号均因现有4px编号栏竖排；城市短名未发现裁切。
- 3组在切换后过早取样时发现底栏越界；300ms稳定复测后均恢复，不能报告为持续越界。
- 693×390从更小窗口切回后，稳定300ms仍保留强制滚动；此时棋盘容器507×288，已超过原405×177阈值。确认需要修复自动恢复逻辑。
- 本轮无页面横向溢出或脚本错误。上述只覆盖本地浏览器模拟，不代表QQ、Safari或实体机均已验证。

稳定复测见evidence/settled-recheck.json。原问题截图与测量保留，新实现未开始。

## 4. 统一设计方向

按实际可见区域分配高度和宽度，优先保留完整原棋盘；右栏由固定3:1改为有底线的弹性宽度。普通空间保留完整顶栏，短空间将状态压为非交互小条，规则继续从更多进入。序号、短名与图标根据格子的实际尺寸排布。

空间不足时采用明确可操作的滚动／放大查看，空间恢复后自动恢复默认概览；用户主动放大的选择独立保存。保留原12×11／42格、中央左资讯右台账、右侧玩家栏和主操作顺序。不能承诺任意缩放或键盘占满屏幕后仍能同时大字显示全部内容。
