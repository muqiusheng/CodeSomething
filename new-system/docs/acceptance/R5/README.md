# R5验收

2026年11月12日。R5.1—R5.4工程完成，前端0.14.0，后端0.1.0，数据库V11；IDEA插件0.3.0保持原版本。下一项为R6.1公开项目研究与来源记录。

## 交付流程

画像覆盖19个正式代码关卡，保存归一化证据、规则、快照与用户纠正；复习覆盖19关、每关两道变式，共38题；服务端评分、帮助声明、恢复、稍后和跳过形成持久记录。每日一题与集中巩固先显示差异、理由和额外时长，接受后生效，可撤销，也可单独停止额外复习。四门课程分别展示正式完成、帮助记录、复习与下一步建议。

画像只描述已观察到的证据。概念选择题记录即时/延迟/重复/辅助复习，不把它们当作独立编码或开放讲解通过。真实学习者的独立程度与长期保留效果仍按R3/R8学习回访验证。

契约见[docs/19](../../../../docs/19-R5画像复习与阶段调整契约.md)。

## 核心行为与构建

- 新增`LearnerProfileApiTest`八项HTTP边界行为测试，按失败→实现→通过推进：空画像/纠正重启、四类来源区分、变式/服务端评分/幂等/稍后、提案接受拒绝撤销与版本冲突、中途帮助不可降级、延迟复习与阶段总结、重复曝光题标记、停止额外复习。
- `CS_RUN_DOCKER_TESTS=true; ./scripts/project.ps1 backend-test`：57项全量测试，0失败、0错误、0跳过，包括真实容器、十关参考/业务反例、JDBC隔离、SQL/正式理解及AI受控回归。随后新增停止额外复习行为；最终R5八项全部通过。因此本轮共验证58个不同后端测试，非将重复执行简单相加。
- `./scripts/project.ps1 frontend-test`：现有五项单元测试通过。`frontend-build`：TypeScript及Vite构建通过，最终0.14.0。
- `./scripts/project.ps1 release-check`：七项门禁行为测试通过，149项发布输入及十关现存报告核对通过；发布课程与原检查器未修改。
- `package-isolated.ps1 -Label r5-final`：最终源码独立打包通过。日志、最终JAR路径与SHA-256见本目录保存的构建证据及`release.json`。

## 浏览器与视觉

验收前端5179、后端5191，独立SQLite位于`runtime/r5-acceptance/data`，运行器与SQL后台执行关闭。四类来源记录为显式测试夹具：无示例的正式双结果、带示例帮助的双结果、重复业务/SQL错误、环境故障。夹具仅用于检验画像规则，未当作真实学员完成证据。

使用独立命名`agent-browser`会话。执行入口：

```powershell
. 'D:/Document/codex/杂项/skill-workbench/video-browser-runtime/activate.ps1'
$env:CS_BROWSER_BIN='D:/Document/codex/杂项/skill-workbench/video-browser-runtime/node_modules/agent-browser/bin/agent-browser-win32-x64.exe'
node new-system/frontend/tests/browser/check-r5.mjs
node new-system/frontend/tests/browser/check-r5-finish.mjs
node new-system/frontend/tests/browser/check-r5-modal.mjs
```

三个脚本按顺序使用同一独立夹具库。首次核心脚本需要初始计划为0分钟；收尾脚本验证核心脚本留下的5分钟计划可停止；弹窗脚本不保存纠正。不要直接对日常库运行，也不要把已有验收库当作全新夹具重复初始化。

实际结果：

- [主流程](browser-checks.json)：64项断言通过，含课程筛选、真实状态、证据摘要/规则、纠正与刷新、预览拒绝/接受/撤销、匹配关卡跳转、答题刷新恢复、帮助、稍后/跳过、主线不变、首页真实队列与断网重试。
- [收尾](browser-finish.json)：37项断言通过，含停止额外复习、布局稳定后截图、两主题、窄屏纠正、Escape返回、CSS 200%缩放和复习网络恢复。主流程与收尾共50组尺寸检查，320/375/768/1024/1440px均无整页横向溢出。
- [弹窗专项](modal-checks.json)：40项检查通过。修复Portal内控件未继承页面选择器的问题；select高度至少44px、textarea至少100px。浅色正文/表单对比度15.92；深色标签8.33、输入文字8.98。两主题分别16次Tab/Shift+Tab焦点始终留在弹窗内，Escape回到原纠正按钮。
- 主流程六个axe场景与收尾十个axe场景均0违规。最终两主题弹窗各剩一类`aria-hidden-focus`自动待判断，涉及Radix焦点守卫及隐藏背景；键盘约束与关闭返回已按上述专项人工操作验证。最初浅色标签对比度自动待判断在修正控件后消除。原始JSON与最终专项结果均保存，不将自动待判断改写为自动通过。
- 最初窄屏截图落在现有侧栏收起动画中间；最终截图在sidebar实际边界稳定后生成。最终截图为`profile-*-375.png`、`reviews-*-375.png`及`correction-*-375.png`，不能用过渡帧判断最终布局。

`ui-ux-pro-max`用于既有系统内的可撤销流程与状态；`daisyui`沿用现有主题语义；`impeccable`局部polish修正Portal表单，检测输出[impeccable-detect.json](impeccable-detect.json)为空。`web-design-guidelines`原始远端规则获取失败（搜索工具404、终端TLS失败），本轮依据已安装技能规则和实际浏览器证据检查，不声称已取得远端最新规则。未引入新的组件库、动效库或付费API。

## 升级、重启与日常服务

- [升级副本](upgrade.json)：从日常V10用SQLite备份接口复制到`runtime/r5-upgrade/data`，由实际JAR迁移到V11；原13张业务表行数与逐表内容摘要一致，完整性与外键检查通过。
- [重启前](restart-before.json)、[重启后](restart-after.json)：5191实际JAR强制停止后重启；同一开放复习、画像快照ID、完整画像、复习队列及正式续学位置全部一致，无重复轮次。
- [日常升级](daily-upgrade.json)：无活动作业后，先备份`runtime/backups/pre-r5-20261112.db`，再切最终JAR到5188。原13张业务表内容逐表一致，V11、integrity和外键检查正常。新画像/复习/纠正/提案表在正常读取前均为0条，没有导入验收数据。
- 正常画像读取后只按现有真实记录生成画像；额外复习默认0分钟，未经用户接受不增加学习负担。5178/5188为日常服务；`runtime/current-backend-jar.txt`保存当前发布指针，`start-release.ps1`优先使用它。

清理与最终健康结果见`cleanup.json`；测试服务和本任务浏览器会话已关闭，日常SQL环境保留。没有修改旧系统、已发布课程或安装日常IDE插件。

## 保留边界

CSS 200%缩放是本轮自动化检查方式，未把它冒充系统级浏览器文字缩放。当前每关两题轮换，重复题会标记为重复练习。真实账号额度/物理断网、SQL/Boot专用AI上下文，以及真实学习回访不在本轮R5工程验收中补记通过，继续按实施追踪单列。
