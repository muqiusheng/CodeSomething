# 0.21.0 本地工程检查链路修复与整体检查

2026年11月17日。用户在正常IDE工程提交时被固定的lab/Application路径阻断，本轮按真实Maven工程修正完整链路，并检查主要业务入口。此文由检查结果持续更新；进行中的专项不记为通过。

## 已确认并修复的问题

1. 前端和后端重复要求src/main/java/dev/codesomething/lab/Application.java。改为读取安全范围内的Maven源码和资源，包、启动类、工程名由学习者确定。原始pom.xml与所有提交文件进入快照摘要。
2. 跨章节打开或保存草稿时改写POM，导致用户原工程配置与检查配置不同。移除改写，章节共享相同源文件；已发布课程的示例路径仍可作参考，网页当前引导不再要求lab包。
3. 运行器只执行target/boot-lab.jar。改为使用工程实际打包的JAR；支持常规Boot 3/4正式版本、JDK17至21和标准Maven插件。依赖在没有用户源码的临时容器里准备，实际源码按原始POM离线构建与运行。
4. 提交漏掉application.properties/yml等运行资源。现在自动读取main/test的Java及允许的文本资源、POM和RUN.md；IDE配置、target、根目录.env不进入检查。
5. 完成按钮只核对后台旧副本，IDE刚改动时可能沿用旧通过报告。完成前重新读取磁盘、同步快照并核对报告；提交或检查期间禁用完成按钮。
6. 切回已打开的干净文件页签时可能短暂显示旧缓存。现在立即读磁盘；未保存缓冲区保留，外部改动冲突拒绝覆盖，丢弃修改可撤销。
7. 二进制字节可能被替换字符解码后进入编辑器。现在严格按UTF-8解码；不把无法解码的文件作为可编辑文本。
8. 应用启动失败可能被误报为平台环境故障。现在读取存活容器的启动日志，作为应用失败反馈；容器/依赖/工具链问题仍归环境故障，不产生通过记录。
9. 快照恢复异常可能让后台作业滞留running。现在写入明确环境失败报告，允许重新提交。
10. 独立作品的首个HTTP探针只等约6秒，正确应用稍慢启动会误判失败。已用真实正确项目复现，并增加统一的30秒HTTP就绪检查与进程退出检测；启动就绪后再执行业务断言，启动失败仍保留日志。
11. 生成项目、作品导入与相应运行器也有固定包/POM/JAR限制。同类入口复用新的安全快照和依赖环境。标准测试变式按工程的根包与启动类适配。
12. 旧目录勾选读取器已无活动调用，删除重复的固定包规则与只验证旧行为的测试。当前测试覆盖新的目录行为。

## 当前验证证据

- 快照与API测试先复现失败，再验证自建包、启动名、资源文件、原始POM及跨章不改写。资源读取与二进制保护也留有先失败后通过记录。
- 最后常规后端回归：112项，87项执行通过，25项需容器的专项在该命令中跳过，本轮按下述受影响流程另行选择验证；日志new-system/runtime/project-audit-backend-final.log。
- 前端单元15项通过；最终构建日志new-system/runtime/audit-frontend-build-final.log，保留原有依赖指令和分块大小提示。
- Spring Initializr形态工程：Boot4.0.9，com.example.demo.LearnSpbootApplication，learn-spboot-0.0.1-SNAPSHOT.jar，嵌套controller和application.properties。真实隔离构建与健康接口通过；改错资源中的status后得到业务失败。原始及复验JSON位于本目录和boot/。
- 浏览器check-project-audit.mjs：9项完整流程，15个路由与30组375/1440px尺寸检查通过。包括即时磁盘变化拒绝完成、重新验证后完成、跨章不改POM、干净页签重新读取、回看标旧、刷新恢复；结果browser.json。测试仅替换系统选择框边界，后续使用真实Chromium目录句柄、文件流、IndexedDB和真实后端检查结果。
- 浏览器axe记录a11y.json，当前检查页面无违规、无待判断；不将单页自动结果扩展为全站零问题。
- Boot与项目A容器专项：3个测试方法通过，含boot-start、boot-jdbc、a-transfer各自参考/错误变体，另含自建4.0.9正负项目与数据库账号/网络隔离。证据boot/，共9份运行结果。
- 项目B：b-login、b-tests、b-deploy参考与错误变体全部通过预期判定；覆盖身份、权限、事务、分页、真实JUnit及变式检测、部署与重启等累计断言。证据collaboration/共6份运行结果。
- 生成项目完整API流程已通过：发布门禁、参考/错误变体、分章学习、当前性、帮助声明和完成。SQL真实MySQL参考/错误变体、练习库隔离和完成记录7项也已通过。最初容器矩阵13项有1项独立作品启动等待误判，其失败日志保留用于说明复现；修正后Portfolio核心、迁移与超卖错误变体全部通过，见portfolio-final/。

