# 命名、版本与 GitHub 发布约定

本约定用于 CodeSomething 后续改进和 GitHub 上传。目录职责见[工程目录与维护约定](15-工程目录与维护约定.md)，课程版本与门禁见[R3.4 契约](14-R3.4课程版本与发布门禁.md)。

## 文件与目录命名

| 对象 | 约定 | 示例 |
| --- | --- | --- |
| 新增业务目录、独立工具和静态资源 | 英文小写，多个词用连字符 | `local-project/`、`check-r7-release.mjs` |
| React 组件 | PascalCase，文件名与主组件名一致 | `TliasLearning.tsx` |
| React Hook | 以 `use` 开头，文件名与导出名一致 | `useProjectFiles.ts` |
| Java、Kotlin 类型 | 文件名与公开类型名一致，包名小写 | `BootCheckRunner.java` |
| 测试 | 在所属模块沿用现有测试后缀 | `local-project-files.test.mjs`、`BootStrategyRunnerTest.java` |
| 中文项目文档 | `NN-主题.md`，沿用下一个空闲编号 | `35-命名版本与GitHub发布约定.md` |
| 模块入口及工具约定文件 | 使用工具识别的名称 | `README.md`、`package.json`、`pom.xml` |

名称按职责确定，用于搜索和定位。新增同类文件时优先沿用所属目录的惯例。改名时同步检查源码引用、脚本、相对链接和测试。已发布课程、锁文件和历史证据的路径按对应契约维护。

## 版本号

仓库正式发布使用 Git 标签 `v主版本.次版本.修订号`，例如 `v0.1.0`。随每个版本发布一组可验证的改动。普通提交或推送可以发生在两次发布之间。

| 改动 | 仓库版本示例 |
| --- | --- |
| 兼容的修复，或作为更新单独发布的小改进 | `v0.1.0` → `v0.1.1` |
| 兼容的新功能或新课程 | `v0.1.0` → `v0.2.0` |
| 需要使用者迁移的 API、数据或配置改动 | 稳定期增加主版本。处于 `0.x` 时增加次版本，并写明迁移步骤 |

截至 2026 年 11 月 20 日，首个提交说明使用 `v0.1.0`，本地尚无同名 Git 标签。发布前执行 `git fetch --tags origin`、`git tag --list` 和 `git log -1 --oneline`，核对远端已有标签和准备发布的提交。已推送的标签固定指向原发布提交，补发更正时使用新版本。

前端以 [package.json](../new-system/frontend/package.json) 为准，改版本时同步 [package-lock.json](../new-system/frontend/package-lock.json)。后端以 [pom.xml](../new-system/backend/pom.xml) 中 `codesomething-backend` 的版本为准。IDEA 插件同步 [build.gradle.kts](../new-system/idea-plugin/build.gradle.kts) 与 [plugin.xml](../new-system/idea-plugin/src/main/resources/META-INF/plugin.xml)。组件按实际改动独立升版。课程包版本和 SQLite 迁移编号继续遵循各自的契约。

## 分支与提交

- `main` 保存已经合并的版本。单主题改动可用短期分支，分支名采用 `origin/<类型>/<英文短名称>`，例如 `origin/feat/sql-practice`、`origin/fix/lesson-resume`、`origin/docs/release-rules`。分支按任务命名，避免使用 `codex` 等工具名作为分支名或前缀。
- 提交标题采用 `类型(范围): 改动摘要`，范围可省略。摘要可用中文，写出具体结果。示例为 `docs(repo): 补充 GitHub 发布约定` 和 `fix(frontend): 恢复 SQL 练习续学位置`。
- 类型使用 `feat` 功能、`fix` 修复、`docs` 文档、`refactor` 重构、`test` 测试或 `chore` 工具和维护。每个提交完成一个可独立说明的改动，相关文档或测试随改动提交。

## 受委托上传的步骤

1. 核对当前分支、提交、改动范围及 GitHub 远端。用户指定远端或分支时按指定目标操作。远端有待合并提交时，先核对差异并按普通 Git 流程处理。
2. 按实际改动运行检查。文档检查链接和差异，代码运行相关模块测试或构建。课程发布使用对应门禁，并如实记录失败和因环境缺失而跳过的检查。
3. 暂存本次委托范围内的文件，用 `git diff --cached --name-status` 和 `git diff --cached --check` 复查。确认运行数据、个人资料和生成产物应用既有忽略规则。
4. 按约定提交并推送用户授权的目标分支。正式发布时，先核对发布提交和版本标签，再按授权推送标签或创建 GitHub Release。发布说明列出主要改动、组件版本、验证结果及必要迁移步骤。
5. 核对远端分支或标签指向的提交，反馈链接、提交号和实际检查结果。

用户提出“帮我上传”时，授权范围为本次相关文件的提交与正常推送。发布标签、GitHub Release 与强制推送按用户具体授权处理。
