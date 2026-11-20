# 检查阶段进度条 0.21.1

2026年11月17日。按用户截图在刷新状态/取消按钮下方增加进度，按后续要求只在检查进行中显示；空闲、仅连接工程、检查通过、失败、取消后都不保留进度条。

运行器在真实执行依赖准备、编译、应用启动、接口/测试及整理结果时上报阶段，现有一秒轮询读取。界面显示第几阶段及阶段标签，不模拟剩余时间或百分比。后端内存记录最多256个作业，阶段单调前进且线程上下文隔离，不增加数据库结构；历史终态仍展示原报告。

使用daisyui原生progress，max=5，提供中文可访问名称和aria-valuetext。阶段标签可换行，沿用现有主题变量。准备新依赖时显示简短说明，替代原来冗长的执行中通用描述。

检查：CheckProgressTest先因缺失模块失败，实现后通过；CheckRunnerApiTest验证错误报告仍带阶段且原鉴权/恢复继续工作，共2方法通过。前端15项测试与最终TypeScript/Vite构建通过，日志见runtime/check-progress-tests.log、check-progress-frontend-tests.log、check-progress-frontend-build-final.log。原有依赖指令/分块提示保留。

check-check-progress.mjs以独立5179/5189学习库、原生Chromium目录句柄和真实Boot运行验证5项流程：空闲无进度、连接目录无进度、提交显示、编译/启动阶段实际前进、成功与取消后隐藏。browser.json记录实际观测阶段0/1/2/3/4及375/1440px页面无溢出；running.png已实际打开核对。文件夹系统选择器边界用原生OPFS句柄替代，未伪造检查作业或执行结果。

日常5178/5188已使用0.21.1，JAR摘要见release.json。切换前在线备份SQLite并确认无活动作业，切换后31张表逐表内容摘要一致，记录daily-data-before.json、daily-data-after.json。未更改课程、检查条件、工程文件或能力证据。测试浏览器与5179/5189进程收尾关闭，日常服务保留。
