# Spring Boot离线运行底座（R3.3.1）

Java21 / Maven3.9.14 / Spring Boot4.1.2。固定POM和镜像锁位于backend/src/main/resources/runner/boot；此目录保存镜像构建文件、冻结依赖清单和参考源码。完整契约见[docs/12](../../../docs/12-R3.3SpringBoot工程与接续契约.md)，实测见[R3.3.1](../../docs/acceptance/R3.3.1/README.md)。

在项目根目录运行`./new-system/tooling/new-boot-workspace.ps1`生成独立Maven参考工程，默认runtime/boot-workspace。IDEA打开后运行Application，GET /api/health返回200和`{"status":"ok"}`。该参考工程用于运行底座验证；网页四章课程按接续契约发布。

运行`./new-system/tooling/prepare-boot-runner.ps1`制作本机锁定镜像，需要已有Java21、Maven3.9.14、固定JDK基础镜像和runtime/maven-repository缓存。脚本先离线构建可信参考，再冻结依赖、构建无网络镜像，成功后更新镜像锁。缓存缺失时保留失败原因，不自动切换在线构建。

BootProjectSnapshot只捕获固定POM和声明包的Java源码；BootCheckRunner在无外网容器里构建及检查，输出draft-r331报告。通过设置CS_RUN_DOCKER_TESTS=true运行BootProjectSnapshotTest和BootCheckRunnerTest验证。正式课程/SQLite/作业队列尚待接入，当前日常服务沿用已发布版本。
