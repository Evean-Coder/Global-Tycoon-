# 手机横屏 Atlas Tasks

依据Spec/Plan，用户统一授权下自审。

- [x] T1 public/board-layout.js及test/board-layout.test.js新增横屏模式，保留42格环形唯一邻接；验证竖屏/PC分界。
- [x] T2 public/client.js同步唯一节点和模式字符串，新增内矩形布局测量，保持旋转及棋子位置。
- [x] T3 public/style.css新增横屏参考布局、独立滚动与全宽底栏，验证图片/台账不盖地块和文字可读。
- [x] T4 e2e/mobile-landscape-atlas.spec.js新增横屏、侧栏、地块触控及股票草稿旋转验证；e2e/mobile-playability.spec.js和e2e/responsive.spec.js更新横屏预期；记录截图/几何。
- [x] T5 rules.md/readme.md/docs/项目现状.md及旧移动Spec/Plan覆盖索引、public/index.html/public/sw.js/e2e/cache.spec.js/package.json同步。
- [x] T6 有限单位、浏览器、赎回/筹资和lint回归，回填checklist与acceptance，保存本地提交，说明部署/实体设备限制。

依赖T1→T2→T3→T4→T5→T6。

实际结果与部署状态见[acceptance.md](acceptance.md)。
