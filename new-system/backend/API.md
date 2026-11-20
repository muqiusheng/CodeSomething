# 平台API契约（R1—R7）

R7新增固定课程`collaboration/1.0.0`，八个关卡为b-login、b-roles、b-plans、b-pagination、b-transaction、b-errors-logs、b-tests、b-deploy。沿用/courses、/workspace-previews、/workspace-bindings、/submissions、/check-jobs、/jobs、/understanding-rules、/understanding-attempts、/learning与/learner接口。正式完成同时要求项目A六关证据和本课程前序关卡证据。画像与复习增加八项，summary.total按实际列表计算。IDE交接支持collaboration；详细业务API属于独立学员工程，见[R7契约](../../docs/22-R7完整业务项目B契约.md)。平台继续使用V12，验收库独立于日常库。

R4.2新增IDE到网页的一次性交接：`POST /ide-handoffs`使用当前绑定Bearer及bindingId/jobId，`POST /ide-handoffs/consume`使用60秒单次code换取当前标签页配对与同一作业。两端响应no-store，失效返回409/HANDOFF_EXPIRED，详细约束见[契约](../../docs/17-R4.2IDE提交检查与网页交接契约.md)。

前缀/api/v1。仅本机单用户，不提供开放CORS。写请求必须使用application/json。所有请求返回X-Request-Id；错误结构为code、message、details、retryable、requestId，不返回数据库路径或堆栈。

| 方法与路径 | 行为 |
| --- | --- |
| GET /health | 实际查询SQLite；tutor为最近连接探测状态，runner细项仍为早期占位，实际执行以作业报告为准 |
| GET /profiles/me/preferences | dailyMinutes、motion、revision、updatedAt |
| PATCH /profiles/me/preferences | 部分更新dailyMinutes（30/60/90）或motion（system/reduce）；其他已保存偏好保留 |
| GET /learning/continue | session为空时nextAction=choose-course，否则resume；当前checksAvailable=false |
| PUT /learning/sessions/local | 保存课程版本与学习环节，必须提交expectedRevision；旧版本返回409 |

续学写入示例：

```json
{
  "courseId": "http-json-basics",
  "courseVersion": "1.0.0",
  "stageId": "json-task-response",
  "step": "teaching",
  "expectedRevision": 0
}
```

课程/关卡标识由小写字母开头，允许字母、数字和短横线，最长64字符；课程版本允许两段或三段数字；step为teaching/task/report。首次expectedRevision=0，服务端返回revision=1，后续使用读到的版本。409包含details.currentRevision，应重新读取后处理，不覆盖更新后的记录。

R1只持久化导航位置，不产生能力证据、通过状态或课程发布；课程是否已发布、先修、作业有效性与解锁在R2实现。实际运行库保持无正式学习记录，测试使用独立临时数据库。

## R2正式课程与快照

课程固定为http-json-basics / 1.0.0 / json-task-response。网页保留已发布的短路由/learn/http-json/1.0/json-response，由页面显式映射到正式标识；未发布路由显示不存在，不挪用当前课程。课程包只包含作者编写的教学、完整JDK21骨架和规则，不执行资料来源脚本。

| 方法与路径 | 行为 |
| --- | --- |
| GET /courses/{id}/versions/{version}/stages/{stage} | 返回指定发布版本、教学、骨架、运行方法、允许文件与验收条件；未知版本404 |
| POST /workspace-previews | directory绝对目录、courseId、courseVersion、stageId；只读取固定TaskServer.java，返回文件列表、字节数、SHA-256、预览id、pairingCode、expiresAt；5分钟有效 |
| POST /workspace-bindings | previewId与pairingCode；检查未使用/未过期/文件未改变，返回id、directory与一次展示的token |
| GET /workspace-bindings/{id}/preview | Bearer token鉴权，读取当前文件字节并返回新摘要 |
| POST /submissions | Bearer token；bindingId与expectedDigest；从目录读取文件，摘要一致才在事务中保存原始字节、版本和时间 |
| GET /submissions/{id} | Bearer token必须匹配该提交绑定；返回不可变快照、摘要与时间，不回读当前目录 |
| POST /check-jobs | Bearer token；submissionId、idempotencyKey（字母/数字/下划线/短横线，1—100字符）；同一绑定+键返回同一作业，用于另一提交返回409 |
| GET /jobs/{id} | Bearer token核对提交的目录绑定，返回实际持久化状态 |

