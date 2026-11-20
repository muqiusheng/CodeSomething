/** Original project teaching, grounded in the user's local Tlias course and interface contract. */
export type TliasStep={title:string;file:string;why:string;action:string;expected:string;pitfall:string;sample?:string};
export type TliasChapter={id:string;title:string;goal:string;before:string;after:string;source:string;reading?:{file:string;page:number;label:string};steps:TliasStep[];checks:string[]};
const step=(title:string,file:string,why:string,action:string,expected:string,pitfall:string,sample?:string):TliasStep=>({title,file,why,action,expected,pitfall,sample});
export const tliasChapters:TliasChapter[]=[
 {id:'start',title:'创建同一份Tlias工程',goal:'从启动类开始，做出可响应的教务管理服务。',before:'已能独立完成项目A的数据库CRUD；本工程尚无业务类。',after:'后面所有章节都在tlias-learning中增加文件，保留本章启动与健康接口。',source:'03 Maven基础、04 Web基础；16/资料/05完整服务端代码中的pom.xml',steps:[
 step('明确最终作品','RUN.md','Tlias要管理部门、员工、班级和学员。先完成部门这条最短链路，再扩展关联数据，避免一开始复制所有业务。','新建tlias-learning目录。在RUN.md写下：管理员登录→维护部门→维护员工及工作经历→查看统计→维护班级学员。记录Java、Maven和数据库版本。','能指出第一个要实现的功能是GET /depts，而不是一次写完所有模块。','完整源码只用来对照卡点，默认工程只提供POM、启动类和端口配置。'),
 step('检查Maven配置','pom.xml','POM决定依赖与打包方式；启动类决定扫描包。资料源码使用Boot 3.2.10、Java17和MyBatis3.0.3，本课程先沿用材料版本便于对照。','阅读左侧最小POM并运行mvn -version；使用JDK17或21。先保留web与test依赖，数据库章再加MyBatis和MySQL驱动。在网页可先编写草稿，保存到本地目录后执行命令。','mvn test能完成依赖解析、编译与测试阶段；此时没有测试用例不代表功能已经通过。','此课有独立依赖，不能把POM换成平台Boot4的隔离判题模板。首次解析依赖需要网络。'),
 step('写第一个健康接口','src/main/java/dev/codesomething/tlias/HealthController.java','@RestController把返回值写入响应；@GetMapping把URL连接到方法。启动类的同包及子包会被扫描。','创建HealthController，添加@RestController；在health方法上添加@GetMapping("/health")，返回Map.of("status","UP")。启动mvn spring-boot:run。','访问http://127.0.0.1:8096/health得到包含status=UP的JSON。','404先看包路径与注解，连接被拒绝先看服务是否已启动、8096是否占用。'),
 step('留下可复现说明','RUN.md','运行说明把自己的工程与参考资料区分开，后续章节可以复用同一启动命令。','记录启动命令、端口、健康请求及实际响应；停止再启动服务验证。下一章继续使用相同目录，不导入完整服务端覆盖它。','可以只看自己的RUN.md重新启动，并在项目树找到亲手写的接口。','不要把资料目录中的数据库密码或云服务配置复制进工程。')],checks:['启动类与健康接口位于同一扫描包','8096返回真实UP响应','RUN.md包含自己的启动记录']},
 {id:'database',title:'给教务数据建模',goal:'在独立数据库中建立部门、员工与工作经历的关系。',before:'同一工程已有健康接口，还未连接数据库。',after:'数据库表和schema.sql保留；下一章添加Mapper读取部门。',source:'05 数据库、06 Java操作数据库；08员工管理；MySQL基础篇',reading:{file:'mysql-basic.pdf',page:61,label:'约束（61页），多表查询（69页）'},steps:[
 step('先从业务推字段','src/main/resources/schema.sql','部门是一组员工的归属；员工可以有多段工作经历。这分别对应一对多关系，不能把所有经历拼在员工表一个字符串里。','先为dept写id、name、create_time、update_time；为emp写id、username、name、gender、job、salary、entry_date、dept_id和时间字段。为emp_expr写id、emp_id、begin、end、company、job。根据接口文档逐个核对类型。','能画出dept.id→emp.dept_id、emp.id→emp_expr.emp_id两条关系。','SQL保留字字段使用反引号；日期用DATE，金额采用DECIMAL，不用浮点数。'),
 step('定义约束并造少量数据','src/main/resources/schema.sql','主键保证身份唯一；NOT NULL和UNIQUE分别保护必填与唯一性，不能只靠前端限制。','在你新建的tlias_learning库中执行自己的建表脚本。为dept插入两个部门，为emp准备不同部门、不同入职日期的三名虚构员工。username加唯一约束；先不创建登录密码字段。','重复用户名插入失败；部门列表能用SELECT读出两行。','只在自己的独立练习库执行，不把资料中的DROP/CREATE整库脚本指向平台学习库。'),
 step('连接MyBatis','pom.xml、src/main/resources/application.properties','MyBatis负责参数与SQL结果映射，数据库驱动负责通信；驼峰映射解决create_time与createTime的命名差异。','在POM追加mybatis-spring-boot-starter:3.0.3和mysql-connector-j（runtime）；配置spring.datasource.url、username、password，从TLIAS_DB_URL/TLIAS_DB_USER/TLIAS_DB_PASSWORD环境变量读取；设置mybatis.configuration.map-underscore-to-camel-case=true。','启动不再报驱动或连接配置错误；健康接口仍可响应。','凭据只放本机环境变量；SQL脚本由自己执行，避免每次启动清空或重复初始化。'),
 step('验证关联查询','notes/queries.sql','JOIN用于把员工的部门编号变成部门名称；LEFT JOIN可以保留尚未分配部门的员工。','先执行emp LEFT JOIN dept，显式列出e.id、e.name、d.name AS dept_name；再按dept_id做COUNT。观察没有员工的部门应如何显示。','能解释INNER JOIN与LEFT JOIN为何可能有不同行数。','COUNT(*)会把左连接的占位行计为1；统计真实员工应COUNT(e.id)。')],checks:['独立数据库三张表与主键已建好','连接信息由环境变量提供','至少一条关联查询有实际结果']},
 {id:'depts-read',title:'打通部门查询三层',goal:'从真实数据库返回/depts，建立第一条完整请求链。',before:'已有dept数据与MyBatis依赖，健康接口保留。',after:'本章形成Controller→Service→Mapper链路，下一章在原类中加入写入。',source:'07 后端Web实战（部门管理）/PPT；12/资料/02接口文档/离线',steps:[
 step('固定响应契约','src/main/java/dev/codesomething/tlias/Result.java','HTTP状态和业务code是两个层次。资料前端读取code、msg、data，字段随意更名会导致联调失败。','创建Result记录或普通类，字段int code、String msg、Object data；提供success(data)返回code=1、msg=success。先只封装自己的健康测试之外的业务接口。','GET /depts最终结构是{"code":1,"msg":"success","data":[...]}。','不要沿用项目A裸数组响应，或把code=1误当成HTTP状态码。'),
 step('先实现数据读取','src/main/java/dev/codesomething/tlias/Dept.java、DeptMapper.java','Mapper接口描述SQL；MyBatis创建实现。@Mapper使它成为可注入对象。','Dept声明id、name、createTime、updateTime并提供访问器；Mapper上添加@Mapper，写findAll，使用@Select查询四列并按update_time降序、id降序稳定排序。','数据库两行映射成两个Dept；时间字段不是null。','类未提供访问器会影响映射或JSON；没有驼峰配置时create_time无法按预期映射。', '@Select("select id, name, create_time, update_time from dept order by update_time desc, id desc")\nList<Dept> findAll();'),
 step('连接服务和控制器','src/main/java/dev/codesomething/tlias/DeptService.java、DeptController.java','Controller接HTTP，Service协调业务，Mapper访问数据库；构造器注入让依赖显式可见。','给DeptService加@Service并注入DeptMapper，实现findAll。Controller加@RestController和@GetMapping("/depts")，注入Service并返回Result.success(service.findAll())。','curl http://127.0.0.1:8096/depts返回两条真实部门。','不要new DeptService()绕过容器，也不要把SELECT直接塞进Controller。'),
 step('改变数据库核对数据流','notes/requests.http','只对照静态示例无法证明连到了自己的数据库。改变输入，观察真正链路。','在自己的库新增第三个部门，重新GET /depts；随后删除测试行再请求。将两次响应记录到requests.http旁的注释或RUN.md。','列表随数据库变化；健康接口和原两条数据保持可用。','空数组可能是连错库，先核对环境变量中的库名，不先修改Controller假造结果。')],checks:['部门响应包含code/msg/data','新增数据库行后接口结果同步变化','能沿Controller追到具体SQL']},
 {id:'depts-write',title:'完成部门增删改',goal:'在现有部门工程加入新增、回显、修改和删除。',before:'部门查询链路已经连通。',after:'保留部门全部操作，下一章员工列表复用相同分层与响应。',source:'07 部门管理；接口文档1.2—1.5',steps:[
 step('新增与时间字段','DeptController.java、DeptService.java、DeptMapper.java','新增由请求体传名称，id由数据库生成，创建/修改时间由服务统一填写。','实现POST /depts，@RequestBody接收name；Service检查去空白后非空且长度合理，设置两个时间；Mapper用#{name}等绑定参数，返回成功响应。','合法名称产生一条新行；空名称得到明确错误且不写入。','#{...}是绑定参数；不要使用${name}或拼接SQL。'),
 step('按编号查询与修改','DeptController.java、DeptMapper.java','编辑表单先回显再提交；更新必须通过id定位，不能漏掉WHERE。','实现GET /depts/{id}和PUT /depts（请求体含id/name）。未知id返回失败说明；修改只更新name、update_time，保留create_time。','改名后查询显示新名，createTime不变。','把@RequestParam和@PathVariable混用会导致400；按资料的URL逐项核对。'),
 step('删除前处理业务关系','DeptService.java、DeptMapper.java','仍有员工引用部门时直接删除会产生悬空关系。是否允许删除是业务规则，放在Service。','按资料实现DELETE /depts?id=编号。先count员工引用，非零则拒绝；零则按id删除。记录本课新增的关联保护规则。','空部门可删，有员工部门保留并返回明确原因。','不要通过关闭外键检查“修好”删除，也不要默默把全部员工删掉。'),
 step('从新增走完整个回归','notes/requests.http','CRUD应该连成真实操作流程。请求成功还要验证数据真的变化。','按新增→读取新id→改名→再次查询→删除→确认消失顺序执行；额外测空名与未知id。最后重测/depts列表和/health。','一轮流程可复现，失败请求不影响原数据。','新增可能改变排序，不能把列表首行当成固定id。')],checks:['四种部门操作都能复现','非法名称不落库','有员工的部门删除被阻止']},
 {id:'employees',title:'员工分页与条件查询',goal:'让员工列表支持姓名、性别、日期区间与分页。',before:'部门CRUD完整，emp已有自己的测试数据。',after:'保留分页查询，下一章新增员工及多段工作经历。',source:'08 员工管理：分页查询、条件查询；MySQL基础篇DQL',reading:{file:'mysql-basic.pdf',page:14,label:'SQL：DQL、排序与分页'},steps:[
 step('定义输入与输出','EmpQueryParam.java、PageResult.java','分页结果同时需要total和rows；total表示全部匹配数量，不是当前页行数。','定义page默认1、pageSize默认10、name、gender、begin、end。PageResult包含long total和List rows；明确页码正整数、pageSize上限100、起始日期不能晚于结束日期。','GET /emps不传分页参数时使用第一页，响应包含total与rows。','先拒绝非法分页再计算offset，避免负数偏移或无限量读取。'),
 step('先实现稳定分页','EmpController.java、EmpService.java、EmpMapper.java','offset=(page-1)*pageSize；分页必须有稳定排序，否则相邻页容易重复。','Controller使用@GetMapping("/emps")。Mapper先实现COUNT和ORDER BY update_time DESC,id DESC LIMIT #{pageSize} OFFSET #{offset}，Service计算offset后组装PageResult。','GET /emps?page=1&pageSize=2返回最多两行，total仍为全部员工数量。','本课先手写COUNT/LIMIT学清原理；不要同时叠加PageHelper造成重复分页。'),
 step('加入可选过滤','src/main/resources/mapper/EmpMapper.xml','动态SQL只在参数有值时添加条件；统计与列表必须使用完全相同的过滤规则。','在XML用<where>与<if>处理name模糊匹配、gender等值和entry_date范围；将公共条件提为<sql>复用到COUNT与SELECT。保留参数绑定。','改筛选条件时total与rows同时变化；空筛选等价于原列表。','使用#{name}配合concat构造LIKE，不用${name}；XML中的<需转义或CDATA。'),
 step('验证分页边界','notes/requests.http','测试要覆盖输入合法性和数据稀少情况。空页不是系统故障。','测第一页、第二页、超出末页、page=0、pageSize=1000、日期倒置及姓名含单引号。记录预期和实际，重测部门列表。','非法参数有原因，末页外rows为空且total不变；引号作为数据处理。','查询结果为空先核对筛选，不通过删除WHERE让所有测试看似通过。')],checks:['total与筛选一致','连续两页在固定数据下不重复','非法页码和日期有明确错误']},
 {id:'employee-transaction',title:'员工与经历一起保存',goal:'在一个事务中保存员工和多段工作经历。',before:'已有可筛选的员工列表。',after:'新增、回显、修改和删除都维持员工与经历的一致性。',source:'08员工管理：新增；09员工管理：事务；EmpLogService素材',reading:{file:'mysql-basic.pdf',page:88,label:'事务与ACID'},steps:[
 step('接收聚合数据','Emp.java、EmpExpr.java、EmpController.java','一个员工请求包含exprList，它是从属记录列表，不能把员工id交给前端随意指定。','实现POST /emps，解析员工字段及exprList；Service校验用户名、部门存在、经历起止日期。禁止把password/token等内部字段直接返回。','合法员工数据进入服务层，错误经历在写入前被拒绝。','嵌套列表同样要校验；只验证外层非空不能保护经历。'),
 step('先获得主键再写经历','EmpMapper.java、EmpExprMapper.java','经历表的emp_id必须指向新员工，数据库生成的id需要回填到对象。','员工INSERT使用@Options(useGeneratedKeys=true,keyProperty="id")；将回填id赋给每条经历，再批量插入emp_expr。','员工与经历的emp_id一致，可从数据库联查。','未取生成id会插入null/0关联；不要用SELECT MAX(id)推测自己的主键。'),
 step('建立事务边界','EmpService.java','事务包住整个业务操作；Spring代理通常只拦截从外部进入的调用，同类自调用可能绕开事务。','在public保存方法上加@Transactional(rollbackFor=Exception.class)，由Controller调用该Service；先写员工，再写经历。不要catch异常后当成功返回。','人为让第二条经历写入失败时，员工和第一条经历都不留下。','异常被吞掉或方法未经过代理会导致部分提交。先做失败实验再认为事务生效。'),
 step('修改删除仍然一致','EmpService.java、notes/requests.http','更新员工与替换经历是一笔业务；删除员工与清理从属记录也必须一起完成。','实现GET /emps/{id}回显含经历；PUT /emps在事务内更新员工、按emp_id删旧经历、写新经历；DELETE /emps?ids=1,2按文档批量删除并清理经历。验证任一步失败整批回滚。','回显、更新、删除与列表形成闭环，失败后原数据完整。','删除经历必须WHERE emp_id IN (...)，不能清空整张表。')],checks:['保存两段经历后关联正确','人为失败能证明整笔回滚','批量删除不留下孤立经历']},
 {id:'errors-upload',title:'统一错误与文件上传',goal:'把业务失败说清楚，并实现不依赖付费云服务的本地上传练习。',before:'员工CRUD与事务已经完整。',after:'保留上传和统一错误处理，登录章再限制访问。',source:'09员工管理：文件上传；10员工管理：异常与配置',steps:[
 step('集中处理错误','GlobalExceptionHandler.java','Controller不应该重复catch；统一异常处理让前端在相同位置读取错误原因。','添加@RestControllerAdvice，分别处理参数错误、业务异常和未预期异常；业务响应沿用code/msg/data，服务端记录完整异常，客户端只收到必要原因。','重复用户名、缺失参数、未知员工都得到可识别反馈。','不要向前端返回SQL、凭据或完整堆栈；HTTP状态和业务code分别记录。'),
 step('接收并限制上传','UploadController.java、application.properties','文件名与类型来自不可信输入；不能用用户给的路径直接决定磁盘写入位置。','POST /upload接收MultipartFile；先限制大小和允许的图片格式，再以服务端生成UUID命名，保存到专用uploads目录。记录本课采用本地存储；资料OSS作为自愿扩展。','合法图片保存并返回data中的访问地址，超限和非图片拒绝。','校验内容而非仅看扩展名；拒绝../和绝对路径，不执行上传文件。'),
 step('打通读取与员工字段','WebConfig.java、EmpService.java','上传成功与能访问图片是两件事；员工image字段保存地址而不是整个文件。','只为uploads目录设置受控静态资源映射或读取接口；在员工新增/修改中存入返回地址；验证重启后文件和地址仍存在。','可读取自己上传的图片，员工详情包含该地址。','不要映射整个磁盘；删除员工是否同时删图需要明确策略，先保留文件避免误删共享资源。'),
 step('做失败请求回归','notes/requests.http','统一错误与上传都容易影响既有接口，需要带着老功能回归。','测试空文件、伪造后缀、超限、合法图片和不存在文件；随后执行部门查询、员工新增和失败事务。','错误可读，原业务仍工作，上传不需要云账号或付费。','资料中的OSS密钥不进入网页或工程；只有主动选择云存储时再配置自己的环境变量。')],checks:['错误响应格式一致','合法图片可读取且重启保留','非法文件不落盘']},
 {id:'reports',title:'让数据变成统计报表',goal:'从现有员工数据计算职位和性别统计。',before:'员工数据可维护，尚未实现统计接口。',after:'后面前端图表使用本章真实聚合结果。',source:'10员工管理：报表统计；接口文档/report',steps:[
 step('先在SQL验证分组','notes/reports.sql','统计是对真实记录聚合；图表标题和分类必须来自约定，不能手填一组漂亮数字。','按job和gender分别GROUP BY，COUNT(*)得到人数；手工加总与员工总人数对照。','每组计数之和等于员工数量，NULL分类有明确处理。','WHERE是聚合前筛选，HAVING是分组后筛选，不能互换。'),
 step('映射职位统计','ReportMapper.java、ReportService.java','资料职位图使用jobList与dataList，对应位置要一一匹配。','实现GET /report/empJobData；查询分组后把职位码映射为标签，按同一循环生成两个列表。遇到未知码明确显示未知。','jobList和dataList长度相同，每个标签人数正确。','不能分别排序标签和数据，否则图表对应错误。'),
 step('映射性别统计','ReportController.java、ReportService.java','饼图需要名称与数量成对返回，不应让前端猜数字码含义。','实现GET /report/empGenderData，按接口文档返回name/value对象列表；空数据返回空列表或约定零值。','每项有可读名称与数字value，空库时接口仍成功。','JSON中的数字不能变成带单位字符串，单位由展示层负责。'),
 step('用一次业务变化验算','notes/requests.http','改变一条员工记录比只看图更能证明聚合正确。','新增一名指定职位员工，核对对应统计增加1；删除后恢复。记录实际变化，保留之前CRUD回归。','报表数值跟随数据库变化。','截图只是表现，测试记录仍须包含真实请求和响应。')],checks:['两种报表与总人数核对一致','未知分类有处理','新增删除反映到统计']},
 {id:'login',title:'登录认证与访问拦截',goal:'把登录结果连接到受保护的业务接口。',before:'部门、员工和报表已能运行，尚无认证。',after:'认证继续保护后面的日志与班级学员操作。',source:'12登录认证：会话、JWT、Filter/Interceptor；本课密码存储另作安全改编',steps:[
 step('建立登录输入与账户','LoginRequest.java、AuthService.java','资料的JWT是令牌机制；密码验证与令牌签发是两件事。教学示例的明文口令不能直接作为实际账号方案。','为练习账户新增password_hash，使用PasswordEncoder（可单独引入spring-security-crypto）生成带盐哈希；POST /login只接username/password，查询用户后使用matches验证。','正确密码成功，错误密码给出统一失败原因，响应不带哈希。','不要把哈希函数结果直接与新生成哈希比较；不要在请求日志中记录口令。'),
 step('把令牌生命周期写明','TokenService.java、RUN.md','JWT含签名与过期时间，解析必须验签；删除浏览器令牌不会让被复制的旧令牌自动失效。','先用已选库实现签发/校验，密钥由TLIAS_JWT_SECRET环境变量读取；payload只放id、username和过期信息。按材料契约返回id/name/username/token。RUN.md明确有效期和注销策略。','篡改或过期令牌校验失败；普通JWT注销后旧副本仍有效直到过期，若要立即撤销需服务端撤销表或会话。','此新项目采用资料JWT，与平台原项目B可撤销会话不同，不能宣称两者撤销能力相同。'),
 step('拦截业务访问','TokenInterceptor.java、WebConfig.java','认证确认是谁，授权决定能做什么；第一步先统一保护接口入口。','注册拦截器，登录和必要静态资源放行；其他接口读取文档约定的token请求头，验证并传递当前用户；结束请求时清理ThreadLocal。','无令牌、坏令牌被拦截，有效令牌能查部门。','放行路径要精确；只在前端隐藏按钮不能保护后端。此时尚未实现角色/对象授权。'),
 step('验证三种失败情况','notes/requests.http','登录“看起来成功”不足以证明拦截完整。必须直接请求后端。','分别测试无令牌、过期/篡改令牌、有效令牌；随后在已登录请求中走一次员工新增与事务回归。记录期望code和实际HTTP状态。','失败不会进入写入逻辑，合法请求仍能走完整业务链。','若新加Spring Security全套starter，默认过滤链可能改变现有契约，按需求显式配置。')],checks:['密码不以明文存储或输出','坏令牌不能访问业务接口','JWT有效期与撤销边界有说明']},
 {id:'logs',title:'用AOP记录操作',goal:'在不重复污染业务方法的前提下记录操作日志。',before:'登录与访问拦截已经完成。',after:'新增业务可复用@Log，日志查询使用分页。',source:'13 AOP：注解、环绕通知、操作日志、ThreadLocal；日志表.sql',steps:[
 step('定义日志需求','OperateLog.java、notes/log-schema.sql','操作日志回答谁、何时、做了什么、耗时多久；它与调试堆栈用途不同。','查看配套日志表，建立自己的operate_log；决定记录operator、operateTime、className、methodName、costTime和脱敏摘要。','一条日志可以对应一次真实业务操作。','不把口令、JWT、完整上传文件或个人敏感字段序列化进日志。'),
 step('写注解与环绕通知','Log.java、OperationLogAspect.java','环绕通知控制目标方法前后，proceed必须执行且返回值要原样传回。','引入AOP starter；自定义运行时方法注解@Log。切面用@Around匹配注解，计时、proceed并返回result；异常继续抛出，不伪装成功。','加注解的部门修改能完成，返回结构仍与原来一致。','切点范围过大会记录登录凭据或递归拦截日志写入；先只标少量业务方法。'),
 step('关联当前操作人','CurrentHolder.java、OperationLogAspect.java','线程池会复用线程，请求结束不清理ThreadLocal可能串用户。','从认证设置的上下文取得用户id；请求结束在afterCompletion或finally中remove。设计日志失败是否影响主业务并写进RUN.md。','不同账户操作日志归属正确，匿名请求不继承上一用户。','日志事务传播要围绕业务要求选择；不要机械复制REQUIRES_NEW认为总是更好。'),
 step('查日志与解释边界','OperateLogMapper.java、LogController.java','日志也需要分页和访问控制；普通用户不该随意读取所有操作记录。','实现文档中的GET /log/page，复用分页边界；限定可访问的管理身份。测试成功与异常操作后实际日志行为，并保留对业务失败的解释。','能从一次操作找到对应日志，日志不可泄露敏感字段。','单纯“存在日志”不证明业务已经提交，以事务和实际数据库结果核对。')],checks:['切面没有改变业务返回值','日志包含正确操作人与耗时','敏感字段脱敏且上下文清理']},
 {id:'students',title:'班级与学员独立扩展',goal:'在同一Tlias工程内独立加入班级、学员和违纪处理。',before:'部门、员工、登录和日志可运行。',after:'工程成为可管理完整教务数据的后端，为前端联调做准备。',source:'11项目实战/接口文档、表结构.sql、Clazz.java、Student.java',steps:[
 step('从接口推设计','notes/design.md、notes/class-student.sql','这章减少逐行提示，复用已掌握的分层、分页与事务，不更换工程。','阅读班级与学员表结构及接口文档；列出clazz的master_id、student的clazz_id关系。写GET/POST/PUT/DELETE /clazzs与/students所需参数、错误和角色。','设计能说明员工教师、班级、学员三者的关系。','class是语言关键字，资料使用Clazz命名；不要悄悄把接口改成/classes。'),
 step('先班级后学员','ClazzController.java、ClazzService.java、ClazzMapper.java','先实现被引用资源，再实现引用者，能逐步运行验证。','亲手实现班级分页、回显和CRUD；班级存在学员时拒绝删除。然后实现学员列表、条件、分页及CRUD，查询返回班级名称。','每一步都可通过真实请求检查，不需要预先填满所有类。','保留员工接口和已有表；只新增本章必要结构。'),
 step('实现违纪更新','StudentService.java、StudentMapper.java','违纪次数与扣分需要一起变化，丢失更新会导致数据不一致。','按文档实现PUT /students/violation/{id}/{score}；验证score范围，SQL原子累加次数与分数，受影响行数为0时返回不存在。','连续两次违纪更新累计正确，非法分数不修改。','先查再覆盖写回在并发下可能丢失更新，使用原子SQL或合适锁。'),
 step('提交自己的讲解与回归','RUN.md、src/test/java/dev/codesomething/tlias/BusinessTest.java','独立扩展的证据来自自己实现、测试和解释，而非读过参考源码。','为班级删除保护、未知学员、违纪边界写自动测试；回归部门、员工、认证。用自己的话说明一条学员更新如何到达数据库。','有可重跑测试和自己的数据流讲解；人工记录仍与平台自动通过分开。','只启动Spring上下文的空测试不能证明业务正确。')],checks:['班级学员复用原工程','删除保护与违纪边界有测试','能不看源码讲清新增链路']},
 {id:'frontend',title:'Vue前端与真实接口联调',goal:'让用户通过页面完成后端操作。',before:'后端业务完整；前端基础可按需补学，不改变Java后端主目标。',after:'同一项目目录增加web子目录，后端server源码继续保留。',source:'01 HTML/CSS、02 JS/Vue/Ajax、15 Vue工程化、16—18 Tlias案例',steps:[
 step('先补当前页面需要的基础','web/src/views/DeptView.vue','页面由状态驱动；v-model收集输入，事件触发请求，列表来自接口数据。','先用一个部门页面学习Vue响应式、v-for、v-model与axios。前端放web目录，后端仍在原工程；使用自己选定的Vite/Vue版本并保留锁文件。','页面能显示来自/depts的实际名称，空列表有提示。','不用先学完整CSS体系才能联调，也不要把资料中完整前端当作已完成个人作品。'),
 step('统一请求和令牌','web/src/utils/request.js、web/vite.config.js','浏览器跨域与服务端端口是不同问题。开发代理和上线反向代理应保持统一的API前缀。','开发时用/api代理到8096并去掉前缀；请求拦截器附带token；响应拦截器识别code、网络错误和未登录，显示原因。','登录后能查询部门；断开后端时显示网络错误而不是空数据。','不要通过关闭浏览器安全机制解决CORS；不要把数据库或JWT密钥写进前端。'),
 step('连接列表与表单','web/src/views/DeptView.vue、EmpView.vue','提交中的禁用、校验错误与成功后刷新决定功能是否可用。','实现部门新增编辑删除、员工分页筛选；保存中禁用重复提交；失败保留输入；成功后重新读取列表；删除前提示具体对象。','页面操作与数据库变化一致，错误后可以修正重试。','不能只改页面数组而不调用API；翻页时同步筛选条件，筛选变化回第一页。'),
 step('沿真实业务走一遍','RUN.md','联调以一条完整流程检验前后端协议，而不以截图数量验收。','从登录→新增部门→新增员工和经历→筛选→编辑→查看统计→删除测试数据。记录网络面板的请求头、请求体和code/msg/data。','每个页面动作都对应后端操作，刷新后数据仍在。','资料上传地址、代理端口和token请求头需要与自己的工程一致。')],checks:['页面数据来自真实后端','失败可修正重试','刷新后业务数据保留']},
 {id:'quality',title:'测试、索引与工程整理',goal:'用失败场景测试与执行计划改善已有工程。',before:'前后端能走完业务流程。',after:'测试与数据库迁移脚本进入项目，部署前能重复验证。',source:'03单元测试、14 Maven高级；MySQL进阶篇索引与SQL优化',reading:{file:'mysql-advanced.pdf',page:8,label:'索引（8页），SQL优化（47页），锁（90页）'},steps:[
 step('为关键行为补回归','src/test/java/dev/codesomething/tlias/BusinessTest.java','测试描述外部可观察行为，尤其是失败后数据库不变和越权被拒绝。','在独立测试数据库编写登录失败、分页边界、部门删除保护、员工经历回滚、班级关联保护的测试。明确每例的前置数据与清理范围。','mvn test能重复执行，失败断言能指出业务错误。','测试不能连接自己的日常数据；不能只断言HTTP200忽略code和实际行数。'),
 step('先看计划再建索引','notes/indexes.sql','索引提升某些读取同时增加写入成本；小数据表全表扫描可能合理。','对实际员工条件查询EXPLAIN，记录key、type、rows；根据常用等值/排序条件设计候选索引，新增后比较计划与足够数据下的耗时。','留下前后计划及数据规模，能说明是否值得保留索引。','不编造性能提升百分比；姓名前置通配LIKE通常难以有效使用普通B树索引。'),
 step('检查事务与并发','EmpService.java、StudentMapper.java','锁和隔离级别解释并发行为，先围绕真实更新设计实验，不要求先背全部引擎细节。','用两个连接观察未提交写入和同一学员原子累加；设置合理超时并回滚测试事务。记录等待和提交后的值。','能区分等待、死锁与业务校验失败，最终值符合预期。','不要在日常库用大范围UPDATE制造锁实验，使用独立测试数据。'),
 step('让结构服务维护','RUN.md、pom.xml','Maven多模块是规模需求，不是项目完整性的硬指标。先让单体可测试、可打包、配置清楚。','删除未用依赖，整理Controller/Service/Mapper包和配置说明；运行mvn clean test package，记录产物名称与测试结果。','一个JAR可以启动，配置不依赖IDE隐式环境。','本章不要求搭建Nexus私服；资料中的Maven高级和自动配置原理留作按需拓展。')],checks:['关键失败测试可重复','执行计划有前后记录','JAR可独立启动']},
 {id:'deploy',title:'Docker部署与完整交付',goal:'把自己的前后端和数据库组成可重启的作品。',before:'业务、测试和打包已经完成。',after:'保留源码、迁移、测试、运行说明与自己的演示证据，进入作品C独立设计。',source:'19 Linux、20 Docker：Dockerfile、Compose、Nginx；MySQL运维篇作为选学',reading:{file:'mysql-operations.pdf',page:1,label:'日志与故障定位；复制、分库分表、读写分离为选学'},steps:[
 step('定义部署拓扑','deploy/compose.yml、deploy/nginx.conf','浏览器访问Nginx，Nginx转发API到应用，应用通过服务名连接MySQL；容器内localhost指向自身。','在原项目新增deploy目录，列web/api/db三个服务。只给web映射外部端口；数据库数据使用命名卷，连接地址使用db服务名；密钥从本机环境传入。','能画出浏览器→web→api→db数据流。','不照搬资料弱口令和/usr/local绝对挂载路径；应用连接db:3306而非127.0.0.1。'),
 step('构建自己的镜像','Dockerfile、deploy/compose.yml','镜像包含应用，数据卷保存可变数据；容器被替换后数据库不应丢失。','为自己打包的JAR编写与Java版本一致的Dockerfile；配置数据库healthcheck和应用就绪重试。前端打包到Nginx目录，/api反向代理并保持开发时路径契约。','本机可通过统一入口打开页面与API。','depends_on仅顺序启动不保证数据库可用；初始SQL仅在空数据卷首次初始化。'),
 step('验证重启和故障','RUN.md','上线前必须验证真实持久与可诊断性，不能只看容器状态running。','新增一条数据，重启应用再读取；重建应用容器再读；检查数据库卷保留。模拟错误数据库配置并通过应用日志定位，随后恢复。','重启后数据在，错误原因可定位，恢复后业务正常。','不要执行down -v来模拟常规重启，它会删除命名卷。'),
 step('展示并解释完整作品','RUN.md、notes/demo.md','作品完成包含功能、重现步骤和技术取舍。这里的人工演示是新项目证据，不自动写入原项目B能力记录。','录下或写出一条完整业务流程、五个关键失败测试、数据库关系、认证边界与部署步骤。任选预约/库存等新题材进入作品C自行设计。','他人按说明可复现你的Tlias，自己能讲清最难的一条链路。','MySQL主从、分库分表与读写分离暂不强制；有真实容量和运维需求再选学。')],checks:['统一入口可用','重启后数据保留','有测试结果与完整运行说明']},
];

