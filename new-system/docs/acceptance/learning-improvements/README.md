# 学习体验改进首轮交付

日期：2026年11月18日。前端0.23.0、教学支持2026-11-18.1、后端发布包improvement-0.23.0.jar。实施规格：[docs/30](../../../../docs/30-学习体验改进实施与验收.md)。

## 改动与计划对应

1. 统一首页续学上下文，覆盖HTTP、SQL、Boot、项目A/B；取消固定HTTP环节和双主要继续入口，复习紧邻当前任务，项目名与入口对应。
2. 首页和设置明确本地IDE/网页协作；目录选择增加等待和取消反馈，保留已有原文件同步、冲突拒绝和完成前磁盘核对。
3. 辅导携带当前任务、环节、小节及授权内容；替换首章过时准备目标，修复HTTP专属系统提示误用于其他课程的问题，安全渲染Markdown并提供任务核对。
4. HTTP首次编码前补地址、请求、JSON、响应与预测练习，允许跳过；首次建议时间注明安装排错另计。
5. SQL压缩目录、删除伪文件导航、统一脚本身份说明，提供直达代码，完成动作前置，原始数据按需展开。
6. Java概念题在检查前可练并看解释；正式证据继续绑定通过报告。SQL关键词误拼写显示行列及建议。修正skip前景/背景配对。
7. JDBC加入完整读取链样例、参数绑定与行映射说明，以及缺行、列名和连接失败对照。
8. 项目A提供同工程的可选HTML/事件/fetch/表单实践；Tlias提供补学入口并保留自己的响应契约。前端未升级为必修路线。
9. 提供换需求、改错和跨天复查任务及个人笔记；笔记草稿可刷新恢复，个人记录不冒充服务端能力证据。
10. 统一阅读位置、编码完成与可选概念标识；沿用真实帮助/迁移/作品回访记录，Tlias继续标明未自动判题。

已发布课包未编辑，用户学习工程未重置，正式检查规则及旧快照继续保留。

## 实际检查

### 行为与构建

- 新增首页课程上下文与Markdown分段行为测试，并按红到绿验证。最终前端18项测试通过，日志`new-system/runtime/improvement-frontend-tests-final.log`。
- SQL反馈测试先复现误导性错误，再修正行列与建议，单项通过；日志`improvement-sql-red.log`及`improvement-sql-green.log`。
- 即时概念练习、首章当前小节上下文分别先失败后通过；日志`improvement-practice-red/green.log`、`improvement-tutor-red/green.log`。
- 后端全量首轮127项：95通过、1失败、31条件跳过。失败为取消勾选课程片段后的上下文边界断言；修正后运行TutorApiTest、SqlPolicyFeedbackTest、SqlLearningApiTest、UnderstandingApiTest共22项，18通过、4条件跳过、零失败。未把条件跳过记为通过，修正后未重复整个全量。日志`improvement-backend-tests.log`、`improvement-backend-final.log`。
- TypeScript/Vite最终构建与后端打包通过；保留既有Monaco分块体积提示。日志`improvement-frontend-build-shipping.log`、`improvement-package.log`。Impeccable改动UI检测结果为空数组，见`improvement-design-check.json`。

上述日志均在`new-system/runtime/`。代码行为测试未以源码字符串存在代替运行验证。

### 浏览器与真实运行

主脚本`new-system/frontend/tests/browser/check-learning-improvements.mjs`使用独立5179/5189及独立数据，35条流程记录、21组1440/390/320px尺寸记录通过，见[browser.json](browser.json)。

- 五类课程各覆盖教学、任务与报告续学，共15个上下文场景；主按钮文案和全部本课程入口对应实际落点。
- 手机首页首屏可见复习入口；最终快捷环节横排，390px复习区域约从y=513开始，见[finish.json](finish.json)。
- HTTP起步预测、解释、跳过与目录取消反馈；代码未通过时即时概念练习成功，完成数保持不变。
- 真实HTTP源码编译、运行与检查通过；本地内容变化使原报告不能用于当前完成，重新检查后可无需正式概念答题完成编码。跨章自动恢复同一目录，回看保留最新源码。
- SQL真实MySQL启动和正式检查通过，完成动作位于结果对照之前；代码入口一次定位，伪文件导航不存在，脚本身份明确。
- JDBC输入输出链与展开样例、项目A可选页面教学均可见；两个主题的skip链接可进入main。

