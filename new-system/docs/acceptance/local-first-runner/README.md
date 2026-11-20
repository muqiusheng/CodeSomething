# 本机运行优先检查

2026年11月17日。规格docs/29-本地运行优先与检查环境回退.md。

## 实现

LocalProjectRunner运行提交快照，复用本机工具和依赖；BootHttpChecks在本机与Docker路径共用，生成项目也共用原断言。LocalFirstCheck仅对local_unavailable回退；其他学习结果原样返回。CheckJobWorker接入普通HTTP和非JDBC的Boot章节，GeneratedRunner接入生成项目。数据库及特殊隔离章节继续沿用原运行器。备用镜像中的预编译探针优化一并保留，见check-speed。

## 已执行证据

- local-runner-red.log：新增本机行为测试先因执行器不存在而失败。
- local-runner-routing.log：HTTP错误实现→修正通过→语法错误、取消不回退及环境失败回退行为通过。
- local-first-api.log：10项专项通过，包括本机Boot正确/错误实现、生成项目正确/错误实现、HTTP、取消、端口占用、启动失败、阶段与旧隔离API异常路径。
- 同一专项内网页API在Docker路径不存在时仍完成真实HTTP检查，报告image为local-jdk，摘要匹配；改源码后旧报告标为过时。
- native Boot HTTP章节：正确工程9.90秒，正确/错误两次合计19.94秒。先前相同章节隔离检查两次为43.38秒，较早原始实现为60.45秒；为不同时间的本机样本，不作为全部章节或首次依赖下载的保证。数据见comparison.json。

以上日志均位于new-system/runtime/。

## 收尾与日常交付

- local-first-fallback.log：2项真实容器专项通过。缺少本地JDK时回退HTTP隔离检查，保留回退原因及同一源码摘要；Boot HTTP章节在共用断言后正确实现通过、错误实现拒绝。
- local-first-unit-final.log：常规124项，93项执行通过、31项按本机/容器条件跳过；本轮相关的有条件专项已按上项及API日志另行实测，不把跳过记为通过。
- 最终JAR验收发现强制平台镜像ID导致用户Maven缓存重新联网核验，改为复用用户.m2与本机Maven设置。local-first-package-final.log记录最后打包通过；配置修正后的发布产物运行check-local-first-release.py，在Docker不可用时完成4项网页API提交：HTTP通过1.531秒、Boot4.0.9原包/启动类/资源通过14.688秒、错误业务值business_error约9.735秒、编译错误compile_error约4.297秒。完整报告release-smoke.json。
- 日常5188已运行local-first-runner-0.22.0.jar，健康UP；31表切换前后摘要一致，无新增迁移。备份位置见daily-data-before.json，核对见daily-data-after.json。验收5189已停止，进程检查只剩日常后端，无遗留测试Java进程。
- 版本与产物SHA-256见release.json。运行方式由本机服务选择；前端课程、用户原学习工程和已发布课程文件未改。本轮没有新建云端执行服务。

