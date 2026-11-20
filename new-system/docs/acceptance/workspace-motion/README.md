# CodeSomething工作台交互调优验收

2026年11月20日依据《CodeSomething_交互丝滑度与极致细节调优方案》实施。适用于共享工程工作台和 Monaco 编辑器。

## 实施说明

- 工具栏、文件页签和操作按钮停用指针磁吸与按压缩放，切页保留120ms纯透明淡入。工作台目录和标签滚动遵循系统或应用的减少动效设置。
- 分隔条在拖拽开始时取得尺寸和边界，后续累加指针位移，每帧合并一次 DOM 更新。水平把手扩宽到56px，高度恒为3px。保留键盘方向键、首尾边界及双击恢复默认尺寸。
- 目录打开和关闭时维持标签栏与代码区的左边线。宽栏的240px目录可收起，覆盖式目录收到外部点击后关闭，编辑器保留自己收到的焦点。手机全屏目录继续提供关闭按钮和Escape焦点返回。
- 每个文件单独维护 Monaco 模型、视图状态及撤销栈。磁盘同步作为独立编辑事务，不生成网页草稿。草稿冲突继续按实际磁盘版本拒绝覆盖。
- 工程工具栏固定44px，完整状态、备用连接和工程指南从「工程操作」查看。任务折叠释放桌面阅读栏整列，窄屏扎实移除教学内容占位。

## 复现

浏览器回归使用5208前端及5209独立后端，目录通过 Chromium 隔离文件系统创建。实际HTTP、Boot判题在隔离后端执行。以下命令从仓库根目录运行。

```powershell
. 'D:/Document/codex/杂项/skill-workbench/video-browser-runtime/activate.ps1'
$env:CS_BROWSER_BIN='D:/Document/codex/杂项/skill-workbench/video-browser-runtime/node_modules/agent-browser/bin/agent-browser-win32-x64.exe'
$env:CS_JOURNEY_QA_URL='http://127.0.0.1:5208'
$env:CS_FRONTEND_URL=$env:CS_JOURNEY_QA_URL
$env:CS_MOTION_SCREENSHOTS='new-system/docs/acceptance/workspace-motion'
node new-system/frontend/tests/browser/check-workspace-motion.mjs
node new-system/frontend/tests/browser/check-layout-refactor.mjs
node new-system/frontend/tests/browser/check-ide-save-sync.mjs
npm test --prefix new-system/frontend
npm run build --prefix new-system/frontend
```

## 验收结果

- 26项前端单元及生产构建通过。日常前端5178返回200，判题和写入验证使用隔离环境。
- 1366×768下 Java 编辑器保持848px，真实HTTP结果与代码同屏。Boot多文件工程通过实际功能检查。既有布局回归共71组页面及尺寸检查通过。
- 两个文件分别输入和撤销，返回 TaskServer.java 可从第20行原光标继续输入。Chrome浏览器授权的混合换行、模拟IDE保存、磁盘和网页冲突拒绝覆盖均通过。
- 保存和运行前后，测得工作区工具栏均为44px，编辑器上沿的纵坐标一致。
- 底部分隔条悬停为56×3px，越过下限后反向移动7px即重新增高，拖拽结束恢复正常光标。桌面任务折叠释放阅读栏整列。

- 在1600px下打开8个文件并投递Chrome真实纵向滚轮输入，标签栏横移。开关目录后，标签区和编辑区的左边沿坐标相同。激活胶囊外框、内部无缝、关闭图标静止以及焦点变化时保留渐隐均通过。
- 320、390、641、768、930、1024、1366px下无页面横向溢出并保持44px工具栏。手机任务折叠、全屏目录及Escape焦点回返通过。减少动效时目录动画停用。

报告中的120fps未做专门的刷新率和帧跟踪测量。本轮以拖拽事件行为、布局几何和真实学习操作验收。

[1366×768真实HTTP运行](http-motion-1366.png) · [1600px多文件标签与目录](wide-tabs.png) · [390px任务折叠](mobile-collapsed.png)