R2.2作业状态为awaiting_runner：等待R2.3隔离运行器接入，不执行学员代码、不返回功能通过、不追加能力证据。快照字节作为SQLite BLOB保存，与元数据同一事务提交，无外部文件/数据库双写。尚未生成执行日志或测试报告。

文件范围固定一个普通文件、最大65536字节，不扫描子目录或读取.env/IDE配置，不接受链接文件或目录联接。文件变化返回409/SNAPSHOT_CHANGED，确认前预览过期或已使用返回409/PREVIEW_EXPIRED；无配对令牌或不匹配返回401/PAIRING_REQUIRED，错误配对码403/PAIRING_REJECTED，错误幂等键复用409/IDEMPOTENCY_CONFLICT。课程不存在404/COURSE_NOT_FOUND。

API核对Host为127.0.0.1/localhost，并拒绝cross-site和不受信任Origin。网页来源默认精确允许http://127.0.0.1:5178及后端自身来源，不开放CORS；测试时可用cs.frontend-origin指定独立前端来源。Vite的CS_BACKEND_URL只用于当前进程代理配置。绑定令牌只以散列保存于数据库；网页在当前标签页sessionStorage保存令牌和最后提交id，刷新可恢复，关闭标签页后需重新配对。“更换目录”清除标签页缓存，不代表服务端令牌撤销；正式撤销和插件会话生命周期留R4完善。

无效输入400/INVALID_REQUEST，未知内容404/NOT_FOUND，方法错误405/METHOD_NOT_ALLOWED，不支持的格式415/UNSUPPORTED_MEDIA_TYPE，旧版本409/VERSION_CONFLICT；其他故障500/INTERNAL_ERROR并允许重试。

## 课程1.1.0：入门项目与章节

新增GET /courses/http-json-basics/versions/1.1.0返回schemaVersion=2项目包：projectId=backend-foundations、目标、先修、来源、完整骨架和8章。GET同版本/stages/{stageId}返回单章及版本/允许文件等元数据。发布标识固定为workspace、request、response、json、run-server、trace、fix-response、transfer，不以请求路径任意读取文件。服务端校验章节顺序、先修只指向前序章、概念/步骤/验收清单及随堂题选项。

原1.0.0接口不变。新版配对仍提交courseId/courseVersion/stageId；快照和作业继承该上下文，前端缓存按版本与章节隔离。mode=reading的章节界面只提供练习，code章节提供真实快照。checkPolicy声明后续隔离运行策略，当前没有执行策略或正式完成结果；题目answer是可见教学反馈，不用于可信判题。
# R2.3 检查作业与报告

`POST /api/v1/check-jobs`沿用`submissionId/idempotencyKey`与目录Bearer授权。相同键返回相同作业；显式重试使用新键。最多8个未结束作业，串行执行。原`awaiting_runner`作业在再次请求时转入队列。1.1.0仅run-server、fix-response、transfer三个编码章节允许执行。

`GET /api/v1/jobs/{id}`返回`queued/running/passed/compile_error/business_error/environment_error/timed_out/cancelling/cancelled`，以及`report/stale/freshness`。报告包含快照SHA-256、课程版本/章节、策略、镜像摘要、探针摘要、逐项预期/实际值、最多8Ki字符日志和结束时间。`functionalPassed`仅为本检查策略的功能结果，不创建关卡完成或能力证据。

`freshness=current/changed/unknown`来自当前授权目录与保存摘要的比对；无法读取文件时也不能把旧报告当作当前代码结果。`GET /api/v1/submissions/{id}/jobs`按创建时间倒序恢复历史作业，使用相同授权。

`POST /api/v1/jobs/{id}/cancel`不需要请求字段。排队作业直接cancelled，执行中的作业先cancelling，完成容器与临时快照清理后cancelled；重复取消不重复执行。终态不改变。环境清理异常返回environment_error。运行中断后重启将遗留作业归为环境异常，提示重新检查。


## R2.5 网页辅导

