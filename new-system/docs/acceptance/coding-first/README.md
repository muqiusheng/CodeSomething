# 同一工程从零完成：教学主线与网页接续

日期：2026年11月16日。前端0.18.1，后端应用版本仍为0.1.0，数据库V15。用户确认每个项目必须围绕同一工程从起步配置逐步完成，选择题仅为补充；详见[核心教学原则](../../../../docs/25-同一工程从零完成的项目教学原则.md)。

## 实际交付

- 产品需求、设计、架构/页面/实施规格、项目A/B、生成项目、作品契约及项目内AGENTS.md同步同工程主线。
- HTTP第一章从最小HttpServer启动文件开始，后续请求、响应、JSON与追踪直接修改同一TaskServer.java；取消本轮最初尝试的独立HTTP/JSON小练习。完整代码关卡共用项目级凭据与源码。
- 固定Boot课程按项目共享当前源码与修订号；章节保留各自绑定和不可变检查快照。项目A/B新建网页工程只有POM与Application，支持创建Java类、JUnit测试和RUN.md。固定运行POM由平台按阶段准备，业务源码继续承接；已有草稿不重置。
- SQL以同一数据库项目组织章节脚本，可在文件导航切换、一次保存已编写的SQL工程脚本。练习环境持续保留，正式检查仍隔离运行当前脚本。
- 生成项目共用一份浏览器工程，默认由第一章起步工程继续开发。新生成器提供最小Controller，读取、新增校验与资源扩展由学习者实现。重新开始工程需要确认，历史报告保留。
- 独立作品继续保留同工程的设计、实现、迁移、开放讲解和回访，增加实际操作步骤。
- Java、SQL和生成项目增加代码完成入口，不要求先答选择题。服务端验证当前报告、摘要、版本、策略与先修，重复提交不重复完成。V15保留原完成记录，允许理解记录为空；画像/首页不把未答题显示为理解通过。

## 验证

执行`new-system/tooling/backend.ps1 -Action test`：101项中78通过、23项条件测试跳过，零失败零错误。新增行为覆盖代码无需答题即可完成、授权、失效报告拒绝、SQL试运行不可完成、重复完成、生成项目帮助记录、跨章节源码接续、返回前章与并发覆盖拒绝。[最终日志](../../../runtime/project-final-backend-tests.log)。

执行`npm --prefix new-system/frontend test`：7项通过。最终`npm --prefix new-system/frontend run build`通过，保留既有Monaco大分块提示。[构建日志](../../../runtime/project-final-frontend-build.log)。

实际浏览器脚本：[check-project-continuity.mjs](../../../frontend/tests/browser/check-project-continuity.mjs)，独立5179/5191、独立数据库`runtime/coding-first-acceptance`。首次连续验收发现测试样例的标题不符合原HTTP完整契约，随后对齐任务规定的“学习 HTTP”；发现SQL需先启动教学MySQL后，完成环境启动并续验。通过项保存在[browser.json](browser.json)，共13项流程检查、7类页面×3种尺寸=21组，无整体横向溢出。

- HTTP真实编译/运行→无需答题完成→请求章承接→完整接口检查→继续编辑→返回第一章仍是最新代码，旧报告标旧。
- Boot健康接口真实构建/通过→下一章保留HealthController并亲手创建EchoController→第二章真实构建/通过→无需选择题完成。
- A/B确认新网页工程只有两个最小配置文件；完整业务从零实现的逐章学习验收待进行。
- SQL真实MySQL正式运行→无需选择题完成→同工程脚本导航保留。首轮试运行环境未启动的失败报告保留，不算通过。
- 生成项目使用确定性adapt题材，无外部AI计费调用；本轮参考/错误变式门禁实际通过后发布到测试库；显式参考帮助完成第一关的真实源码检查，再进入第二关保留原代码。
- 作品页同工程操作步骤及三种尺寸检查；本轮未重新执行完整作品核心/迁移/部署检查。

桌面HTTP及375px深色Boot两场景axe均零违规，各保留1类自动对比度待判断（伪元素/Monaco叠层）。实际查看[HTTP界面](http-same-project.png)、[Boot界面](boot-layout.png)及[深色手机界面](mobile-dark.png)，未将自动待判断记为已全部通过。记录见[browser.json](browser.json)及[手机axe](axe-mobile-dark.json)。

## 发布锁与已知限制

`scripts/project.ps1 -Task release-check`未通过：R3.4门禁发现BootProjectSnapshot.java与历史锁不一致，该文件在本轮开始前已于14:13修改，本轮未改动。原R7平台覆盖允许的BootCourses/BootCheckRunner差异继续保留。摘要对照另显示本轮完成规则与画像代码两项平台变更不匹配R7历史锁；未运行成功的R7发布门禁不记通过。未修改或重建任何历史锁，没有重新发布固定课程。两份锁中的132及163个课程文件均无变更，见[摘要对照](published-lock-comparison.json)。

固定历史课包中仍有旧版教学、逐关IDE骨架和双结果描述，网页通过主线适配承接新要求；完整讲解与全项目逐章实际学习验收继续依据docs/25推进。首轮浏览器验证不代表已经由真实学习者从零完成所有A/B/作品功能。Boot从JDBC晚期回看早期章节时的完整运行环境兼容未在本轮跨阶段验收中覆盖。

测试期间曾因两个Maven进程同时使用target目录导致一次类文件缺失；已串行重跑最终全量通过，失败日志保留于runtime/coding-all-tests.log。

## 日常服务与数据

已切换日常后端到`runtime/releases/project-continuity-0.18.1.jar`，日常端口5178/5188保持不变，健康接口UP。切换前确认无活动检查并通过SQLite备份，V15升级后30张原数据表内容摘要全部一致，完整性ok、外键检查为空。备份路径及摘要见[daily-before.json](daily-before.json)、[daily-after.json](daily-after.json)。测试数据没有写入日常库。原完成证据与历史快照保留。

测试浏览器已关闭；验收服务及教学MySQL测试容器在收尾停止。日常服务继续运行。
