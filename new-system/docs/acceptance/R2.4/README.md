# R2.4 双结果完成与续学验收

日期：2026年11月11日。前端0.9.0；后端JAR 0.1.0；课程1.1.0；正式理解规则1；SQLite迁移V7/V8。

## 交付行为

三个代码章各有两道正式情境题。服务端依据配对授权读取功能作业，核对课程版本、关卡、检查策略、快照摘要、全部检查项和当前文件状态，再判定正式答案。前置代码关卡完成后，功能与理解均通过才写入唯一关卡完成证据。重复或并发同一请求返回同一尝试；同键换答案返回冲突。答错可重答，环境失败和新代码失败保留历史证据。

完成证据关联提交、功能作业、理解尝试、代码摘要和规则版本。正式理解读取接口不返回答案键。已有随堂练习继续只作本次练习。原版1.0.0仍可读取、提交检查和恢复位置，正式完成入口明确提示暂不支持，提供新版入口；没有复用新版题目判定原版。

续学接口核对课程与章节，支持understanding步骤并保留revision冲突保护。后续章节可预览，正式位置不能跨过尚未完成的前置代码关卡；阅读章不新增自报完成门禁。完成后计算下一章或项目总结，重复请求不会自动推进多关。代码变化和文件缺失会阻止新增完成，旧完成仍明确对应历史代码。

网页新增“理解验证”页签、正式答题、失败重答、提交结果焦点、刷新后答案草稿与历史尝试恢复。首页、章节目录、项目总结和画像证据区读取真实进度；首页最近完成替换为正式记录，练习示例单独标示。关卡达标与独立程度、长期保留情况分别表达。完整项目达标后，首页总结入口不受回看旧章节的位置影响。

## 实际验证

1. `$env:CS_RUN_DOCKER_TESTS='true'`后执行`./new-system/tooling/backend.ps1 package`：24项测试全部通过，无跳过，包含原7项真实Docker运行器测试与新增2项真实容器学习流程。记录backend-package.txt。
2. `./new-system/tooling/backend.ps1 test -TestName 'UnderstandingApiTest#upgradingFromR23PreservesTheExistingCursorAndAllowsTheNewUnderstandingStep'`：新增1项V6→V8迁移回归通过。原report步骤和revision=7保留，写入理解步骤后revision=8。记录migration-upgrade.txt。两轮合计25项不同后端测试，未重复计数。
3. 新增HTTP测试覆盖正式题不泄露答案、无功能结果拒绝完成、答错重答、摘要与版本证据、幂等键冲突、并发同请求、跨配对令牌拒绝、规则版本错误、答案缺项、前置代码关卡、文件变更/缺失、重启尝试恢复、正式位置与预览分离、无效章节、过时revision和三关项目总结。
4. `npm run build`通过，前端0.9.0，TypeScript与Vite产物见frontend-build.txt。原依赖的“use client”指令忽略警告保留，没有新增运行依赖。
5. `check-r24-web.mjs`真实浏览器流程及`CS_R24_RESUME=transfer`补验：49条不同断言通过，含25组布局断言、5组axe检查及主流程行为。web-checks.json保留原执行条目，重复补验的一条断言不重复计数。五类页面/状态各在1440/1024/768/375/320px检查，无页面横向溢出。
6. 浏览器已验证：功能通过不自动完成、正式答错不完成、重答通过、刷新恢复正式页签与尝试、下一章保存位置、后续预览不覆盖正式位置、错误骨架真实报告、修复后双结果、代码变化后禁提交但保留历史证据、三关达标、首页与画像真实记录。补验还覆盖原生必答焦点、未提交草稿刷新保留及结果焦点。
7. 独立验收库使用runtime/r24-acceptance-final，服务5179/5198。重启同一JAR后，三条完成证据ID、续学章节与revision均保持，记录restart-check.json及restarted-home.png。初次比对遇到未关闭的检查浏览器受开发热更新影响写回位置；关闭该会话并固定前端后重新验证，结果通过。

已实际查看桌面完成态、手机正式题、首页和项目总结截图。五个axe场景均0违规；三个工作台场景各有同一种既有待人工判断项：tab-index伪元素背景使工具无法自动计算对比度。项目总结和首页为0待判断项。相关JSON完整保留，不把工作台待判断项记作自动通过。

## 执行修正与限制

TDD记录保留首次接口缺失、功能门禁与双结果测试的失败及通过日志。真实容器首轮因Docker未启动归类为环境错误，启动后完成验证。测试启动参数重复导致的配置错误已修复。

浏览器脚本先因等待隐藏任务字段而超时，后因迁移样例只替换一处路径得到真实业务失败，补验又发现选择器引号错误；均修正后只补验受影响部分。功能与理解判定没有使用这些失败脚本伪造通过。

使用tdd、impeccable局部polish、agent-browser与web-design-guidelines。Impeccable上下文引擎下载失败，依据已有PRODUCT/DESIGN和随附指南人工处理，没有宣称自动引擎检测通过。Web工具访问规范源失败后，通过Invoke-WebRequest取得当前规范并执行本轮表单、焦点、语义、异步反馈和长内容检查。新增表单沿用原生radio、fieldset/legend与现有按钮。必要前置未满足时禁用提交；可答题时交由原生required提示缺项，提交期间防重复。

R2.4已交付；R2.5网页AI上下文、分级提示、停止与错误恢复仍待实现，R1真实限额等余项继续单列。数据库/SQL和Spring Boot课程仍待后续阶段。课程包1.1.0的任务、题目、检查约定与原始记录保留；显示层将早期“隔离运行器仍待接入”的平台状态说明修正为“功能结果请以本次检查报告为准”，避免课程中的历史平台状态与当前真实报告冲突。

## 证据入口

- backend-package.txt、backend-behavior.txt、migration-upgrade.txt、frontend-build.txt。
- web-checks.json、axe-*.json、progress-before-restart.json、continue-before-restart.json、restart-check.json。
- questions-320.png、final-questions-320.png、completed-1440.png、completed-320.png、project-summary.png、home-progress.png、restarted-home.png。

测试库、练习目录和令牌均留在runtime，验收记录不含配对令牌。日常学习库不会导入验收通过证据。日常服务恢复及备份路径见daily-start.json。


收尾补验：check-r24-final-ui.mjs另有5项针对最终显示层的检查通过，见final-ui-checks.json，覆盖过时平台状态提示、章节标记、回看后的总结入口、项目目录同源进度及窄屏标签。主流程49条不同断言与这5项补验分别记录。daily-home.png为日常库只读首页，正式完成为0；升级前备份路径和SHA-256见daily-start.json。健康接口数据库状态为UP；其runner细项仍沿用R1静态not-configured占位，真实执行状态以作业API和受限容器报告为准，健康细项更新留后续处理。
