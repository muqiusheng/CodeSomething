# CodeSomething 后端

本机服务使用 Java 21、Spring Boot 和 SQLite。它提供课程、学习记录、项目文件、运行检查、复习和辅导接口。Flyway 随应用启动迁移平台数据库，SQL 课程使用独立的 MySQL 教学环境。

## 运行与构建

先按[快速开始](../../README.md#快速开始)配置 JDK 和 Maven。以下命令从仓库根目录运行。

```powershell
./scripts/project.ps1 backend-dev
./scripts/project.ps1 backend-test
./new-system/tooling/backend.ps1 package -SkipTests
```

开发服务默认监听 `127.0.0.1:5188`。[健康接口](http://127.0.0.1:5188/api/v1/health)用于确认进程状态。脚本从 `new-system/` 启动 Maven，将平台数据写到 `runtime/data/`，Maven 下载写到 `runtime/maven-repository/`。单元及接口测试使用独立临时数据。

打包完成后，也可在 `new-system/` 中运行 `java -jar backend/target/codesomething-backend-0.1.0.jar`。JAR 提供 API，前端由 Vite 单独启动。直接启动 JAR 时可用 `CS_DATA_DIRECTORY` 指定平台数据库目录。修改 `CS_BACKEND_PORT` 时，在前端同步设置 `CS_BACKEND_URL`。

## 本机集成

- HTTP、Boot 前三章与生成项目优先使用本机检查。Docker 用于 SQL、隔离章节和相应的运行环境回退。详见[运行规格](../../docs/29-本地运行优先与检查环境回退.md)。
- `CS_DOCKER_BIN` 可指定 Docker CLI 的路径。运行隔离检查前需启动 Docker 引擎。
- `CS_IDEA_EXECUTABLE` 可指定本机 IDEA 的启动程序。
- AI 辅导用已登录的 Codex CLI，`CS_CODEX_BIN` 可指定其命令路径。

[API 文档](API.md) · [隔离运行约束](../runner/README.md) · [阶段验收](../docs/acceptance/README.md)
