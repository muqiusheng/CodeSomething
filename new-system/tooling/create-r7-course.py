"""One-time authoring entry. Refuses to overwrite the locked R7 release."""
from pathlib import Path
import hashlib,json,re

root=Path(__file__).resolve().parents[1]
target=root/'course-packs/collaboration/1.0.0'
if (root/'curriculum/r7-release-lock.json').exists():
    raise SystemExit('R7 is locked. Author a new course version instead of overwriting published files.')
target.mkdir(parents=True,exist_ok=True)
salt='00112233445566778899aabbccddeeff'
digest=hashlib.pbkdf2_hmac('sha256',b'Learn-2026!',bytes.fromhex(salt),600000).hex()
seed=f"""CREATE TABLE users(id BIGINT PRIMARY KEY,username VARCHAR(80) UNIQUE NOT NULL,salt CHAR(32) NOT NULL,password_hash CHAR(64) NOT NULL,role VARCHAR(10) NOT NULL);
INSERT INTO users VALUES(1,'alice','{salt}','{digest}','USER'),(2,'bob','{salt}','{digest}','USER'),(3,'eve','{salt}','{digest}','USER'),(4,'admin','{salt}','{digest}','ADMIN');
CREATE TABLE sessions(token_hash CHAR(64) PRIMARY KEY,user_id BIGINT NOT NULL,expires_at BIGINT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE plans(id BIGINT PRIMARY KEY AUTO_INCREMENT,title VARCHAR(100) NOT NULL,owner_id BIGINT NOT NULL,FOREIGN KEY(owner_id) REFERENCES users(id));
CREATE TABLE memberships(plan_id BIGINT NOT NULL,user_id BIGINT NOT NULL,PRIMARY KEY(plan_id,user_id),FOREIGN KEY(plan_id) REFERENCES plans(id),FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE plan_tasks(id BIGINT PRIMARY KEY AUTO_INCREMENT,plan_id BIGINT NOT NULL,title VARCHAR(100) NOT NULL,status VARCHAR(10) NOT NULL,assignee_id BIGINT NOT NULL,FOREIGN KEY(plan_id,assignee_id) REFERENCES memberships(plan_id,user_id));
CREATE TABLE audit_events(id BIGINT PRIMARY KEY AUTO_INCREMENT,actor_id BIGINT NOT NULL,action VARCHAR(40) NOT NULL,plan_id BIGINT NOT NULL,FOREIGN KEY(actor_id) REFERENCES users(id),FOREIGN KEY(plan_id) REFERENCES plans(id));
INSERT INTO plans VALUES(1,'Java学习计划',1),(2,'私人复习计划',3);
INSERT INTO memberships VALUES(1,1),(1,2),(2,3);
INSERT INTO plan_tasks VALUES(1,1,'学习 HTTP','todo',1),(2,1,'复习 SQL','done',2),(3,1,'练习 JDBC','todo',2),(4,1,'阅读 Java','done',1),(5,1,'完成项目','todo',2),(6,2,'私人笔记','todo',3);
"""
(target/'seed.sql').write_text(seed,encoding='utf-8')
resource=root/'backend/src/main/resources/runner/collaboration'
resource.mkdir(parents=True,exist_ok=True)
(resource/'seed.sql').write_text(seed,encoding='utf-8')
source=root/'tooling/r7-reference'
auth=source/'AuthService.java'
auth.write_text(auth.read_text(encoding='utf-8').replace('210000','600000'),encoding='utf-8')

