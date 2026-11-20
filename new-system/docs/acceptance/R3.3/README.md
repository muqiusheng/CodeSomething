# R3.3 Spring Boot与项目A验收

日期：2026年11月12日。R3.3.2—R3.3.4已交付，前端0.12.0。Spring Boot基础boot-foundations/1.0.0四章、个人任务管理task-manager/1.0.0六关已接日常网页。日常入口为http://127.0.0.1:5178/projects/boot-foundations和/projects/task-manager，后端5188。工程接续契约见[docs/12](../../../../docs/12-R3.3SpringBoot工程与接续契约.md)。

## 交付范围

Boot四章包含启动、路径/查询参数/DTO、构造器注入与分层、参数化JDBC。项目A包含读取、新增、修改删除、校验、稳定分页和书签独立迁移。每关提供概念讲解、输入输出示例、IDE步骤、验收要求、骨架文件、参考实现和两道正式情境题。骨架逐步减少；迁移章仅给启动类与固定POM，要求提交书签CRUD、分页、校验、JUnit测试和RUN.md。

多文件提交复用原有范围预览、配对授权、不可变SQLite快照、幂等检查队列、逐项报告、正式理解及唯一完成证据。源码变化不能借用旧报告；正式位置区分后续章节预览。课程、版本、关卡、策略、源码摘要、固定镜像及检查实现摘要共同绑定报告。原HTTP单文件和SQL通路保留。

项目A正式完成检查HTTP三个代码关、SQL迁移和Boot JDBC证据；Boot JDBC正式完成要求SQL写入证据。所有课程仍可预览，功能检查也可独立运行。画像显示功能/理解证据与独立程度尚未评价。RUN.md目前检查存在且至少80字符，开放讲解的质量及真实学习者独立完成表现仍需人工评价。

## 隔离执行与本机练习

固定Java21、Maven3.9.14、Spring Boot4.1.2及MySQL Connector/J9.7.0。普通Boot沿用R3.3.1镜像；JDBC镜像sha256:ed231f8aa9ebb2e48df58330e80692ecc5ca67717ee3c11dc0ab8ffabe3c3dc5固化1315项缓存文件，见[镜像构建](jdbc-image-build.log)与[环境锁](../../../backend/src/main/resources/runner/boot/jdbc-image-lock.json)。可信参考可在线预热依赖，学员检查始终离线构建，宿主不执行学员源码或构建配置。

每次JDBC作业独立创建internal网络与MySQL，使用tmpfs数据目录、受限学员账号及随机凭据，无宿主端口映射。Java容器非root、只读输入/根目录/依赖仓库，CPU/内存/pids和总时限受限。学员账号只有cs_lab的SELECT/INSERT/UPDATE/DELETE；root只允许容器内连接。错误、取消、超时和重启恢复均按归属标签清理容器、网络及临时输入。环境故障不计知识错误。

IDE使用独立持久练习库cs-boot-practice，端口只绑定127.0.0.1:13318，卷cs-boot-practice-data。执行tooling/start-boot-practice.ps1创建或连接，重复执行保留数据；生成的runtime/boot-practice/run.ps1加载本机凭据运行用户指定工程。真实宿主Java读取5条任务并重复启动保留通过，见[本机JDBC](local-jdbc.json)。此练习库使用普通Docker桥接网络以支持Windows宿主端口转发；正式验收网络继续为internal。它与现有无网络SQL练习库分开。

## 实际验证

后端回归47项全通过，无失败、无跳过，含原HTTP容器/课程/配对、SQL、平台、理解和辅导接口以及Boot快照/课程授权，见[统计](regression-summary.json)与[日志](regression.log)。另一个策略测试逐关运行参考和错误变式：十关参考通过，十个行为错误变式被拒绝，结果在[strategies](strategies/)目录。JDBC七关矩阵运行见[strategy-matrix.log](strategy-matrix.log)，Boot前三关的原始报告分别保留。

