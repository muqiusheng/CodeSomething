# 前端样板验收

日期：2026年11月10日。版本：frontend 0.1.0。仅对当前前端样板负责，不代表R1/R2整阶段通过。

## 构建与环境

Node v24.14.0、npm 11.9.0。React 19.2.0、React Router 7.9.5、TypeScript 5.9.3、Vite 7.2.2、Lucide React 0.468.0；package-lock.json已生成。

安装最初因全局缓存写入受限失败，改用工程内.npm-cache；官方registry请求缓慢后，通过npmmirror安装成功。最终命令：`npm install --no-audit --no-fund --cache .npm-cache --registry https://registry.npmmirror.com --fetch-retries 1 --fetch-timeout 30000`，added 26 packages。

`npm run build`最终退出码0，TypeScript检查通过；Vite转换1590模块。产物CSS 29.10kB、JS 267.91kB（gzip 85.80kB）。React Router依赖的use client指令有被Vite忽略的提示，未造成构建失败。

`npm run dev`：绑定127.0.0.1:5178，strictPort；没有启动旧服务或后端。

## 真实浏览器检查

使用agent-browser独立会话`codesomething-prototype-1110`，Chromium。测试后关闭该会话。

- 首页进入课程；教学、任务、检查报告可切换；任务页签写入URL，刷新后内容正确。
- 请求示例输入1得到200 OK及id/title/completed，输入2得到404与错误消息。固定前端数据，非真实接口检查。
- 理解题选false布尔值后得到正确反馈；不写正式完成记录。
- 项目搜索xyz显示空状态与清除筛选入口。
- 设置时长30分钟，保存刷新后值仍为30；测试后恢复60分钟。
- 手机导航可打开，Escape可关闭，并确认document.activeElement.className为icon-button mobile-menu。
- 隐藏手机侧栏使用inert，开启时主应用使用inert，避免焦点进入遮挡内容；原生控件保留可见focus。
- 首页、工作台在320/375/768/1024/1440px，documentElement.scrollWidth均等于innerWidth。
- 路径、项目、复习、作品、画像、设置在320px均无页面横向溢出。
- 使用CSS zoom=2作放大压力检查；发现双栏挤压后添加内容容器查询，最终正文与辅导上下排列。此项不是完整浏览器文字缩放验收。
- 最后读取浏览器errors，无页面异常输出。

## 可访问性检查与修复

按web-design-guidelines当次在线规则检查新代码：可见标签、按钮/链接语义、图标隐藏、页签命名分组、radio fieldset、状态播报、跳转主要内容、URL状态、减少动态效果CSS。来源：https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md。

自动axe-core 4.12.1，标签wcag2a,wcag2aa。首轮发现辅助文字对比度问题，调深文字后复查：首页0违规，1类待人工项（旋转JSON插图中11个节点的色彩计算）；课程工作台最终0违规、0待人工项、22项通过。不将自动化结果等同全部可访问性通过。

## 截图

- [首页1440](home-1440.png)
- [工作台1440](lesson-1440.png)
- [项目1440](projects-1440.png)
- [首页375](home-375.png)
- [工作台375](lesson-375.png)
- [工作台CSS放大200%](lesson-zoom200.png)

## 尚未实现或待验收

没有真实后端、目录桥接、代码快照、隔离检查、GPT调用、正式学习证据、完整课程与动态生成。页面明确展示未连接或规划状态。首页进度是演示，画像页没有伪造掌握结论。

完整浏览器200%文字缩放、减少动态效果系统实测、全部异步异常与长日志、生产部署fallback、正式后端数据一致性与核心行为测试留待对应R阶段。本次没有为固定样板交互增加镜像实现的单元测试。

技能：ui-ux-pro-max（多页面规则，Python检索因无运行时失败，未采用未经核验的数据库结果）；agent-browser（运行验收）；web-design-guidelines（交付检查）。本地技能库已检索，因现有技能与明确设计基线足够，未额外采用库内技能。
