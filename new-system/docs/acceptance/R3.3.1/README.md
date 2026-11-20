# R3.3.1 Spring Boot运行底座验收

2026年11月12日。结果：多文件快照、固定Maven工程、离线容器构建及健康接口检查通过。日常前端仍为0.11.0，HTTP/SQL课程沿用已发布版本；Boot报告使用draft-r331。接续范围见[docs/12](../../../../docs/12-R3.3SpringBoot工程与接续契约.md)。

## 产物与实际行为

BootProjectSnapshot捕获固定POM与声明包内Java文件，排序摘要覆盖所有文件；拒绝修改POM、单文件超限、嵌套目录及Windows目录联接。未声明的.env和.mvn不进入快照，捕获后修改源文件不改变原快照。

镜像固定为sha256:1d8c33dc7ce617e0cbf115ac2fdafbbbf95b081aae77d0b644d70b9bb3ed93a4，采用Java21、Maven3.9.14、Spring Boot4.1.2。[镜像准备日志](prepare.log)包括可信参考的宿主离线构建及无网络Docker镜像制作。固定POM和依赖清单摘要见[环境锁](../../../backend/src/main/resources/runner/boot/image-lock.json)，冻结缓存共1310个文件。

参考工程在无网络、只读根目录、非root和有限内存容器中从干净多文件目录构建可执行JAR，再启动Boot并发出真实HTTP请求。只有GET /api/health的200、JSON内容类型和status字符串ok同时满足才通过。源码和标准输出不作为通过断言。

## 测试与证据

项目根目录实际运行：

```powershell
& ./new-system/tooling/prepare-boot-runner.ps1
$env:CS_RUN_DOCKER_TESTS='true'
$env:CS_BOOT_EVIDENCE_DIRECTORY=Join-Path (Get-Location) 'new-system/docs/acceptance/R3.3.1'
& ./new-system/tooling/backend.ps1 -Action test -TestName 'BootCheckRunnerTest,BootProjectSnapshotTest'
& ./new-system/tooling/backend.ps1 -Action test
& ./new-system/tooling/backend.ps1 -Action test -TestName 'BootCheckRunnerTest#aContainerNameCollisionPreservesTheOtherRunsContainer'
& ./new-system/tooling/backend.ps1 -Action package -SkipTests
```

全量44项测试全部通过，无失败、无跳过，见[统计](full-summary.json)和[日志](backend-full.log)。包含Boot运行5项、快照3项，以及原HTTP课程/工作区、容器、平台、SQL、理解和辅导接口。随后新增的[容器重名冲突测试](collision.log)单独1项通过，共45项不同测试；前期专项与全量范围有重叠，不重复累计。

常规打包因日常进程占用原JAR而无法重命名，见[首次打包](package-locked.log)。随后将pom.xml与src原样复制到runtime/r331-package/backend，逐文件核对摘要相同，以Maven3.9.14执行`-o -DskipTests package`，独立目录打包通过，见[最终打包](package.log)。完整命令还包含固定settings、本地依赖仓库与-f独立POM路径。产物摘要与同源核对保存在finish.json；日常服务保留运行。

逐项可读报告：

- [参考工程](reference.json)：真实离线构建和健康响应通过。
- [错误业务值](wrong-health.json)：返回status=wrong，结果business_error。
- [非法Java](compile-error.json)：结果compile_error，并包含HealthController.java定位。
- [隔离](isolation.json)：学员代码写输入、探针、依赖仓库及根目录均失败，外网连接失败、Docker socket不存在；真实HTTP仍通过，日志保留BOOT_ISOLATION_OK。
- [运行超时](timed-out.json)：Maven构建成功后请求阻塞，总时限15秒触发timed_out。
- [取消](cancelled.json)：运行中取消，结果cancelled。

环境故障测试将Docker指向不存在的可执行文件，返回environment_error；非法作业ID在文件操作前拒绝。每次执行均核对临时输入为空，最终核对无cs-r331容器遗留。容器重名时以随机归属标签核对，已有其他运行容器保留，测试随后只清理自行创建的容器。

TDD首次失败分别是缺少快照类及运行器类，见[snapshot-red](snapshot-red.log)、[runner-red](runner-red.log)。首次真实参考运行在构建成功后发生超时，JUnit记录约901秒墙钟时长，原因未确定，原始记录保留[first-timeout](first-timeout.log)。立即重跑约11秒通过，见[retry](retry.log)；随后专项及全量再次通过。该次失败未计入通过证据。Maven在noexec临时目录中打印Jansi本地库加载提示，随后降级并完成构建，原日志保留。

## 工程生成与日常状态

实际执行new-boot-workspace.ps1，生成runtime/boot-workspace，含两个源码文件及固定POM，可用IDEA打开Application运行。再次向同一目录生成时明确拒绝覆盖。prepare脚本PowerShell语法检查通过，固定Maven与Java版本识别通过。镜像制作上下文保留在runtime/boot-image-586dc01b750d4ed2ab51a4947793b0be供检查。

本轮新增独立执行类与资源，未添加迁移或修改日常学习库；验收仅使用JUnit临时库和临时容器。日常5178/5188健康与清理结果见[收尾检查](finish.json)。前端未修改，本轮不重复做网页布局验收。

## 接续范围

R3.3.1是独立工程底座。课程注册、SQLite多文件快照、队列接入、双结果与续学、网页课程/报告及JDBC数据库连接尚待R3.3.2—R3.3.3；项目A六关接R3.3.4。本轮草稿报告不写入正式完成或学习画像。R1真实限额/物理断网及SQL专用AI上下文余项继续保留。
