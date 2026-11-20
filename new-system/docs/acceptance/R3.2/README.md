# R3.2 MySQL教学与SQL闭环验收

日期：2026年11月12日。结果：R3.2完成，前端0.11.0、SQL课程sql-foundations/1.0.0已接入日常网页。HTTP/JSON课程1.1.0及原记录保留。技术契约见[docs/11](../../../../docs/11-R3.2SQL教学闭环与运行契约.md)。

## 可用入口与环境

日常前端127.0.0.1:5178，后端5188；项目入口`/projects/sql-foundations`。容器cs-sql-learning已就绪，实际MySQL8.4.13，卷cs-sql-learning-data。固定镜像摘要a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902，无网络/端口映射，640MiB/1CPU/256pids。

日常数据库V9升级前备份在runtime/backups/pre-r32-20261112.db；[升级前](daily-before.json)与[升级后](daily-after.json)表数量一致。V10迁移成功，integrity_check为ok，foreign_key_check无错误；日常SQL尝试/理解/完成均为0。日常截图见[daily-project-1440.png](daily-project-1440.png)，图中没有验收完成记录。

验收网页5179、后端5189使用runtime/r32-acceptance-data与独立MySQL容器/卷。六关正式完成仅存在验收库和临时JUnit库，未写入日常库。临时服务和容器在证据整理后关闭，日常服务保留。

## 后端与实际命令

在项目根目录执行：

```powershell
$env:CS_RUN_DOCKER_TESTS='true'
& ./new-system/tooling/backend.ps1 -Action test
& ./new-system/tooling/backend.ps1 -Action test -TestName SqlLearningApiTest
& ./new-system/tooling/backend.ps1 -Action package -SkipTests
```

全量35项通过（包括原HTTP容器、平台、正式理解、AI辅导接口和5项SQL测试），见[全量统计](backend-full-summary.json)与[日志](backend-full.log)。随后新增并发幂等/排队取消恢复用例，SQL专项6项全部通过，见[专项结果](sql-api-tests.txt)与[日志](sql-api-tests.log)。两次范围有重叠，不合计为41项不同测试。JAR打包通过，最终前端执行npm run build通过，无新增npm依赖。

六个SQL关卡均实际执行参考实现与错误变式：连接值错误、建表缺约束、WHERE方向错误、UPDATE漏WHERE、分页偏移错误、迁移误改其他书签。全部正例通过且错误变式失败；查询/分页还在第二组数据上核对。正式题答错不完成、只功能通过不完成、SQL变化不能借用旧报告、跨关卡/版本拒绝、先修拒绝、同键不同内容冲突、五个并发重复请求只保存一份快照、取消后重启恢复均有覆盖。

开发中先跑出缺失API及SQL/Java通路拒绝的失败测试，再实现对应行为。真实容器测试检出Windows模板引号及镜像临时初始化服务问题，已分别改为结构化inspect和最终mysqld就绪判断；修正后的测试通过。

## 浏览器

独立agent-browser会话codesomething-r32及finish完成后均关闭。脚本使用任务工具链activate.ps1设置环境，CS_BROWSER_BIN指向该工具链的agent-browser可执行文件：

```powershell
node new-system/tooling/check-r32-web.mjs
node new-system/tooling/check-r32-finish.mjs
```

[主流程](web-checks.json)：75条断言、40组尺寸检查通过。完整六关走过真实SQL编辑→功能检查→新情境理解→服务端完成。额外核对错误WHERE预期/实际对比、理解答错重答、刷新恢复、首页SQL续学、画像精确证据入口、试运行不计完成、重置取消/确认、键盘页签、CSS200%缩放和HTTP记录未变。

[局部收尾](finish-checks.json)：28条断言、15组尺寸检查通过。覆盖.sql导入、草稿刷新、手机章节选择器、统一页签的键盘行为、精确历史快照/摘要、拒绝SQL后的错误焦点及重置弹窗焦点循环。手机截图在侧栏收起后补拍，避免把尺寸切换中的过渡帧作为最终布局。

视口均为320/375/768/1024/1440px，无页面横向溢出；结果表和代码块允许内部滚动。截图：[项目目录](project-1440.png)、[错误WHERE](wrong-where-1440.png)、[正式报告](report-1440.png)、[手机任务](task-375.png)。

主流程4个axe WCAG2A/AA场景均0违规，局部收尾两个场景也为0违规。重置弹窗存在aria-hidden-focus与color-contrast两类自动待判断项，见[原始结果](axe-reset-dialog.json)：实际连续8次Tab均留在弹窗内，Escape返回重置触发按钮；标题及说明实测白底文字对比度16.11:1与5.02:1。自动incomplete原样保留，不改写为自动全通过。完整浏览器文字缩放和系统屏幕阅读器未做本轮实测，200%结果仅指CSS zoom。

## 故障、隔离与服务恢复

执行`node new-system/tooling/check-r32-failures.mjs`，见[failure-checks.json](failure-checks.json)，18条断言通过：

- 用真实MySQL表锁阻塞查询，分别得到timeout和cancelled，客户端连接数回到0。
- 同时提交两次检查，得到不同临时数据库，结束后检查库清空。
- 拒绝INSERT SELECT和CREATE AS SELECT；学员SQL的跨库、外部文件、任意函数及客户端命令已由API测试拒绝。
- 停止验收MySQL得到environment_error；恢复后卷中6条练习数据仍在。
- 验证BOOLEAN默认0以及CREATE TABLE隐式提交，ROLLBACK后此前写入仍存在；测试库随后删除。
- 超时、停止及环境故障没有删除已有六关完成证据。

另对真实验收JAR做强制中断：先连接环境，再暂停验收容器，使作业处于[running](recovery-before.json)，终止5189进程后重启同一JAR/数据库，作业恢复为[environment_error](recovery-after.json)，六关完成和SQL续学位置保留。重新连接环境后清理遗留检查库。前两次准备分别已提前进入环境错误，未作为running中断通过证据；最终上述running前后记录为有效证据。

## 当前范围与接续

SQL固定讲解/确定性报告/理解题已闭环；SQL专用AI上下文未接入，HTTP/JSON现有AI接口回归通过。当前不提供教学MySQL的TCP直连；IDE编写.sql文件后可导入网页。Spring Boot基础、Java多文件快照、JDBC连接MySQL及个人任务管理项目进入R3.3。

R1真实限额耗尽/上游物理断网余项继续保留，未因R3.2通过而销项。没有修改旧code-something目录或迁移旧数据。
