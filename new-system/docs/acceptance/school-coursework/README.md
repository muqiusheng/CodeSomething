# 课内实战验收

验收日期 2026-11-20。前端 0.25.0，后端 0.2.0，SQLite V16。各项运行与导出使用独立的 5196/5197 验收实例及独立 MySQL 卷。

- 课程接口列出大三上《数据库原理》7 个实验。实验三详细接口和浏览器题目清单均有 14 组。日常 5178 入口与 API 代理复核通过。
- 实际 MySQL 返回多结果集、中文、空值及特殊字符。创建并更新数据后在另一实验读到结果，视图、带分隔符的过程、触发器均执行成功。核对错误回显、影响行数，以及空库和种子两种重置保留作答与运行记录。容器网络为 none，无端口绑定，课堂账号限定在课程库。
- 浏览器在 Monaco 中输入 SQL 并以 Ctrl+Enter 执行，表格返回四行。保存另一题再运行全部，刷新后恢复结果。预览载入学号、姓名和实验内容，复制成功。实际下载的 HTML-based .doc 由 Word 打开，检测到学号、姓名、实验目的、SQL、四张结果表及三页正文。
- 桌面 1366px 实测导航轨 56px，窄屏 390px 复核无横向页面溢出。浏览器查看浅色课程大厅、浅色编辑与结果、深色窄屏和报告弹窗。大厅 axe 零违规；工作台记录共享 Monaco 壳的 `aria-allowed-role` 提示，以及编辑器、下拉框和下一题按钮的对比度自动待判断项。截图在本机 `new-system/runtime/school-qa/`，含身份的报告截图随运行数据保留。
- `./scripts/project.ps1 frontend-test` 26 项通过，`./scripts/project.ps1 frontend-build` 通过。设置 `CS_RUN_DOCKER_TESTS=true` 后，后端 `SchoolDraftStoreTest,SqlLearningApiTest,SqlPolicyFeedbackTest` 9 项通过，零跳过，包含旧 SQL 运行和规则回归。
- 日常 5188 切换前使用 SQLite 在线备份 `pre-school-20261120-164141.db`。切换后逐表比较 30 张原数据表内容一致，新课内草稿表为空，服务健康。验收进程与浏览器会话已结束，独立验收容器已停止。
- 实验一中的 Workbench 界面操作由学习者在本机完成。七份真实作业的逐题学习和课堂提交待使用验证。

## 工作台体验复验

- 隔离实例 5196/5197：连接题默认 0 张，切换全部后可读取 6 张；切到建表题恢复本题选项并显示 3 张结构表。
- 用真实 MySQL 在浏览器完成最后一项必做测试，验证 100% 进度、通关卡、2 行结果、报告预览、下一实验和大厅已完成。
- 390px 窄屏无页面横向溢出。编辑已经运行成功的必做 SQL 后，通关撤销，失败查询显示原始 MySQL 报错。截图存于本机 `new-system/runtime/school-qa/`。

## Web Workbench 验收

- 隔离 MySQL 检查 SC 复合主键及两条外键。执行 DDL 后，GET schema 返回新建表、视图、存储过程和触发器。浏览器验证对象筛选、手动刷新及 Sno 字段类型与主键预览。
- API 验证选区内容不匹配时返回 400。浏览器同时输入两条 SQL，用 Ctrl+Enter 和运行按钮验证只执行首条选区，原草稿版本和整题结果未改变。格式化将两条普通 SQL 展开并保留两条语句。
- 浏览器将 2 行搜索为 1 行，验证 Markdown 复制反馈，并下载含 BOM 的 CSV。文件只含表头与命中的 beta 行。390px 检查无页面横向溢出。
- 前端构建和 31 项单测通过，后端 SchoolDraftStoreTest 与 JAR 打包通过。日常 5178/5188 已接入，健康接口 200，课程主库对象可读取。验收截图及测试 CSV 保存在本机 `new-system/runtime/school-qa/`。

## 多库浏览验收

- 隔离 MySQL：SHOW DATABASES 与 API 列表一致，无默认库时 DATABASE() 返回 NULL。编辑器执行 CREATE DATABASE、USE、CREATE TABLE，切库后读取新表。创建接口拒绝保留系统库名与含通配符的名称，选区运行保留草稿。
- 浏览器：SCHEMAS 下拉显示可见库，新建后选中新库，运行建表后树刷新。验收截图为本机 runtime/school-qa/multi-databases.png。
- 日常：原课程库可浏览，information_schema 可分页读取 78 个系统视图。验收库保留在隔离卷。
