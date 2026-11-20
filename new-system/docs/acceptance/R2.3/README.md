# R2.3 隔离检查与报告验收

日期：2026年11月11日。范围：docs/05的R2.3。新系统独立实现，旧目录和旧数据未迁移。

## 交付

SQLite V6增加检查报告与结束时间。作业以保存的原始字节快照为输入，经过持久队列、受限Docker编译和HTTP检查后产生报告。保留幂等请求、范围授权，新增取消、历史读取、刷新恢复、显式重新检查与旧代码标识。网页任务区和检查报告页签显示同一结果；功能通过不创建关卡完成记录。

环境固定为本机已有Eclipse Temurin JDK21镜像摘要；禁外网、不发布端口、普通用户、只读快照和根文件系统、CPU/内存/进程/日志/时间限制，细节见../../../runner/README.md。检查策略分别为服务启动、任务JSON与笔记JSON，阅读章节拒绝执行。

## 实际验证

- `CS_RUN_DOCKER_TESTS=true; ./new-system/tooling/backend.ps1 package`：19项测试与JAR构建，结果见backend-package.txt。其中7条真实容器测试覆盖编译失败、业务失败、启动检查、修复与迁移成功、JSON尾部多余对象、超时/运行中取消、源码/根文件系统写入和外网连接限制。普通测试不开此环境变量时会跳过这7条。
- HTTP行为测试使用独立临时SQLite。检查环境不可用归类为environment_error，报告摘要绑定快照；当前文件变化为changed、文件缺失为unknown；重启后报告可读取，未授权取消返回401。该测试新增断点验证的补充记录见api-report-restart.txt。
- `npm run build`：TypeScript和Vite构建通过，见frontend-build.txt。
- `check-r23-web.mjs`与仅补验尾部动作的`check-r23-finish.mjs`：共16条不同断言，结果web-checks.json为passed。真实浏览器覆盖错误骨架→逐项报告→修复→七项通过，刷新恢复、改代码后旧报告、日志展开、报告页签、运行中取消与取消后刷新。
- 报告在1440/1024/768/375/320px五种宽度无页面横向溢出。已查看桌面与移动截图。axe WCAG2A/AA检查0违规、1项待人工判断：已有页签编号伪元素背景的对比度计算，详见axe-report.json；不把待判断项写为通过。

网页验收用5179/5198与runtime/r23-acceptance-data，避免把测试通过写入日常学习库。最初未配置5179可信来源的验收请求被正确拒绝；配置cs.frontend-origin后完成验收。最终JAR重启后再次读取真实编译报告通过，见restart-check.json；日常应用已恢复5178/5188，验收5179/5198服务已停止。原脚本尾部把summary当作button定位，已修正为summary选择器，并只补验受影响动作。

## 证据

- business-error-1440.png：原骨架业务失败。
- passed-1440.png、passed-320.png：修复后通过与窄屏。
- compile-report-tab.png：报告页签显示真实编译错误。
- backend-package.txt、api-report-restart.txt、restart-check.json、frontend-build.txt、web-checks.json、axe-report.json。

## 下一项

R2.4实现理解结果、双结果完成、下一关与断点续学；R2.5及R1的网页AI上下文、真实限额/断线场景仍待实现或验收。本轮不把模拟问答、课程浏览或测试夹具写成用户能力证据。未做多用户、共享执行服务或旧数据迁移。