lessons=[
('b-login','登录与可撤销会话','将账号密码换成有时限的会话，注销后旧令牌立即失效。',[
('密码验证与身份','账号是用户标识，密码只在登录时提交。users保存独立salt和PBKDF2-HMAC-SHA256摘要，比较时使用恒定时间方法，不在响应中返回数据库行。教学种子使用公开练习密码，方便在隔离库复现；真实账号需独立随机salt。请求先经JSON类型检查，再按username参数化查询；未知账号执行同样的KDF并返回相同401，避免用错误文案泄露账号是否存在。'),
('会话的生命周期','登录成功用SecureRandom生成32字节随机令牌，只将SHA-256摘要写入sessions。客户端用Authorization: Bearer令牌访问/api/auth/me，服务端每次校验摘要和expires_at。会话有效期3600秒；DELETE /api/auth/session删除摘要，旧令牌随后得到401。页面刷新会丢失内存中的令牌，需要重新登录，但应用重启不应清空数据库会话。'),
('从响应验证真实身份','先用错误密码请求，预期401，再登录alice并读取me，预期只含id、username、role。不要把前端下拉选中的账号当成身份。验证随机非法令牌、已注销令牌和过期会话；401表示需要重新认证。日志只记录请求编号、方法和状态，密码与令牌不进入日志。')],
['POST /api/auth/login接收username/password，正确返回token/expiresAt/username/role，错误密码401','GET /api/auth/me无令牌/非法/过期令牌返回401；有效会话返回真实用户','DELETE /api/auth/session返回204，原令牌失效；密码和令牌摘要不出现在用户响应'],
'POST /api/auth/login\n{"username":"alice","password":"Learn-2026!"}\nGET /api/auth/me\nAuthorization: Bearer <token>',
('页面改成管理员但登录令牌属于bob，服务端身份是什么？',['仍是bob','自动变成admin','不必验证'],0),('注销后重放旧令牌应返回什么？',['200','401','201'],1)),
('b-roles','角色与对象权限','区分管理员、计划负责人、成员与局外人，阻止跨计划越权。',[
('两类权限','users.role是全局角色，memberships是用户与计划的多对多关系。admin仅能访问审计，不自动成为所有计划成员；alice是计划1负责人，bob是成员，eve仅属于计划2。访问业务对象必须同时判断登录身份与目标计划关系。知道计划编号不能获得读取权限，换路径里的id也不能绕过校验。'),
('每次请求都验证','Controller从令牌得到User，Service调用requireMember校验plan_id与user_id。批量分配还要求plans.owner_id等于当前id；完成任务只允许负责人或该任务的assignee。先按plan_id和task_id一起定位任务，再做操作，避免拿计划1权限修改计划2的任务。角色失败返回403，任务在当前计划中不存在返回404。'),
('建立权限矩阵','用四个账号分别验证：alice能读计划1并分配，bob能读但不能分配，eve不能读计划1，bob不能读管理员审计，admin能读审计但不能绕过计划成员关系。测试必须直接请求API；隐藏按钮只改善界面，不能保护后端。')],
['alice可读计划1；bob可读但批量分配403；eve读取计划1为403','普通用户访问/api/admin/audit为403，admin访问成功','不能通过修改plan/task路径或请求体里的用户编号获取他人权限'],
'alice → plan 1: 200\nbob → POST plan 1 tasks/batch: 403\neve → GET plan 1: 403\nadmin → GET audit: 200',
('eve把计划编号从2改成1，应该在哪里阻止？',['只在网页隐藏','Service按当前身份核对memberships','改密码字段名'],1),('全局admin是否自动有全部计划写权限？',['是','不用登录','否，仍需成员与负责人关系'],2)),
('b-plans','计划、成员与数据关系','创建计划时同时建立负责人关系，理解主外键与事务边界。',[
('从业务规则建模','一个用户可参加多个计划，一个计划也有多名成员，因此用memberships(plan_id,user_id)复合主键表达关系。plans.owner_id指向users；plan_tasks的(plan_id,assignee_id)引用成员复合键，数据库阻止任务分配给局外人。audit_events记录操作者、动作和计划，不复制密码、令牌与完整请求体。'),
('创建是一个业务动作','POST /api/plans只接收title；owner_id必须取自已认证身份，不能接受客户端传入的ownerId。Service的public create方法使用@Transactional，依次插入plans、memberships和审计。任意一步失败，三步一起回滚；数据库自增编号取GeneratedKeyHolder，不能用列表长度猜编号。'),
('列表与隔离','GET /api/plans通过memberships仅返回当前用户参与的计划，按id稳定排序。成功创建返回201和新id，再GET该id验证关系已建立；bob列表不能出现eve的私人计划。数据源密码来自进程环境变量，学员账号仅有cs_lab的增删改查权限，建表由独立初始化步骤完成。')],
['GET /api/plans只返回当前成员的计划，按id排序','POST /api/plans校验1—100字符标题，201返回真实新id；负责人来自令牌','创建计划、加入负责人本人、写审计同一事务；引号和HTML字符按普通数据保存'],
'users 1 ← N plans\nusers N ↔ N plans（memberships）\nplan_tasks(plan_id,assignee_id) → memberships\nPOST /api/plans {"title":"复习计划"}',
('创建计划时客户端传ownerId=其他用户，服务端应采用谁？',['请求体用户','随机用户','令牌认证用户'],2),('用户与计划的多对多关系用什么表示？',['memberships关系表及复合主键','逗号拼接用户名','只写前端数组'],0)),
('b-pagination','按计划筛选与稳定分页','让筛选后的total、页内数据和权限范围保持一致。',[
('定义查询契约','GET /api/plans/1/tasks?page=0&size=2&status=todo返回items、total、page、size。page从0开始，size为1至50，page最多100000；status仅接受all/todo/done。先验证成员权限，再执行SQL；接口不可根据客户端传入的userId决定过滤范围。'),
('计数与数据保持同源','COUNT和列表使用相同的plan_id与status条件，列表增加ORDER BY id LIMIT ? OFFSET ?。偏移用long乘法计算，避免整数溢出。初始计划1未完成任务id为1、3、5，每页2条时第0页为1/3，第1页为5，第2页为空，但total一直为3。空页仍是200，非法分页参数返回400。'),
('用变化发现错误','分别切换all、todo、done，核对总数和每页编号。不能先从全库取一页再在Java过滤权限或状态，这会造成漏项与泄露。改变size后从第0页重新查询，翻页控件根据total决定能否下一页；保留空状态和错误原因。')],
['计划1的todo三页依次[1,3]、[5]、[]且total始终3','筛选不包含计划2任务；排序稳定；page/size/status错误返回400 JSON','空页200与items=[]，参数绑定避免SQL拼接'],
'SELECT COUNT(*) FROM plan_tasks WHERE plan_id=? AND status=?;\nSELECT ... FROM plan_tasks WHERE plan_id=? AND status=? ORDER BY id LIMIT ? OFFSET ?;',
('筛选todo后total还统计所有任务，应该修正什么？',['按钮颜色','COUNT使用相同筛选条件','扩大页大小'],1),('第2页（page=1），每页2条，OFFSET是多少？',['1','4','2'],2)),
('b-transaction','批量分配与事务回滚','在真实MySQL中验证多条任务和审计一起提交或一起回滚。',[
('把不变量放进事务','负责人一次提交1至20条任务，每条包含title和assigneeId。被分配者必须属于当前计划，标题为1至100字符。成功返回201和真实生成的ids。PlanService的public batch方法放@Transactional，由Controller经Spring代理调用，不能在同一个对象内部绕过代理调用带注解的方法。'),
('失败必须穿过边界','示例先插入第一条合法任务和审计，再校验第二条。第二条为空标题或局外成员时抛Problem（RuntimeException），Spring默认回滚运行时异常。不要catch后返回成功，也不要把异常吞掉；统一异常处理在事务代理外部转为400，因此回滚先发生，HTTP错误随后返回。'),
('并发与任务归属','数据库复合外键保证任务与计划成员关系一致。完成任务时同时用plan_id与task_id定位，再允许负责人或assignee操作，更新和审计也在一个事务内。验证回滚要查任务数与审计数，而不只看400；自增编号回滚后可能留下间隙，编号连续不是正确性的要求。')],
['合法批量新增两条返回201，不同id，可按计划读取，合法完成返回done','第二条空白或非成员时400，首条任务和对应审计全部回滚','bob只能完成自己的任务，不能完成alice任务；跨计划taskId不可操作'],
'POST /api/plans/1/tasks/batch\n[{"title":"应回滚","assigneeId":2},{"title":" ","assigneeId":2}]\n预期400；任务和审计总数均不变',
('第二条抛RuntimeException，第一条和审计应该怎样？',['全部回滚','保留第一条','只删审计'],0),('事务回滚后编号有间隙，能否说明回滚失败？',['一定失败','不能，检查业务行与审计是否回滚','要重装MySQL'],1)),
('b-errors-logs','统一异常与请求日志','用请求编号连接错误响应和日志，保留原因并保护凭据。',[
('稳定错误契约','认证401、权限403、输入400、当前计划内任务不存在404，响应包含code、message、requestId。JSON语法错误和参数类型错误也走统一Advice；意外异常返回500和通用恢复提示。不能向浏览器返回SQL语句、数据库密码和完整堆栈。错误HTTP状态必须真实设置，正文写失败但200会误导客户端。'),
('一次请求一个编号','OncePerRequestFilter给每次请求生成UUID，同时放入请求属性和X-Request-Id。finally记录该编号、HTTP方法和最终状态。不要记录Authorization、请求体、密码或查询字符串。用户报告失败时可以提供requestId，开发者据此定位；请求编号由服务端生成，客户端传入的任意字符串不应进入日志造成伪造行。'),
('区分环境与知识','连不上数据库、Docker未启动、依赖缺失和部署端口被占用属于环境问题，先核对环境再重试。功能检查中400/403等预期业务失败属于正常反例；学习平台的environment_error不计为知识错误。核对错误响应、响应头和日志编号一致，同时检查密码和本轮令牌均未出现在日志。')],
['400/401/403/404错误包含非空code/message/requestId，响应头编号与正文相同','访问日志包含请求编号、方法和状态；不出现密码、令牌、SQL凭据','无效JSON与非数字分页返回400；环境故障在学习画像中单列'],
'HTTP/1.1 403\nX-Request-Id: <uuid>\n{"code":"PLAN_FORBIDDEN","message":"你不是这个计划的成员","requestId":"<同一uuid>"}',
('定位用户的一次失败请求最合适用什么？',['密码','完整令牌','requestId'],2),('数据库连接失败应如何解释学习表现？',['先归类环境问题并排查，不据此否定掌握','必然不懂事务','直接完成关卡'],0)),
('b-tests','集成测试与有效断言','从API验证权限和事务，再让故意错误的实现使测试失败。',[
('通过公共接口观察','JUnit启动真实Spring应用与随机端口，HttpClient发出登录和业务请求。最低覆盖：eve读计划1被拒绝、bob不能分配与读审计、第二项无效时任务与审计回滚、注销后旧令牌失败。测试应使用独立创建的计划，不清空全库，也不依赖测试运行顺序。'),
('验证测试会抓错','只有Tests passed不够，assertTrue(true)也会通过。门禁会移除参考实现的成员检查再运行你的测试，要求发生断言失败，并拒绝仅编译失败的结果。因此测试必须调用真实接口、断言具体状态与数据。功能检查另用外部探针检查提交实现，不以提交测试自报的结果替代。'),
('从辅助走向独立','这一关不提供完整测试答案，只给公共API契约、空测试结构和运行方式。自己设计正常路径与反例，解释每条断言保护什么业务规则。RUN.md写出表关系、事务边界、环境变量、构建和运行命令；功能与概念题通过是工程证据，是否独立完成与开放讲解仍需实际回访。')],
['提交*Test.java，以真实HTTP覆盖成员越权、负责人权限、事务回滚和会话注销','JUnit至少一个有效测试通过；成员检查故意移除后必须出现断言失败而非编译错误','RUN.md至少80字符并说明环境、表关系、事务边界和运行方式'],
'mvn test\nassertEquals(403, outsiderResponse.statusCode());\nassertEquals(beforeTotal, afterFailedBatchTotal);',
('测试在正确实现与越权实现都通过，说明什么？',['测试覆盖不足，应加入权限断言','实现一定正确','可以删掉权限'],0),('隔离数据库无法启动使测试失败，应先检查什么？',['更改业务答案','Docker与连接配置','把403改200'],1)),
('b-deploy','部署与前端演示','从最小工程独立复现业务，按文档部署并在前端演示。',[
('部署边界','最终关只给启动类、固定POM、需求、API契约和测试要求。复用你前几关自己完成的代码，并说明必要改动。构建可执行JAR后，通过独立MySQL库和环境变量启动，网页与API同源，不需要开放数据库端口到公网。练习部署仅监听127.0.0.1，使用单独端口与专用数据卷，停止服务保留数据。'),
('配置与可恢复运行','数据源URL、账号和密码由启动脚本注入。固定MySQL镜像，初始化脚本只在空数据卷执行；应用用仅有DML权限的learner账号。构建失败、端口占用、数据库未就绪分别给出错误，不能把部署环境错误计为业务掌握不足。应用重启后计划和任务应仍然存在，登录会话根据数据库时限继续生效。'),
('从界面讲清数据流','配套前端登录alice，创建计划，分配任务，切换bob完成分配给他的任务，再切换eve尝试读取他人计划得到403。演示分页筛选、第二条错误导致整批回滚、管理员审计与注销失效。页面的动态数据用textContent输出，避免任务标题被当作HTML执行。最后说明users、plans、memberships、plan_tasks的关系和事务代理如何保证原子性。')],
['完整前端可登录、创建计划、筛选翻页、分配与完成任务、显示权限错误和审计','重新构建的JAR启动成功，应用重启后任务持久；会话注销后失效','提交可复现RUN.md与有效JUnit；按deploy.ps1在独立端口部署，环境错误单列'],
'& ./new-system/tooling/deploy-r7.ps1 -Action start -ProjectDirectory <绝对路径>\n浏览器 http://127.0.0.1:5196/\n-Action stop 保留数据库卷\n-Action status 核对健康',
('JAR重启后学习计划丢失，应首先核对什么？',['页面主题','浏览器字体','数据源是否仍指向持久数据库'],2),('解释事务边界应指出哪一项？',['Service public事务方法内的任务与审计写入','按钮圆角','前端数组长度'],0)),
]
chapters=[]
srcdir='src/main/java/dev/codesomething/lab/'
testdir='src/test/java/dev/codesomething/lab/'
pom=(root/'backend/src/main/resources/runner/boot/jdbc-pom.xml').read_text(encoding='utf-8')
run='''# 运行项目B\nJava21、Maven3.9、Docker与隔离MySQL。工程固定pom.xml，构建mvn package；环境变量SPRING_DATASOURCE_URL、SPRING_DATASOURCE_USERNAME、SPRING_DATASOURCE_PASSWORD由deploy-r7.ps1注入。打开http://127.0.0.1:5196。users与plans通过memberships形成多对多关系，任务外键约束分配者属于计划。PlanService.batch的public事务方法把任务与审计一起提交；RuntimeException向外抛出导致整体回滚。用mvn test验证API权限、回滚和注销；安装、端口与数据库连接错误单列环境问题。部署脚本start/stop/status保留独立数据卷。教学账号密码仅用于本机隔离练习。\n'''
allfiles={srcdir+p.name:p.read_text(encoding='utf-8') for p in source.glob('*.java') if p.name!='BusinessTest.java'}
allfiles.update({'pom.xml':pom,'RUN.md':run,testdir+'BusinessTest.java':(source/'BusinessTest.java').read_text(encoding='utf-8')})
def remove_method(code,name):
    match=re.search(r'public [^\n]*?\b'+name+r'\([^\n]*?\)\s*\{',code)
    if not match: raise ValueError(name)
    start=match.end();depth=1;position=start
    # Java templates have balanced braces inside string literals; all chosen methods obey this.
    while depth:
        if code[position]=='{':depth+=1
        if code[position]=='}':depth-=1
        position+=1
    return code[:start]+'\n        // TODO: implement this stage from the API contract\n        throw new Problem(501,"NOT_IMPLEMENTED","请完成本关");\n    '+code[position-1:]
