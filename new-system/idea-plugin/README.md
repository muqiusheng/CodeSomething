# CodeSomething IDEA插件

插件版本为 0.3.1，支持 IntelliJ IDEA 的 262.* 构建系列。阶段验收使用 IntelliJ IDEA 2026.2（IU-262.8665.258，JBR 25）。

## 当前功能

打开练习工程后，通过View → Tool Windows → CodeSomething打开工具窗口；选择课程，点击“加载课程”，选择后端发布的编码关卡。点击“预览提交范围”可查看当前工程允许的文件、快照摘要与有效期，再点击“确认范围并配对”。可从窗口打开对应网页任务。

支持HTTP/JSON、Boot基础和项目A。SQL课程继续在网页提交.sql。插件预览会保存当前工程内用户尚未落盘的文档，再由本机后端读取允许文件；不修改业务代码内容。切换课程、关卡或服务端口会清除待确认预览。

后台请求只连接127.0.0.1或localhost，不跟随重定向。令牌存入IDE PasswordSafe，workspace.xml保存配对ID、目录、端口、课程/关卡、最近作业及待重试快照元数据，令牌继续只进入凭据库。后端继续执行五分钟单次码、目录与文件范围、快照变化检查。

配对后点击“提交并检查”，保存当前工程未落盘文档并提交快照。检查报告页自动刷新，可取消、查看逐项预期/实际与日志，并选择编译或测试位置跳转源码。“在网页查看报告”用60秒单次交接打开同一作业，继续正式理解验证。创建作业的响应丢失时，“重试启动检查”复用同一快照和幂等键。工具窗口重开时恢复同一绑定和作业，连接异常自动重试或点击“恢复连接”；目录移动后先重新预览并确认配对。代码修改时在窗口底部持续显示旧快照状态。可点击“清除本机配对”移除本机元数据及凭据，服务端历史保留。未向日常IDE安装插件，验收使用独立数据。

## 构建

本机可直接复用已安装IDE的Kotlin编译器和后端JUnit缓存，从仓库根运行：

```powershell
./new-system/tooling/idea-plugin-local.ps1 test
./new-system/tooling/idea-plugin-local.ps1 build
```

通过 `CS_IDEA_HOME` 指定本机 IDE 目录。该脚本从 `new-system/runtime/maven-repository` 读取 JUnit。首次使用时可先运行后端测试准备依赖，或使用下方 Gradle 项目。插件包输出至 `build/distributions/codesomething-idea-0.3.1.zip`。

Gradle项目使用官方IntelliJ Platform Gradle Plugin2.20.1、Kotlin2.3.20和本机IDE SDK，运行JDK为IDE附带的25。执行前在当前终端设置CS_IDEA_HOME、JAVA_HOME与GRADLE_USER_HOME；只改变本进程：

```powershell
$env:CS_IDEA_HOME = 'C:/path/to/IntelliJ IDEA 2026.2'
$env:JAVA_HOME = Join-Path $env:CS_IDEA_HOME 'jbr'
$env:GRADLE_USER_HOME = Join-Path (Get-Location) 'new-system/runtime/gradle-home'
```

标准Wrapper已生成并固定分发SHA-256，可使用`./gradlew.bat test buildPlugin`。仓库根的`./new-system/tooling/idea-plugin.ps1 build`会自动选择本机SDK与项目内Gradle缓存，并在当前进程传递环境中的无凭据代理。R4.3已通过标准Gradle测试、buildPlugin与verifyPluginStructure；Kotlin/Swing工程关闭额外Java插桩，使用项目内Maven缓存和既有远程仓库。详情见[R4.1验收](../docs/acceptance/R4.1/README.md)。官方资料：[Gradle插件](https://plugins.jetbrains.com/docs/intellij/tools-intellij-platform-gradle-plugin.html)、[工具窗口](https://plugins.jetbrains.com/docs/intellij/tool-windows.html)、[凭据存储](https://plugins.jetbrains.com/docs/intellij/persisting-sensitive-data.html)。

## 源码与测试

- src/main/kotlin：配对HTTP客户端、工具窗口及项目级配对状态。
- src/main/resources/META-INF/plugin.xml：插件描述与工具窗口扩展。
- src/test/kotlin/PairingClientTest.kt：真实HTTP边界及恢复元数据的十项JUnit行为测试。
- ContractProbe.kt：连接独立后端的协议验收，不使用日常库。
- SandboxSmokeActivity.kt：只注册到验收沙箱，实际点击工具窗口并检查凭据存储；不进入生产插件包。

完整契约见[IDEA插件与配对](../../docs/16-R4.1IDEA插件与配对契约.md)。

R4.2契约见[IDE提交与网页交接](../../docs/17-R4.2IDE提交检查与网页交接契约.md)，真实IDE与网页证据见[R4.2验收](../docs/acceptance/R4.2/README.md)。

R4.3契约见[IDE恢复与目录重绑](../../docs/18-R4.3IDE恢复与目录重绑契约.md)，验收见[R4.3](../docs/acceptance/R4.3/README.md)。IDE凭据库使用仅内存模式时，退出后需重新配对；插件不更改IDE的凭据存储设置。
