# R9 网页编程与个人中心

2026年11月16日。前端0.18.0，后端0.1.0，数据库V14。日常入口5178/5188。

## 已实现

- 首页“继续练习”直达任务。HTTP准备章改为网页工作区准备说明，不再显示无意义的检查报告页签；原版课程文件保持原样，通过网页练习适配层呈现新的操作指引。
- HTTP与固定Boot/项目A/B课程提供Monaco网页编辑、语法高亮、查找、文件切换、错误行定位、服务端草稿、浏览器恢复副本、版本冲突处理、源码快照、隔离编译检查及理解验证。插件和原目录提交按需展开，保留既有接口。
- SQL接Monaco与本地保存；生成项目接可编辑源码；独立作品增加网页源码预览和提交入口。后几类继续使用各自原有作业/证据接口；未提交草稿以浏览器缓存为主，HTTP/固定Boot草稿另外保存到服务器。
- “保存到本地目录”使用Chrome/Edge File System Access API，由用户选择目录、查看文件范围并保存；保持工程路径，只覆盖声明文件，保留其他文件。跨路径和无效路径在写入前拒绝。原生目录选择器未做人工点击验收；已验证浏览器实际目录句柄写入，以及Windows临时目录中的结构、内容、无关文件保留和越界拒绝。
- 个人中心包含五维课程验证覆盖雷达图、六项实际统计、7/30/90天活动日历、领域进度和可展开技能地图；统计时段进入URL。无记录显示待验证及空状态；运行成功率排除排队、取消和环境问题，不计算虚构总战力或等级。
- 头像弹出菜单集中画像、学习偏好、外观与交互、模型连接和设置；支持方向键、Escape、焦点返回和设置锚点跳转。依用户后续指令移除顶部介绍块。

## 实际验证

- 后端最终回归：30项，28通过、2项需要显式Docker开关的测试跳过，无失败。命令：`./new-system/tooling/backend.ps1 -Action test -TestName 'BrowserWorkspaceApiTest,UnderstandingApiTest,LearnerProfileApiTest,PortfolioApiTest,LearnerStatsApiTest#statsCountRealRunsAndKeepPendingJobsOutOfTheSuccessRate'`。日志runtime/r9-backend-regression.log。另有新增接口先失败再通过的单独运行记录。
- 前端7项单元通过，包含能力汇总与本地文件保存的行为验证。前端构建通过；Monaco动态加载，仍有编辑器分块超过500kB的构建提示。
- `check-web-workspace.mjs`：8项真实HTTP闭环检查通过。网页编辑→错误编译→行号定位→修复→旧报告标识→刷新恢复→真实容器通过→正式理解→画像更新。证据browser-report.json及对应截图。
- `check-personal-center.mjs`：77项检查，其中50组尺寸（5页×2主题×5宽度）无页面横向溢出；10次axe均0确定违规。头像键盘、设置锚点、统计筛选、能力详情、准备章入口及本地保存均实际执行，原始结果personal-center-report.json。
- `check-web-course-smoke.mjs`：Boot首关多文件经真实隔离构建、接口检查通过，并进入正式理解；SQL在实际MySQL启动后经网页编辑器试运行并返回connected结果。证据course-smoke.json、sql-smoke.json及截图。首次SQL未启动环境的环境错误如实保留在验收库，不计为代码错误。
- 交付前日常页面：头像菜单及两主题截图已实际查看；雷达SVG文字逐项按实际背景计算对比度，最小5.8848，证据daily-final.json。介绍块不存在。日常统计当时运行、复习和活跃日均为0，未导入验收完成记录。

## 自动待判断与范围

axe对SVG文字、Monaco屏幕阅读器辅助输入层、提示区和既有页签装饰有对比度待判断项，未冒充为0待判断。雷达已逐项计算对比度；可见编辑器注释和注解的确定对比度问题已修正，实际截图检查已完成。辅助输入层承担键盘/屏幕阅读器，代码可见内容由token绘制。

首轮真实闭环覆盖HTTP；固定Boot首关和SQL试运行另行实测。生成项目与独立作品新增入口通过构建及相关接口测试，尚未对每一个生成项目、作品和所有课程逐关重走实际学习流程。Java语义补全、任意命令终端和任意业务自动评价未实现。

## 日常切换

先备份至runtime/data/backups/pre-r9-20261116.db，检查无活动作业，再更新current-backend-jar.txt并重启日常后端。前后30张旧表逐表内容摘要一致，只有Flyway增加第14次迁移，新建browser_workspaces；证据runtime/r9-daily-before.json及r9-daily-upgrade.json。原JAR指针保存在runtime/r9-previous-backend-jar.txt。验收使用5179/5189及r9-acceptance-data，未将测试证据写入日常库。

收尾：验收5179/5189服务、cs-sql-r9-acceptance容器及其独立数据卷已清理，四个本任务浏览器会话均已关闭。日常5178返回HTTP 200，5188健康UP；最后前端构建及7项单元通过。
