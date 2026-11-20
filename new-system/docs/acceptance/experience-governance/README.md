# 学习工作台体验治理验收

2026年11月20日。前端包0.24.0。浏览器使用5208端口、5209隔离后端、独立SQLite和临时工程。

- 26项前端单元测试与生产构建通过。
- 真实JDK编译和HTTP检查覆盖控制台无输出、打印成功、服务未启动、HTTP成功、正式通关保存、磁盘变更标旧及历史进度保留。浏览器核对未通过与过时结果撤下续学入口，通过后Enter可续学。1366×768初始结果区完整显示续学按钮。见[真实HTTP通过](run-passed-1366.png)。
- 在同一工程树测量文件夹与文件行均为24px最小高度、13px字号。验证辅助项默认不透明度0.55，源码与pom.xml为1。
- 项目大厅的HTTP部分进度来自真实保存结果。用进度响应样例检查Boot部分完成、SQL全部完成、列表与卡片徽章、章节完成标记及当前项高亮。Boot步骤按钮更新小节深链接，任务区域保留单个运行参考。
- 在320、390和768px检查SQL章节目录边界。390px检查双主题，菜单覆盖阅读页签，当前完成章仍保留高亮。见[窄屏深色章节目录](sql-chapters-390.png)。
- 本轮Boot和SQL的完成态采用响应样例。实际编译、运行及快照回归覆盖Java和HTTP。构建保留依赖分块提示。

在准备好独立5208前端与5209后端后，从工程根目录运行以下命令。

```powershell
. 'D:/Document/codex/杂项/skill-workbench/video-browser-runtime/activate.ps1'
$env:CS_BROWSER_BIN='D:/Document/codex/杂项/skill-workbench/video-browser-runtime/node_modules/agent-browser/bin/agent-browser-win32-x64.exe'
$env:CS_JOURNEY_QA_URL='http://127.0.0.1:5208'
node new-system/frontend/tests/browser/check-first-program-and-completion.mjs
npm test --prefix new-system/frontend
npm run build --prefix new-system/frontend
```
