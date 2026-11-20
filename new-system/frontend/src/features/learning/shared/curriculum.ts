/** Original project-specific lessons. Published checkpoints and learner code keep their identity. */
export type LessonUnit={id:string;title:string;file:string;instruction:string;expected:string;sample?:string};
export type ChapterPlan={title:string;before:string;after:string;lessons:LessonUnit[]};
type Unit=[title:string,instruction:string,expected:string,sample?:string];
function chapter(title:string,file:string,before:string,after:string,units:Unit[]):ChapterPlan{return {title,before,after,lessons:units.map(([title,instruction,expected,sample],i)=>({id:'lesson-'+(i+1),title,file,instruction,expected,sample}))}}
const http:Record<string,ChapterPlan>={
 workspace:chapter('创建任务接口','TaskServer.java','只有main、端口与服务启动代码。','写出的第一个响应会在后续请求、状态和JSON章节持续完善。',[
 ['认识工程入口','找到main和server.start()。main只在启动时执行；请求到来后执行的是处理器。先不要改端口。','能分别指出启动入口与待添加的请求入口。'],
 ['注册请求路径','在start之前写server.createContext，路径为/api/tasks/，第二个参数是接收exchange的lambda。先只写空的花括号。','处理器与main在同一个类里，花括号配对。','server.createContext("/api/tasks/", exchange -> {\n    // 在这里处理一次请求\n});'],
 ['准备第一条数据','在处理器内定义String body，用Java文本块描述id、title、completed三个字段。id=1，title为学习 HTTP，completed=false。先区分Java字符串和其中的JSON。','body是字符串；字符串内部的id是数字，completed是布尔值。'],
 ['把文字变成字节','调用body.getBytes(StandardCharsets.UTF_8)保存为bytes。中文不一定一个字符一个字节，因此长度使用bytes.length。','准备好了按UTF-8发送的byte[]。','byte[] bytes = body.getBytes(StandardCharsets.UTF_8);'],
 ['发送并关闭响应','给响应头设置Content-Type为application/json; charset=utf-8，再发送200和字节数。用try-with-resources获取输出流并write(bytes)。','运行并检查后，两次探针请求都收到响应；后章再细分不同编号。','try (var output = exchange.getResponseBody()) {\n    output.write(bytes);\n}'],
 ]),
 request:chapter('让接口识别资源','TaskServer.java的createContext处理器','已有一个可以返回任务数据的处理器。','保留同一个处理器，下一章补上每个分支的状态码。',[
 ['读出本次请求','在处理器第一行保存exchange.getRequestMethod()和getRequestURI().getPath()。方法和路径是两件事，不用完整URL比较路径。','能在代码中分别找到GET和/api/tasks/1的来源。'],
 ['识别1号任务','在已有body赋值外加if(path.equals("/api/tasks/1"))，只在该分支保留任务数据。equals比较字符串内容。','1号路径仍返回原来的任务对象。','String path = exchange.getRequestURI().getPath();'],
 ['处理其他编号','else分支给body赋包含非空message的JSON。把发送字节的公共部分放在if/else之后，避免发送两次。','2号路径得到错误说明，而不是1号数据。'],
 ['改变输入再核对','运行同一个工程，比较结果中的1号与2号请求。先保持JSON字段不变，下一章再让未找到返回404。','两次请求走了不同分支，原任务功能仍在。'],
 ]),
 response:chapter('用状态码表达结果','TaskServer.java的路径分支和发送响应位置','能区分1号任务和未知编号，但状态码可能相同。','下一章只修改JSON字段类型，保留200与404。',[
 ['先列两条接口约定','写下已存在资源应该成功、未知资源应该未找到。状态码描述处理结果，message解释原因，二者不能相互替代。','1号预期200，2号预期404。'],
 ['为分支准备状态','在if前声明int status，成功分支赋200，else赋404。每条可能路径都必须给status和body赋值。','Java编译器不再报告变量可能未初始化。'],
 ['把状态传给发送方法','将sendResponseHeaders中的固定数字换为status。getResponseHeaders().set设置JSON内容类型，在发送头之前执行。','状态来自当前分支，正文继续使用当前body。','exchange.sendResponseHeaders(status, bytes.length);'],
 ['做一次错误对照','暂时把404改为200，预测未知编号结果，再还原为404并运行。烟测收到响应不等于完整契约通过，完整检查章会核对状态。','能说明为什么HTTP可响应与业务正确是两种检查。'],
 ]),
 json:chapter('定义任务的数据格式','TaskServer.java的body','接口已有成功/失败分支及状态码。','固定数据约定后进入运行与排错，继续同一份源码。',[
 ['给三个字段定类型','在任务响应上标出id:number、title:string、completed:boolean。双引号会把false变成字符串，前端不能按布尔值使用它。','知道未完成是false，不是"false"。'],
 ['亲手写任务JSON','只修改已有成功分支的body，保留id=1、title=学习 HTTP。检查JSON双引号、冒号和逗号，最后一个字段后不加逗号。','JSON对象包含三个字段且类型符合约定。'],
 ['保留错误数据结构','未知资源仍返回含message的对象。不要因为整理任务数据而删除else或把错误对象当任务返回。','成功对象与错误对象各有用途。'],
 ['做一次类型实验','先预测给false加引号后前端会收到什么，再还原并运行。完整检查章将逐字段验证，烟测只证明接口能回答。','能从原始JSON中识别字符串、数字和布尔值。'],
 ]),
 'run-server':chapter('把自己写的接口跑起来','TaskServer.java','前四章已经在同一个文件中加入路径、分支、状态和JSON。','本章验证能编译、能响应；完整业务契约在后续检查章验证。',[
 ['确认运行的是你的源码','先查看右侧文件，找到createContext、body、sendResponseHeaders和输出流。若沿用旧草稿，直接从现有代码继续，不重置。','你能指出哪几行产生当前接口响应。'],
 ['保存这次代码','在IDE改一行注释并保存所有文件，回到网站重新读取本地文件、保存快照。保存不会自动启动Java。','网站显示本次读取的文件范围与快照摘要。'],
 ['执行编译和启动','在网页连接自己的工程后，点击“提交验证”。先观察排队/运行状态；编译失败先看文件行号，连接失败再看是否注册路径与发送响应。','报告区展示本次实际编译、请求和响应。'],
 ['体验你做出的接口','在“我的接口作品”中切换1号与2号请求，查看实际JSON和任务卡片。比较标题、完成状态和未知资源说明。','知道这个Java程序已经能给网页返回任务数据。'],
 ['改一点，再运行一次','在body里临时改标题，重新运行，观察作品卡变化；看完恢复学习 HTTP并再运行。旧报告只能展示上次快照。','亲眼看到网页结果随你编写的Java改变。'],
 ['留下编码记录','本章烟测通过即可完成本关编码。下一章沿自己的代码追踪处理过程，选择题可按需补充。','继续学习入口可用，源文件仍是这一份。'],
 ]),
 trace:chapter('沿自己的代码追踪请求','TaskServer.java','接口已经可以编译和响应。','恢复约定数据后，在完整检查章核对所有分支。',[
 ['预测处理顺序','不运行，先从main、createContext、path、if、body到write按执行时机排序。createContext注册处理器，不代表立刻收到请求。','能区分一次启动与每次请求。'],
 ['加入观察点','在处理器里打印path与status。日志不要打印密码、令牌；当前任务没有这些敏感字段。','每次请求对应一条自己的观察日志。','System.out.println(path + " -> " + status);'],
 ['从日志回到代码','运行后展开编译与运行日志，对照1号和2号请求，找到status在哪个分支赋值。两条日志不等于两次服务启动。','能用运行证据解释控制流。'],
 ['练习一次定位','设想未知编号也显示任务标题，先检查path判断和else赋值，不先改输出流。保留任务约定进入完整检查。','知道数据错误应沿赋值链定位。'],
 ]),
 'fix-response':chapter('完成任务接口契约','TaskServer.java','已有可响应的接口和自己的追踪日志。','保留任务资源，下一章在同工程扩展笔记资源。',[
 ['从成功路径开始','核对1号任务status=200，id为数字1，title为学习 HTTP，completed为布尔false。按字段逐项查，不一次重写整份文件。','1号请求的状态和三个字段各有明确依据。'],
 ['再验证失败路径','2号及其他未知路径使用404和非空message。发送响应的公共代码必须使用分支选出的status。','错误资源不会伪装为成功任务。'],
 ['检查编码和响应头','设置application/json并用UTF-8计算实际字节长度。头、状态、JSON正文分别检查，避免只看页面有文字就算成功。','中文标题无乱码且JSON能被解析。'],
 ['逐条修正报告','运行并展开失败断言；一次修一个问题再运行。代码变化后先前的通过结果会变旧。','所有当前契约断言通过，并能指出修复位置。'],
 ['小迁移预演','在纸上设计一个notes资源，列出它与tasks不同的字段。先保留当前任务代码，下一章添加路由而非覆盖任务处理器。','准备好笔记id/title/archived字段及404约定。'],
 ]),
 transfer:chapter('在任务工程扩展笔记','TaskServer.java新增/api/notes/处理器','任务接口已通过完整检查。','两个资源留在同一工程，为Boot项目中的Controller做准备。',[
 ['保留已有任务处理器','找到现有/api/tasks/注册位置。在同一个server上再注册/api/notes/，不要删除tasks或创建另一套main。','工程内同时存在两个资源入口。'],
 ['写笔记的成功分支','笔记1返回数字id=1、字符串title=第一条笔记、布尔archived=false。借鉴发送流程，字段含义由笔记决定。','tasks的completed与notes的archived没有混用。'],
 ['补笔记错误分支','未知笔记返回404和非空message；各处理器只关闭自己的输出流，不能关闭整个服务。','笔记2得到未找到信息。'],
 ['做完整回看','运行迁移检查并核对两类资源代码仍在。回到任务章只换检查目标，不回滚现在的工程。','新增功能与前面成果保存在同一份源码。'],
 ]),
};
const sql:Record<string,ChapterPlan>={
 'db-connect':chapter('建立数据库工程','01-db-connect.sql','工程先只有SQL文件导航，练习库由平台启动。','后续建表、查询和写入分别成为同目录下的脚本。',[
 ['认识库和表','数据库是表的容器，表才保存行。先点击启动教学环境；暂时没有自己的tasks表是正常状态。','环境状态可用；不把网页连接成功当成已建表。'],
 ['写第一条查询','亲手输入SELECT 1 AS connected;，通过试运行看一行常量。不需要FROM，因为这次不是读表。','返回字段名connected，值为1。','SELECT 1 AS connected;'],
 ['识别当前数据库','在同一SELECT中加入DATABASE() AS current_database。正式检查换临时库，不要把库名写死到答案里。','结果同时说明查询可用及当前库名。'],
 ['保存并正式检查','试运行用于探索，不生成章节完成。当前脚本保存在工程，点击提交正式检查核对本章输出，再完成编码。','脚本可回看，下一章新增建表脚本。'],
 ]),
 'db-model':chapter('为任务建立表结构','02-db-model.sql','已确认可连接数据库；还没有自己设计的任务表。','建表脚本保留，后续查询脚本使用相同字段。',[
 ['把任务翻译成字段','任务编号、标题、完成状态分别用id、title、completed。先决定编号主键、标题必填和完成默认值。','能解释每个字段存什么及是否允许为空。'],
 ['创建主键和标题','写CREATE TABLE tasks，id INT PRIMARY KEY，title VARCHAR(100) NOT NULL。每列之间有逗号。','同一编号不能重复；标题不能为NULL。','CREATE TABLE tasks (\n    id INT PRIMARY KEY,\n    title VARCHAR(100) NOT NULL\n    -- 继续补完成状态\n);'],
 ['补布尔默认值','加入completed BOOLEAN NOT NULL DEFAULT 0。MySQL用0/1表示布尔；默认值只影响未提供该列的新行。','省略completed写入时默认未完成。'],
 ['观察表再检查','用SHOW COLUMNS FROM tasks;试查结构。表已存在时不要反复执行建表；正式检查使用独立空库，不会删除练习表。','正式报告展示实际表结构，已写脚本继续保留。'],
 ]),
 'sql-read':chapter('从表里读取任务','03-sql-read.sql','已有任务表；正式检查会准备约定数据。','查询脚本成为后续写入前核对影响范围的工具。',[
 ['先只取需要的列','写SELECT id,title FROM tasks;。字段列表决定结果包含什么，FROM决定数据从哪张表来。','返回编号和标题，不额外返回completed。'],
 ['加入未完成条件','用WHERE completed=0过滤。先预测哪几行保留，再试运行；条件不是给所有行改值。','结果不再包含已完成任务。'],
 ['让结果稳定','使用ORDER BY id ASC。没有排序时数据库不承诺返回顺序，不依赖某次碰巧的排列。','编号按升序显示。'],
 ['做一次反向查询','试着改成completed=1观察差异，再恢复本章未完成查询并正式提交。保留建表脚本。','能用一次条件变化解释结果集变化。'],
 ]),
 'sql-write':chapter('安全地修改任务','04-sql-write.sql','已经会按条件读取任务。','保留增改删脚本，分页章继续查看结果。',[
 ['先预测影响行','用SELECT检查id=1与id=2，写下新增9、完成1、删除2后的最终数据。WHERE首先是安全边界。','能在运行前说出哪些行会变、哪些保持原样。'],
 ['新增一条任务','写INSERT INTO tasks(id,title,completed) VALUES(...)，加入9号整理笔记，状态0。一次只调通新增。','新增行可以查询到；重复执行会触发主键冲突。'],
 ['只完成目标任务','写UPDATE tasks SET completed=1 WHERE id=1;。先用同样WHERE做SELECT，防止漏条件影响全表。','只有1号完成状态改变。'],
 ['删除并回看全部数据','DELETE用WHERE id=2，最后查询所有行。练习库会被试运行改变；正式检查每次从固定数据开始。','2号消失，其他原任务未被误改。'],
 ['再做一组安全练习','在草稿副本中练习只改9号标题，观察后恢复本章约定。错误变式是学习过程，正式结果以当前脚本为准。','知道如何把查询条件复用到写入。'],
 ]),
 'sql-page':chapter('把任务分成稳定的小页','05-sql-page.sql','能够查询、筛选与修改任务。','分页方法随后迁移到同工程中的书签表。',[
 ['先列完整排序','按completed升序，再按唯一id升序。相同完成状态必须有第二排序字段。','每条任务在排序中都有稳定位置。'],
 ['只取第一页','LIMIT 2 OFFSET 0表示跳过0条后取2条。先观察第一页，LIMIT不是任务编号。','最多返回两行。'],
 ['算出第二页','偏移量=(页码-1)×每页条数；每页2条的第二页偏移2。只改OFFSET，对照两页是否重叠。','本章最终查询使用LIMIT 2 OFFSET 2。'],
 ['换数据再验证','正式检查会用另一组数据核对顺序。不要按样本编号硬编码IN列表，恢复id/title/completed字段顺序后提交。','分页由规则计算，换数据仍正确。'],
 ]),
 'sql-transfer':chapter('在数据库工程新增书签','06-sql-transfer.sql','任务表相关脚本完整保留。','得到同时包含tasks与bookmarks的数据库脚本工程。',[
 ['设计新资源而非改旧表','新建bookmarks表，id主键、title必填、saved必填默认0。tasks表和脚本保留。','书签状态saved与任务状态completed分别表达。'],
 ['建立三条书签','插入1号Java文档、2号SQL手册、3号接口笔记。先核对插入数据，再做状态更新。','三个编号与标题可分别读取。'],
 ['更新和删除','只把1号saved改为1，删除2号。复用前章的WHERE安全方法，不整表更新。','剩余1号已保存、3号未保存。'],
 ['交付完整脚本','最后查询未保存书签的id和title并按id排序。正式检查从空库执行整个当前脚本，需包含建表及前面的写入。','只返回3号接口笔记，六个SQL文件一起保存。'],
 ]),
};
const boot:Record<string,ChapterPlan>={
 'boot-start':chapter('亲手创建Boot健康接口','你的启动类 → HealthController.java','从自己创建的Maven配置和启动类开始；已有工程继续保留源码。','保留健康接口，下一章增加接收参数的接口。',[
 ['从Java入口认识Boot','打开Application，main把启动交给SpringApplication。@SpringBootApplication开启组件扫描；同包与子包里的Controller才会被发现。','能找到自己工程的启动类与根包。'],
 ['创建控制器文件','点击＋Java文件，输入HealthController。类留在lab包，导入RestController并在类上添加@RestController。已有该文件就继续编辑。','新类被Spring识别为返回数据的控制器。'],
 ['建立健康路由','创建公开health方法并加@GetMapping("/api/health")。返回Map.of("status","ok")或包含status的record，注意导入Map和GetMapping。','GET健康路径得到200与status=ok。','@GetMapping("/api/health")\npublic Map<String, String> health() {\n    // 返回健康信息\n}'],
 ['比较Java返回值和JSON','这里返回的是Java对象，Spring完成JSON序列化；不用自己写输出流。与前面HttpServer的发送过程作比较。','知道框架接替了请求分派与对象转JSON。'],
 ['运行、排错和留存','运行并检查；404先查路由和包，编译错误先查import。通过后保留Application和HealthController，继续下一章。','亲手完成的第一个Boot接口保留在工程。'],
 ]),
 'boot-http':chapter('读取请求参数并返回数据','EchoController.java','已有Application和健康接口。','健康与echo接口保留，下一章新增Controller→Service→Repository调用链。',[
 ['为新功能增加类','保留HealthController。创建EchoController并添加@RestController，本章先接收路径编号与名字，再学习POST请求体。','两个Controller在同一Boot工程内。'],
 ['建立GET路由','给公开方法加@GetMapping("/api/echo/{id}")。用@PathVariable接收整数id，用@RequestParam接收name。路径参数与查询参数来自不同位置。','GET /api/echo/7?name=Java能返回id和name。'],
 ['构造读取响应','返回包含id和name的Map或record。id保留数值类型，name保留传入字符串；保留健康接口。','响应随路径和查询参数一起变化。','@GetMapping("/api/echo/{id}")\npublic Object get(@PathVariable int id, @RequestParam String name) {\n    // 返回id与name\n}'],
 ['接收POST JSON','另加POST /api/echo和@RequestBody输入，定义title与Object completed。先验证completed instanceof Boolean，再返回201与相同字段。','合法输入201；缺字段或字符串布尔返回400。'],
 ['做多组请求实验','运行检查比较GET参数、POST合法JSON、缺字段与错误类型。回看健康接口仍在，下一章新增三层调用。','请求参数和请求体两种输入都亲手处理过。'],
 ]),
 'boot-layers':chapter('建立三层与构造器注入','TaskController.java → TaskService.java → TaskRepository.java','健康与echo接口已存在；本章给任务业务建立分层入口。','保留已有接口，下一章让Repository访问数据库。',[
 ['先画职责边界','新增GET /api/layers的调用链。Controller处理HTTP，Service处理业务，Repository提供数据；已有EchoController保留。','能说清三个类各负责什么。'],
 ['先写最底层','在lab包创建TaskRepository并加@Repository，公开title()暂返回构造器注入。先用固定数据观察调用关系，再接真实数据库。','数据来源只有一处，后续可替换。'],
 ['注入数据依赖','创建@Service TaskService，通过构造器接收TaskRepository，公开title()调用repository.title()。不要在方法中new Repository。','业务层不需要知道HTTP请求。'],
 ['让Controller调用Service','创建TaskController，构造器注入TaskService。GET /api/layers返回包含title的对象，值来自service.title()。','响应为title=构造器注入，三层调用贯通。'],
 ['沿调用链定位变化','临时只改Repository返回值并运行观察，再恢复约定。路径、健康与echo代码不删除，下一章替换数据访问实现。','能从JSON追到Service再追到数据来源。'],
 ]),
 'boot-jdbc':chapter('在已有Boot工程接入数据库','Controller → Service → JdbcTemplate','已有HTTP接收与Service业务分层。','连接SQL工程中的表概念，为项目A的持久化CRUD准备。',[
 ['认识连接由谁提供','网页检查准备隔离数据库并注入连接配置。JdbcTemplate通过构造器注入，不把本机密码写入源码。','能区分程序类与环境连接参数。'],
 ['确认表和字段','按本章约定使用tasks表及id/title/completed。列名来自SQL设计，Java返回字段来自接口契约，两者需要映射。','可以手工画出一行数据库记录对应一个响应对象。'],
 ['写参数化读取','使用jdbc.queryForList或queryForObject，条件中的变量使用?和参数传入。不要拼接用户输入进SQL。','相同SQL可读取不同编号且不混淆引号。','jdbc.queryForList("SELECT id,title,completed FROM tasks WHERE id = ?", id);'],
 ['处理没有数据','无行返回时按契约提供404或空列表。不要通过catch所有异常把数据库连接失败也伪装成未找到。','缺数据与环境失败有不同解释。'],
 ['添加写入并验证持久化','在同工程增加POST /api/tasks，接收title与completed，使用生成键返回201。单引号标题用参数绑定，创建后通过GET读取。','连续新增编号不同，应用重启后新任务仍在数据库。'],
 ['从请求追到数据再运行','依次指出路径参数、Service、SQL参数、行映射和JSON。保存后运行，旧健康与参数接口代码继续留存。','得到会读数据库的同一Boot工程。'],
 ]),
};
const tasks:Record<string,ChapterPlan>={
 'a-read':chapter('建立持久化任务查询','HealthController / TaskController / TaskService / TaskRepository','新项目从自己的启动类和Maven配置开始，平台准备隔离练习数据库。','同一工程随后增加写入，已有读取保留。',[
 ['先让项目可启动','创建HealthController和GET /api/health，返回status=ok。保留启动类在你自己的根包，运行配置无需另装依赖。','最小应用能提供健康接口。'],
 ['设计任务的表示','根据验收清单确定id/title/completed类型。先创建record或普通Java类，再决定如何从数据库行映射，别直接把所有逻辑堆进main。','编号是数值，完成是布尔值。'],
 ['实现列表读取','在Repository注入JdbcTemplate查询tasks；Service组织结果，Controller用GET /api/tasks返回列表。先完成列表，再实现单条。','已有数据以数组返回，空表是空数组。'],
 ['增加单条和404','为GET /api/tasks/{id}接收路径参数，用?查询。找不到返回404和message；列表入口继续可用。','存在与未知编号得到不同结果。'],
 ['运行并解释一次','对照列表、已存在和未知编号报告。指出每个类的职责，下一章只新增POST方法和写入方法。','查询功能由你写出并成为后续基础。'],
 ]),
 'a-create':chapter('让任务能被创建','TaskController / TaskService / TaskRepository','列表和单条读取已完成。','下一章在同样的资源路径增加修改与删除。',[
 ['先写请求和响应草图','确定POST接收title/completed，创建成功返回201与新任务。id由系统产生，不能信任用户提交的id。','明确请求对象与数据库实体的区别。'],
 ['接收JSON请求','在已有Controller添加@PostMapping和@RequestBody输入对象，先确认字段类型和缺省处理。GET方法保留。','POST进入新方法而不影响查询。'],
 ['写参数化插入','Service调用Repository，INSERT列名与参数一一对应。获取新生成编号后再构造响应，不把固定编号写死。','连续创建得到不同编号。'],
 ['验证写后可读','按本章检查提交新增，再通过原GET读取新编号。标题含单引号时不应破坏SQL。','新增和查询走通同一份数据库数据。'],
 ['复盘一次完整数据流','从JSON→输入对象→参数化SQL→新编号→响应说一遍。记录哪些方法本章新建，哪些继续复用。','能解释任务怎样真正留下来。'],
 ]),
 'a-update-delete':chapter('修改和删除已有任务','TaskController / TaskRepository','同工程已经能够创建和读取任务。','后续在现有写入路径统一校验。',[
 ['按编号定位对象','先用上一章查询方法确认目标。更新与删除都必须限定id；未知编号与成功操作分别处理。','不会误改整张表。'],
 ['实现更新方法','添加PUT /api/tasks/{id}，SQL的SET赋新值，WHERE限定路径id。参数顺序和占位符逐一对照。','更新返回200，GET看到新标题和完成状态。'],
 ['实现删除方法','写DELETE FROM tasks WHERE id=?，观察受影响行数。成功返回204且无响应体，未知编号或重复删除返回404。','已删任务再读不可见，其他任务不变。'],
 ['做边界回归','创建两条任务，只改其中一条再删它；核对另一条仍在。运行正式检查，不用手工猜测通过。','新增、查询、修改、删除在同工程同时成立。'],
 ]),
 'a-validation':chapter('在写库前校验输入','TaskService与错误响应','CRUD已经可用，现在补失败路径而非重写CRUD。','下一章读取分页继续复用安全输入规则。',[
 ['列有效与无效输入','对照契约列空白、缺字段、标题过长、错误布尔类型。先写期望400，别让无效数据写入后再删除。','每种输入有明确失败规则。'],
 ['归一化标题','在Service中先检查空值与类型，再trim，再检查长度。顺序不同会造成空值异常或接受纯空格。','有效标题去首尾空白，空白标题被拒绝。'],
 ['保护数据库边界','completed必须是布尔输入；类型不对不要用字符串转成真假凑结果。校验全部通过才调用Repository写入。','错误输入不增加记录数。'],
 ['统一失败结果','用400和message描述输入错误，404继续表示资源不存在。运行正例与反例，确认旧CRUD仍然有效。','能从状态和说明区分两类错误。'],
 ]),
 'a-pagination':chapter('给任务列表增加分页筛选','TaskController列表方法 / Repository查询','同工程的CRUD与输入校验完整保留。','最终章把这套方法用于新增书签资源。',[
 ['拆分分页输入','接收page、size及契约中的筛选条件。先确定默认值、最小值和size上限，不让负数进入OFFSET。','参数缺省与无效输入都有定义。'],
 ['先数总量再取当前页','COUNT与分页查询使用相同WHERE。总量表示所有符合条件记录数，不是当前页长度。','total和items分别承担不同含义。'],
 ['计算偏移与稳定排序','本API从page=0开始，offset=page*size。按id稳定排序，LIMIT/OFFSET参数化，复用行映射。与SQL章按自然页码换算的方式区分。','page=0返回第一批，page=1返回第二批，筛选后total正确。'],
 ['验证筛选后的分页','先筛选再分页，测试末页和超出页。检查报告换数据仍可通过，原单条GET和写入保持可用。','能解释为何总量随筛选而改变。'],
 ]),
 'a-transfer':chapter('扩展书签并补自动化测试','BookmarkController / BookmarkService / Repository / TaskServiceTest / RUN.md','任务管理已经完成；书签是同工程新增资源。','交付可解释、有测试的任务与书签项目。',[
 ['新增书签资源边界','保留tasks类和表，新增bookmarks。按本章契约使用saved字段，复用校验与分页思路，不把两个资源共用同一集合。','写入书签不改变任务数据。'],
 ['贯通书签CRUD','依次实现列表、单条、新增、修改和删除，每做一个方法就用约定请求核对。不要一次复制一整套未理解的业务实现。','各方法遵循明确状态及字段约定。'],
 ['写校验单元测试','按验收接口创建公开TaskService、嵌套Input(String title,Object saved)与title(Input)。测试空白拒绝和去首尾空白。','JUnit能抓到故意放行空白的错误。'],
 ['写运行和数据流说明','在RUN.md描述环境、启动与测试命令、HTTP→Service→SQL，以及重启后保留数据的原因。代码中不保存凭据。','别人能按说明运行并理解作品。'],
 ['提交完整回归','保存同一工程全部文件，运行检查及错误变式测试。回看任务章节仍保留书签与测试。','功能、测试和说明对应当前快照。'],
 ]),
};
const collaboration:Record<string,ChapterPlan>={
 'b-login':chapter('从空工程实现登录会话','HealthController / AuthController / SessionService','项目B是新工程，不自动填入现成登录代码。','会话标识随后成为权限和数据归属的依据。',[
 ['启动并认识账号数据','先创建健康接口。根据本章契约认识alice/bob/eve/admin的测试身份，不把这些练习账号当生产认证方案。','能够启动，知道每种账号的用途。'],
 ['先接收登录输入','定义账号密码输入，在登录路由接收。校验缺失和错误凭据；错误时不能发放令牌或泄露密码。','正确与错误输入走不同分支。'],
 ['创建服务端会话','生成不可预测会话标识，将用户与过期时间保存在服务端。响应按契约返回令牌，后续从请求头读取。','令牌不是直接使用用户名。'],
 ['实现注销与过期','注销删除或撤销服务端会话，受保护请求每次核对有效性。已撤销令牌再次请求应失败。','会话可以被服务端真正撤销。'],
 ['测试完整登录链','依次核对未登录→登录→访问→注销→旧令牌再访问。下一章继续使用这份认证代码增加授权。','知道登录成功不代表所有操作都获准。'],
 ]),
 'b-roles':chapter('在会话上增加对象权限','SessionService / AuthorizationService / 计划与任务Controller','能够识别当前登录用户。','下一章持久化计划与成员关系，继续沿用权限边界。',[
 ['写一张权限草图','区分负责人、成员、局外人和审计管理员。角色只是入口条件，还要核对当前对象属于哪个计划。','能描述谁可读、谁可写、谁仅可审计。'],
 ['从会话取身份','统一通过服务端会话得到用户；请求体里的userId不可信，不允许它覆盖真实操作者。','改请求体不能冒充别人。'],
 ['按计划校验成员','查询plan_id与user_id成员关系，再检查负责人或分配人。操作任务时同时用plan_id和task_id定位。','改URL中的计划编号不能越权。'],
 ['测试拒绝路径','用负责人、成员、外部账号和管理员分别核对。403表示无权限，404按契约处理当前计划内不存在的对象。','成功与拒绝的证据成对出现。'],
 ]),
 'b-plans':chapter('建立计划和成员的数据关系','PlanService / Repository / 数据表初始化','已有认证和权限判断，数据库关系需要完整落地。','后续筛选、分页与事务基于同一组表。',[
 ['先设计关系','users与plans通过memberships关联，计划保存owner_id。用外键约束说明任务的assignee必须是成员。','能画出计划、用户、成员和任务的对应关系。'],
 ['实现创建计划','参数化写入plans并取得新编号，不复用固定样本编号。标题等输入先校验再写库。','每个新计划有独立身份。'],
 ['自动加入负责人','同一次事务中写membership。计划成功却缺少负责人关系属于半成品，失败必须回滚。','创建者同时成为合法成员。'],
 ['建立任务和审计关联','任务引用当前计划及成员，审计记录操作者与动作，不复制密码或令牌。复用前章授权方法。','数据与权限使用相同归属关系。'],
 ['以失败验证关系','故意分配给非成员并观察拒绝，核对数据库约束与Service校验如何配合。再运行完整检查。','不是只有正常请求才能工作。'],
 ]),
 'b-pagination':chapter('按当前计划筛选和分页','计划任务列表Controller / Repository','计划、成员和任务已有真实数据关系。','事务章继续使用同一个任务集合。',[
 ['先限定归属','所有列表查询先带plan_id和当前用户权限。不能先取全站任务再在浏览器隐藏其他计划。','跨计划数据不会进入响应。'],
 ['组合筛选条件','按契约加入完成状态、负责人等筛选；只为提供的条件追加占位符和参数。','筛选不覆盖权限条件。'],
 ['分页和总数同条件','COUNT与items查询共用同一组WHERE，排序包含唯一键。页码和size先校验再计算偏移。','total与items代表同一个权限范围。'],
 ['用两种身份回归','不同成员与外部用户分别检查。空页不代表没有任何任务，可能只是偏移超过末页。','页面数据与账号、计划和筛选一致。'],
 ]),
 'b-transaction':chapter('让批量分配全部成功或回滚','批量Controller / TaskService / Repository','已经能定位计划、成员和单条任务。','错误与日志章将统一呈现失败原因。',[
 ['先定义原子单位','把一批任务看成一个业务操作：任意一条非法，不能留下前几条成功结果。列出空批次、重复编号和非成员情况。','能写出失败后数据库应保持的状态。'],
 ['先验证整批输入','检查数量、重复、每个任务属于当前计划以及所有目标成员。认证和权限也必须在写入之前。','越权与非法输入不会部分执行。'],
 ['建立事务边界','在Spring管理的Service公开方法上使用@Transactional。不要在Controller循环调用多个独立提交的方法。','整批写入位于同一事务内。'],
 ['验证失败回滚','让中间一项故意非法，比较前后数据与审计；异常不能被吞掉后继续提交。恢复输入再检查成功批次。','成功全部生效，失败全部回滚。'],
 ]),
 'b-errors-logs':chapter('统一异常与可追踪日志','全局异常处理器 / 请求过滤器 / Service','接口已覆盖正常与权限/事务失败路径。','测试章用这些稳定结果写自动化断言。',[
 ['列出错误分类','输入错400、未登录401、权限403、未知404、业务冲突按契约处理。数据库故障不能伪装成空列表成功。','失败状态各有原因。'],
 ['收口异常响应','在全局异常处理器统一返回约定错误结构；Controller不再到处复制try/catch。message解释恢复方式。','同类失败具有一致字段。'],
 ['加入请求标识','为请求生成或传递受控requestId，日志记录路径、状态和耗时。将标识关联到错误响应，便于定位。','从页面错误能找到对应日志。'],
 ['过滤敏感数据','不记录原始密码、Authorization和完整敏感请求体。测试异常请求后查看日志，保留前章事务回滚。','可追踪不以泄露凭据为代价。'],
 ]),
 'b-tests':chapter('用真实API测试保护工程','src/test/java/.../*Test.java / RUN.md','登录、权限、事务和错误返回已经实现。','部署章依靠测试判断运行环境是否改变行为。',[
 ['把用户流程写成用例','按登录→建计划→建任务→筛选→批量→注销设计一次正常流程。测试应访问真实HTTP接口而非只断言常量。','用例与业务功能一一对应。'],
 ['每次操作都断言','检查状态、字段类型、数据变化与令牌撤销。断言失败必须让测试失败，不要捕获后只打印。','故意改坏业务会被JUnit抓住。'],
 ['补越权和回滚用例','用外部账号访问计划、用非法批次验证无部分写入；测试数据独立准备，不能依赖执行顺序。','边界有可重复的自动化证据。'],
 ['运行并说明测试范围','创建运行说明，描述哪些真实请求被测、哪些部署观察还需人工核对。提交检查要求真实JUnit执行。','测试结果可以解释，不等同于开放讲解已通过。'],
 ]),
 'b-deploy':chapter('把同一工程接上前端并部署','RUN.md / 同一工程源码与测试','业务和自动化测试都已留在当前工程。','形成可演示的协作项目，之后进入独立作品。',[
 ['整理启动契约','确认端口、环境变量、数据库连接和初始化方式。按自己工程的pom.xml构建，不把凭据写入RUN.md。','别人知道需要哪些运行参数。'],
 ['连接业务前端','使用本项目提供的协作前端，从登录开始操作真实API。不是把检查通过截图当成可用业务。','账号切换、列表与操作结果来自你的后端。'],
 ['验证重启持久化','按可选本机部署命令启动，新增记录后停止再启动。使用同一实例名保留数据；不手动删卷。','重启后业务记录仍在，过期会话按规则处理。'],
 ['做最后一次完整演示','展示登录、权限拒绝、分页和批量失败回滚，再运行测试。记录部署命令和停止方式，保留整个工程。','能说明这个项目解决的问题以及失败如何恢复。'],
 ]),
};
const generated:Record<string,ChapterPlan>={
 read:chapter('创建题材资源读取','ResourceController.java','每个题材只有最小启动配置和空Controller，旧工程继续保留。','下一章在同一集合增加写入校验，不重新导入骨架。',[
 ['把题材映射到契约','在上方完成要求确认真实资源路径。所有题材仍用id/title/completed，不能按题材擅自替换字段。','知道页面题材与运行接口的对应关系。'],
 ['创建内存集合','在Controller中准备按编号保存记录的Map，放入本题材约定的1号初始记录。集合属于工程状态，不在每次GET中重建。','重复请求读取同一个集合。'],
 ['实现列表与单条','按要求写@GetMapping，列表返回集合内容；单条用@PathVariable查找，缺少时用404和message。','两个读取接口共享同一份记录。'],
 ['运行并保留成果','提交当前源码核对字段与状态；看过参考实现就记录示例帮助。进入下一章继续修改同一个Controller。','读取代码不会被下一章起步文件替换。'],
 ]),
 validate:chapter('在现有资源上新增记录','ResourceController.java的POST方法','读取功能和内存集合已完成。','archive扩展继续保留这套读取与写入。',[
 ['继续原集合','保留GET方法和字段，在同一Controller添加POST。编号由服务分配，不能每次返回固定id。','新增后原GET可以读取。'],
 ['先完整校验','title先判断类型与空白，再trim与长度；completed必须是真布尔，缺字段、错误类型返回400。','非法输入还没到集合写入位置就被拒绝。'],
 ['保证分配与写入一致','对共享集合及编号更新做合适同步，创建成功201返回新记录。错误不消耗业务记录。','连续新增得到独立记录。'],
 ['比较失败前后状态','先读列表，提交非法输入，再读列表确认没变化；按真实题材约定运行检查。','正例和反例一起验证。'],
 ]),
 transfer:chapter('在同工程扩展archive资源','ResourceController.java新增archive集合与路由','原资源的读取和新增已完成并保留。','交付两个互相隔离的资源及自己的数据流说明。',[
 ['划清两个集合','按完成要求中的archive路径添加新集合与独立编号。保留原资源，不从空启动类重新开始。','两类资源状态有独立归属。'],
 ['实现archive读取','为新集合实现列表、单条与404。先完成读，再加写入；字段继续为id/title/completed。','新路径不会读到原集合。'],
 ['复用输入规则','为archive新增接口复用同样校验原则，但将有效数据写到archive集合。共享规则不等于共享数据。','新增archive不改变原资源数量。'],
 ['双资源回归与讲解','两个资源分别新增、读取，核对隔离与重启后内存清空。提交代码后可补充讲解数据流。','能说清哪些能力复用、哪些状态隔离。'],
 ]),
};
const portfolio:Record<string,ChapterPlan>={
 core:chapter('从设计实现预约作品','作品Controller / Service / Repository / JUnit / RUN.md','已有题材与设计，同一作品从最小Application开始。','通过核心后领取陌生需求，在同一工程继续扩展。',[
 ['先固定最小业务流程','根据设计写登录→看资源→预约→查看本人记录→取消。将资源、库存、用户与预约状态映射为表和关系。','知道先实现什么以及成功后数据如何变化。'],
 ['先完成可读取的资源','亲手创建健康接口、会话入口和资源列表；按契约准备初始资源。初始化不得在每次启动时清空已有数据。','可以读取持久数据，界面显示真实资源。'],
 ['实现单次预约','接收resourceId和quantity，校验正整数与资源存在，事务中原子扣减库存并写预约。以当前会话确定用户。','成功201，库存不足409且不超卖。'],
 ['实现本人查询与取消','只查询当前用户；取消核对归属并原子恢复库存，重复取消不能重复加库存。','他人记录不可见，库存有一致边界。'],
 ['补并发和持久测试','测试争抢最后库存、非法数量、重复取消与重启后数据。RUN.md解释事务和约束，提交核心检查。','作品包含功能、测试和可说明的取舍。'],
 ]),
 transfer:chapter('承接作品完成陌生需求','原预约Service与新增批量接口','核心实现已通过，现有类、数据模型与测试全部保留。','功能通过后为同一快照留下开放讲解与回访。',[
 ['分析已领取的变更','逐条阅读真实迁移要求，列哪些接口、事务和测试受影响。当前自动契约是2—5项批量预约。','改动建立在已有设计而非替换整个作品。'],
 ['先写失败场景测试','覆盖任一资源不存在、数量无效、库存不足、同资源重复项累计超量。失败后所有库存与预约保持原样。','测试描述整批原子性。'],
 ['复用核心服务规则','整批在单一事务边界完成；累计同资源数量再校验，沿用会话、权限和取消规则。','核心与迁移使用一致业务约束。'],
 ['回归并说明取舍','提交迁移与核心回归，解释失败如何回滚、如何防并发超卖。留下帮助声明和实际讲解，不自动宣称独立能力。','当前作品、报告与讲解绑定同一快照。'],
 ]),
};
export const curriculum:Record<string,Record<string,ChapterPlan>>={'http-json-basics':http,'sql-foundations':sql,'boot-foundations':boot,'task-manager':tasks,collaboration,generated,portfolio};
export function curriculumFor(course:string,stage:string):ChapterPlan{return curriculum[course]?.[stage]||{title:'继续当前工程',before:'保留已有源码。',after:'按当前任务要求继续开发。',lessons:[]}}
export function resolveLesson(lessons:LessonUnit[],id:string|null){return Math.max(0,lessons.findIndex(l=>l.id===id))}
