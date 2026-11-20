# R3.1 知识依赖与项目A设计核验

日期：2026年11月12日。范围：设计和静态一致性检查。应用前端0.10.0、HTTP课程1.1.0保持原版本。本目录不提供SQL执行、网页功能或新课程发布通过证据。

## 交付

- [实施规格](../../../../docs/10-R3.1知识依赖与项目A关卡.md)：八章现状、缺口、先修、教学数据库重置、Spring基础、项目A API约定、骨架递减、检查反例和接续步骤。
- [机器可读依赖图](../../../curriculum/r3-plan.json)：24节点，8个已有HTTP章和16个规划节点；draft状态，不被运行时加载。
- [静态核验脚本](../../../tooling/check-r31-plan.mjs)与[实际输出](validation.json)：无环、引用、重复节点、字段、原课程章节/模式/策略/时长映射、规划总时长及本轮相关文档链接。

## 实际命令与结果

在项目根目录执行`node new-system/tooling/check-r31-plan.mjs --record`，输出保存validation.json；退出码0表示静态核验通过。规划新内容785分钟，按每天约一小时拆分，不作为完成期限。脚本使用Node内置模块，无新增依赖。首次核验检出规格总时长加总错误（835与785不符），已按逐章数据修正后重跑。

只读核对project.json、CourseController、LearningSessionController、UnderstandingRules、CheckJobController/Worker、DockerCheckRunner、平台pom及现有设计文档。确认5个阅读章、3个正式代码章；server-smoke只证明收到响应，不能描述为任务业务正确。发现fix-response内“隔离运行器仍待接入”的旧说明，已列下一课程修订版事项，本轮未改发布包。

官方资料：REST与JDBC两篇Spring指南通过Invoke-WebRequest返回200，已提取RestController与JdbcTemplate正文；MySQL8.4建表/事务页面返回403。通用web工具返回404，之后采用直接HTTPS读取。MySQL相关环境和语义检查保留R3.2实测。

本轮没有应用代码变更、数据库写入或旧系统迁移，无需重新运行前后端构建与浏览器全站验收。未运行的MySQL/SQL、容器策略、多文件快照、跨课程解锁、页面和独立工程测试均为待实现/待验收；R1限额/物理断网余项保持原状态。

下一项：R3.2先完成环境与重置的正反例，再接第一条真实SQL学习闭环。依赖图不能直接替换现有服务端课程注册与双结果规则。
