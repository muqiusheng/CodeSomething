# R4.1 IDEA插件与配对验收

日期：2026年11月12日。对应[配对契约](../../../../docs/16-R4.1IDEA插件与配对契约.md)。版本0.1.0，IDE为本机IntelliJ IDEA2026.2（IU-262.8665.258），JBR25.0.3，Kotlin编译器2.3.20。

## 已执行验证

本机SDK构建：`./new-system/tooling/idea-plugin-local.ps1 test`与`build`通过。六项JUnit测试覆盖当前工程预览、显式确认配对、远程/凭据URL拒绝、快照已变更的恢复原因、目录不一致拒绝及发布关卡名称/只读章节过滤。按每个行为先失败再实现，red/green日志保存在本目录；最终见[final-tests.log](final-tests.log)。

独立真实后端：5191、runtime/r41-acceptance/data，与日常5188及其数据分开。ContractProbe用插件真实HTTP客户端加载Boot四关、预览三个文件并配对，验证配对码不能复用、修改文件不能沿用旧预览、测试副本源字节恢复。结果见[contract-check.json](contract-check.json)。

IDE沙箱：通过独立config/system/plugins/log目录启动本机IDE。测试专用启动扩展调用实际工具窗口的加载、预览与确认按钮，等待真实后台任务；读取IDE PasswordSafe确认凭据已存，复核项目元数据没有token字段。最终[结果](sandbox-check.json)、[预览截图](preview.png)、[配对截图](paired.png)通过。截图检查后修正端口千位分隔、字段对齐及配对后预览有效期的显示，再对受影响流程重跑通过。

Computer Use运行时不可用，Windows UI Automation未暴露Java控件；未宣称通过这两种工具完成点击。实际按钮验证由沙箱内的Swing/IDE测试扩展执行，截图由真实已挂载组件绘制产生。

安装包核验：[package-check.json](package-check.json)。生产插件包不包含测试类、ContractProbe或沙箱启动扩展，限定262.*。未向用户日常IDE安装；包位于idea-plugin/build/distributions/codesomething-idea-0.1.0.zip。

沙箱IDE与5191后端已停止，5178返回200、5188数据库UP，见[cleanup-health.json](cleanup-health.json)。未改后端源码、课程锁或日常库。没有执行R4.2代码检查作业、没有写入任何用户课程完成记录。

## Gradle入口

已从官方来源下载并校验Gradle9.2.1，见[分发摘要](gradle-distribution.json)；标准Wrapper生成通过，见[日志](gradle-wrapper.log)，提交的wrapper属性包含distributionSha256Sum。本机SDK脚本是已通过的安装包构建入口；Gradle项目配置及本机SDK解析通过，但首次下载Kotlin编译器等依赖耗时较长，已停止本轮额外构建；完整test/buildPlugin/verifyPluginStructure待验收，不能记为通过。日志见[gradle-build.log](gradle-build.log)，早期未使用代理的中止记录见[gradle-direct-attempt.log](gradle-direct-attempt.log)。已增加仅在当前进程使用HTTP_PROXY/HTTPS_PROXY的tooling/idea-plugin.ps1，后续可继续标准Gradle验证；根目录idea-test/idea-build仍调用已通过的本机SDK脚本。

## 接续

R4.1配对流程已验证。R4.2接保存快照、启动检查、状态及错误定位；R4.3接断线/重启恢复、目录移动重绑与旧结果标识。旧后端绑定撤销仍属后续生命周期工作。只在本机构建验证IDE版本上声明兼容。
