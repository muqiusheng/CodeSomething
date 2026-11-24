# 数据库备考验收


## 2026年11月24日题库与可移动数据表面板

- 本轮覆盖 11 套新卷，共 275 题。每卷有 10 道单选、5 道判断、5 道填空和 5 道编程，满分 100。MySQL 8.4 真实执行 55 道参考 SQL，全部获得 10/10。变式扣分、语法行号、约束反例、BIT 和隔离库回收一并通过。 [Docker 判题日志](../../../runtime/database-workbench-final-tests.log)
- 七组实验共 101 道参考 SQL 均获得 10/10。整批复验中两道查询遇到 Docker 环境暂不可用，随后使用最终后端通过对应判分接口复跑，两题均满分。实测全表误删只得执行分，正确重试满分，持久练习库快照一致。 [实验补验日志](../../../runtime/database-workbench-lab-recheck.log)
- 28 项后端契约、访问控制与题库测试和 54 项前端单测通过，前后端生产构建通过。旧版试卷归档，实验旧运行记录仍可导出。 [后端测试](../../../runtime/database-workbench-contract-final.log) · [前端单测](../../../runtime/database-workbench-frontend-final.log) · [前端构建](../../../runtime/database-workbench-build-delivery.log)
- 1440×900 与 390×844 的 Chromium 验证内嵌结构、桌面并排、窗口内横滚、Monaco 顶栏、鼠标拖动、方向键移动、Escape 还原及移动端浮窗边界。考试流程覆盖重置后保留 SQL，实验检验差异行、满分绿标、刷新续做及导出。 [浏览器主流程](../../../runtime/database-workbench-browser-test.log) · [浮窗与判分复验](../../../runtime/database-workbench-floating-results.log) · [桌面浮窗](../../../runtime/database-workbench-qa-shots/final-data-window-floating.png) · [移动端浮窗](../../../runtime/database-workbench-qa-shots/final-data-window-mobile-light.png)

本轮使用本机临时 SQLite 与 Docker MySQL。理论题依照仓库课程资料和已记录的课件考点整理，未取得第 1–6 章原始幻灯片逐页复核。

## 2026年11月24日双路线与 25 题卷验收

本轮使用独立本机后端 `5496`、前端 `5497`、SQLite 测试库和 Docker MySQL 8.4。当前 11 套试卷共 275 题，全部通过题量、分值、归一化题干去重、七类实验覆盖与答案投影检查。后端使用仓库的 Maven 脚本。

- `SchoolExamCatalogTest,SchoolExamPackCacheTest,SchoolExamRulesTest,SchoolExamMysqlTest` 共 10 项通过。55 道参考 SQL 在真实判题中均获 10/10。回归覆盖列名大小写、变式扣分、约束反例、BIT 预览、SQL 调试诊断、课内库隔离及临时沙箱清理。[MySQL 与题库日志](../../../runtime/school-exams-rework-20261124-152534/mysql-final.log)
- 补验建表和改表题的完整列类型检查。5 道涉及长度校验的参考解均为 10/10，错误列宽的作答为 5/10。[列类型回归](../../../runtime/school-exams-rework-20261124-152534/ddl-metadata.log)
- 备考公网接口用例通过，覆盖分账号作答、超时交卷、草稿版本、重练、错题和限流。扩展运行出现一处管理端重试测试的 Windows SQLite 临时目录清理失败，该用例单独复跑通过。[备考接口日志](../../../runtime/school-exams-rework-20261124-152534/targeted-tests.log) · [临时目录清理用例复跑](../../../runtime/school-exams-rework-20261124-152534/public-admin-cleanup-retry.log)
- `pnpm run test` 通过 54 项，`pnpm run build` 完成 TypeScript 检查和生产构建。依赖沿用项目的 `package-lock.json`。[前端测试](../../../runtime/school-exams-rework-20261124-152534/frontend-tests.log) · [生产构建](../../../runtime/school-exams-rework-20261124-152534/frontend-build-final.log)
- Chromium 在 1440×900 和 390×844 验证双路线入口、25 题答题卡、倒计时、草稿恢复、真实 SQL 判分、错误行高亮、阅卷、单题与组卷重练、实验预置查询和报告导出。[主流程日志](../../../runtime/school-exams-rework-20261124-152534/browser-verified.log) · [移动端大厅](../../../runtime/school-exams-rework-20261124-152534/final-shots/02-hall-mobile-light.png)

