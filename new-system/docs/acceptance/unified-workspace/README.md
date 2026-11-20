# 统一本地工程工作区 0.20.0

2026年11月17日。当前HTTP、Boot与项目A/B的共用学习工作区由一次性文件夹副本改为授权工程的文件浏览与编辑。主入口取消手动勾选和独立网页编辑模式，IDE与网页修改同一份学习者工程。SQL、Tlias、生成项目与作品原有专用入口本轮未整体改造。

## 当前行为

- 使用桌面Chrome/Edge的showDirectoryPicker申请工程读写权限；按课程和版本将原生目录句柄存入IndexedDB。刷新、跨章节自动查询权限并恢复；权限失效时仅要求重新授权，不要求重新定位目录。首次选择独立工程，网站不会生成或迁移业务源码。
- 目录按需展开，保留根目录的所有文件、子目录、IDE配置与构建产物；不再用检查白名单过滤展示。不支持预览的二进制和大于1MiB文件仍出现在目录，点击时提示使用本地应用。
- 点击文件进入共用Monaco编辑器，多文件切换，未保存标记；保存直接写回已授权文件。提交自动保存脏稿，然后从磁盘重新读取HTTP单源码或Boot全套Java源码与POM、RUN.md。notes、IDE配置、构建产物不上传。现有Boot检查器不接收任意资源/配置文件，仍使用原课程契约。
- 返回窗口与每5秒核对本地内容，干净的当前文件刷新，脏稿保持。网页保存前比较原始内容，检测到外部修改拒绝覆盖；可显式丢弃重读，也可恢复刚才丢弃的网页修改。当前会话使用sessionStorage恢复未保存草稿，关闭页面前提示。
- 根目录与网站工程分离；已知网站仓库根和前端包被拒绝选择。浏览器只记忆访问句柄；后台继续保留必要检查快照，运行器在隔离环境编译，不将学习项目当作网站代码目录。

## 检查证据

- 核心文件操作新增行为测试先失败（模块缺失），实现后通过。npm test共14项通过，覆盖完整目录/限定快照、原样保存、冲突拒绝与路径逃逸拒绝；既有工程测试保留。
- npm run build通过TypeScript与Vite；日志见new-system/runtime/unified-workspace-build-final.log。依赖包指令及原有大分块提示仍存在。
- check-unified-workspace.mjs使用独立5179/5189、独立SQLite与真实Chromium原生FileSystemDirectoryHandle、FileSystemWritableFileStream及IndexedDB完成8项流程与6组375/768/1440px检查；浏览器JSON见browser.json。
- check-unified-workspace-details.mjs另完成3项局部流程：网站仓库根拒绝连接、跨页面恢复未保存草稿、丢弃撤销后写回原文件；结果见browser-details.json。
- 实际Boot提交自动读取3个源码/配置文件，真实Docker隔离编译与健康接口功能检查通过；无手动选择。完整目录中的notes、.idea、target保留可见，未进入编译快照。
- 自动恢复原生目录句柄、跨章使用同一目录、权限失效仅重新授权、HTTP与Boot项目隔离、网页写回和IDE冲突保护均实际驱动验证。
- axe记录a11y.json及后续局部a11y-final.json；无确定违规。HTTP原有课程tab-index伪元素背景有color-contrast自动待判断项，不将其记为已通过。
- 实际查看workspace.png与workspace-final.png，检查目录、编辑器、按钮和长内容；最终图展示局部工作区。

## 环境与范围

日常前端127.0.0.1:5178读取0.20.0源代码，后端127.0.0.1:5188继续运行已验收local-first-0.19.0.jar；未修改数据库结构、日常学习记录、已发布课包和旧目录。独立验收浏览器与5179/5189进程在收尾关闭。

原生系统目录选择框是自动化测试边界：测试仅替换showDirectoryPicker返回值，后续使用真实Chromium OPFS句柄、文件流与IndexedDB，未伪造接口结果或检查结果。首次系统选择目录和Chrome跨进程永久授权选项待用户在实际浏览器操作；不把OPFS测试称为已完成系统对话框验收。

现有Boot检查器仍要求src/main/java/dev/codesomething/lab/Application.java和课程固定POM；任意包结构现在可完整显示与编辑，但不代表已获得检查兼容性。界面明确提示当前检查限制，不自动重写POM、移动Java包或修改用户的工程。HTTP检查仍以根目录TaskServer.java为源码入口。

目录访问方案参考Chrome官方文档：https://developer.chrome.com/docs/capabilities/web-apis/file-system-access 与 https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api 。按官方要求持久化句柄并查询权限；授权不足时由用户动作重新申请。

局部界面检查采用web-design-guidelines（2026-11-17读取Vercel当前规则）：按钮/summary键盘语义、焦点、状态与错误提示、长文件名、空编辑器、未保存恢复和丢弃撤销；没有新增依赖或动效。
