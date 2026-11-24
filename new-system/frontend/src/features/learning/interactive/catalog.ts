import type {Anatomy, Bug, Choice, Fill, Lesson, Module, Predict, Step} from './types.ts';

const choices=(...items:[string,string,string?][]):Choice[]=>items.map(([id,label,feedback])=>({id,label,feedback}));
const hotspot=(id:string,token:string,role:string,meaning:string,application:string)=>({id,token,role,meaning,application});
const contentType='application/json; charset=utf-8';
const httpBridge='/learn/http-json/1.1/workspace?tab=任务';
const sqlBridge='/projects/sql-foundations';
const jsonCode=['{','  "id": 1,','  "title": "写第一个接口",','  "completed": "false"','}'];
const pathCode=['String path = exchange.getRequestURI().getPath();','int status;','if (path.equals("/api/tasks/1")) {','    status = 200;','} else {','    status = 404;','}','exchange.sendResponseHeaders(status, bytes.length);'];

const javaCheck:Predict={
 kind:'predict',id:'placement-java',title:'同样的路径能匹配吗？',tag:'字符串内容比较',
 prompt:'浏览器发来的路径和代码中的字面量内容一样，比较结果是什么？',
 code:['String path = new String("/api/tasks/1");','if (path.equals("/api/tasks/1")) {','    System.out.println("命中");','} else {','    System.out.println("未命中");','}'],
 input:'path 的内容是 /api/tasks/1，两者是不同的字符串对象。',
 choices:choices(['matched','命中'],['missed','未命中','.equals() 比较字符串内容，对象来自哪里无关。'],['throws','抛出异常']),
 answer:'matched',trace:[{line:1,note:'path 的内容是 /api/tasks/1'},{line:2,note:'内容相同，条件为 true'},{line:3,note:'输出：命中'}],
 hints:['看 if 中调用的方法。','String.equals 比较内容。','两个字符串都含有 /api/tasks/1。'],
 explanation:'String.equals 比较字符内容。若用 ==，这里会比较引用，可能让正确路径落到未命中分支。'
};
const httpCheck:Bug={
 kind:'bug',id:'placement-http',title:'404 响应里的布尔值',tag:'JSON 布尔类型',
 prompt:'找到字段类型不对的那一行，再选出修法。',
 symptom:'HTTP 404 · 客户端校验失败：found 期望 boolean，收到 string。',
 code:['HTTP/1.1 404 Not Found','Content-Type: application/json','','{','  "found": "false"','}'],
 line:5,guidance:'状态码说明资源没找到。类型校验指向响应体中的 found 字段。',
 choices:choices(['boolean','将 "false" 改成 false'],['status','把状态码改成 200','状态码改变后，found 仍是字符串。'],['null','把 found 改成 null','null 也不是布尔值。']),
 answer:'boolean',corrected:'  "found": false',result:'HTTP 404 · {"found":false}，字段类型校验通过',
 hints:['读报错里的字段名。','JSON 的布尔值写作 true 或 false。','保留 404，去掉值两侧的引号。'],
 explanation:'404 描述资源状态，布尔值描述响应体字段的类型。两者可以同时正确。'
};
const sqlCheck:Fill={
 kind:'fill',id:'placement-sql',title:'只找未完成的任务',tag:'WHERE 条件',
 prompt:'补全 WHERE 后面的条件。completed 列用 0 表示未完成，用 1 表示完成。',
 template:'SELECT id, title\nFROM tasks\nWHERE {{condition}};',
 slots:[{id:'condition',label:'筛选条件',answers:['completed = 0'],misconceptions:{'completed = 1':'1 表示已完成，会查出相反的一组任务。'}}],
 chips:['completed = 1','completed = 0','id = 0'],
 hints:['用状态列 completed。','WHERE 保留满足条件的行。','将 completed 与未完成的值 0 比较。'],
 explanation:'WHERE completed = 0 对每条记录检查完成状态。id 仍然是任务编号。'
};
export const placement=[javaCheck,httpCheck,sqlCheck] satisfies Step[];

