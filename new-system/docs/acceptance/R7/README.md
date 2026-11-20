# R7 完整业务项目B验收

2026年11月13日工程验收完成。前端0.16.0、后端0.1.0、IDEA插件0.3.1，平台数据库V12。日常5178/5188已切换到最终发布包，入口为“项目→学习计划与任务协作”。课程标识collaboration/1.0.0，八个60分钟关卡。

## 已交付

八关覆盖可撤销会话、全局角色与计划对象权限、计划/成员关系、稳定分页筛选、批量事务、统一错误与安全请求日志、有效API集成测试、配套业务前端与持久部署。第七关要求自己编写测试，第八关仅提供固定POM与启动类。支持网页或IDE配对、多文件不可变快照、隔离功能检查、两道正式理解题、先修校验、幂等完成、续学、27项画像、16道新增复习变式与五课程回顾。

业务参考实现使用真实MySQL；权限反例同时覆盖管理员接口、局外人跨计划读取、普通成员分配任务、他人任务与跨计划任务编号。事务检查让第二条输入失败，直接核对数据库任务与审计均未增加。测试门禁将提交JUnit运行于固定越权错误实现，空断言无法通过。

## 验证结果

- 后端69个不同JUnit方法最终通过、零未解决失败、零跳过；[逐方法证据](backend-tests.json)。全量基线副本仍带“回顾只有四门课程”的旧断言，新增项目B后实际为五门；更新断言并修正画像总数后，当前源码15项相关回归通过。原始[全量日志](backend-full.log)与[当前源码回归](backend-current-regression.log)分别保留，汇总按当前源码证据替换该旧断言。常规backend.ps1入口的[九项专项](backend-standard-command.log)也通过。
- 八关参考与八个行为错误变式全部通过门禁，报告绑定当前参考摘要、检查器类、探针、种子、错误实现与镜像。[最终策略矩阵](strategies-final/)、[182项发布输入门禁](gate.json)、[R7版本锁](../../../curriculum/r7-release-lock.json)。早期strategies目录保留开发诊断，正式门禁读取strategies-final。
- 198项API断言通过，真实运行八个Docker作业，逐关完成理解题与双结果、幂等重试、权威进度、续学和复习。[API记录](api.json)。先修仅在独立runtime/r7-api-final库用六条明确命名的项目A测试夹具；项目B八关使用真实提交和作业，日常库保持原数据。
- 浏览器84项检查、40组尺寸、11个axe场景最终零违规、零待判断。[浏览器汇总](browser-final.json)。覆盖真实登录/错误聚焦、分页、HTML标题按文本显示、批量回滚、成员/局外人/管理员边界、账号切换清空旧任务、IDE报告交接、两主题、320—1440px和代码区焦点。原始browser.json包含已修正的画像总数发现，局部复查结果已合并到browser-final。
- 实际JAR强制中断后，同一作业恢复为environment_error，八关完成和位置保留，所属容器与网络清理。[中断前](interruption-before.json)、[恢复结果](recovery.json)。
- 实际部署实例的应用JAR重启后，浏览器创建的计划、任务、已完成状态与同一登录会话保留；宿主只绑定127.0.0.1。[部署重启](deployment-restart.json)。
- 前端构建和五项单元、IDE十项JUnit及0.3.1打包通过。旧课程八项门禁、R7六项门禁、原149项锁与平台扩展、研究六项行为/来源核验通过。[发布检查](release-check.log)。
- 最终独立JAR的72份主源码与当前仓库相同，检查器类字节与矩阵一致。[构建清单](build.json)。独立构建目录避开IDE对普通target目录的增量编译干扰。

## 日常数据与服务

切换前备份为runtime/backups/pre-r7-20261113-131444.db。切换后25张表逐表内容摘要一致，integrity_check=ok、外键检查无错误，R7日常完成数为0；没有导入验收数据。[切换前](daily-before.json)、[切换后](daily-after.json)。当前后端指针为runtime/current-backend-jar.txt，ChatGPT连接ready，八章课程与0/8进度在真实日常页面验证。[服务核对](daily-service.json)、[日常目录截图](daily-catalog.png)。

验收前后端使用5179/5189与独立SQLite，业务演示验收使用5197和独立MySQL卷；收尾停止验收实例，日常学习服务与原SQL/Boot练习容器保留。清理结果见cleanup.json。

## 实际命令

```powershell
# 独立编译与测试，保留原后端工作目录以兼容已有测试路径
./new-system/tooling/prepare-r7-build.ps1 -Name r7-final-build
# Maven使用本机JDK21、固定仓库与cs.runner隔离环境；完整命令记录于测试日志

node ./new-system/tooling/checks/check-r7-api.mjs
node ./new-system/tooling/checks/prepare-r7-interruption.mjs
node ./new-system/tooling/checks/verify-r7-recovery.mjs
node ./new-system/tooling/checks/check-r7-deployment.mjs

./scripts/project.ps1 frontend-build
./scripts/project.ps1 frontend-test
./scripts/project.ps1 idea-test
./scripts/project.ps1 idea-build
./scripts/project.ps1 release-check
./scripts/project.ps1 research-check

python ./new-system/tooling/checks/summarize-r7-tests.py
python ./new-system/tooling/checks/r7-daily-data.py verify
```

浏览器脚本为frontend/tests/browser/check-r7.mjs、check-r7-finish.mjs、check-r7-regions.mjs，使用独立命名会话；启动工具前加载本机video-browser-runtime/activate.ps1并设置CS_BROWSER_BIN。它们依赖上述验收实例和夹具，按本记录的阶段运行。

## 待实际学习验证

工程检查验证代码与概念规则。真实学习者独立完成、开放讲解表关系与事务、陌生需求迁移继续进入R8学习回访。200%采用1440px视口CSS zoom模拟；768px下同一模拟保留桌面媒体查询而使既有应用壳溢出，原生浏览器文字缩放尚未实测。原R1真实额度/物理断网、SQL及Boot专用AI上下文继续单列。

完整范围与业务API见[项目B契约](../../../../docs/22-R7完整业务项目B契约.md)。
