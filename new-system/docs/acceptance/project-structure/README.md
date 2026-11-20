# 工程目录整理验收

日期：2026年11月12日。对应[工程目录约定](../../../../docs/15-工程目录与维护约定.md)。

本轮迁移72个文件：前端按功能、共享组件、接口、hooks、主题及样式分组；单元与浏览器检查分开；阶段检查移入tooling/checks，工具测试移入tooling/tests。保留Maven后端、课程、发布锁、平台数据及运行端口。两个零字节异常文件和一份早期日志归入runtime。

新增根目录.gitignore、.vscode/settings.json与scripts/project.ps1，修正根目录、工程和前端README的过期状态，更新当前文档中的脚本路径。历史验收记录原样保留。

迁移前后前端构建及3项弹簧行为测试均通过。迁移后43个前端文件逐项核对，除模块导入路径外内容相同；见[migration-checks.json](migration-checks.json)。备份与逐项路径清单位于本机new-system/runtime/structure-refactor-20261112/。

当前构建：[frontend-build.log](frontend-build.log)。发布门禁7项行为测试及149项输入/十关报告核对：[release-check.log](release-check.log)。课程规划与文档链接：[curriculum-check.json](curriculum-check.json)。工程语法、当前文档链接与产物摘要核对结果见[structure-checks.json](structure-checks.json)。

未重新执行Docker策略矩阵或浏览器全站验收；此次未改变业务逻辑，且迁移前后生产JS/CSS摘要完全一致。没有运行后端迁移、修改日常数据或重启日常服务。

初轮课程规划校验发现新增的本页尚未落盘，补齐本页后重跑；最终结果以上述文件为准。依赖包既有use-client打包提示保留，不影响构建。