const jsonBug:Bug={
 kind:'bug',id:'json-type',title:'为什么未完成的任务被划掉？',tag:'JSON 布尔类型',
 prompt:'定位类型错误，再修正文档中的 completed。',
 symptom:'HTTP 200 · 任务卡被划掉。前端记录：typeof task.completed === "string"。',
 code:jsonCode,line:4,guidance:'响应能解析，重点看 completed 的值。字段名和字符串继续保留引号。',
 choices:choices(['boolean','把 "false" 改成 false'],['rename','把 completed 改名为 done','前端按 completed 读取，改名会丢失约定。'],['numeric','把 "false" 改成 0','JSON 契约要求 boolean。0 是合法数字，但类型不符。']),
 answer:'boolean',corrected:'  "completed": false',result:'HTTP 200 · 前端读取到 false，任务卡保持未完成',
 hints:['看 typeof 的结果。','JSON 字符串有引号，布尔值没有。','只改 completed 的值，保留字段名。'],
 explanation:'非空字符串 "false" 在 JavaScript 中也会进入 if 的真分支。如果最后一个字段后还加逗号，问题会更早发生：JSON.parse 会直接报 SyntaxError。'
};

export const lessons:Lesson[]=[
 {
  id:'http-01-request-lifecycle',module:'http',title:'5 分钟看懂浏览器请求如何到达 Java',description:'追踪方法、路径、路由分支与 JSON 响应。',minutes:5,
  steps:[
   {kind:'flow',id:'request-flow',title:'让三条请求走一遍',tag:'请求与响应',
    prompt:'分别发送读取存在任务、读取不存在任务和创建任务的请求，观察后端命中的分支。',
    template:'http-pipeline',required:['get','missing','create'],experiments:[
     {id:'get',method:'GET',path:'/api/tasks/1',branch:'读取编号为 1 的任务',status:200,body:'{"id":1,"title":"写第一个接口","completed":false}'},
     {id:'missing',method:'GET',path:'/api/tasks/99',branch:'按编号查询，没有记录',status:404,body:'{"error":"task not found"}'},
     {id:'create',method:'POST',path:'/api/tasks',branch:'读取请求体，创建新的任务',status:201,body:'{"id":3,"title":"写查询","completed":false}'}
    ],hints:['依次点三个请求按钮。','GET 读取，POST 在这个接口创建。','对照 200、404、201 的响应体。'],
    explanation:'路径告诉程序访问哪个资源，方法告诉它做什么。这个沙盒用固定模拟数据展示契约，专业工作台会运行你实现的路由。'},
   {kind:'anatomy',id:'request-anatomy',title:'拆开一次 HTTP 往返',tag:'HTTP 报文',
    prompt:'点亮方法、路径、状态和响应体。',
    lines:[
     {text:'GET /api/tasks/1 HTTP/1.1',hotspot:hotspot('method','GET','请求方法','客户端要读取资源。','路由用 getRequestMethod() 区分读取与创建。')},
     {text:'Host: localhost:8080'},{text:''},
     {text:'HTTP/1.1 200 OK',hotspot:hotspot('status','200 OK','响应状态','服务端成功处理了请求。','把状态传给 sendResponseHeaders，调用方可据此决定接下来做什么。')},
     {text:'Content-Type: application/json; charset=utf-8'},
     {text:''},
     {text:'{"id":1,"completed":false}',hotspot:hotspot('body','{"id":1,"completed":false}','响应体','这是浏览器收到的数据。','把 JSON 转成 UTF-8 字节后写入 exchange.getResponseBody()。')}
    ].map(line=>line),
    hints:['先看请求的第一行。','响应头和响应体之间有空行。','找出 GET、路径、200 OK 和 JSON 体。'],
    explanation:'请求与响应各自拥有起始行和头部，响应的空行后才是数据。'},
   {kind:'predict',id:'request-predict',title:'编号 99 会走哪条路？',tag:'路由分支',
    prompt:'先预测状态码，再查看 Java 实际会经过的分支。',
    code:pathCode,input:'GET /api/tasks/99。示例 bytes 已准备好。',
    choices:choices(['ok','200 · 命中任务 1'],['missing','404 · 找不到任务'],['created','201 · 创建任务']),
    answer:'missing',trace:[{line:1,note:'path = "/api/tasks/99"'},{line:3,note:'equals 返回 false'},{line:6,note:'status = 404'},{line:8,note:'发送 404 与响应体字节长度'}],
    hints:['先写下 path 的实际内容。','equals 要求整个字符串相同。','99 与 1 不同，会执行 else。'],
    explanation:'浏览器看到的状态由当前分支和发出的响应头决定。这个入门分支只匹配任务 1。'},
   {kind:'fill',id:'request-fill',title:'声明你接受的方法与返回类型',tag:'方法与 Content-Type',
    prompt:'这是只读任务接口。用两个空槽完成 GET 检查和 JSON 响应头。',
    template:'if ("{{method}}".equals(exchange.getRequestMethod())) {\n    exchange.getResponseHeaders()\n        .set("Content-Type", "{{media}}");\n}',
    slots:[{id:'method',label:'读取方法',answers:['GET'],misconceptions:{POST:'POST 用于这里定义的创建入口。只读接口应匹配 GET。'}},{id:'media',label:'响应类型',answers:[contentType],literal:true,misconceptions:{'text/plain':'text/plain 表示文本。前端需要 application/json 约定，并用 UTF-8 解码。'}}],
    chips:['POST',contentType,'GET','text/plain'],
    hints:['第一个槽与浏览器的读取动作对应。','响应头 Content-Type 告诉客户端如何解释响应体。','填 GET 与 application/json; charset=utf-8。'],
    explanation:'方法检查限制请求的动作，Content-Type 申明返回的内容与编码。它不会自动把 Java 对象转换成 JSON。'}
  ]
 },
 {
  id:'http-02-json-contract',module:'http',title:'用 JSON 表达任务数据',description:'让 Java 响应和网页任务卡读懂同一份约定。',minutes:6,
  steps:[
   {kind:'anatomy',id:'json-anatomy',title:'一个任务，三种值',tag:'JSON 值类型',
    prompt:'点亮编号、标题和完成状态，看看前端怎么用。',
    lines:[
     {text:'{'},{text:'  "id": 1,',hotspot:hotspot('id','1','数字','编号是数字 1。','用于查找或更新同一条任务。')},
     {text:'  "title": "写第一个接口",',hotspot:hotspot('title','"写第一个接口"','字符串','文本值需要双引号。','网页把 title 作为任务卡标题。')},
     {text:'  "completed": false',hotspot:hotspot('completed','false','布尔值','false 表示未完成。','网页据此决定任务卡是否划线。')},{text:'}'}
    ],hints:['字段名都有双引号，值有不同规则。','数字和布尔值可以直接写。','分别点 1、标题和 false。'],
    explanation:'JSON 对象把字段名映射到值。应用按契约读取每个值的类型，字段是否有引号直接影响结果。'},
   {kind:'fill',id:'json-fill',title:'补全客户端能读懂的任务',tag:'JSON 类型契约',prompt:'编号是数字 1，任务尚未完成。',
    template:'{\n  "id": {{id}},\n  "title": "写第一个接口",\n  "completed": {{done}}\n}',
    slots:[{id:'id',label:'数字编号',answers:['1'],misconceptions:{'"1"':'"1" 是字符串。这里把 id 约定为数字，便于按主键匹配。'}},{id:'done',label:'未完成布尔值',answers:['false'],misconceptions:{'"false"':'带引号的 "false" 是非空字符串。if (task.completed) 会把它当真，误划掉任务。','False':'合法的 JSON 布尔值全小写。'}}],
    chips:['"false"','1','true','"1"','false'],
    hints:['先确定每个字段约定的类型。','双引号把值变成字符串。','两个空槽都可以直接填入不带引号的值。'],
    explanation:'JSON 可解析和符合业务类型是两层要求。这里同时满足语法及 id、completed 的类型契约。'},
   jsonBug,
   {kind:'predict',id:'json-predict',title:'后端切换状态，网页会变什么？',tag:'接口到任务卡',
    prompt:'先预测文本，再沿着数据读取和条件分支核对。',
    code:['const task = JSON.parse(body);','let label = "待完成";','if (task.completed === true) {','    label = "已完成";','}','card.textContent = label;'],
    input:'body = {"id":1,"title":"写第一个接口","completed":true}',
    choices:choices(['pending','待完成'],['done','已完成'],['title','写第一个接口']),
    answer:'done',trace:[{line:1,note:'解析得到 completed = true'},{line:2,note:'label 先是「待完成」'},{line:3,note:'条件成立'},{line:4,note:'label 变成「已完成」'},{line:6,note:'任务卡显示「已完成」'}],
    hints:['看 completed 是布尔值还是字符串。','=== true 检查这个值是否是布尔 true。','第 4 行更新 label，最后一行把它写进卡片。'],
    explanation:'后端改变 JSON 字段后，前端解析、分支和渲染按顺序读到这个变化。'}
  ]
 },
 {
  id:'http-03-java-to-endpoint',module:'http',title:'把 Java 基础变成真正能跑的任务接口',description:'按 Java HttpExchange 的实际顺序组装状态码和响应体。',minutes:7,
  steps:[
   {kind:'predict',id:'endpoint-predict',title:'这次会返回 200 吗？',tag:'路径命中',
    prompt:'预测指定路径的分支与状态码。bytes 在发送前已由分支准备好。',
    code:pathCode,input:'GET /api/tasks/1',
    choices:choices(['ok','200 · 读到任务'],['missing','404 · 找不到任务'],['created','201 · 创建任务']),
    answer:'ok',trace:[{line:1,note:'path = "/api/tasks/1"'},{line:3,note:'equals 返回 true'},{line:4,note:'status = 200'},{line:8,note:'把 status 和 UTF-8 字节长度写进响应'}],
    hints:['对照输入与条件中的完整路径。','String.equals 比较字符内容。','命中时只进入 if 的主体。'],
    explanation:'同样的 Java if/else 在路由里决定客户端会看到什么。状态准备好以后再写响应头。'},
   {kind:'parsons',id:'endpoint-order',title:'拼出一次 Java HTTP 响应',tag:'响应写出顺序',
    prompt:'组装 5 个动作。先准备路径、状态和字节，再发送响应。',
    blocks:[
     {id:'headers',code:'exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");'},
     {id:'write',code:'try (var out = exchange.getResponseBody()) { out.write(bytes); }'},
     {id:'decoy',code:'server.start();',decoy:true},
     {id:'branch',code:'var reply = replyFor(path); // reply 含 status 与 UTF-8 bytes'},
     {id:'send',code:'exchange.sendResponseHeaders(reply.status(), reply.bytes().length);'},
     {id:'path',code:'var path = exchange.getRequestURI().getPath();'}
    ].map(block=>block.id==='write'?{...block,code:'try (var out = exchange.getResponseBody()) { out.write(reply.bytes()); }'}:block),
    solution:['path','branch','headers','send','write'],
    hints:['要按路径选择分支，得先取路径。','sendResponseHeaders 之后，响应头就发出去了。','先取路径、准备 reply、设类型、发送状态与长度、写字节。'],
    explanation:'replyFor 是项目中你将写出的分支逻辑。启动服务只发生一次，每个请求内只处理自己的 exchange。'},
   {kind:'fill',id:'endpoint-fill',title:'别让 404 被固定的 200 覆盖',tag:'Java 路由与状态码',
    prompt:'判断路径，声明 JSON 响应类型，并把计算好的状态发给浏览器。',
    template:'boolean found = path.{{compare}}("/api/tasks/1");\nint status = found ? 200 : 404;\nbyte[] bytes = taskJson(found).getBytes(UTF_8);\nexchange.getResponseHeaders()\n    .set("Content-Type", "{{media}}");\nexchange.sendResponseHeaders({{status}}, bytes.length);',
    slots:[
     {id:'compare',label:'内容比较方法',answers:['equals'],misconceptions:{'==':'== 比较引用，可能让相同字符内容的路径走进 404 分支。这里调用 String.equals。','equals()':'模板已经提供方法的括号和参数，槽里只需填写方法名 equals。'}},
     {id:'media',label:'JSON 响应类型',answers:[contentType],literal:true,misconceptions:{'text/plain':'响应体是 JSON，客户端需要用 JSON 约定读取。'}},
     {id:'status',label:'根据分支计算的状态',answers:['status'],misconceptions:{'200':'写死 200 会覆盖上面的 404：客户端会把不存在的任务当成一次成功读取。'}}
    ],
    chips:['==','200',contentType,'equals','text/plain','status'],
    hints:['三个槽分别需要比较方法、内容类型和状态变量。','比较字符内容用 equals，发送状态与分支保持一致。','填 equals、application/json; charset=utf-8 和 status。'],
    explanation:'路由统一准备状态与内容，最后发送已计算好的状态和字节长度。UTF_8 指 java.nio.charset.StandardCharsets.UTF_8；taskJson 负责按分支构造 JSON。'},
   {kind:'bug',id:'endpoint-bug',title:'不存在的任务怎么成了 200？',tag:'响应状态排错',
    prompt:'沿着 status 的来源找到真正把错误状态发给浏览器的行。',
    symptom:'GET /api/tasks/2 → HTTP 200 OK · {"error":"task not found"}',
    code:['String path = exchange.getRequestURI().getPath();','boolean found = path.equals("/api/tasks/1");','int status = found ? 200 : 404;','byte[] bytes = taskJson(found).getBytes(UTF_8);','exchange.sendResponseHeaders(200, bytes.length);','try (var out = exchange.getResponseBody()) {','    out.write(bytes);','}'],
    line:5,guidance:'先验证第 3 行对任务 2 算出了 404，再追踪发送状态码的调用。',
    choices:choices(['status','用 status 替换 sendResponseHeaders 的第一个参数'],['body','把错误 JSON 改成正常任务 JSON','任务 2 并不存在。伪造任务数据会掩盖分支问题。'],['length','把长度改成字符串字符数','HTTP 响应长度使用字节数，修改它也不会改变状态码。']),
    answer:'status',corrected:'exchange.sendResponseHeaders(status, bytes.length);',result:'GET /api/tasks/2 → HTTP 404 Not Found · {"error":"task not found"}',
    hints:['错误体说明路径判断已经识别不存在。','查 status 是否真的用在发响应的调用里。','让 sendResponseHeaders 接收 status。'],
    explanation:'调试接口时分别核对状态和数据。当两者表达不同结论时，沿着变量追到实际写出的那一行。'}
  ]
 },
 {
  id:'sql-01-visual-where',module:'sql',title:'看得见的 SQL：精准捞出未完成任务',description:'用任务表观察筛选、排序和分页，再修一次危险更新。',minutes:7,
  steps:[
   {kind:'flow',id:'sql-filter',title:'在任务表里试一次筛选',tag:'筛选、排序与截取',
    prompt:'试试未完成和已完成，切到倒序与 LIMIT 2。观察哪些行被筛掉，哪些行只是没进入当前页。',
    template:'sql-table-filter',rows:[{id:1,title:'写第一个接口',completed:false},{id:2,title:'加响应头',completed:true},{id:3,title:'写查询条件',completed:false},{id:4,title:'验证错误状态',completed:false},{id:5,title:'创建任务表',completed:true}],
    target:{where:'0',order:'DESC',limit:2},question:'在未完成、编号倒序、LIMIT 2 时，命中哪些任务？',
    choices:choices(['first','1、3'],['last','4、3'],['all','4、3、1']),answer:'last',
    hints:['WHERE 先排除 completed = 1 的两行。','剩余 id 由大到小排列。','倒序剩 4、3、1，LIMIT 2 取前两个。'],
    explanation:'查询先筛选再排序，LIMIT 只截取排序后的结果。表中的淡化行保留为教学对照。'},
   {kind:'parsons',id:'sql-order',title:'拼一条能交给 MySQL 的查询',tag:'SQL 子句顺序',
    prompt:'按 SQL 的书写顺序排列各行。完成后看看 IDE 里要放在哪个脚本。',
    blocks:[{id:'where',code:'WHERE completed = 0'},{id:'limit',code:'LIMIT 2;'},{id:'select',code:'SELECT id, title, completed'},{id:'order',code:'ORDER BY id DESC'},{id:'from',code:'FROM tasks'}],
    solution:['select','from','where','order','limit'],
    hints:['查询从 SELECT 开始。','FROM 指明表，WHERE 写在 FROM 之后。','先 ORDER BY 确定顺序，再写 LIMIT。'],
    explanation:'写法按 SELECT → FROM → WHERE → ORDER BY → LIMIT。理解运行时，可以从表出发，先筛选，排序后再截取。'},
   {kind:'fill',id:'sql-fill',title:'翻到未完成任务的第二页',tag:'LIMIT 与 OFFSET',
    prompt:'页大小是 2，按 id 升序列出未完成任务的第 2 页。',
    template:'SELECT id, title, completed\nFROM tasks\nWHERE {{condition}}\nORDER BY id ASC\nLIMIT 2 OFFSET {{offset}};',
    slots:[{id:'condition',label:'未完成筛选条件',answers:['completed = 0','COMPLETED = 0'],misconceptions:{'completed = 1':'这个条件只查已完成任务。布尔列中的 0 才表示未完成。'}},{id:'offset',label:'跳过行数',answers:['2'],misconceptions:{'1':'OFFSET 是跳过的行数。第二页需先跳过第一页的两行。','4':'跳过四行会从第三页开始。'}}],
    chips:['1','completed = 1','2','4','completed = 0'],
    hints:['用 WHERE 选出未完成的候选行。','OFFSET 是跳过行数，与页码不同。','跳过 (2 − 1) × 2 = 2 行。'],
    explanation:'稳定排序使分页结果可预测。LIMIT 是最多返回几行，OFFSET 是从结果前面跳过几行。'},
   {kind:'bug',id:'sql-update',title:'诊所：为什么每条任务都完成了？',tag:'写入范围',
    prompt:'目标是只完成任务 3。定位扩大了写入范围的语句。',
    symptom:'预期影响 1 行 · 实际影响 3 行，三条未完成任务都被标记完成。',
    code:['START TRANSACTION;','SELECT id, completed FROM tasks WHERE id = 3;','UPDATE tasks SET completed = 1;','SELECT id, completed FROM tasks ORDER BY id;','ROLLBACK;'],
    line:3,guidance:'SELECT 只决定读哪些行。找出真正写表的语句，并检查它自己的 WHERE。',
    choices:choices(['where','在 UPDATE 上添加 WHERE id = 3'],['select','修改前一条 SELECT 的 WHERE','SELECT 的条件不会传到下一条 UPDATE。'],['limit','只加 LIMIT 1','限制数量仍未指明目标，可能改到别的任务。']),
    answer:'where',corrected:'UPDATE tasks SET completed = 1 WHERE id = 3;',result:'影响 1 行 · 只有 id = 3 的任务被置为完成，练习事务随后回滚',
    hints:['找到 SQL 动词 UPDATE。','独立语句各自拥有自己的 WHERE。','用主键 id = 3 限制写入范围。'],
    explanation:'动手前可先用同一条 WHERE 执行 SELECT 确认范围。这里事务最后回滚，真实工程中的提交应以已检查的结果为依据。'}
  ]
 }
];

