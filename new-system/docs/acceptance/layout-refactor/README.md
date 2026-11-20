# CodeSomething布局与组件架构验收

2026年11月19日根据《CodeSomething_布局与组件架构重构解决方案》实施。台式布局、窄屏导航、工作台测试和技术标签均以同一份前端源码验收。

## 实施约定

- 宽度按 ≤640、641–768、769–1024、≥1025 CSS px 四档表达。范围查询连续覆盖小数宽度。卡片内容仍可按自身容器宽度重排。
- 双栏时文件区可用宽度达到900px才默认打开220px文件树。1366px下仍可随时打开覆盖式目录。这样同时满足编辑器宽度目标和足够宽时的三栏布局。手机目录使用原生模态对话框，支持 Esc 和焦点返回。
- 工具栏、标题与章节进度回归正常布局。桌面工作台跟随视口高度，结果区可用鼠标或上下方向键调整，双击分隔条恢复默认。长日志在结果区内滚动。SQL 沿用脚本专属工作区与窄屏视图切换。
- 圆角、间距与六级层叠统一进入 design-system.css。标签自然换行，标签页支持横向滚动，选中新文件时将标签页移入可视范围。折叠和切换由原工程工作区继续持有文件、草稿与检查状态。

## 复现

从仓库根目录运行。前端5208代理隔离后端5209。浏览器通过 Chromium 的隔离文件系统创建测试工程，仅替换浏览器文件夹选择动作。本地 Java 与 Boot 实际执行由隔离后端完成。该脚本会提交并保存隔离学习记录。

```powershell
. 'D:/Document/codex/杂项/skill-workbench/video-browser-runtime/activate.ps1'
$env:CS_BROWSER_BIN='D:/Document/codex/杂项/skill-workbench/video-browser-runtime/node_modules/agent-browser/bin/agent-browser-win32-x64.exe'
$env:CS_JOURNEY_QA_URL='http://127.0.0.1:5208'
$env:CS_LAYOUT_SCREENSHOTS='new-system/docs/acceptance/layout-refactor'
node new-system/frontend/tests/browser/check-layout-refactor.mjs
npm test --prefix new-system/frontend
npm run build --prefix new-system/frontend
```

## 验收结果

| 检查 | 结果 |
| --- | --- |
| 前端 | 26项单元通过，TypeScript与Vite生产构建通过 |
| HTTP 第2节 | 1366×768下 Monaco 可用宽度为848px，放大模式超过900px。真实Java运行返回HTTP正文，代码和响应同屏，进入结果无需滚动页面，报告提供第3节入口 |
| Boot多文件工程 | 真实提交功能检查通过。1600px视口显示常驻文件树，多个长标签可横向滚动，序列还可用键盘聚焦浏览 |
| 响应式 | 11个HTTP工作台尺寸、6个Boot工作台尺寸与54组页面及尺寸组合通过水平溢出检查，覆盖930/960px和四档断点边界 |
| 布局与交互 | 桌面文章末尾章节入口、拖拽调整左右分栏与结果面板、键盘调整结果面板、全屏编辑器、平板任务折叠、手机文件抽屉与Escape返回焦点、辅导弹窗盖住文件抽屉均通过 |
| 技术标签及可访问性 | 项目库标签平铺换行，主区域axe为0确定违规。HTTP主区域axe为0确定违规，1个活跃页签序号的颜色对比由工具标记待人工确认，见[扫描记录](http-a11y.json) |
| 日常服务 | 5178已加载本轮工作台，运行与提交验证使用隔离环境 |

报告中的编码效率百分比未做真人计时。本轮以可重复测量的界面尺寸、浏览器操作和真实检查结果为验收依据。

## 浏览器证据

- [HTTP 第 2 节 1366×768](http-1366.png) · [深色](http-dark-1366.png) · [930px](http-930.png)
- [手机工作台](http-390.png) · [手机全屏文件目录](directory-390.png)
- [Boot 多文件工作台](boot-1600.png) · [项目标签](project-list.png)
