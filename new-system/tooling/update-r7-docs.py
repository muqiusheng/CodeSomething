from pathlib import Path
root=Path(__file__).resolve().parents[2]
system=root/'new-system'
def replace(path,old,new):
    content=path.read_text(encoding='utf-8')
    if old not in content:raise ValueError(f'Missing expected document text: {path}: {old[:50]}')
    path.write_text(content.replace(old,new),encoding='utf-8')
replace(root/'README.md','当前前端0.15.0、后端0.1.0、IDEA插件0.3.0','当前前端0.16.0、后端0.1.0、IDEA插件0.3.1')
replace(root/'README.md','下一项为R7完整业务项目B','R7已交付“学习计划与任务协作”八关、登录与对象权限、真实MySQL事务、有效集成测试及配套前端部署，接入双结果、续学和27项画像；下一项为R8独立作品C')
replace(root/'README.md','./scripts/project.ps1 research-check','./scripts/project.ps1 research-check\n./scripts/project.ps1 r7-release-check')
replace(system/'README.md','前端0.15.0、后端0.1.0、IDEA插件0.3.0','前端0.16.0、后端0.1.0、IDEA插件0.3.1')
replace(system/'README.md','R3—R6工程完成，下一项为R7完整业务项目B。','R3—R7工程完成，下一项为R8独立作品C。项目B八关已接登录、对象权限、MySQL事务、异常日志、有效API测试与独立部署前端；画像扩为27项。入口为“项目→学习计划与任务协作”，范围见[R7契约](../docs/22-R7完整业务项目B契约.md)。')
replace(system/'frontend/README.md','当前0.15.0','当前0.16.0')
replace(system/'backend/README.md','当前能力：健康、偏好、版本化续学','R7新增collaboration/1.0.0八关、CollaborationRunner、项目A先修校验及27项画像/复习；平台数据库继续为V12。业务工程使用独立MySQL与配套前端，运行入口为`tooling/deploy-r7.ps1`，完整约束见[项目B契约](../../docs/22-R7完整业务项目B契约.md)。\n\n当前能力：健康、偏好、版本化续学')
paragraph='2026年11月13日R7工程完成：发布“学习计划与任务协作”八关，覆盖可撤销登录会话、角色与计划成员权限、关系建模、分页筛选、批量事务、统一错误/请求日志、真实API集成测试和配套前端部署。后两关逐步从自行编写测试走向最小启动工程；功能检查、正式理解、先修、IDE交接、续学与画像连通。画像扩为27项、复习增加16道变式；独立完成与开放讲解由实际学习回访确认。\n\n'
replace(root/'PRODUCT.md','网上调研提供项目题材与公开开发实践证据。',paragraph+'网上调研提供项目题材与公开开发实践证据。')
tracking=root/'docs/实施追踪.md'
replace(tracking,'| R7 项目B | 未开始 | 登录权限、完整业务、部署、配套前端 |','| R7 项目B | 工程完成 | 八关教学、登录/角色/对象权限、MySQL事务、错误日志、有效JUnit、持久部署与配套前端；正式理解/先修/IDE交接/续学/27项画像，真实独立讲解待回访 |')
replace(tracking,'更新：2026年11月13日。R3—R6工程完成；前端0.15.0、后端0.1.0、插件0.3.0','更新：2026年11月13日。R3—R7工程完成；前端0.16.0、后端0.1.0、插件0.3.1')
replace(tracking,'当前R6支持有界内存REST题材生成与发布，下一项R7。','当前R6支持有界内存REST题材生成与发布，R7补齐固定完整业务项目B，下一项R8。')
old='当前下一项为R7完整业务项目B：登录与角色、分页筛选、事务、统一异常、日志、集成测试与部署，并提供配套前端。R6工程已按[兴趣匹配与生成发布契约](21-R6兴趣匹配与生成发布契约.md)交付，证据见[R6验收](../new-system/docs/acceptance/R6/README.md)。原R1与实际学习回访待验项按上表保留。'
new='当前下一项为R8独立作品C与首轮学习回访：从最小工程完成新题材、讲解与迁移，复核独立程度和实际学习效果。R7工程范围见[项目B契约](22-R7完整业务项目B契约.md)，证据见[R7验收](../new-system/docs/acceptance/R7/README.md)。原R1真实额度/物理断网、SQL及Boot专用AI上下文继续单列。'
replace(tracking,old,new)
print('Updated current product, documentation entry points, version references and R8 next stage.')
