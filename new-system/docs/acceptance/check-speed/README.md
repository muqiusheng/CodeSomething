# 学习项目检查提速

2026年11月17日。范围为Boot、项目A/B、生成项目和作品的隔离检查链路。

## 改动

平台的Probe、BootProbe、R7Probe及WaitForHttp在无网络、无学员源码的临时容器内编译一次，作为只读镜像层复用。缓存键包括实际依赖镜像ID、全部探针源码和编译策略版本。后续检查直接运行class，避免逐个接口重新编译Java源文件，以及每次作业重新编译R7Probe。

学员原始POM、源码打包、独立数据库、隔离权限、接口断言、快照摘要和完成条件保持原有规则。未增加CPU或内存限额。首次遇到新的依赖镜像或探针版本需要准备缓存；热缓存收益与接口数量有关。镜像缺失会重建，取消和准备失败不产生通过记录。进度条同时识别源码探针与预编译探针。

## 对照

同机、同boot-http章节、相同正确实现和业务错误变式，使用现有BootStrategyRunnerTest的eachPublishedStrategyAcceptsItsReferenceAndRejectsItsBehavioralMutant方法；CS_RUN_DOCKER_TESTS=true、CS_BOOT_STAGE_FILTER=boot-http。

| 两次检查合计 | 优化前 | 优化后（缓存已就绪） |
| --- | ---: | ---: |
| JUnit方法耗时 | 60.45秒 | 43.38秒 |
| 正确项目 | passed | passed |
| 错误项目 | business_error | business_error |

本次缩短17.07秒，约28.2%；是一次本机对照，未据此承诺全部章节或首次准备的耗时。数字包含两次完整运行器调用，不包含Maven测试框架启动；两个测试各运行多个接口断言。

原始日志：new-system/runtime/check-speed-before.log、check-speed-after.log。快照报告：new-system/runtime/check-speed/before和after。摘要见comparison.json。

## 验证与交付

新增ProbeEnvironmentTest先失败后通过，覆盖编译产物可读不可写、相同输入复用镜像、取消及临时输入清理。CheckProgressTest新增预编译命令的启动/功能阶段测试，也先失败后修正。初次回归发现Docker不可用时工作目录初始化提前退出，修正后5项专项通过，常规116项中89项执行通过、27项条件跳过，打包通过。随后用户确定本机运行优先，此优化作为备用隔离路径保留，统一交付见../local-first-runner/README.md；没有单独切换check-speed版本。
