# R6.1公开项目研究验收

日期：2026年11月12日。范围：工程侧公开来源研究与归档、能力映射、离线完整性核验。当前前端0.14.0、后端及插件版本保持原状。

## 交付

- [来源清单](../../../research/catalog.json)：三个公开样例、固定提交、根许可、观察范围、改编判断和六项真实关卡映射。
- [原始证据](../../../research/runs/2026-11-12-r61/capture-index.json)：三份仓库元数据、三份提交、三份目录树，以及固定版本README、LICENSE、POM和选定Java代码，共24份带字节数与SHA-256的文件。
- [研究账本](../../../research/research-report.json)：三来源、九条事实/推断、两种实际检索读取能力；Petclinic分支同源，未作独立佐证。
- [范围契约](../../../../docs/20-R6.1公开项目研究与来源契约.md)、[离线检查器](../../../tooling/checks/check-r61-research.mjs)与[采集入口](../../../tooling/collect-r61-sources.py)。

## 已执行

1. 搜索服务检索第一方仓库与Spring JDBC指南，并打开三份第一方页面。通用web工具返回404，转用已连接搜索服务成功；该失败保留在账本的unavailable_providers。GitHub REST和raw HTTPS读取三仓库均成功，未执行上游代码。
2. `./scripts/project.ps1 research-check`：六项行为测试通过，24份摘要和六项关卡映射通过；[输出](research-check.txt)。覆盖完整归档、许可缺失、证据篡改、虚假发布/构建状态、无效关卡/锚点、固定提交/日期/唯一标识不一致。
3. `python <本地multi-source-search>/scripts/validate_report.py new-system/research/research-report.json`：VALID，三来源、九判断、两读取能力；[输出](ledger-validation.txt)。
4. 原课程`release-check`七项行为测试与149项发布输入核对通过，使用已有十关报告核对绑定，本轮未重跑Docker课程矩阵。109条本地文档链接通过，日常5178/5188均返回HTTP 200。结果见[validation.json](validation.json)。本轮未改课程包、应用代码、数据库或日常进程。
5. 对既有证据目录再次运行采集器，退出非零并报FileExistsError；逐文件摘要比较确认原归档保持一致。网络故障恢复未模拟。

测试按行为逐轮增加，先观察失败再实现。初次映射校验误用了旧课程的mode字段；完整归档正例暴露了这一点，已按当前课程的真实chapter结构修正。最终六项测试全部通过。

## 后续范围

上游工程构建、运行、测试有效性和学习效果均为not-run。当前是工程侧来源目录；应用内任意题材研究、兴趣输入、画像匹配及排序进入R6.2，生成和发布进入R6.3—R6.4。研究来源不进入正式课程或能力完成证据。R1真实限额/物理断网、SQL/Boot专用AI上下文和真实学习回访继续保留。