随后更新迁移测试检测和账号限制，补跑迁移正反例及JDBC账号隔离两项通过，见[final-isolation.log](final-isolation.log)。回归47项与策略类2项共49个不同JUnit测试方法；不同轮次范围有重叠，不按执行次数相加。迁移参考测试通过，允许空白标题的可信错误实现触发学员JUnit断言失败。检查器使用文档约定的TaskService.title(Input)公开接口，不要求学员采用特定源码表达式。

[完整API流程](journey.json)108条断言通过：在独立验收库真实完成HTTP/SQL先修及Boot四章、项目A六关；功能单独通过不完成、理解答错不完成、重答和幂等不重复、源码变化拒绝旧报告、后续章节预览不改正式位置、跨课程续学均覆盖。验收库位于runtime/r33-acceptance-data，未写入日常库。

[浏览器](web-checks.json)67条断言、50组尺寸通过。实际走过错误骨架→目录范围确认/配对→快照→失败报告→修改代码→重新检查→理解答错重答→刷新恢复，核对键盘页签、错误焦点、手机章节选择、200% CSS zoom、首页续学和画像十条精确证据链接。五个axe WCAG2A/AA场景均0违规、0待判断；系统屏幕阅读器和浏览器原生文字缩放未在本轮实测。

截图：[Boot目录](boot-project-1440.png)、[项目A目录](task-project-1440.png)、[报告](boot-report-1440.png)、[手机迁移任务](transfer-task-375.png)。手机最终图在视口切换动画结束后重拍；初始过渡截图保留但不作最终布局证据。

实际强制中断运行中的JAR检查，再用最终发布包重启：[中断前](recovery-before.json)、[恢复后](recovery-after.json)。恢复为environment_error，Boot4/4和项目A6/6完成证据、原续学位置保留，检查容器/网络/临时输入全部清理。中断前还在学员容器内验证外网不可达、远程root拒绝、全局DDL拒绝、输入/根目录/依赖仓库只读。

开发验收先发现MySQL默认远程空密码root可用，随后增加MYSQL_ROOT_HOST=localhost并移除root@%，账号隔离回归与最终中断前探针通过。另修正Windows JSON参数传递、应用进程重启与tmpfs生命周期、页签遗漏样式类。失败原始文件journey-failed.json及web-failed.json保留为开发过程证据，以成功记录和最终发布检查为准。

## 发布与数据

最终前端构建见[frontend-build.log](frontend-build.log)，独立目录后端打包见[package.log](package.log)。最终JAR摘要及源码逐文件一致性核对见[release.json](release.json)。使用tooling/start-release.ps1启动日常与验收后端；它拒绝占用中的端口，不自动终止其他服务。

日常库备份runtime/backups/pre-r33-20261112.db；[发布前](daily-before.json)与[发布后](daily-after.json)记录数量一致，integrity_check为ok，foreign_key_check为空。本轮复用V10结构，无新增迁移。日常Boot/项目A完成记录为0。日常页面和环境最终检查见[finish.json](finish.json)，截图daily-boot-project-1440.png。临时验收服务与验收SQL容器/卷在收尾清理；日常前后端、SQL练习环境及本机Boot练习库保留。

## 可复现入口

项目根目录：

```powershell
& ./new-system/tooling/new-boot-workspace.ps1 -Course boot-foundations -Stage boot-start
& ./new-system/tooling/new-boot-workspace.ps1 -Course task-manager -Stage a-read
& ./new-system/tooling/start-boot-practice.ps1
# 用生成的runtime/boot-practice/run.ps1 -ProjectDirectory <绝对路径>运行JDBC工程
$env:CS_RUN_DOCKER_TESTS='true'
& ./new-system/tooling/backend.ps1 -Action test
# 使用独立5189验收服务/库时运行API流程与浏览器脚本；勿指向日常库。
node new-system/tooling/check-r33-journey.mjs
```

本轮完成既定R3.3.2—R3.3.4。SQL/Boot专项AI辅导上下文、R1真实额度耗尽/上游物理断网、后续IDEA插件及画像复习属于后续范围。自动情境题与测试通过形成课程双结果，不自动推断独立作品能力。
