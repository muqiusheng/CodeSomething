# 0.6.0 安静反馈与首页入口验收

2026年11月10日。用户要求替换嘈杂聚光，并为截图中的首页路径、待复习、最近完成和其他操作入口增加交互。

已移除styles.css中所有指针径向渐变；原spotlight区域改hover，指针调度仅保留封面tilt及按钮/导航。悬停卡片采用固定边框、1–2px抬起及浅阴影。HomeLearningSections.tsx将四条路径对应到真实目的页面、待复习改整块链接、演示完成记录改详情按钮。Modal补全无Dialog.Trigger时的焦点返回。筛选、答案、设置和辅助入口添加适度反馈。复用现有React/CSS/Dialog，无新依赖。

实际检查：

- npm run build最终0.6.0通过；JS gzip118.02kB，CSS gzip17.72kB。依赖use client忽略提示仍有。
- 真实浏览器：第二条路径进入/projects/task-manager；首条进入课程；待复习整块进入/reviews。
- 演示记录弹窗显示两类示例检查，不展示虚构提交时间或快照。局部axe WCAG2A/AA为0违规、0待人工项、14项通过。
- Escape关闭后document.activeElement.className为evidence evidence-button，焦点正确回归。
- 主卡及项目封面::before content为none；源码检索styles.css无radial-gradient或spotlight残留。封面视差仍返回有效matrix3d，功能保留。
- 首页320/375/768/1440px的scrollWidth等于innerWidth。
- 首页axe为0违规，原静态渐变背景上6个文字节点仍为自动待人工项，沿用此前明确色值的复核结果。
- 截图检查路径行hover和待复习整块hover，测试会话已关闭，5178开发服务保留。

证据：[路径行hover](home-hover.png)、[复习整块hover](home-review-hover.png)。本轮未重复所有既有业务、手机硬件和低端设备性能测试。