GET /tutor/connection读取最近检查状态；POST /tutor/connection查询官方账户类型与可用模型，返回status/message/model或脱敏错误，不执行推理。

POST /tutor/requests接收courseId、courseVersion、stageId、level（concept/locate/example）、question（1—2000字）、includeLesson、可空submissionId/jobId及idempotencyKey。服务端组装当前章节片段；代码/报告按配对Bearer授权，核对版本和关卡。代码与报告同时选择时须来自同一快照。相同编号/内容返回原请求，内容不同409/IDEMPOTENCY_CONFLICT，已有生成中请求返回409/TUTOR_BUSY。

GET /tutor/requests/{id}返回持久状态、answer、revision、contextManifest、帮助等级、课程与快照引用。选择代码/报告的记录在读取、停止、事件订阅时均需相同配对授权。POST /tutor/requests/{id}/stop请求停止。GET /tutor/requests/{id}/events?after=revision返回SSE state事件，事件ID为revision、data为完整当前状态；服务端跳过旧revision，断开后先GET再按游标连接，恢复不重复生成。

状态为queued/running/completed/cancelling/cancelled/failed/interrupted；服务重启将遗留活动状态标为interrupted，保留输出。AUTH_REQUIRED、RATE_LIMITED、MODEL_UNAVAILABLE、PROVIDER_UNAVAILABLE、PROVIDER_DISCONNECTED、TUTOR_TIMEOUT等错误保留可操作消息。停止和失败保留部分回答，主动新问题使用新编号。真实限额耗尽仍待验。

本地ChatGPT官方app-server为唯一提供方；课堂辅导不会触发付费API回退或更新关卡完成证据。请求/回答/上下文与恢复策略详见根docs/09-R2.5网页辅导计划与契约.md。

## R5画像与复习（V11）

本地单用户接口前缀`/api/v1/learner`：`GET /profile`返回19关证据、规则/快照ID与课程回顾；`POST /corrections`保存有理由的幂等纠正；`GET/POST /reviews`读取队列或开始/恢复变式；`POST /reviews/{id}/answer`按后端规则评分（实际帮助不可降级），`POST /reviews/{id}/defer`保存later/skip；`GET/POST /adjustments`读取/生成提案，`POST /adjustments/{id}/decision`处理accept/reject/undo并核对计划版本。提案类型daily-review/focus-course/pause-review分别为每日5分钟/集中15分钟/停止额外安排。完整结构、边界和规则见[画像复习契约](../../docs/19-R5画像复习与阶段调整契约.md)。不修改正式关卡完成或主线位置。

## R6研究生成（V12）

`/api/v1/projects`提供兴趣候选、幂等草稿、ChatGPT结构化方案、可恢复验证、发布与独立学习流程。`POST /candidates`读取R5真实画像；`GET/POST /drafts`及`POST /drafts/{id}/retry|stop|validate|publish`管理草稿；`GET /courses[/{id}]`只读取已发布包。`GET /courses/{id}/stages/{stage}/reference`记录示例帮助。`POST /courses/{id}/checks`接收三个允许文件的显式快照，`GET /checks/{id}`恢复报告，`POST /checks/{id}/stop|understanding`停止或验证理解。完整字段、门禁和错误见[R6契约](../../docs/21-R6兴趣匹配与生成发布契约.md)。当前生成Java21/Boot内存REST三关，数据重启清空；原固定课程API及主线进度保持原语义。

## R8独立作品（本机单用户）

GET/POST `/api/v1/portfolio`读取作品/幂等创建题材；GET `/{id}`读取档案。GET `/starter`仅给固定POM、Application和RUN.md。POST `/{id}/design`保存设计（revision乐观锁），`/position`保存四页签位置，`/transfer`在最新核心通过后发放迁移规则。POST `/previews`显式捕获目录范围，`/checks`确认预览快照并创建幂等隔离作业，`/checks/{job}/stop`停止。POST `/explanations`保存绑定最新通过迁移检查的四段讲解与帮助声明，`/visits`保存实际观察与真实续学/画像/复习快照。`state=evidence-ready`只表示工程证据齐备，`independence`仍为待实际回访核实。设计版本变化、最新作业失败或讲解未绑定时不显示齐备。完整字段与边界见根目录docs/23。