## 2026年11月24日定向精修复验

在独立本机后端 `5396`、前端 `5397` 与 MySQL 8.4.13 隔离容器中完成验证，并通过冷备与副本演练后平滑同步至日常 `5188`（`school-exams-polish-0.6.2.jar`）。

- **大小写不敏感判题**：`ExamSqlRunner.difference()` 改用 `Locale.ROOT` 小写比对列名；`exam-lab-01-q32`、`exam-lab-02-q31`、`exam-lab-07-q31` 的 `information_schema` `state_check` 使用 `LOWER(...)` 归一化标识符。`SchoolExamMysqlTest` 新增 SELECT、别名、CREATE TABLE、ALTER TABLE、CREATE VIEW、CREATE TRIGGER 共 8 组小写/大小写混写回归，全部 15/15。
- **刷题模式运行与报错反馈**：刷题模式「试运行」移入一级工具栏；`ExamSqlScript.diagnostic()` 将 MySQL 包装批处理行号与语法内部行号统一改写为学员源码真实行号；`Grade`/`CheckResult`/`Item` 透出 `errorLine`、`advice` 与 `sqlError`（兼容旧 SQLite JSON 反序列化）；「运行并判分」报错时 Monaco 同步高亮错误行，顶部仅展示一条合并诊断，3 个检查点不再复读；查询类大题满分默认展示实际结果表预览。
- **答题卡与布局精修**：「放弃当前草稿并重新开始」移入答题卡底部次要区，桌面答题卡改为 5 列排布于 1440×900 首屏完整可见，手机 390×844 位于答题卡弹窗底部且点击先关抽屉再弹确认；修复 `.exam-debug` 视口由 1440px 缩回 390px 时的横向溢出。
- **检查结果**：
  - `& scripts/project.ps1 -Task backend-test`：170 项中 134 项通过、36 项按条件跳过，0 失败。
  - `CS_RUN_DOCKER_TESTS=true` 运行 `SchoolExamMysqlTest,SchoolExamCatalogTest,SchoolExamPackCacheTest,SchoolExamRulesTest`：9 项全部通过（143.2 秒，22 道参考题与 8 组小写回归均 15/15，沙盒与临时容器均已清理）。
  - `& scripts/project.ps1 -Task frontend-test`：48 项全部通过；`& scripts/project.ps1 -Task frontend-build`：生产构建通过。
  - `node new-system/frontend/tests/browser/check-school-exams.mjs`：桌面 1440×900 与手机 390×844 明暗主题全流程通过，临时容器 `cs-sql-school-9b99c18a74091b2f3a08f8e7` 与数据卷已清理；截图位于 [polish-run/shots](../../../runtime/school-exam-acceptance/polish-run/shots)。
  - 日常 `5188` 切换：先冷备 `new-system/runtime/data/backups/pre-school-exams-polish-20261124.db`，副本演练 V16→V23 迁移后切换至 `school-exams-polish-0.6.2.jar`，`PRAGMA integrity_check=ok`、`foreign_key_check=[]`，原有 31 张表逐表行数与 SHA-256 摘要 31/31 一致，`5188` 与 `5178` 代理均返回 200（11 套卷）。

## 2026年11月24日性能与界面复验

在独立本机后端 5394、前端 5395 与 MySQL 8.4.13 环境执行。Docker 专项保留上一版的 22 道参考题和负例，并追加空结果列名、缓存一致性、动态表、增加列和新预览检查。以下为本机墙钟时间。

| 场景 | 实测 |
| --- | --- |
| Docker 专项测试体 | 260.4 秒 → 131.8 秒，缩短约 49%，22 道参考题均为 15/15 |
| 22 道参考 SQL 首次判分合计 | 67.75 秒 |
| 代表性单题判分，容器就绪 | 首次 3.341 秒，命中参考缓存 1.604 秒 |
| SQL 调试 | 单条常规查询 1.133 秒，四步动态跟踪 1.741 秒 |
| 初始化结构预览 | 首次 1.470 秒，重复读取命中内存结果 |
| 含两道 SQL 大题的整卷交卷 | 容器与参考缓存均热 3.233–3.327 秒，SQL 得分 30/30 |
| 冷路径 | 容器已就绪、参考缓存未建 6.557 秒，首次同时启动 MySQL 容器 24.986 秒 |

