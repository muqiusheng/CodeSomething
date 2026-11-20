# R4.3 IDEA恢复与目录重绑验收

2026年11月12日，插件0.3.0。R4.1—R4.3工程任务完成。契约见[IDE恢复与目录重绑](../../../../docs/18-R4.3IDE恢复与目录重绑契约.md)。

## 交付行为

工具窗口恢复工程配对、端口、课程关卡、同一作业和待重试快照。网络故障保留状态并自动重连，提供手动恢复入口。目录移动后禁用提交，要求在新目录重新预览并确认；原报告保留。允许文件未保存修改时立即提示旧快照，完成报告继续定时核对磁盘摘要；窗口底部持续显示时效。清除本机配对移除本机状态和凭据，服务端历史保留。

## 已执行检查

- `./scripts/project.ps1 idea-test`：10项JUnit通过，零跳过。新增恢复元数据行为先因缺少字段及方法失败，再实现通过，见[初轮失败](red-recovery.log)、[首轮通过](green-recovery.log)、[最终测试](idea-tests.log)。
- `./new-system/tooling/idea-plugin.ps1 build`：标准Gradle的JUnit、buildPlugin、verifyPluginStructure全部通过，最终无描述校验警告，见[Gradle日志](gradle-build.log)、[JUnit XML](gradle-junit.xml)。本轮解决R4.1遗留的完整标准构建验收：关闭无表单Kotlin/Swing工程的额外Java插桩，并复用项目内已准备的Maven缓存。早期离线失败见[依赖诊断](gradle-offline.log)。
- `./scripts/project.ps1 idea-build`：本机SDK安装包构建通过，见[SDK日志](sdk-build.log)。最终安装包为idea-plugin/build/distributions/codesomething-idea-0.3.0.zip，核对不含测试、协议探针和沙箱扩展，见[安装包摘要](package-check.json)。ZIP为IDE安装格式。
- `./scripts/project.ps1 release-check`：7项门禁行为及149项发布输入锁、十关现有报告核对通过，见[发布门禁](release-check.log)。本轮没有变更判题器或已发布课程，沿用其现有发布矩阵证据。

## 真实IDE五段流程

`new-system/tooling/checks/run-r43-recovery.ps1`使用5191、独立SQLite、发布参考工程副本和独立IDE配置。兼容实测为IDEA2026.2 IU-262.8665.258/JBR25，基础平台模式，未安装到日常IDE。脚本每次分配独立目录并固定一份完整编译产物；首次启动引导只在该沙箱关闭。

1. 初次配对并提交，真实隔离Maven构建与健康接口检查通过，等待工程状态写入后正常退出。
2. 新进程恢复同一jobId；编辑器未保存修改立即显示旧快照；驱动停止5191后端，IDE显示断线并保留状态，后端使用同一库重启后自动恢复原作业。
3. 真正移动工程目录再打开，提交禁用并显示原目录；在新目录重新预览及确认后生成新绑定，清除本机配对后状态与凭据读取为空。
4. 再配对并完成一次检查，捕获新快照、保存幂等键，向服务端创建作业后模拟丢失创建响应，退出IDE。
5. 新进程恢复待重试快照与原幂等键，点击“重试启动检查”后获得原jobId并通过。最终3个快照对应3个作业，没有重试重复作业；3个原始源码/配置文件逐字节一致，理解尝试为0。

汇总见[五段流程及数据核对](recovery-check.json)、[驱动日志](sandbox-driver.log)。原始阶段结果分别为[初次提交](prepare-result.json)、[重启与断线](restore-result.json)、[移动与清除](moved-result.json)、[响应丢失准备](prepare-pending-result.json)、[重试恢复](restore-pending-result.json)。截图见[提交](prepare.png)、[持续旧快照](unsaved-stale.png)、[目录移动](moved.png)及[恢复重试](restore-pending.png)。

早期夹具运行发现首次引导阻塞、异步保存未等待、编译产物选择竞争和退出时凭据尚未保存，已分别修正为沙箱局部设置、等待实际落盘、固定编译产物、正常退出保存；最终五段流程从独立配置与发布参考工程重跑通过。

## 清理与接续

验收IDE与5191后端均已停止，测试运行容器已退出；日常5178返回200、5188数据库UP，保留两个日常数据库容器，见[清理与健康](cleanup-health.json)。本轮只更改插件、工具与文档；日常后端、前端和学习库未写入验收数据。

下一阶段为R5画像与复习。其他IDE构建保持未实测；IDE凭据库若使用仅内存模式，退出后需重新配对。R1真实额度/物理断网、SQL及Boot专项AI、真实学习者独立讲解仍按原阶段跟踪。
