# R3.4课程版本与发布门禁验收

日期：2026年11月12日。范围：[课程版本与门禁契约](../../../../docs/14-R3.4课程版本与发布门禁.md)。

新增149项固定发布输入清单、十关报告核对、骨架递减复核、独立运行入口，并阻止历史创作脚本覆盖已发布课程。未修改前端、平台后端运行逻辑、已发布课程字节或日常学习数据库。

## 行为与结构检查

`node --test new-system/tooling/check-r34-release.test.mjs`七项通过，见[日志](gate-tests.log)。测试通过临时目录调用真实门禁：同版本改写被拒绝、其他源码报告被拒绝、迁移骨架混入额外答案被拒绝、生成脚本写入前拒绝发布覆盖、完整正反例被接受、环境故障不能替代行为反例、旧检查器报告被拒绝。临时文件自动清理。

按单项失败→最小实现→通过推进了前四项；有效正例与环境错误分类作为最终边界回归补充。`node new-system/tooling/check-r31-plan.mjs`通过，24节点依赖无环、现有HTTP映射及785分钟规划一致。本轮不将draft依赖图改成已实现课程注册。

`run-r34-release.ps1`通过PowerShell语法解析；实际矩阵与门禁在本轮按相同分步命令执行，未再重复运行完整包装入口。

## 隔离运行

设置`CS_RUN_DOCKER_TESTS=true`、`CS_BOOT_EVIDENCE_DIRECTORY`为本轮独立strategies目录，执行`backend.ps1 -Action test -TestName BootStrategyRunnerTest`成功退出。两个JUnit测试方法通过、零失败/错误/跳过，包含十关参考passed、十个行为错误变式business_error，以及一项JDBC账号/DDL/外网隔离检查。日志见[strategies.log](strategies.log)，逐关原始报告见[strategies](strategies/)。运行耗时13分19秒；完整矩阵无需在普通文案或样式修改后重复运行。

随后`node new-system/tooling/check-r34-release.mjs --record`通过，见[gate.json](gate.json)。参考源码按Java多文件快照协议重算摘要，与十关真实报告全部一致；课程版本、策略、镜像、检查器及正反例断言均核对通过。门禁结果同时保存锁文件与每份报告的SHA-256。

首次核对发现R3.3中九关报告的harnessDigest早于最终检查器；本轮完整重跑十关后，以当前已锁源码和新报告建立R3.4首次基线。参考源码及课程文件未变，a-transfer旧摘要原本已是最终检查器。拒绝记录见[初始基线拒绝](initial-baseline-rejected.json)，逐关对照见[基线复核](harness-baseline-review.json)。旧记录原样保留，不能拿旧检查器报告授权当前发布；已补相应回归测试。

[资源清理](cleanup.json)显示验收应用/数据库容器与网络均为空；日常练习容器保留。[日常健康](daily-health.json)为前端200、后端UP。新工具未连接学习数据库；未新增日常完成记录。未改应用源码或UI，本轮未重新打包或重复浏览器截图验收。

## 交付边界

门禁供本地发布流程调用，非运行时热更新服务。课程生成/发布自动化接R6。当前错误变式沿用R3.3：前三关分别改错健康值、创建状态和层间读取，其余关改错单条读取，验证各策略能识别真实业务错误；更细粒度的每条需求反例可随新课程版本扩展。a-transfer参考另由现有策略真实执行JUnit及错误实现测试。

本轮不记录用户能力通过。SQL/Boot专项AI上下文、R1真实额度和物理断网、用户独立讲解质量继续单列。下一项R4.1：IDEA实际版本及Kotlin插件配对。
