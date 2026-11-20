# 全流程课程验收

2026-11-19。日常前端在`127.0.0.1:5178/learn/journey`提供72节主线和18节补练。旧项目入口继续使用已发布课程，逐课链接映射到其正式检查。浏览位置与正式学习结果分别保存。补练可以回到出发课次。

- `npm test` 23项通过，含课程总数、模块分布、课号唯一、逐课字段和正式课包关卡映射。`npm run build`通过。
- `frontend/tests/browser/check-full-journey.mjs`在独立5179/5189验证首页入口、下一节、准确工作区往返、续学、补练返回原课次、SQL/Boot/JDBC/项目B/部署/作品入口，以及真实浏览器逐页打开90个地址。每页校验文件、运行区、结果及目标工作区课号。第02节360、768、1280px无页面横向溢出，已看实际截图。
- 日常5178用独立浏览器会话打开第02节。课页范围axe自动检查为0确定违规、0待判断。
- 第02节从网页示例提取`TaskServer.java`，本机JDK21编译运行。改前和改后的实际HTTP200正文均准确。第62–63节使用网页`compose.yaml`、已构建项目B验收JAR与课程测试数据，启动独立Java和MySQL容器，经登录后创建计划，在Compose停止并重启后读取同一记录。测试容器、网络及测试数据卷均清理。
- 工程验证覆盖上述样例和导航。既有正式检查依然按各课程约定执行。本次未替学习者逐节完成90项任务，真人逐章试学、学习时长与独立迁移效果待实际使用验证。

## 学习路径和项目目录

`frontend/tests/browser/check-project-journey-entries.mjs`在日常5178核对原有七个阶段卡片、章节概览和90个课次链接。验证键盘展开SQL阶段后直达第15节，在“基础项目”列表原地展开Boot的16节课、390px展开时无页面横向溢出、切换卡片布局后可展开并直达第31节，以及“查看目录”仍进入原“项目开发路线”及“进入学习”。HTTP、SQL、Boot、项目A、项目B、作品C六个项目的课次数量和首节均有回归检查。项目展开截图已查看，24项前端单元与生产构建通过。

## 第一节运行与正式通关

参考[赫尔辛基大学 Java MOOC 的 Test My Code 练习](https://java-programming.mooc.fi/part-1/1-starting-programming/)和[GitHub Classroom 输入输出评分](https://docs.github.com/en/education/manage-coursework-with-github-classroom/teach-with-github-classroom/use-autograding#inputoutput-test)。使用真实运行结果、分项预期和可重试反馈。

`frontend/tests/browser/check-first-program-and-completion.mjs`在隔离5179/5189使用同一份工程先后检查第1、2节及原正式关卡。已验证第1节空输出失败、打印自定义中文通过并自动保存、刷新后进度可取回、第2节纯控制台程序失败以及真实HTTP响应通过。正式关卡仍可提交、保存和保留历史。`LocalProjectRunnerTest`额外验证只写标准错误及非零退出均失败。后端12项通过，5项环境条件测试跳过；前端24项单元通过。第11节沿用既有服务可用性和历史通关规则，完整JSON与状态码约束由后续正式修复关卡验证。