for index,(stage,title,goal,concepts,requirements,example,q1,q2) in enumerate(lessons):
    starter={k:v for k,v in allfiles.items() if not k.startswith(testdir)}
    if index==0:starter[srcdir+'AuthService.java']=remove_method(starter[srcdir+'AuthService.java'],'login')
    if index==1:
        for name in ['requireMember','owner','admin']:starter[srcdir+'AuthService.java']=remove_method(starter[srcdir+'AuthService.java'],name)
    if index in [2,3,4]:starter[srcdir+'PlanService.java']=remove_method(starter[srcdir+'PlanService.java'],['create','tasks','batch'][index-2])
    if index==5:
        starter[srcdir+'RequestLog.java']='package dev.codesomething.lab;\n// TODO: implement request correlation and safe access logging\n'
        starter[srcdir+'ApiErrors.java']='package dev.codesomething.lab;\n// TODO: implement the documented JSON error contract\n'
    if index==6:
        starter[testdir+'BusinessTest.java']='package dev.codesomething.lab;\nimport org.junit.jupiter.api.Test;\n// TODO: use real HTTP requests to verify permissions, rollback and logout\npublic class BusinessTest { @Test void businessContract() { throw new AssertionError("请编写有效API测试"); } }\n'
    if index==7:starter={'pom.xml':pom,srcdir+'Application.java':allfiles[srcdir+'Application.java']}
    for kind,files in [('reference',allfiles),('starter',starter)]:
        for path,content in files.items():
            dest=target/stage/kind/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(content,encoding='utf-8')
    chapters.append(dict(stageId=stage,title=title,minutes=60,goal=goal,concepts=[dict(title=a,body=b) for a,b in concepts],task=goal,
        steps=['从本关骨架或自己的上一关工程开始，在IDEA实现需求；固定pom.xml。','用本地部署脚本准备隔离MySQL和运行环境，按API契约验证正常与失败路径。','网页配对或IDE插件保存快照，提交功能检查；环境错误排查后重试。','修复后完成正式理解题，记录帮助使用并解释表关系和事务边界。'],requirements=requirements,pitfall=concepts[-1][1],example=example,
        dependsOn=[] if index==0 else [lessons[index-1][0]],formalQuestions=[dict(id='apply',prompt=q1[0],options=q1[1]),dict(id='transfer',prompt=q2[0],options=q2[1])],formalAnswer=dict(apply=q1[2],transfer=q2[2])))