- 最后配置复验3项通过（project-audit-final-config.log）：Boot4.0.9正确/错误/启动失败、显式Lombok注解处理，以及作品核心/迁移/超卖；结果见final-config/与portfolio-final/。准备依赖时关闭注解处理，用户代码实际离线编译时遵循原POM的编译配置。
- 最终共享运行器复验3项全部通过：生成项目自建com.example.library包、ReaderApplication与reading-project.jar；项目B登录参考/错误变体；独立Boot运行器启动。最终日志project-audit-shared-runtime-final.log，证据shared-runtime-final/与collaboration-final/。
- 发布课包按既有锁清单逐字节核对：r34的132份课包文件、r7的163份课包文件摘要一致；未改写历史锁、历史证据或旧项目。记录course-locks.json。

## 范围与实际限制

本轮没有更换学习目标或发布课包，没有把学习者工程迁移进网站目录。HTTP仍是课程约定的TaskServer.java单文件实验；SQL仍为脚本和隔离数据库；Tlias仍是资料实战与自查，未增加自动判题。生成项目与独立作品保留其专用学习界面，导入/检查规则同步修正。

当前支持单模块标准Boot Maven工程。聚合模块、外部父POM、Gradle、自定义构建扩展及超出JDK范围会返回配置说明；没有偷偷替换版本或源码后标记通过。首次新依赖准备需要网络与时间，之后复用按配置摘要缓存的镜像。用户源码在原有非特权、只读根文件系统、限制资源与外部网络的运行器中执行；依赖准备不含用户源码，关闭注解处理。

首次原生系统文件夹对话框与跨浏览器会话永久授权仍由浏览器管理；浏览器自动验收的选择器边界已明确记录，不将OPFS替代选择器说成已操作系统对话框。当前用户截图已表明实际目录读取授权可用。

主要参考：Apache Maven的go-offline说明（https://maven.apache.org/plugins/maven-dependency-plugin/go-offline-mojo.html）与Spring Boot打包说明（https://docs.spring.io/spring-boot/maven-plugin/packaging.html）。实际实现使用隔离依赖准备中的test/package预热，避免为每个工程解析无关发布/站点插件；实际JAR名称遵循用户POM。

## 已交付状态

日常前端5178与后端5188已运行0.21.0，实际JAR为project-audit-0.21.0-final.jar，摘要见release.json。后端原IDE与模型二进制配置保留。

切换前在线备份日常SQLite，确认无活动作业；切换后31张表逐表行数与内容摘要完全一致，记录daily-data-before.json、daily-data-after.json。没有数据库结构迁移或测试学习记录混入日常库。

同一发布JAR在独立5189学习库完成最后网页提交：com.example.demo.LearnSpbootApplication、Boot4.0.9、原始POM、自动收集资源、实际JAR名称，真实功能检查通过。browser-final-smoke.json与own-project-passed-final.png保存实际结果；最终图已打开核对。长文件名改为目录内横向滚动，375/1440px无页面溢出、文件名保持单行，结果directory-layout-final.json；截图own-project-final.png。

最终前端构建通过（project-audit-frontend-build-final.log）。测试会话、5179/5189独立进程在收尾关闭，日常5178/5188继续运行；临时作业与依赖准备容器已由各运行器清理，可复用依赖镜像保留。
