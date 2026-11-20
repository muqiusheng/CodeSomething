# R8 独立作品C工程验收

2026年11月13日，前端0.17.0、后端0.1.0、数据库V13。R8工程流程已交付，首轮真实学习验收待实际学习后完成。日常入口：<http://127.0.0.1:5178/portfolio>。

## 已交付

作品页替换原结构预览。自选有限资源预约题材，保存业务与数据设计，从最小Java21/Boot工程自行实现登录、库存预约、身份隔离、幂等取消、测试和部署。内部表名、分层与事务实现自主设计；固定POM、lab包与32个业务Java文件是当前执行边界。只提供启动配置，不经作品API提供完整实现。

提交前显式预览文件及摘要，确认后保存不可变快照。串行隔离MySQL/Maven检查覆盖输入、权限、库存、并发与部署重启；核心通过后领取批量预约变式，验证整体回滚与重复资源累计校验。设计版本、核心/迁移、幂等键、报告、讲解和帮助声明相互绑定，设计或代码变化后不能沿用旧证据认定新版本齐备。

档案归集工程报告、讲解和实际观察，提供单独JSON导出。首页、画像与作品列表提供真实续接，页签保存到服务端并映射到URL，未保存设计在浏览器恢复。回访附真实课程续学位置、画像快照与复习数量；24小时后的回访还要求作品创建后有真实复习记录才标记延迟回访。保存文字不自动认定理解、独立编码或产品验收通过。

## 执行结果

- 后端全量非容器回归：74项被发现，51通过、23因环境条件跳过，零失败。记录`new-system/runtime/r8-regression.log`。本轮没有重跑未修改的全部旧Docker矩阵。
- R8五个不同测试方法全部通过：PortfolioApiTest两项、PortfolioFlowTest、PortfolioIsolationTest、PortfolioRunnerTest。最终版本一致性三项回归通过。完整HTTP流程经真实Docker核心/迁移、讲解、模拟回访、重启恢复和新编译失败失效验证；模拟数据只在测试库中。
- 当前检查器的核心与迁移正例见`api-full-flow.json`，故意超卖实现被拒绝见`overbook-mutant.json`；核心正反例检查器摘要一致。早期直接矩阵见`core-reference.json`、`transfer-reference.json`，最终控制流以当前完整API证据为准。
- 前端构建和五个单元测试通过。作品页按路由拆包，无新增运行依赖。
- 主浏览器68项断言、40组双主题尺寸、8个axe场景通过；最终部署说明与日常入口补充8项、4组受影响尺寸、2个axe场景通过。共10个axe场景零违规、零待判断。证据`browser.json`、`browser-finish.json`及对应截图/axe文件。
- 实际部署前端11项操作通过：错误登录、真实预约、切换身份清空旧数据、越权拒绝、重复取消及四组尺寸；应用和数据库完整重启持久性3项通过。见`deployment-browser.json`、`deployment-persistence.json`。
- 最终JAR真实强制中断恢复8项通过：相同作业/摘要、幂等重试、容器/网络/临时输入清理、显式停止及不生成独立能力结论。见`process-recovery.json`。
- 原课程发布门禁通过：旧课程8个门禁、149项锁，R7六个门禁、182项锁。发布课程字节未改。记录`new-system/runtime/r8-release-check.log`。
- 日常V12先备份再升V13，原24张数据表逐表内容一致，五张新作品表为空，完整性与外键正常。见`daily-before.json`、`daily-after.json`。5178/5188已切最终版本，ChatGPT连接ready，见`daily-connection.json`。

## 修复与限制

保留`core-reference-initial-failure.json`：工程夹具漏配请求标识过滤器，错误响应返回500，修复后正例通过。保留两份初轮浏览器记录：保存成功提示曾被过期草稿提示覆盖；启动文件长路径曾导致320px页面溢出。最终均修复并重新验证。未保存设计恢复另经StrictMode真实刷新验证。

当前自动评价域是有限资源预约，不声称支持任意业务类型。JUnit真实执行已验证，提交测试覆盖质量、前端整体可用性、开放讲解质量和独立程度由实际学习回访核实。工程夹具与浏览器模拟回访不是用户的学习成果。

200%验收使用1440px视口CSS zoom模拟；原生文字缩放仍待实测。R1真实账号额度耗尽/上游物理断网、SQL与Boot专用AI上下文继续保留原待办。朋友共享和桌面化尚未启动。

## 复现入口

```powershell
./scripts/project.ps1 r8-test
./scripts/project.ps1 frontend-test
./scripts/project.ps1 frontend-build
./scripts/project.ps1 release-check
```

浏览器脚本使用`start-r8-acceptance.ps1`的5189/5179独立实例，以及任务专属agent-browser会话。运行前按项目AGENTS激活工具链，并把CS_BROWSER_BIN设为原生agent-browser-win32-x64.exe。主流程脚本`frontend/tests/browser/check-r8.mjs`从空验收作品创建工程记录；部署脚本需单独启动5197验收实例。不要把这些脚本指向日常数据库。

完整需求边界见[作品契约](../../../../docs/23-R8独立作品与首轮验收契约.md)。
