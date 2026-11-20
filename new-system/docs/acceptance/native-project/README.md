# 本机工程连接与读取恢复

2026年11月18日，前端0.24.0；发布包native-project-0.24.0-final.jar。规格见[docs/31](../../../../docs/31-本机工程连接与稳定文件快照.md)。

## 结果与范围

HTTP、Boot及项目A/B共用工作区新增本机服务连接，沿用同一份本地工程、原目录树与编辑器。旧浏览器授权连接保持，不自动迁移；可通过“改用本机工程连接”重新选择同一目录。后台只核对元信息，提交及完成前读取稳定快照；IDE修改冲突保留网页缓冲。浏览器备用增加短暂消失重试及权限/路径错误分类。索引损坏不阻止课程服务启动，重新保存连接前留存损坏记录副本。

SQL、Tlias、生成项目及作品的专用导入流程未整体替换。学习主线、判题策略、旧报告和已发布课包保持原范围。

## 自动与真实文件验证

- 前端21项单元通过，包含瞬时文件缺失恢复、权限拒绝保留具体位置、持续变化快照拒绝及原目录/冲突规则。首项重试行为已先红后绿；日志local-project-unit-shipping.log。
- 后端最终20项测试通过、零跳过：LocalProjectApiTest、LocalProjectStoreTest、BootProjectSnapshotTest、CourseWorkspaceApiTest。覆盖凭据隔离、路径越界/来源拒绝、连接跨重启、写入冲突、元信息变化和损坏索引恢复。损坏索引测试先失败后修复。日志local-project-tests-shipping.log；早期红灯local-project-red.log、local-project-registry-red.log保留。
- 最终TypeScript/Vite构建及后端打包通过；Monaco分块大小提示保持。日志local-project-build-final.log和local-project-package-shipping.log。日志均位于new-system/runtime。
- [browser.json](browser.json)记录12条实际流程、HTTP/Boot共6组390/768/1280px尺寸，无横向溢出。网页确实修改测试磁盘文件；IDE外部改动拒绝旧网页覆盖，草稿可恢复及撤销丢弃；HTTP真实检查并保存编码完成，Boot原Maven工程真实检查通过；源码变化标旧、跨章保留根目录、目录移动后提示重新选择、后台不重复请求源码快照、浏览器OPFS备用连接均通过。
- 最终JAR重启独立后端后，浏览器恢复Boot连接及同一份通过报告，见restored-after-server-restart.png。
- workspace axe4.12.1为零确定违规、零待判断。本项是浏览器备用场景，不代表Windows原生窗口或全站辅助技术验收。

浏览器使用5179/5189、独立数据库、临时目录CodeSomething-native-qa-20261118和真实磁盘文件。为独立验证连接后的读写，测试启动前预置了两条测试连接索引及浏览器工程标识；凭据仅保存在runtime中，不进入公开证据。**这项预置不等同于通过原生窗口完成授权。** 原学习工程与日常库没有装入测试源码、测试连接或完成记录。

未保存缓冲的恢复测试先通过SPA离开工作区，再完整刷新并返回；保留草稿通过实际编辑器值核对。直接刷新触发beforeunload时，当前agent-browser守护进程曾不响应，故不将该次挂起记为产品通过。初轮脚本另修正Windows CRLF以及Monaco虚拟渲染的断言。

## Windows选择窗口的证据与未验项

随包DirectoryPicker.cs调用Windows IFileOpenDialog，支持系统地址栏及选文件夹；本机系统.NET编译器实际生成专用GUI程序，窗口已被桌面工具列出，标题“CodeSomething - 选择学习工程根目录”，可访问树包含“文件夹”“连接此工程”“取消”。请求和网页取消能退出专属程序，后台没有残留终端窗口。早期PowerShell承载方案已从交付中删除，最终为独立GUI程序。

桌面工具在激活窗口时持续返回`failed to activate captured window`，按computer-use恢复规则重选窗口后仍失败。因此**从系统窗口选择路径并点击确认的完整人工链路待验**，不能宣称该链路端到端通过。选择后的真实读写、检查、重启恢复分别由上述测试验证。真实Windows焦点/前台显示、系统窗口确认、学习者连续试用仍待人工核对。

## 日常发布

日常5178/5188已切换本轮前端及最终JAR。发布前在线备份、无活动检查后切换；[daily-before.json](daily-before.json)和[daily-after.json](daily-after.json)记录31张学习表的计数与内容摘要，前后完全一致，完整性ok、无外键错误。没有新增数据库迁移。日常健康和本机ChatGPT链路保持UP/ready。独立测试服务与浏览器会话收尾关闭。

网页只显示服务连接标识，不展示工程授权凭据；本机索引记录目录与凭据摘要。浏览器不向服务发送任意绝对根目录、系统命令或Shell片段。外部程序不受应用锁控制，保存前核对和原子替换不等同跨应用事务保证。
