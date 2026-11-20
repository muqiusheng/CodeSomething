# R1正式工程底座

2026年11月11日，在前端0.7.0设计首轮后按用户追加指令直接推进。当前前端0.7.1、后端0.1.0。工程底座已运行；GPT网页辅导、真实限额错误和R2学习闭环仍待验收。

## 实际环境与启动

JDK21.0.6、Maven3.9.14、Node24.14.0、npm11.9.0、IDEA2026.2。默认命令行原为Java8，tooling/backend.ps1仅为当前进程选定已有JDK21。Docker最初不在PATH，后续通过用户目录的Docker Desktop CLI连接到Docker29.6.2、linux/amd64引擎；无需安装新全局组件。environment.json保留已验证路径和独立端口。

前端127.0.0.1:5178，后端127.0.0.1:5188；Vite代理/api。运行数据与Maven缓存分别在runtime/data和runtime/maven-repository，均不入版本库。后端只使用新目录，未迁移旧数据。

实际执行tooling/backend.ps1 test，3项HTTP行为测试通过；package -SkipTests生成独立可运行JAR。前端npm run build通过，产物大小见build-results.json。后端JAR已实际启动，健康接口查询SQLite返回UP；Flyway成功应用V1/V2迁移。重复启动迁移校验通过。

## 数据一致性证据

遵循逐条红绿循环，先记录行为失败，再实现并回归：

1. 偏好接口未实现时返回404；实现迁移与接口后，保存30分钟/减少动效，关闭并重新启动服务仍能恢复。
2. 31分钟最初触发数据库约束500；增加领域校验与统一错误后返回400/INVALID_REQUEST，已有60分钟不变。
3. 续学接口未实现时返回404；实现后保存教学位置，再更新到任务位置，旧版本更新返回409/VERSION_CONFLICT；重启仍恢复任务位置及revision=2。

完整通过摘要backend-tests.txt。开发过程日志保存在忽略的runtime/r1-test-*.log。测试使用TempDir临时SQLite，实际运行库的session仍为空，未制造正式学习记录。

## 前后端联调

tooling/check-r1-web.mjs完成14项断言，原始数据web-checks.json：代理健康、偏好写入、删除浏览器缓存后从服务恢复、动效保存、首页时长读取、断网不改数据库、浏览器回退、恢复连接重试及设置页五种尺寸。测试后恢复原偏好。

接入后设置页320/375/768/1024/1440px无横向溢出；axe4.12.1 WCAG2A/AA为0违规、0待判断项。截图settings-connected-1440/375.png与settings-save-offline.png。前端其他页面本轮视觉证据复用../formal-design/，未重复全站审计。

## GPT可行性

官方app-server在现有ChatGPT登录下完成一次实际教学回答、interrupt停止和进程重连，额度桶读取成功。没有读取/输出令牌，没有切换付费API。具体套餐未知，不把教师身份当作授权资格。见GPT接入验证.md和gpt-probe.json。

网页辅导尚未调用该提供方，前端与健康接口继续标示未连接。未人为耗尽额度，真实限额错误、网络断线同轮恢复和网页上下文/停止另行验收。

## 下一阶段

按docs/05推进R2：编写首个正式HTTP/JSON课程包、实现目录配对及范围预览、代码快照与幂等作业，再在已可用Docker引擎上固定镜像和资源限制，完成错误→修复→功能/理解双通过→续学闭环。当前Docker在线不等于隔离判题已实现。R1余下的AI错误场景可与R2独立推进。