目录测试使用Chromium原生OPFS文件/目录句柄和IndexedDB，只替代系统选择器返回值。此证据验证连接后的实际文件读取、检查与接续，不等同于人工完成操作系统授权弹窗。首次脚本曾把上次通过文本误当本次运行结束，改为等待当前可完成状态；另将Monaco虚拟滚动的文本断言改为真实文件内容与当前目录核对。保留`browser-partial.json`及早期日志，最终结果以`browser.json`为准。

个人笔记另以浏览器实际输入、刷新恢复和显式保存核对，界面提示“属于个人记录，尚未核实独立能力”。未将笔记写入正式学习完成。

### 视觉与可访问性

实际查看最终两主题首页手机图、HTTP起步、JDBC展开示例、SQL代码/报告和概念练习。初轮发现JDBC示例受旧样式影响导致文字低对比，修正为成对表面/文字令牌；手机截图等待侧栏过渡稳定后重拍。

`check-learning-improvements-finish.mjs`对首页、SQL、HTTP起步、JDBC两主题共8个场景执行axe4.12.1，最终均为零确定违规。初轮JDBC长代码区缺少键盘焦点，增加可聚焦具名region后，仅复查受影响的HTTP/JDBC场景。自动待判断项：代码区及页签伪元素的color-contrast。SQL定位容器的aria-prohibited-attr初轮待判断已通过补齐region语义并局部复验处理。原始结果保存在`axe-*.json`；[finish.json](finish.json)汇总最终结果。待判断项不等于零问题或完整辅助技术验收通过。

最终截图使用`*-final.png`；早期截图保留作发现与修正记录，不作为最终样式证据。规范来源为当次读取的[Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)。LeiBox实际检索到sailing-toc及blister-dropdown，因装饰意象与本次操作型页面不匹配而未引入，复用现有组件。

### 真实AI

独立账号数据环境经现有官方本机ChatGPT链路实际提问HTTP首章lesson-3、SQL连接和Boot JDBC三个场景，均完成，见[tutor-real.json](tutor-real.json)。人工阅读确认：HTTP指导准备JSON正文；SQL区分连接自检与独立设计；JDBC解释路径参数、SQL绑定、行映射及JSON转换。没有切换付费API。样本验证不代表所有模型回答均已消除冲突，SQL/Boot的专用辅导界面未在本轮整体扩展。

技术讲解参照并核对[JDK21 HttpExchange](https://docs.oracle.com/en/java/javase/21/docs/api/jdk.httpserver/com/sun/net/httpserver/HttpExchange.html)、[Spring JDBC示例](https://spring.io/guides/gs/relational-data-access/)、[MDN Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)。引用用于机制核对，教学算例不作为用户真实运行数据。

## 日常发布与待验

日常库在线备份路径及31张表摘要见[daily-before.json](daily-before.json)；切换后[daily-after.json](daily-after.json)确认全部31表计数与摘要一致，完整性ok、无外键错误。运行包SHA-256为`64AF8B62D4BFB399065F8CAB5681DA650D8101E9C463755BCDD58856621AF0F5`。日常5178/5188已切换，数据库健康UP，本机ChatGPT连接检查ready，验收数据未写入日常库。

真实学习者的连续试学、独立讲解、跨天重做、完整课程逐章效果、系统原生文件授权人工操作、屏幕阅读器及实体手机验证继续待验。后续依据真实卡点扩充其他高密度课程教学，完整前端必修路线需要另定范围。本轮工程通过与学习效果分别记录。

收尾核对：独立5179/5189进程已按命令行确认归属后关闭；本轮浏览器会话已关闭；仅移除带codesomething.sql=1标签且名称为cs-sql-improvement-20261118的测试容器及其专属数据卷，保留日常cs-sql-learning。日常新版即时概念练习返回passed=true、recorded=false，随后31表摘要再次一致。发布摘要见[release.json](release.json)。
