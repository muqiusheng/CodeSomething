# CodeSomething前端

前端使用 React 19、TypeScript 5.9、Vite 7.2，以及 Cupcake 浅色和 Synthwave 深色主题。当前版本见[package.json](package.json)，组件来源见[COMPONENTS.md](COMPONENTS.md)。

## 运行与检查

使用 Node.js 24 运行开发和测试。在仓库根执行以下命令。

```powershell
npm --prefix ./new-system/frontend ci --cache ./.cache/npm
./scripts/project.ps1 frontend-dev
./scripts/project.ps1 frontend-build
./scripts/project.ps1 frontend-test
```

完整测试包含原始讲义校验。运行前按[本机资料导入说明](../../docs/27-本机资料与Tlias实战课程.md#导入个人学习资料)准备文件。

也可进入本目录运行`npm run dev`、`npm run build`、`npm test`和`npm run preview`。开发/预览端口5178；Vite将`/api`代理到5188，后端见[说明](../backend/README.md)。`CS_BACKEND_URL`可覆盖开发代理目标。

## 源码

`src/main.tsx`保留React启动、应用壳和路由。页面与专属组件按功能进入`src/features/`；共享布局在`src/components/layout/`，共享展示在`src/components/shared/`，Radix适配和来源在ui，LeiBox适配和来源在leibox。API、hooks、主题状态和CSS分别位于api、hooks、theme、styles。详见[目录约定](../../docs/15-工程目录与维护约定.md)。

单元测试在`tests/unit/`，浏览器验收在`tests/browser/`。后者需已有浏览器工具、指定服务与独立数据，按对应验收记录运行；`npm test`仅运行单元测试。

## 主要路径与数据

- `/learn`：真实续学与完成证据。
- `/projects`、`/path`：项目目录与阶段路径。
- `/projects/backend-foundations`、`/learn/http-json/1.1/:stage`：HTTP/JSON课程。
- `/projects/sql-foundations`、`/learn/sql/1.0/:stage`：SQL课程。
- `/projects/boot-foundations`、`/learn/boot-foundations/1.0/:stage`：Boot课程。
- `/projects/task-manager`、`/learn/task-manager/1.0/:stage`：项目A。
- `/reviews`、`/portfolio`、`/profile`、`/settings`：复习、作品、画像与设置。

课程请求示例与随堂练习用于教学；完成证据由正式功能报告和理解验证共同决定。网页辅导不作为通过证据。平台SQLite保存正式记录与学习偏好，浏览器保存主题、动效、收藏等本地偏好；离线保存有明确回退反馈。

最新界面证据：[主题](../docs/acceptance/palette-refresh/README.md)、[导航](../docs/acceptance/navigation/README.md)、[设置](../docs/acceptance/settings-refine/README.md)。目录迁移验证见[工程整理](../docs/acceptance/project-structure/README.md)。

R5画像、复习、可预览/撤销的安排与阶段回顾已接真实接口；见[验收](../docs/acceptance/R5/README.md)。

## R6兴趣项目

`/projects/studio`比较画像候选、生成/恢复草稿、验证与发布；`/projects/generated/:id?stage=read|validate|transfer`学习已发布三关。生成项目源码经显式文件导入和隔离检查，完成记录独立保存，原主线位置保持原语义。验收脚本check-r6、check-r6-learning、check-r6-content需要独立5191/5179与对应运行ID，见[R6证据](../docs/acceptance/R6/README.md)。
