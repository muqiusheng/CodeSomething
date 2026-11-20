# 0.4.0 全站交互验收

2026年11月10日。用户先要求增加交互，再明确扩展到整个系统并强调趣味性。本次范围为现有前端八个页面及其预览，不实现后端。

## 实现与来源

全站快捷导航；主页可点的JSON；工作台字段探索、修改数据与模拟请求；路径全部展开与折叠反馈；项目收藏、布局切换及接口预览；两题复习解析与重练；作品档案多页签预览；画像依据说明；可保存的减少动效模式。

使用make-interfaces-feel-better控制动作与反馈、leibox实时检索评估、agent-browser验收。组件来源为已采用的LeiBox按压按钮、shadcn Tabs/Accordion/Dialog/Command；本次没有硬塞不匹配的LeiBox新演示组件。官方原始Dialog/Command源码JSON保留，实际入口按项目CSS适配。设计参数与取舍见根DESIGN.md及frontend/COMPONENTS.md。

## 构建与依赖

npm run build最终版本0.4.0，TypeScript与Vite退出码0；JS gzip116.03kB，CSS gzip15.90kB。依赖内部use client被Vite忽略的提示仍有，无构建失败。

新增精确版本：@radix-ui/react-dialog 1.3.1、cmdk 1.1.1。package-lock.json在版本整理时因PowerShell空键解析失败损坏，已用npm package-lock-only从实际安装树恢复，最终校验lockfileVersion=3、根版本0.4.0、110个包；npm ls --depth=0核实所有直接依赖匹配。没有遗留不一致的锁文件。

## 真实浏览器验证

独立会话codesomething-interactions-1110及最终全新会话codesomething-interactions-final，Chromium；测试后关闭，5178开发服务保留。

1. 主页点击completed，代码为true，小任务状态同步为已完成。
2. Ctrl K打开快捷导航；筛选“作品”后Enter进入/portfolio；Escape关闭返回quick-trigger焦点。
3. 项目收藏、已收藏筛选；刷新仍能找到已收藏条目；取消收藏正常。测试后清除本次收藏。
4. 卡片/列表切换；浏览器startViewTransition存在，切换结束后project-list出现或移除。减少动效下也能正常切换。
5. 项目预览POST接口显示“任务创建成功”与id；Escape关闭。手机375px弹窗可阅读、无整体横向溢出。
6. JsonExplorer选择completed并切换为true，输入“我的交互任务”，GET编号1的响应包含新标题与completed:true。编号2返回404；200/404本次对比标签都出现。
7. 请求发送中可取消，显示“模拟请求已取消”；再等待600ms，demo-output数量仍为0，没有迟到结果。
8. 复习第一题故意选错、第二题选对，本轮结果1/2；再练回到第1题。正确/错误均给解释与静态状态，截图查看过。
9. 减少动效选择后html data-motion=reduce，刷新仍为reduce，跨页列表操作仍正常；测试后恢复跟随系统。
10. 作品预览选择接口文档，active panel显示接口约定；画像说明弹窗显示能力规则并明确非个人实测结果。
11. 路径展开全部后4个open panel，收起后open panel=0。
12. 八页/learn、/path、/projects、/reviews、/portfolio、/profile、/settings及课程在320/375/768/1024/1440px，scrollWidth均等于视口宽度。复用本轮证据，不重复旧版验收。
13. 最终全新浏览器会话errors没有异常输出。

## 可访问性与视觉检查

axe WCAG2A/AA：项目主页面0违规0待人工项（21通过）；复习答案页0违规0待人工项（21通过）；课程0违规0待人工项（26通过）；作品预览局部0违规0待人工项（17通过）。项目预览局部0违规，pre文本对比度待人工项：#41536d在#f6f8fb，对比充足且截图可读。快捷导航全页0违规，Radix隐藏背景/焦点哨兵和首页渐变有自动待人工项；实际Escape焦点回归已检查，背景无法直接点选。

首轮发现项目图上的标签对比度不足及若干分组缺少role，已调深标签并补group后复查。开发过程中一次存储容错代码引入语法错误，已修复，最终会话无此异常。

make-interfaces-feel-better范围记录：React普通CSS；查看Typography（保留0.3层级）、Surfaces（弹窗与内边距）、Animations（上述反馈与减少动效）、Icons（同一Lucide库与状态）、Performance（CSS明确过渡属性、无新增通用动画库）。未执行浏览器动画面板10%慢速逐帧检查或真实低端设备性能测试；这些不宣称通过。

## 截图

[快捷导航桌面](command-1440.png)、[快捷导航手机](command-375.png)、[项目卡片](projects-grid.png)、[项目列表](projects-list.png)、[项目预览桌面](project-preview.png)、[项目预览手机](project-preview-375.png)、[字段探索](json-explorer.png)、[复习题](review-question.png)、[复习解析](review-answer.png)、[设置](settings.png)。

## 事实边界

请求明确是本地模拟，450ms用于展示教学过程，不代表真实网络耗时。收藏、动效与复习稍后是浏览器偏好；字段探索、当前任务状态、本轮复习结果不生成正式证据。AI连接、本地桥接与真实代码检查仍待R阶段实现。