const requestCheck:Predict={...javaCheck,id:'skip-http-route',title:'哪个 URL 会命中？',prompt:'同样的 Java 条件，换一个真实请求路径。',input:'path 的内容是 /api/tasks/99。',answer:'missed',
 choices:choices(['matched','命中','条件需要完整路径相同。'],['missed','未命中'],['throws','抛出异常']),
 trace:[{line:1,note:'本次输入为 /api/tasks/99'},{line:2,note:'equals 返回 false'},{line:5,note:'输出：未命中'}],
 code:['String path = "/api/tasks/99";',...javaCheck.code.slice(1)],explanation:'编号不同，完整路径比较为 false，程序进入 else。',
 hints:['对照输入与 if 右边的路径。','String.equals 比较完整字符串。','99 和 1 不同，走 else。']};
const mediaCheck:Fill={...sqlCheck,id:'skip-http-media',title:'告诉浏览器响应体是什么',tag:'Content-Type',
 prompt:'响应体是 UTF-8 编码的 JSON。设定 Content-Type。',template:'exchange.getResponseHeaders()\n    .set("Content-Type", "{{media}}");',
 slots:[{id:'media',label:'媒体类型与编码',answers:[contentType],literal:true}],chips:['text/html',contentType,'text/plain'],
 hints:['看响应体使用的数据格式。','媒体类型在分号之前，字符集在分号之后。','用 application/json; charset=utf-8。'],
 explanation:'客户端可根据 Content-Type 把 UTF-8 响应交给 JSON 解析器。'};
