# CodeSomething 应用工程

前端、后端与 IDEA 插件分别构建。安装依赖、启动服务和仓库级命令见[快速开始](../README.md#快速开始)。

| 模块 | 入口 |
| --- | --- |
| React 学习工作台 | [frontend/](frontend/README.md) |
| Spring Boot 本机服务 | [backend/](backend/README.md) |
| IntelliJ IDEA 插件 | [idea-plugin/](idea-plugin/README.md) |
| 课程包与依赖规划 | [course-packs/](course-packs/)、[curriculum/](curriculum/) |
| 本机及隔离检查 | [runner/](runner/README.md) |
| 工程工具和阶段检查 | [tooling/](tooling/)、[维护约定](../docs/15-工程目录与维护约定.md) |
| 阶段验收 | [验收索引](docs/acceptance/README.md) |

前端默认端口 5178，后端默认端口 5188。SQL 教学环境由课程页启动，首次使用需要 Docker。HTTP、Boot 与项目 A/B 可在任务页连接独立的本地学习工程，按章节持续开发。仓库的 `runtime/` 存放平台数据和临时文件。
