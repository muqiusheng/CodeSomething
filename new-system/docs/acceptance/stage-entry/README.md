# 0.6.1 路径清理与阶段条件弹窗

日期：2026年11月11日。范围：用户圈出的模块计数、基础先修说明和后续阶段开始条件。

移除路径内phase-module-count、phase-entry、phase-dependency三个文字区域，DOM计数均为0。保留课程、目标、当前学习位置与主操作。后续三个阶段提供“开始条件”按钮，使用现有Dialog与Tabs展现前置阶段到目标阶段，具体条件不丢失；基础模块不再重复已知Java背景。

浏览器会话codesomething-stage-entry：

- 项目A入口打开条件弹窗；方向键从项目A切换到项目B后显示对应CRUD能力要求。
- Escape关闭后焦点className为phase-conditions。
- 作品C条件内“查看项目B”进入/projects/collaboration。
- 320px整体宽度320px，弹窗内容宽290px；375px整体宽度375px、弹窗内容345px，无横向溢出。
- 桌面和手机弹窗截图目视检查；首次文字对比度不足已修正，最终局部axe WCAG2A/AA为0违规、0待人工项、16项通过。
- 浏览器errors无异常输出，会话已关闭。

最终版本0.6.1，npm run build退出码0，TypeScript与Vite通过。无新增依赖，原依赖use client忽略提示仍在。

截图：[桌面弹窗](dialog-1440.png)、[手机弹窗](dialog-375.png)。没有实现新的正式解锁或学习判定，不以先修说明视图替代真实证据。

## 0.6.2 已覆盖上面的交互

用户纠正：无需独立设计，仅点击查看项目时简单提醒。StageEntryDialog和专用图形/页签样式已删除，条件入口合并到查看项目。npm run build通过。真实浏览器验证：提醒打开时仍在/path，取消后仍在/path且焦点回到查看项目；继续查看进入/projects/task-manager。普通提醒局部axe为0违规0待人工项，测试会话已关闭。0.6.1截图仅为历史记录，当前页面以本节为准。