const sortCheck:Predict={
 kind:'predict',id:'skip-sql-order',title:'倒序以后，第一行是谁？',tag:'ORDER BY 与 LIMIT',
 prompt:'预测只返回一行时的 id。',code:['SELECT id, title','FROM tasks','WHERE completed = 0','ORDER BY id DESC','LIMIT 1;'],
 input:'任务 1 和 3 未完成，任务 4 已完成。',choices:choices(['one','1'],['three','3'],['four','4']),
 answer:'three',trace:[{line:2,note:'读取 1、3、4'},{line:3,note:'保留 1、3'},{line:4,note:'顺序变成 3、1'},{line:5,note:'返回 3'}],
 hints:['先剔除已完成任务。','DESC 把大编号排在前。','LIMIT 1 只拿排序后的第一个。'],
 explanation:'已完成的 4 在筛选时已被排除，倒序后 3 排第一。'
};

export const modules:Module[]=[
 {id:'http',title:'HTTP 与 JSON 实战前哨',description:'跟着一条请求往返，把路径判断、状态码与任务 JSON 接起来。',bridge:httpBridge,bridgeTitle:'Java 任务接口工作台',
  challenge:[requestCheck,{...httpCheck,id:'skip-http-json'},mediaCheck]},
 {id:'sql',title:'SQL 数据思维预演',description:'用同一张 tasks 表看见筛选、排序、分页和更新范围。',bridge:sqlBridge,bridgeTitle:'任务数据实验室',
  challenge:[{...sqlCheck,id:'skip-sql-where'},sortCheck,{...(lessons[3].steps[3] as Bug),id:'skip-sql-update'}]}
];

export const academyPath='/learn/foundations';
export const lessonPath=(id:string)=>academyPath+'/lesson/'+id;
export const skipPath=(id:string)=>academyPath+'/skip/'+id;
export const modeLabel={guided:'循序渐进',open:'自由探索'};
export const skillLabels={java:'Java 语法',http:'HTTP 与 JSON',sql:'SQL 查询',boot:'Spring Boot'};
