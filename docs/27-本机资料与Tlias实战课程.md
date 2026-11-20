# 本机资料与Tlias实战课程

2026年11月17日，用户提供`D:/BaiduNetdiskDownload`中的JavaWeb＋AI及MySQL资料，要求判断阶段并加入网站。

## 阶段与教学主线

Tlias放在项目A之后，属于项目B完整业务阶段，与既有“学习计划与任务协作”并列供选择。它覆盖部门/员工CRUD、多表关系、经历事务、上传、报表、JWT、AOP、班级学员、Vue联调和部署，适合承接SQL、Boot和基础CRUD，而非作为Java入门第一课。MyBatis从部门查询章引入。

全课程14章56小节，每章四个开发小节。每小节包含修改文件、原理、实现动作、预期结果和排错；每章有已有成果、后续承接、自查和资料来源。按每天约一小时安排，可将复杂章节拆成多天，不以14章承诺14天完成。

同一份`tlias-learning`工程由最小POM、Application、端口配置与RUN.md开始，业务代码由学习者创建；跨章、回看与刷新保持最新草稿。浏览器按项目保存源码，阅读位置按章/小节保存。损坏草稿不会被初始模板覆盖，多标签页变化阻止旧页继续覆盖。通过既有目录保存组件可导出独立文件，不生成ZIP。

## 来源核查与改编

实际读取20个JavaWeb主题目录、部门管理PPT文本、完整服务端ZIP中的POM/Mapper文件列表与示例、接口Markdown和SQL；PDF基础95页、进阶142页、运维83页，目录及关联页码取自文件书签，并渲染查看基础篇第61页。未把视频文件名当成已观看视频的证据。

源码材料为Spring Boot3.2.10、Java17、MyBatis3.0.3；本课程独立于原课程Boot4/JDBC运行环境。平台既有课包与完成策略保留。部门响应使用code/msg/data，员工分页使用total/rows，认证使用token头；对应原文可在网页资料阅读区查看。

改编点：从最小工程而非完整源码起步；先手写COUNT/LIMIT理解分页；上传先用本地存储，OSS选学；密码使用带盐哈希，密钥由环境提供；JWT有效期与撤销边界明确；关联删除、事务失败、日志脱敏和真实回归写入自查。这些是本次教学设计，不冒充原资料已实现的能力。

MySQL基础篇补SQL基础、约束、多表查询及事务；进阶篇随本项目的索引/执行计划/锁实验使用；运维篇在部署后选读，主从、分库分表和读写分离不作为入门前置。

导入清单固定为三份PDF、接口文档、班级学员SQL、日志SQL，共六份；SHA-256、原始路径和PDF目录记录于`new-system/docs/acceptance/local-materials/manifest.json`。安装程序、破解工具、二进制成品、云服务配置及完整参考工程未复制到站点。原文件保留。当前授权范围是个人站点学习，对外共享材料的授权另行核对。

## 网站入口与运行范围

### 导入个人学习资料

仓库提供课程正文、任务步骤和最小工程。资料阅读区和完整前端测试另需六份个人学习资料。将具备使用权限的原始资料按导入脚本约定放到 `D:/BaiduNetdiskDownload/mysql` 和 `D:/BaiduNetdiskDownload/javaweb+ai`，在已安装 PyMuPDF 的 Python 环境中从仓库根执行以下命令。

```powershell
python -X utf8 ./new-system/tooling/import-local-learning-materials.py
```

导入文件和校验清单位于 `new-system/frontend/public/materials/tlias/`，由 Git 忽略。导入后重启或重新构建前端即可使用资料入口。

首页“新加入的资料实战”、项目库（项目B分类/搜索/收藏）、学习路径均可进入`/projects/tlias`，正文路由为`/learn/tlias/:chapter?step=数字`。既有SQL/Boot/A/B资料区增加本机讲义及Tlias链接，原课程契约仍有效。

当前交付是完整资料教学与网页工程草稿。Tlias执行自己的Maven、MySQL、Vue与Docker命令，尚未接平台隔离运行和自动判题；阅读与人工自查不写入原项目B或画像的正式通过证据。首章独立工程已真实构建启动并返回UP，其他章节仍需逐章实际开发回访；不能将首章烟测外推为全课程功能验收。

课程源文件：`new-system/frontend/src/features/learning/tlias/tlias-course.ts`；界面：同目录`TliasLearning.tsx`；样式：`src/styles/tlias-learning.css`。导入工具：`new-system/tooling/import-local-learning-materials.py`。验收记录见`new-system/docs/acceptance/local-materials/README.md`。
