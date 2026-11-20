# 2026年11月17日学习页只读体验评审

用户要求：以挑剔前端工程师视角实际体验 http://127.0.0.1:5178/learn 并交付报告。此轮只评审，不实施修复。

最终文件：`new-system/docs/reviews/2026-11-17-学习页前端体验评审报告.docx`。共10项问题：P1一项、P2八项、P3一项。原始浏览截图保留本目录；`report-*.png`仅裁取原截图，未改页面内容。

## 实际执行

- agent-browser独立会话：learn-review-20261117、learn-review-A-20261117、learn-review-B-20261117，均已关闭。
- 主检查1440×1000、390×844，独立设计评审1440×1000、390×844，技术评审1262px、390px、320px。
- 首页、SQL第一章任务与原有检查报告、查看工程定位、键盘skip、导航Escape与焦点返回、Ctrl+K、深浅主题。
- 390与320首页scrollWidth分别等于390、320。主检查SQL 1440px scrollWidth 1440；390px scrollWidth 390。
- SQL任务页顶部稳定后编辑器y约1682px（1440×1000），手机约2472px（390×844）；坐标是本次状态读数，不是性能指标。
- 初次首页href：继续练习→SQL db-connect任务；继续上次学习→同章检查报告。浏览任务后续学位置随之更新，两个按钮可能同址。最后恢复SQL第一章检查报告再回首页。
- 卡内三个“本关学习环节”href均固定HTTP：workspace、run-server、fix-response，已与Dashboard.tsx交叉核对。未实际进入这些HTTP链接。
- 技术评审axe 4.12.1：浅色聚焦skip时color-contrast一项，#005d58对#302638约1.85:1；深色首页0项。键盘截图b-keyboard-skip.png。
- Impeccable detect对Dashboard.tsx和HomeLearningSections.tsx实际返回[]；这不检验课程上下文路由，也不表示全站通过。
- 最新Web Interface Guidelines：网页工具open返回404，随后PowerShell Invoke-RestMethod成功读取官方raw文本。

## 文档验证

python-docx生成，A4、宋体/Times New Roman正文10.5pt、黑体标题，Word原生多级编号；不附交付PDF。

技能提供的render_docx.py实际执行因缺少pdf2image失败；未安装依赖。改用本机Word COM只读打开与ExportAsFixedFormat输出内部PDF，再用PyMuPDF渲染页面PNG，实际查看全部最终页面。Word实例由脚本创建并关闭。中间PDF及页面PNG只用于内部排版核验。

## 边界

未提交检查、写源代码、完成关卡、重置练习、调用AI或变更配置。普通课程导航会保存页签位置，已恢复初始续学页签；不能称整个学习数据库零写入。

未做真实文件夹授权、完整编码通关、断网与配额故障、性能指标、200%缩放、屏幕阅读器、实体手机及其他浏览器检查。已有历史通过不作为此轮证据。未修改PRODUCT/DESIGN或发布课程，未运行无关构建与单元测试。

Questions skipped: 用户只要求体验评审报告，现有材料足够，不新增确认流程。

最终Word为5页，全部5张最终页面PNG已实际打开检查，标题无装饰横线、无空白尾页、正文与截图无裁切。浏览器内联eval引号失败生成的两个零字节临时文件已按确切路径清理，后续使用--stdin。
