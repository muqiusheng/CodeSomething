# R4.2 IDEA提交与检查验收

日期：2026年11月12日。插件0.2.0、前端0.13.3。契约见[IDE提交与网页交接](../../../../docs/17-R4.2IDE提交检查与网页交接契约.md)。

## 已执行检查

- `./scripts/project.ps1 idea-test`：9项JUnit，零跳过。原6项配对行为加授权快照/幂等作业、报告/取消、编译与测试位置范围检查。新增行为先失败再实现，首轮为缺失接口编译失败，后端交接首轮为预期401实际404，前端失效恢复首轮为任务页签未选择。
- `./new-system/tooling/backend.ps1 -Action test -TestName 'CourseWorkspaceApiTest,PlatformApiTest,BootCourseApiTest'`：14项通过，零跳过，覆盖原配对/快照/幂等/平台/Boot接口及新增交接鉴权与单次消费。本轮未重复全量Docker测试。
- 前端5项单元通过；前端生产构建、后端JAR打包和本机SDK插件打包通过。
- `./scripts/project.ps1 release-check`：7项门禁行为测试及149项发布锁、十关现有报告核对通过。课程内容和运行策略未更改，未重跑十关发布矩阵。

日志见[插件测试](idea-tests.log)、[后端测试](backend-tests.log)、[前端构建](frontend-build.log)、[后端打包](backend-package.log)、[发布门禁](release-check.log)。

## 真实IDE沙箱

本机IDEA2026.2 IU-262.8665.258/JBR25/Kotlin2.3.20；与R4.1相同基础平台模式，不依赖Ultimate模块。独立config/system/plugins/log与工程副本位于runtime/r42-acceptance。测试启动扩展只装进沙箱JAR。

实际按钮流程：加载Boot四关→预览→确认配对→编辑器产生未保存编译错误→提交→隔离Maven编译错误→选中位置跳转到Application.java对应行→编辑器修复→提交新快照→真实检查通过→再次提交并取消。最终核对原始文件字节一致，结果见[sandbox-check.json](sandbox-check.json)、[编译错误截图](compile-error.png)、[通过截图](passed.png)。首次测试夹具把CRLF直接送进IDE的LF文档API而失败，已修正夹具并重新运行通过，未修改课程文件。

错误跳转实际调用编辑器，测试检查所选文件和光标行；Java测试堆栈定位和范围外拒绝由JUnit覆盖，没有把无位置的业务失败伪造为源码行号。

## 网页与数据

由IDE已通过作业生成短效交接，agent-browser独立会话消费。核对同一jobId、submissionId、功能报告、理解入口、片段移除和URL不含令牌，见[browser-check.json](browser-check.json)与[网页截图](browser-report.png)。刷新后恢复同一报告；正式理解页可打开，但本轮没有提交答案或生成完成证据。

60秒后消费临时码真实返回409/HANDOFF_EXPIRED，见[browser-expiry-mobile.json](browser-expiry-mobile.json)。失效恢复提示确实显示在任务页，见[browser-failure.json](browser-failure.json)。375×812无页面横向溢出，报告及理解验证可见，见[最终窄屏检查](browser-mobile-final.json)与[窄屏截图](browser-mobile.png)。中间脚本曾用aria-label查询实际由aria-labelledby命名的理解区，产生false；最终改用实际formal-title节点重新核对为true，保留原始记录用于追溯。

桌面及窄屏axe均0违规、0待判断，原始输出见[browser-axe.json](browser-axe.json)、[browser-mobile-axe.json](browser-mobile-axe.json)。未改页面样式，没有重复全站尺寸审计。

生产插件包核对排除测试/沙箱类，见[package-check.json](package-check.json)。未向日常IDE安装。日常后端更新前确认无活动作业，SQLite备份runtime/backups/pre-r42-20261112.db；无新增迁移，更新前后提交、作业、理解和完成记录均为0。进一步逐表比较备份与运行库，14张表全部内容相同，见[daily-data-check.json](daily-data-check.json)。新JAR已在独立release目录服务5188，5178网页可用。测试IDE/5191/5179与专用浏览器会话清理状态见[cleanup-health.json](cleanup-health.json)。

## 保留事项

R4.3仍负责插件重启恢复、目录移动重绑、持续旧结果提示及生命周期。R4.1标准Gradle首次依赖完整构建仍待验，本轮SDK安装包构建已通过。SQL/Boot专项AI、R1额度/物理断网和真实学习者独立讲解继续单列。