- 后端常规命令 & scripts/project.ps1 -Task backend-test 通过，168 项中 132 项通过、36 项按原条件跳过。[后端日志](../../../runtime/school-exam-optimized-backend-test.log)
- 设置 CS_RUN_DOCKER_TESTS=true 后，用 new-system/tooling/backend.ps1 -Action test -TestName SchoolExamMysqlTest,SchoolExamCatalogTest,SchoolExamPackCacheTest,SchoolExamRulesTest 运行 7 项，全部通过。四套卷 120 题重写后，全库 352 道题干去重门禁通过。[Docker 与题库日志](../../../runtime/school-exam-optimized-final-mysql.log)
- & scripts/project.ps1 -Task frontend-test 通过 47 项，& scripts/project.ps1 -Task frontend-build 完成生产构建。[前端测试](../../../runtime/school-exam-optimized-frontend-test.log) · [生产构建](../../../runtime/school-exam-optimized-frontend-build.log)
- 真实 Chromium 脚本 check-school-exams.mjs 通过。桌面 1440×900、手机 390×844 检查明暗主题、数字答题卡、题干样式、行内填空、无连字、SQL 调试、复盘筛选、草稿放弃与重开、旧实验运行和导出。[浏览器日志](../../../runtime/school-exam-acceptance/optimized/browser-verified.log)
- 通过本机交卷接口提交两道参考 SQL，计时包含服务端批改和 SQLite 快照写入。[热容器交卷](../../../runtime/school-exam-acceptance/optimized/submit-ready-timing.log) · [容器初启动及热缓存交卷](../../../runtime/school-exam-acceptance/optimized/submit-timing.log)

人工查看了[桌面大厅](../../../runtime/school-exam-acceptance/optimized/02-hall-desktop-light.png)、[行内填空](../../../runtime/school-exam-acceptance/optimized/02-inline-blank-desktop-light.png)、[手机答题卡](../../../runtime/school-exam-acceptance/optimized/07-answer-card-mobile-dark.png)、[复盘筛选](../../../runtime/school-exam-acceptance/optimized/05-report-filter-desktop-light.png)、[动态表预览](../../../runtime/school-exam-acceptance/optimized/10-trace-dynamic-table.png)与[原实验工作台](../../../runtime/school-exam-acceptance/optimized/11-original-lab-desktop-dark.png)。

验收使用 Windows 本机、独立 SQLite 数据目录、独立课内 MySQL 容器和具名 Chromium 会话。浏览器请求本机开发入口 `127.0.0.1:5295`，代理到后端 `127.0.0.1:5294`。验收数据为测试账号、合成课程种子及测试作答。

## 运行命令

在仓库根目录运行。

```powershell
& scripts/project.ps1 -Task backend-test
& scripts/project.ps1 -Task frontend-test
& scripts/project.ps1 -Task frontend-build
$env:CS_RUN_DOCKER_TESTS = 'true'
& new-system/tooling/backend.ps1 -Action test -TestName SchoolExamMysqlTest
```

Docker 用例使用课内工作台的 MySQL 8.4 镜像。用例启动独立课内容器，核对 22 道参考 SQL、部分得分、缺行、多行、错序、反例拦截、隐藏变体、执行计划、事务内跟踪、错误行及沙盒清理。校验前后的实验库结果完全相同。

在全新的独立数据库上启动本机后端和前端代理后，运行浏览器脚本。脚本会生成实际考卷草稿、交卷和错题记录，因此需要专用验收实例。

```powershell
. 'D:/Document/codex/杂项/skill-workbench/video-browser-runtime/activate.ps1'
$env:CS_BROWSER_BIN = Join-Path (Split-Path (Get-Command agent-browser.cmd).Source) 'node_modules/agent-browser/bin/agent-browser-win32-x64.exe'
$env:CS_SCHOOL_EXAM_APP = 'http://127.0.0.1:5295'
$env:CS_SCHOOL_EXAM_OUTPUT = Join-Path (Get-Location) 'new-system/runtime/school-exam-acceptance'
node new-system/frontend/tests/browser/check-school-exams.mjs
```

