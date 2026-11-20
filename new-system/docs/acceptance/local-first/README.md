# 本地工程优先验收 · 0.19.0

日期：2026年11月17日。契约：`docs/28-本地工程创建读取与验证.md`。任务页默认本地开发、网站读取与检查，网页编辑辅助；沿用同一工程与原课程判定。

## 实际执行

- 后端：`./new-system/tooling/backend.ps1 -Action package -TestName 'CourseWorkspaceApiTest,BootLearningApiTest,BrowserWorkspaceApiTest'`。实际发现并执行CourseWorkspaceApiTest与BrowserWorkspaceApiTest，共27项通过、零跳过；BootLearningApiTest没有匹配类，未将其计入测试。日志：`new-system/runtime/local-first-build.log`。
- 新接口先运行失败测试：源码读取、IDE配置两个测试在接口不存在时均收到404；实现后通过。源码测试核对未配对401、白名单、内容与摘要、磁盘变化409和重新读取。IDE测试核对配置缺失503与外站Origin403。
- 前端：`npm --prefix new-system/frontend test`，13项通过。`npm --prefix new-system/frontend run build`，TypeScript与Vite通过；保留既有大分块提示，未增加依赖。最终日志：`new-system/runtime/local-first-frontend-final.log`。
- Impeccable机械检测四个新增/主要改动组件，返回空结果。
- 浏览器：激活video-browser-runtime后，设置`CS_BROWSER_BIN`为随附原生程序，运行`check-local-first.mjs`及`check-local-readers.mjs`。独立5179/5189、独立SQLite、独立HTTP/作品/Tlias源码目录；不向日常学习库写测试完成。

## 浏览器与成图

`browser.json`记录12项主流程和18组375/768/1440px检查。HTTP默认不初始化网页编辑器；本地目录预览配对；只读查看真实源码；受限环境实际编译、请求与检查通过；编码完成无需答题；磁盘变化标旧；下一章沿用目录。IDEA按钮收到真实进程启动响应；网页编辑可切换。Boot/A/B、SQL、Tlias入口与尺寸均已检查。

`readers.json`记录3项附加检查：作品实际目录读取与排除无关文件、辅助编辑切换、Tlias实际源码读取。补查作品375px与Tlias375px深色，无页面横向溢出。生成项目复用ProjectFileEditor，未在本轮独立重跑生成、发布与全关判题。

实际打开检查了Boot创建指引、HTTP文件读取、Tlias桌面与深色手机截图。HTTP标题和最小启动配置补齐后另查`http-guide-final.png`。图片不含日常账号或用户工程源码。

HTTP与Tlias局部axe均无确定违规。首次HTTP检查发现已有`.practice-current`裸div的aria-label待判断，已补`role="group"`；最终`a11y-final.json`只剩color-contrast自动待判断项，不能宣称全部无待判断。只读编辑器按钮改为“放大查看”，文件选择加具名与可见焦点提示。

## 日常切换

原JAR：`runtime/releases/guided-learning-0.18.2.jar`；新JAR：`runtime/releases/local-first-0.19.0.jar`。切换前确认无活动检查作业，SQLite在线备份为`runtime/data/pre-local-first-20261117.db`；核实旧进程程序及JAR后停止，通过`start-release.ps1 -Mode daily`启动。日常IDE路径由启动脚本读取本机已有安装，未修改系统环境。

`daily-before.json`与`daily-after.json`记录31张表的行数和内容摘要，逐表完全一致；无新迁移。日常5178/5188保留，新后端健康UP。验收浏览器会话、5179/5189服务已在收尾关闭。

## 实际边界

打开IDEA只表示启动请求已发送，创建工程由学习者操作；本轮没有代替学习者操作New Project。IDE输入未保存时网站读取不到，保存后需重新读取。网页草稿与本地源码互不自动覆盖。

Tlias仍无自动判题，使用本机运行与自查。SQL、Boot/A/B、生成项目和作品完整逐章学习效果不由本轮入口/读取验收替代；新增判题规则与开放讲解评估未纳入本轮。已发布课包和原历史检查证据未改。
