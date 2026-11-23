# 码起步 应用工程

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

## 本机 Docker Desktop 项目组

`codesomething-local` 统一管理本机验收网页、后端和两个按需练习库。已有本机设置存放在 Git 忽略的 `runtime/local-compose/settings.env`，三个数据卷按原名作为外部卷挂载。

在仓库根目录运行以下命令：

```powershell
./new-system/tooling/local-compose.ps1 up -d --wait
./new-system/tooling/local-compose.ps1 --profile sql --profile boot ps -a
./new-system/tooling/local-compose.ps1 up -d sql-practice
./new-system/tooling/start-boot-practice.ps1
./new-system/tooling/local-compose.ps1 --profile sql --profile boot stop sql-practice boot-practice
```

本机 HTTPS 仍使用原验收域名和端口 5643。Boot 练习脚本读取实际回环映射并生成 JDBC 配置。本机因 Windows 保留了原端口而使用 13380。日常 SQL 容器保留原名并使用无网络模式。课内实战隔离库和判题容器由应用按需建立。
