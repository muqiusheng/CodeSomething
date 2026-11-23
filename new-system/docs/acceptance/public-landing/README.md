# 公开产品介绍页本地验收

2026年11月23日完成检查。使用仓库当前的0.30.2工作树、Vite生产构建、隔离的测试数据库与本地Nginx容器。验收未访问生产账号或改动生产站点。

同日复验公开展示升级。新增四个静态展品、五阶段产出预览、深色工作台和收尾卡。浏览器演示同时覆盖有动效及减少动效两种状态，工作台输出和 SQL 数据均为页面所标注的示例。截图与 JSON 结果已按升级后的生产构建刷新。

## 构建与单测

- `npm test` 通过36项。`npm run build` 生成 `dist/index.html` 与 `dist/app.html`。构建仍报告工作台部分第三方模块指令及大体积代码块提示。
- 后端 `PublicAccessTest#loginCreatesRevocableSession` 通过。验证访客状态、管理员角色、`Cache-Control: no-store`、会话探测不返还或轮换令牌、已轮换会话的探测结果，以及业务接口原有401行为。

## 静态内容与收录隔离

- Chromium 禁用 JavaScript 后，根页保留四个展品、五阶段产出、工作台代码、进度结果和三项断言，四条FAQ可以原生展开。运行按钮保持禁用。生产HTML的 canonical、robots、Open Graph 与三类 JSON-LD 校验通过，可执行脚本保持外置。开发入口的各账户和工作台路由均回到 SPA。
- 主站通过 Instabox 网关的标识开启收录，直接访问供应商入口仍执行原有跳转或409。通用Nginx的主站配置也做了独立对照。悉尼备用与上海私用配置返回全站 `noindex`，robots.txt 禁止全部抓取。主站只有根路径允许索引，sitemap 只列该 URL。
- 本地Nginx 1.30.7配置检查及实际请求通过。根页、工作台、资源、重定向、401和404响应中的安全响应头按原配置保留，备用注册页面302，注册和发码写入409。逐路径结果保存在本目录的 `nginx-results.json`。

这些检查验证站点发出的抓取和索引信号。Google 需要能抓取 URL 才会读取该 URL 的 `noindex`，已发现或已收录的 URL 需在上线后核验搜索引擎状态。[Google noindex 文档](https://developers.google.com/search/docs/crawling-indexing/block-indexing)

## 浏览器与账户流程

- 云杉翡翠浅色、云杉翡翠深色和薄荷霓虹深色各检查五个视口。尺寸为1440×900、1024×768、768×1024、390×844和320×720，15组均无横向溢出。九套配色的浅、深组合分别测量首屏文字、主要操作、沙盒代码、工作台代码和结果摘要，抽测最低4.70:1，薄荷霓虹浅色最低9.29:1。浏览器复验还覆盖独立明暗按钮、配色菜单、390px菜单焦点、键盘选择阶段、沙盒脉冲中断和五阶段演示重跑。详细数值见下方浏览器记录。
- 隔离测试账号验证了未登录访问 `/learn`、`/projects`、`/school` 和 `/admin/overview` 的登录跳转，邀请码片段填充，账户页标志返回根页，登录后恢复原目标及按角色处理 `redirect=/`。已登录学员、管理员和本机免登录模式均留在根页，入口分别指向对应工作区。
- 机器结果保存在本目录的 `browser-results.json`。复验脚本为 [check-public-landing.mjs](../../../frontend/tests/browser/check-public-landing.mjs)。使用 Node 24、Chromium 和 agent-browser，指定已启动的本地公网测试预览站 `CS_LANDING_URL`、agent-browser 可执行文件 `CS_BROWSER_BIN` 与证据目录 `CS_LANDING_OUTPUT`。可分别补充开发入口 `CS_LANDING_DEV_URL`、本机模式预览站 `CS_LANDING_LOCAL_URL` 及隔离管理员密码 `CS_LANDING_TEST_ADMIN_PASSWORD`。原 Bento Craft 脚本已用 `/learn` 作为学习首页入口。

本机截图包括 `emerald-light-1440-full.png`、`cupcake-synthwave-dark-390-full.png`、`emerald-light-320.png` 和 `javascript-disabled.png`。
