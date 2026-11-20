# 公开项目来源清单

R6.1首轮研究记录，日期2026年11月12日。数据入口为[catalog.json](catalog.json)，证据位于[runs/2026-11-12-r61](runs/2026-11-12-r61/)，检索账本为[research-report.json](research-report.json)。

| 样例与原始来源 | 观察到的范围 | 后续适配方向 |
| --- | --- | --- |
| [Spring Petclinic](https://github.com/spring-projects/spring-petclinic) | README描述服务端页面；已读OwnerController和OwnerRepository、根POM与许可 | 多实体关系、分页和业务建模；改编需新增REST契约并处理JPA先修 |
| [Petclinic REST](https://github.com/spring-petclinic/spring-petclinic-rest) | README描述独立REST后端；已读ClinicServiceImpl、OwnerRepository、根POM与许可 | 多实体接口、服务分层和事务；映射器、生成代码及安全配置需进一步拆解 |
| [Spring JDBC客户样例](https://github.com/spring-guides/gs-relational-data-access) | 已读客户record、JdbcTemplate参数化批量写入与查询、POM与许可 | 可改编成JDBC小练习；加入HTTP、隔离MySQL与显式重置 |

以上适配方向是工程判断，尚未按真实学习画像排序。两项Petclinic同源，不作独立佐证。上游版本和根许可按catalog中的固定提交、证据文件及SHA-256核对；分支首页用于导航。JDBC源码在启动时删除并重建customers表，改编时需改成隔离种子和显式重置。

三个来源均为research-only，根许可Apache-2.0，构建状态not-run。README中的命令和版本只作为上游声明，研究过程未运行上游代码。当前只读清单未接网页；课程发布由R6.3—R6.4门禁决定。完整约定见[来源契约](../../docs/20-R6.1公开项目研究与来源契约.md)。

在仓库根目录运行`./scripts/project.ps1 research-check`可离线核对来源与能力映射。采集新版本需使用新的运行目录，保留既有证据。