project=dict(schemaVersion=3,courseId='collaboration',courseVersion='1.0.0',status='published',title='学习计划与任务协作',subtitle='项目B · 八关完整业务与部署',description='从登录与对象权限到协作事务、有效集成测试和配套前端部署。每关约一小时，逐步减少骨架。',outcomes=['连接真实MySQL的多用户协作后端','可演示正常操作与权限失败的配套前端','API集成测试、运行说明和部署证据'],prerequisites=['项目A六关正式双结果；可提前预览与运行检查，正式完成须有先修证据。'],chapters=chapters,
    sources=[dict(title='Spring声明式事务与回滚规则',url='https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/rolling-back.html'),dict(title='OWASP密码存储指南',url='https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html')])
(target/'project.json').write_text(json.dumps(project,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for name in ['Application','AuthService','PlanService','BusinessController','Problem','ApiErrors','RequestLog']:
    output=resource/'mutation'/f'{name}.java';output.parent.mkdir(parents=True,exist_ok=True)
    content=(source/f'{name}.java').read_text(encoding='utf-8')
    if name=='AuthService':content=content.replace('if (!member(u,plan))','if (false)')
    output.write_text(content,encoding='utf-8')
print('Authored eight R7 stages, reference implementations, declining scaffolds, schema and formal questions.')