后端用例覆盖题库结构和答案投影、乱序映射、考场核对保护、草稿版本、到期使用服务端草稿、提交重试、角色与分库、SQL 不可用降级、错题掌握及公网调试限流。前端用例覆盖答题状态、倒计时、草稿备份版本及跳题。

## 证据与文件范围

| 本机检查 | 结果 | 日志 |
| --- | --- | --- |
| 后端常规套件 | 164 项，128 项通过，36 项按既有运行条件跳过 | [backend-test](../../../runtime/school-exam-backend-final.log) |
| Docker MySQL 专项 | 22 道参考 SQL 均为 15/15，负例、跟踪、输出限制及清理通过 | [SchoolExamMysqlTest](../../../runtime/school-exam-mysql-final.log) |
| 前端单元测试 | 46 项通过 | [frontend-test](../../../runtime/school-exam-frontend-test.log) |
| 前端生产构建 | 通过 | [frontend-build](../../../runtime/school-exam-frontend-verified.log) |
| Chromium 实机流程 | 1440×900、1280×900、390×844，覆盖浅色和深色。专项考场、综合练习、错题筛选与组卷、整卷及部分重刷、原 Workbench 与报告通过 | [浏览器日志](../../../runtime/school-exam-acceptance/browser-pass.log) |

浏览器验证正确、错误和未作答状态，部分得分由后端场景覆盖。浏览器确认刷新后恢复选项与存疑标记，考场内隐藏核对与速查，SQL 能运行选区、单步定位错误、检查 EXPLAIN、预览三表并出分。Markdown 和旧 Word 导出的验收读取 Chromium 生成的 Blob 并检查题项、检查点和旧实验运行结果。Windows 自动磁盘下载命令曾报告取消，导出内容以浏览器生成的文件数据为准。

截图包括[备考大厅](../../../runtime/school-exam-acceptance/02-hall-desktop-light.png)、[执行跟踪](../../../runtime/school-exam-acceptance/04-trace-desktop-light.png)、[成绩报告](../../../runtime/school-exam-acceptance/05-report-desktop-light.png)、[移动端答题卡](../../../runtime/school-exam-acceptance/07-answer-card-mobile-dark.png)和[原实验工作台](../../../runtime/school-exam-acceptance/11-original-lab-desktop-dark.png)。

补验确认 MySQL 1054 的客户端第 8 行映射到学员源码第 1 行，错误行使用独立红色标记。见[诊断截图](../../../runtime/school-exam-acceptance/12-diagnostic-color-desktop-light.png)。

- [新增实现和 API 契约](../../../../docs/38-课内数据库应试备考路线与SQL调试判题.md)
- 课程包在 `course-packs/school/database-systems/exams/`，包括 7 份 `exam-lab-*.json` 与 4 份 `exam-mock-*.json`。
- 后端在 `dev.codesomething.school` 下新增 `ExamCatalog`、`ExamRules`、`ExamSqlRunner`、`ExamSqlScript`、`ExamStore`、`SchoolExamController`，扩展 `SchoolLabRunner`、`MysqlEnvironment` 和 `PublicAccessFilter`。迁移为 `V23__school_exams.sql`。
- 前端在 `src/features/school/exams/` 下新增 `ExamHall`、`ExamWorkspace`、`ExamReport`、`ExamMistakes`、`ExamQuestion`、`ExamShared`、API 类型和状态模块，修改 `SchoolHome`、`main.tsx`、`CodeEditor`，样式在 `src/styles/school-exam.css`。
- 后端测试包括 `SchoolExamCatalogTest`、`SchoolExamMysqlTest`、`SchoolExamRulesTest` 与 `PublicAccessTest` 的考试场景。前端新增 `school-exam-state.test.mjs` 和 `check-school-exams.mjs`。
- 本机日志与截图在 [runtime/school-exam-acceptance](../../../runtime/school-exam-acceptance)。其余测试日志位于 [runtime](../../../runtime)。运行产物受仓库忽略规则管理。
