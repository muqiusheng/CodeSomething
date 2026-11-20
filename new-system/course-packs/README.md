# 版本化课程包

2026年11月12日R3.4：Boot四章与项目A六关已发布1.0.0。发布文件固定清单位于[curriculum/r34-release-lock.json](../curriculum/r34-release-lock.json)，运行`tooling/run-r34-release.ps1`重新执行十关参考/错误变式并核对证据。已发布目录不原地再生成；旧创作脚本会在写入前拒绝覆盖。范围和实际结果见[R3.4验收](../docs/acceptance/R3.4/README.md)。

2026年11月12日：新增sql-foundations/1.0.0，含六章项目式SQL教学、初始/变式种子。正式题规则在后端SqlCourse，答案不由正式题接口返回；实际MySQL检查与双结果均已运行验收，见[SQL验收](../docs/acceptance/R3.2/README.md)。以下HTTP段落保留其发布时记录；当前HTTP检查/完成能力以R2.3—R2.5验收为准。

R1建立独立目录，R2在此编写并验证第一个正式HTTP/JSON单元。前端现有固定示例不视为已发布课程包。正式包必须固定课程ID、版本、关卡ID、教学、验收与理解规则，发布后不原地覆盖。

R2前不从历史code-something目录复制课程或判题实现。
# 已发布首个单元

http-json-basics/1.0.0/stage.json是R2.1正式课程，TaskServer.java是可编译、含两个待修复TODO的完整JDK21骨架。版本标识与R1续学契约一致。首关只需已有Java基础，不提前要求Spring Boot；Spring Boot模块与项目A仍按原计划建设。

网页直接从正式课程接口读取内容、下载骨架。教学中的请求按钮是明确标识的模拟示例；正式代码提交只捕获一个TaskServer.java，不以示例点击产生能力证据。功能判定接R2.3，理解题保存与双结果规则接R2.4。本包当前“published”表示人工审阅的教学版本可读，不表示隔离判题门禁已实现。

课程1.1.0新增8章，详见http-json-basics/1.1.0/project.json。先修按序，全部章可查看。旧1.0.0继续发布，新版API由固定发布标识读取，真实快照继承对应版本与章。界面项目名“后端入门实验室”，教学内容和技术来源见根目录docs/07。
