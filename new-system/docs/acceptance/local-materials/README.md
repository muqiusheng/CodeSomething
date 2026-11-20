# 本机资料课程接入验收

日期：2026-11-17。范围：Tlias项目B资料实战、三份MySQL讲义、网站入口、项目级草稿与阅读续接。后端、原发布课包和日常学习数据未改。

## 已执行

- `python -X utf8 new-system/tooling/import-local-learning-materials.py`：六份资料按清单导入，SHA-256与原始路径见manifest.json；三份PDF实际95/142/83页。基础篇第61页实际渲染查看，见mysql-constraints.png。
- `npm --prefix new-system/frontend test`：13项通过，含损坏草稿拒绝、路径逃逸/全栈文件支持、资料摘要及PDF页码校验；首次检查捕获`./`路径问题，修正后全部通过。
- `npm --prefix new-system/frontend run build`：TypeScript与Vite通过；已有第三方use-client与大块体积提示。
- 独立`runtime/acceptance/tlias-first-chapter`中写入最小模板与首章健康接口验证代码，Maven package成功，见first-chapter-build.log；Java21启动Boot3.2.10，在8097实际请求`/health`得到UP，见first-chapter-health.json。该验证没有业务测试，不表示其他章节业务通过；验证服务完成后关闭。
- `agent-browser`独立`cs-tlias-materials`会话：14章页面逐个打开，均有对应标题与教学，见chapters.json；课程目录/学习页320、375、768、1024、1440px共10组检查无整体横向溢出，见dimensions.json。另查看桌面和手机深色截图并修正桌面编辑器高度。
- 实际创建HealthController、编辑、进入第二章、继续编辑、回看第一章并刷新，正文仍保留最新代码，第一章恢复第2小节，见continuity.json。位置与草稿只写该隔离浏览器，未写日常学习数据库。
- 原始接口按钮读取成功，见source-reader.json；资料URL与导入摘要校验、目录与正文入口检查通过。
- axe WCAG2A/AA：学习页0违规，编辑器输入/提示和保存按钮背景叠加有1类对比度待人工判断，见a11y-final-chapter.json；目录结果另见a11y-overview.json。共享编辑器既有问题未扩展为全站重构。

## 来源

用户目录的PPT、接口文档、源码及PDF为内容事实来源。补充核对MyBatis参数绑定、Spring声明式事务代理与MySQL执行计划官方文档：

- https://mybatis.org/mybatis-3/sqlmap-xml.html
- https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html
- https://dev.mysql.com/doc/refman/8.0/en/explain.html

界面检查按web-design-guidelines；技能原command.md链接返回404，改读同仓库AGENTS.md，副本web-guidelines.md。主题/组件沿用项目现有daisyUI色板与共享实现。

## 待完成范围

Tlias尚无平台隔离运行、正式检查与画像接入；其他章节的真实业务开发、依赖增补、数据库/前端/部署全流程需逐章学习验收。资料实战不改为原课程自动通过。完整教学主线与改编记录见根目录docs/27。
