# 隔离运行器（R2.3）

0.22.0：本目录提供备用及数据库/特殊章节的隔离运行环境。普通HTTP、Boot前三章和生成项目默认使用本机执行，参见docs/29-本地运行优先与检查环境回退.md。

已启用：后端从SQLite不可变快照建立临时输入，在独立JDK21容器内编译、启动学员服务并执行HTTP探针。原练习目录不挂载到容器，不加载学员构建脚本，也不在平台JVM运行学员代码。

镜像固定为`eclipse-temurin@sha256:4b1a74fbffbe6b4e7b6f0171a472478282fb463790a51edf10e465d578f22b69`。这是本机已有的21-jdk-jammy镜像，运行时`--pull=never`，缺镜像或Docker不可用返回环境异常；不自动下载、不回退宿主执行、不启动Docker Desktop。

限制：禁外网、不发布端口、UID/GID65534、只读根文件系统、只读本次TaskServer.java与Probe.java、移除全部capabilities、no-new-privileges、1CPU、256MiB内存且无额外swap、96进程/线程、64MiB临时文件系统。javac禁注解处理，Java最大堆96MiB，探针64MiB；单响应最多16KiB，宿主命令输出最多32KiB，报告日志最多8Ki字符。Docker日志驱动关闭，学员日志在有限tmpfs中。默认总运行45秒，上限120秒，容器自身150秒退出兜底。

编译和HTTP探针为受控命令；检查结果由后端解析真实HTTP响应。学员标准输出只进入日志，不决定通过。成功响应校验JSON整体语法、字段值及类型，失败响应校验404、内容类型和非空message。三种策略：run-server使用server-smoke-v1，只验证启动与响应；fix-response/原版单元使用task-json-v1；transfer使用notes-json-v1。阅读章节拒绝代码检查。

作业状态与报告持久化。取消执行中的作业先进入cancelling，容器和临时文件清理完成后进入cancelled；终态不会被重复取消改变。超时也执行清理。重启时对运行中遗留容器执行移除，并把中断作业归为环境异常供显式重试。队列持久化、串行执行，最多8个活动作业。仅在同一平台实例内使用本地单用户数据目录；尚未实现共享部署或多进程调度。

配置（当前进程环境变量，无需修改全局环境）：

- CS_DOCKER_BIN：现有docker.exe绝对路径，默认C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe。
- CS_RUNNER_ENABLED：默认true，false时新作业保留awaiting_runner。
- CS_CHECK_TIMEOUT_SECONDS：默认45，限制5—120。
- CS_FRONTEND_ORIGIN：默认http://127.0.0.1:5178，使用独立验收端口时同步配置。

真实容器测试需设置`CS_RUN_DOCKER_TESTS=true`后运行`new-system/tooling/backend.ps1 test`。未设置时相关7条测试跳过，不能以此宣称Docker验收通过。验收证据见../docs/acceptance/R2.3/README.md。当前结果只表示本检查策略的功能结果，理解验证与关卡完成在R2.4实现。

参考：[Docker运行与资源约束](https://docs.docker.com/engine/containers/run/)。上述限制已通过真实容器测试；这是本地教学执行器，不作为面向恶意租户的共享执行服务。
