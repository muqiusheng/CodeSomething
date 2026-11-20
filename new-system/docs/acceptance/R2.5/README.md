# R2.5 网页AI辅导验收

2026年11月11日完成。前端0.10.0、后端0.1.0，课程1.1.0及原1.0.0保持原版本。网页已使用本机现有ChatGPT官方app-server提供真实上下文辅导。

## 交付行为

工作台支持概念提示、定位问题、示例讲解，默认携带当前章节课程片段；代码快照与检查报告主动选择。服务端核对配对授权、课程/版本/关卡和同一份快照，过滤课程答案键与骨架。每次问题使用独立临时提供方会话，页面展示本次问题、等级和上下文清单。

回答以SSE显示，刷新按原请求恢复。发送编号在网页请求前保存；重复请求不触发重复生成。停止、失败、服务重启均保留已持久化内容。AI辅导与功能/理解通过记录保持独立。

## 执行证据

- `CS_RUN_DOCKER_TESTS=true; & new-system/tooling/backend.ps1 test`：30项测试，0失败、0跳过，包括7项真实Docker测试、正式理解与双结果回归、5项新增辅导HTTP行为测试。原始摘要见[backend-tests.txt](backend-tests.txt)。
- 本机协议修正后再次执行`backend.ps1 test -TestName TutorApiTest`：5项通过；JAR重新package通过。摘要见[tutor-final-tests.txt](tutor-final-tests.txt)与[package.txt](package.txt)。
- `npm run build`：TypeScript与Vite生产构建通过，最终依赖版本0.10.0与锁文件一致，见[frontend-build.txt](frontend-build.txt)。
- `check-r25-web.mjs`：[26条断言](web-checks.json)通过。包括真实概念回答、生成中可见部分内容、真实停止、桌面/抽屉共享、关闭焦点返回、刷新恢复、章节隔离、连接设置与进度不受AI影响。
- `check-r25-code.mjs`：[12条断言](code-web-checks.json)通过。真实Docker报告为business_error；主动选择代码与报告后，真实定位提示指出`/api/tasks/1`分支的`completed`是字符串。中断浏览器事件连接后，上游继续完成；恢复读取同一请求。修改文件显示旧快照，刷新保留受保护回答，新问题重新选择代码/报告。
- `check-r25-example.mjs`：[5条断言](example-checks.json)通过。真实示例讲解提供局部布尔字段示例；取消课程片段后，上下文清单为空，代码/报告ID为空。
- `check-r25-recovery.mjs`：[5条断言](recovery-checks.json)通过。使用协议替身，在部分输出后强制结束测试后端，重启后状态为interrupted、内容保留，重复原编号不重跑，主动新问题可完成。

真实调用模型由本机官方目录返回，本轮为gpt-6.1-sol。只保存教学回答、必要标识和状态，不输出官方账户凭据。网页连接断开通过浏览器拦截SSE请求构造；这是显示连接恢复证据，上游物理网络中断另列待验。

## 视觉与无障碍

工作台1440/1024/768/375/320px无页面横向溢出；连接设置320px无溢出。桌面回答、375px抽屉、设置页三个axe WCAG2A/AA场景均0违规，原始文件为axe-*.json。课程页原有页签伪元素对比度仍有待人工判断项；抽屉场景另有Radix模态隐藏背景/焦点守卫的aria-hidden-focus待判断项。关闭抽屉返回触发按钮已实测，自动待判断项未计为通过。

截图：[桌面](answer-1440.png)、[375px抽屉](answer-drawer-375.png)、[代码与报告定位提示](code-report-answer-1440.png)。保留原视觉体系，复用现有Radix Dialog、原生表单和Lucide，无新增运行依赖。

## 本机运行与数据

日常服务维持5178/5188。验收服务使用5179/5189、runtime/r25-data；崩溃测试另用5190和单独临时库。验收快照、回答和检查报告均留在独立测试目录。日常库升级前使用SQLite backup API备份到runtime/backups/R2.5/before-v9.db，SHA-256为8A5078B93AF509D9B3566088A2CA59982259A2C66A79EBBA36740F750BB27192。V9只追加辅导表，原课程、快照、报告、位置与完成记录保留。

日常库未写入验收辅导记录或完成证据；日常连接检查仅查询授权与模型。详细启动/核对结果见[daily-start.json](daily-start.json)。旧code-something保持原样。

## 实测修正与待验项

首次网页调用因本机CLI拒绝`readOnly.access`而在生成前失败。通过本机生成schema及只读诊断确认该字段已移除，改用本机支持的readOnly结构后，真实网页回答、停止及代码报告辅导通过。该失败记录保留在验收库，未自动重发。

额度错误归类与重试通过协议替身验证；真实账号额度耗尽、上游物理断网恢复继续保留R1待验。未人为耗尽账号额度。单题辅导以当前选择为边界，暂不包含多轮历史、IDEA插件及长期画像；后续按R3—R5推进。共享部署仍需单独验证官方授权和工具边界。