export const tliasStarter:Record<string,string>={
 'pom.xml':`<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>3.2.10</version><relativePath/></parent>
  <groupId>dev.codesomething</groupId><artifactId>tlias-learning</artifactId><version>0.1.0</version>
  <properties><java.version>17</java.version></properties>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency>
  </dependencies>
  <build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build>
</project>
`,
 'src/main/java/dev/codesomething/tlias/Application.java':`package dev.codesomething.tlias;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
`,
 'src/main/resources/application.properties':'server.port=8096\n',
 'RUN.md':'# 我的Tlias学习工程\n\n在这里记录自己的启动命令、实际请求和测试结果。\n',
};
export function validTliasPath(path:string){return path.length<=200&&!path.split('/').some(part=>part==='.'||part==='..')&&/^(?:pom\.xml|Dockerfile|RUN\.md|(?:src\/(?:main|test)\/[A-Za-z0-9_./-]+|web\/[A-Za-z0-9_./-]+|notes\/[A-Za-z0-9_./-]+|deploy\/[A-Za-z0-9_./-]+)\.(?:java|xml|properties|yml|yaml|sql|md|http|conf|vue|js|ts|json|html|css))$/.test(path)&&!path.includes('//')}
export const tliasStorageKey='cs-tlias-project-v1';
export function parseTliasDraft(raw:string|null):Record<string,string>{
 if(!raw)return {...tliasStarter};
 const value:unknown=JSON.parse(raw);
 if(!value||typeof value!=='object'||Array.isArray(value)||!Object.entries(value).length||Object.entries(value).some(([p,s])=>!validTliasPath(p)||typeof s!=='string'))throw new Error('草稿格式无法识别，原数据已保留。');
 return value as Record<string,string>;
}
