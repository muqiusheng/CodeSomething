from pathlib import Path
root=Path(__file__).resolve().parents[1]
def edit(name,old,new):
    path=root/name;content=path.read_text(encoding='utf-8')
    if old not in content:raise ValueError(f'missing expected text: {name}: {old[:60]}')
    path.write_text(content.replace(old,new),encoding='utf-8')
frontend=root/'frontend/src'
for path in [frontend/'api/learning-api.ts',frontend/'api/ide-handoff.ts',frontend/'features/learning/shared/UnderstandingVerification.tsx',frontend/'features/home/Dashboard.tsx']:
    content=path.read_text(encoding='utf-8').replace("'boot-foundations','task-manager'","'boot-foundations','task-manager','collaboration'")
    path.write_text(content,encoding='utf-8')
edit('frontend/src/features/home/Dashboard.tsx',"resume?.session?.courseId==='task-manager'?'个人任务管理':'接口启动实验室'","resume?.session?.courseId==='collaboration'?'学习计划与任务协作':resume?.session?.courseId==='task-manager'?'个人任务管理':'接口启动实验室'")
edit('frontend/src/main.tsx',"<Route path=\"/learn/task-manager/1.0/:stage\"","<Route path=\"/learn/collaboration/1.0/:stage\" element={<BootLearning course=\"collaboration\"/>}/><Route path=\"/learn/task-manager/1.0/:stage\"")
edit('frontend/src/main.tsx',"<Route path=\"/projects/task-manager\"","<Route path=\"/projects/collaboration\" element={<BootLearning project course=\"collaboration\"/>}/><Route path=\"/projects/task-manager\"")
edit('frontend/src/main.tsx',"loc.pathname==='/projects/task-manager'","loc.pathname==='/projects/task-manager'||loc.pathname==='/projects/collaboration'")
edit('frontend/src/features/projects/ProjectBrowser.tsx',"sessions:'后续阶段',icon:Layers3","sessions:'8关 · 可学习',icon:Layers3")
edit('frontend/src/features/projects/ProjectBrowser.tsx',"'boot-foundations','task-manager'","'boot-foundations','task-manager','collaboration'")
edit('frontend/src/features/projects/LearningPath.tsx',"kind:'项目 B',count:'规划中'","kind:'项目 B',count:'8 个关卡'")
edit('frontend/src/features/learning/boot/BootLearning.tsx',"{(stage==='boot-jdbc'||courseId==='task-manager')&&","{courseId==='collaboration'&&<details open><summary>项目B运行与前端演示</summary><p>在项目根目录执行 <code>&amp; ./new-system/tooling/deploy-r7.ps1 -Action start -ProjectDirectory 你的工程绝对路径</code>，在 <a href=\"http://127.0.0.1:5196/\" target=\"_blank\" rel=\"noreferrer\">本地业务前端</a> 演示。部署使用独立MySQL与持久卷，不覆盖其他练习库。用 <code>-Action stop</code> 停止并保留数据，<code>-Action status</code> 查看健康。Docker未启动、构建或端口失败按环境问题排查。</p><p>练习账号alice为计划1负责人，bob为成员，eve属于计划2，admin仅有审计权限；练习密码见工程运行说明。最终关从最小工程实现前端和API；正式完成前须先完成项目A六关。</p></details>}{(stage==='boot-jdbc'||courseId==='task-manager')&&")
edit('frontend/src/features/learning/boot/BootLearning.tsx',"const [search,setSearch]=useSearchParams(),tab=search.get('tab')||'教学';","const [search,setSearch]=useSearchParams(),rawTab=search.get('tab')||'教学',tab=rawTab==='理解验证'?'检查报告':rawTab;")
edit('frontend/src/features/profile/ProgressEvidence.tsx',"course==='boot-foundations'?'Spring Boot验证证据':'项目A验证证据'","course==='collaboration'?'项目B验证证据':course==='boot-foundations'?'Spring Boot验证证据':'项目A验证证据'")
edit('frontend/src/features/profile/LearnerProfile.tsx',"<BootProgressEvidence course=\"task-manager\"/>","<BootProgressEvidence course=\"task-manager\"/><BootProgressEvidence course=\"collaboration\"/>")
edit('frontend/src/api/learner-api.ts',"'task-manager':'个人任务管理'","'task-manager':'个人任务管理','collaboration':'学习计划与任务协作'")
edit('frontend/src/api/learning-api.ts',"workspace:'开发工作台'","'b-login':'登录与可撤销会话','b-roles':'角色与对象权限','b-plans':'计划、成员与数据关系','b-pagination':'按计划筛选与稳定分页','b-transaction':'批量分配与事务回滚','b-errors-logs':'统一异常与请求日志','b-tests':'集成测试与有效断言','b-deploy':'部署与前端演示',workspace:'开发工作台'")
edit('tooling/new-boot-workspace.ps1',"'boot-foundations','task-manager'","'boot-foundations','task-manager','collaboration'")
edit('tooling/new-boot-workspace.ps1',"}else{@('a-read'","}elseif($Course -eq 'collaboration'){@('b-login','b-roles','b-plans','b-pagination','b-transaction','b-errors-logs','b-tests','b-deploy')}else{@('a-read'")
edit('idea-plugin/src/main/kotlin/dev/codesomething/idea/LearningToolWindowFactory.kt','CourseChoice("个人任务管理", "task-manager", "1.0.0")))','CourseChoice("个人任务管理", "task-manager", "1.0.0"),\n        CourseChoice("学习计划与任务协作", "collaboration", "1.0.0")))')
edit('backend/src/main/java/dev/codesomething/profile/LearnerController.java','        return all;','        add(all,"collaboration","1.0.0","/learn/collaboration/1.0/",BootCourses.COLLAB,List.of("登录会话","角色与对象权限","计划与成员关系","稳定分页筛选","批量事务","异常与日志","集成测试","部署与前端"));\n        return all;')
edit('backend/src/main/java/dev/codesomething/profile/LearnerController.java','"boot-foundations","task-manager"','"boot-foundations","task-manager","collaboration"')
edit('backend/src/test/java/dev/codesomething/LearnerProfileApiTest.java','assertEquals(19,profile.path("knowledge").size())','assertEquals(27,profile.path("knowledge").size())')
edit('frontend/package.json','"version": "0.15.0"','"version": "0.16.0"')
# npm lock's root package metadata, without updating dependencies.
path=root/'frontend/package-lock.json';path.write_text(path.read_text(encoding='utf-8').replace('"version": "0.15.0"','"version": "0.16.0"'),encoding='utf-8')
print('Integrated project B into curriculum, submission, formal understanding, resume, learner profile, reviews and IDE selection.')
