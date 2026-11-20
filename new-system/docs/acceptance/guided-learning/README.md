# 细分课程、操作指引与真实作品展示

日期：2026年11月16日。前端0.18.2，后端应用0.1.0，数据库V15。

## 交付

- 当前操作卡置于目录之前，显示修改文件、操作和观察结果，带去编辑、可选语法片段和上一/下一节；桌面保持可见，窄屏顺序排列。URL小节直达和刷新恢复保留同工程源码。
- 网页教学层覆盖37个章节/阶段、164个动手小节：HTTP 36、SQL 25、Boot 21、A 27、B 34、生成12、作品9。小节位置与服务端功能完成证据分开。去掉把requirements原文原样变成步骤的通用生成器。
- Java报告增加真实响应作品卡、不同请求结果、错误说明和原始JSON对照；HTTP烟测记录正文并说明检查范围。旧报告缺正文不补造，代码变化仍标旧。生成项目和作品页复用同一展示，SQL继续展示真实表格。
- Java/SQL基础代码建议、常用成员、Spring注解、短模板与当前文件名称；自动触发、按钮或Ctrl+Space，Enter采纳，Tab填参数。属于本地基础提示，不宣称完整Java语义分析。
- 新Boot工程只有POM与Application，SQL新脚本留空。已有代码不重置。创建Java类改为工作区内的具名输入表单，避免依赖系统prompt。
- 各章节配置具体参考课时，共102条章节关联；文件名来自实际网盘目录，公开分P按同名编号关联，未逐集播放。附完整网盘文件位置复制和用户分享入口。参考编排与资料核对见[sources.md](sources.md)、[网盘目录](netdisk-catalogue.json)和[实际文件名](netdisk-observed-videos.json)。

## 真实验证

`npm --prefix new-system/frontend test`：10项通过，包括Java提示范围、课程接续位置、报告真实JSON/旧烟测缺正文等。日志：`runtime/guided-learning-frontend-tests.log`。

`new-system/tooling/backend.ps1 -Action test -TestName 'BrowserWorkspaceApiTest,DockerCheckRunnerTest#smokeCheckAcceptsTheIntentionallyUnfixedStarter'`，设置CS_RUN_DOCKER_TESTS=true：15项通过，无跳过。包含最小Boot起步及保留学员实现、草稿授权/并发/重启/跨章接续，以及真实Docker烟测正文。先执行新增断言发现2个预期失败，再修改实现，最终通过。日志：`runtime/guided-learning-backend-tests.log`。这是相关专项，未记为本轮全量后端测试。

前端最终构建通过，保留既有Monaco大分块提示；后端打包通过。日志分别为`runtime/guided-learning-frontend-build.log`、`runtime/guided-learning-package.log`。Impeccable检测改动UI文件结果为空数组，见`runtime/guided-learning-design-check.json`。

使用内置浏览器、独立5179/5191和`runtime/guided-learning-acceptance`测试库：

- 五类课程HTTP/SQL/Boot/A/B ×375/768/1440px共15组布局无页面横向溢出；当前指引均使用具体内容。
- HTTP真实源码编译与运行，作品卡显示学习HTTP及布尔状态；切换未知任务显示真实404和message；原始JSON对照。编辑后报告标旧，回看与刷新保留同一工程。
- 新Boot工程确认只有两个配置文件，通过行内表单创建HealthController，真实Maven构建与健康接口通过；进入HTTP章仍保留控制器。
- Java输入server.和exchange.展示对应方法，选择getRequestURI实际插入调用。SQL空脚本输入SEL自动建议SELECT，Enter实际插入模板。
- 小节深链接直达“准备第一条数据”，刷新仍在该节并保留源码；课程总览展示八章36小节。
- 手机深色放大编辑通过。首次发现Monaco吞掉Esc，增加捕获处理后，实际验证光标在代码框内按Esc也能还原。
- 具体参考链接P44及复制按钮成功反馈通过；未把浏览器虚拟剪贴板读取当作操作系统剪贴板字节对比。

记录：`browser-layout.json`及`browser-checks.json`（26条布局或流程记录）；截图实际打开查看`guidance-desktop.jpg`、`code-suggestions.jpg`、`outcome-desktop.jpg`、`mobile-dark.jpg`。本轮未新增axe全量审计，不声称全站无障碍全部通过。生成与作品报告复用有源码检查，本轮未重跑全部生成/作品核心/迁移/部署流程。

浏览器测试曾发现建议命令未注册、Esc在编辑框内被截获，均修正后复验；构建发现Monaco贡献入口未带类型声明，补充声明后最终通过。网盘浏览曾遇窗口最小化和桌面锁屏，用户恢复后完成相关目录核对，没有绕过锁屏或浏览器站点安全拦截。

## 日常服务和数据

确认无活动作业后，SQLite在线备份并切换`runtime/releases/guided-learning-0.18.2.jar`。日常5178/5188保留，`/api/v1/health`为UP；31张原表（含Flyway）逐表计数与摘要一致，完整性ok、无外键错误，见`daily-before.json`和`daily-after.json`。

没有重新发布固定课包、改历史发布锁、覆盖既有工程或向日常库导入验收代码。新小节不生成虚假理解/独立能力证据。原全课程逐章真实学习回访及已有发布锁漂移继续单列。

收尾：独立5179/5191服务及测试浏览器页已关闭；日常5178/5188保留。原生网盘保持用户已打开的课程目录，没有关闭用户软件。最后一次测试页切换曾因源码尚未完成自动保存触发离页保护，等待保存后正常留存，未放弃源码。
