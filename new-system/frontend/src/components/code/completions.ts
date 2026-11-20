export type CodeSuggestion={label:string;insertText:string;detail:string;snippet?:boolean};
const entry=(label:string,insertText:string,detail:string,snippet=true):CodeSuggestion=>({label,insertText,detail,snippet});
const exchange=[entry('getRequestURI','getRequestURI()','读取请求URI；接getPath()获取路径'),entry('getRequestMethod','getRequestMethod()','读取GET、POST等方法'),entry('getResponseHeaders','getResponseHeaders()','设置响应头'),entry('sendResponseHeaders','sendResponseHeaders(${1:200}, ${2:bytes.length});','先发送状态码和响应长度'),entry('getResponseBody','getResponseBody()','获取响应输出流'),entry('getRequestBody','getRequestBody()','获取请求输入流'),entry('close','close();','关闭本次请求')];
const java=[
 entry('if','if (${1:condition}) {\n\t$0\n}','条件分支'),entry('ifelse','if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}','成功与失败两条路径'),entry('for','for (${1:var item} : ${2:items}) {\n\t$0\n}','遍历集合'),entry('try','try (${1:var stream = resource}) {\n\t$0\n}','自动关闭资源'),entry('sout','System.out.println(${1:value});','打印变量观察数据流'),
 entry('String','String ${1:name} = ${2:""};','字符串变量'),entry('return','return ${1:value};','返回结果'),entry('class','public class ${1:Name} {\n\t$0\n}','创建类'),entry('record','public record ${1:Name}(${2:String value}) {}','创建只读数据表示'),entry('method','public ${1:void} ${2:name}(${3:}) {\n\t$0\n}','创建方法'),entry('import','import ${1:java.util.Map};','导入需要的类型'),
 ...['public','private','static','final','void','int','long','boolean','false','true','null','new','throw','throws'].map(x=>entry(x,x,'Java关键字',false)),
 ...['@RestController','@Service','@Repository','@SpringBootApplication','@Transactional','@Test','@Override'].map(x=>entry(x,x,'需要导入对应Java类型',false)),
 ...['Get','Post','Put','Delete','Request'].map(x=>entry('@'+x+'Mapping','@'+x+'Mapping("${1:/api/resource}")','Spring请求映射；保留已有路由')),
 entry('@RequestBody','@RequestBody ${1:Input} ${2:input}','从JSON读取请求体'),entry('@PathVariable','@PathVariable ${1:long} ${2:id}','读取路径参数'),entry('@RequestParam','@RequestParam(defaultValue = "${1:1}") ${2:int} ${3:page}','读取查询参数'),
];
const sql=[entry('SELECT','SELECT ${1:columns}\nFROM ${2:table}\nWHERE ${3:condition};','查询字段、表与条件'),entry('INSERT','INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values});','新增记录'),entry('UPDATE','UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:id = 1};','先确认WHERE范围再修改'),entry('DELETE','DELETE FROM ${1:table}\nWHERE ${2:id = 1};','先确认WHERE范围再删除'),entry('CREATE TABLE','CREATE TABLE ${1:table} (\n\tid INT PRIMARY KEY,\n\t${2:title} VARCHAR(100) NOT NULL\n);','创建表；按任务补全字段'),entry('ORDER BY','ORDER BY ${1:column}, id','确定性排序'),entry('LIMIT','LIMIT ${1:2} OFFSET ${2:0}','按偏移分页'),...['WHERE','AND','OR','NOT NULL','PRIMARY KEY','COUNT(*)','JOIN','GROUP BY','ASC','DESC','BOOLEAN','VARCHAR','INT'].map(x=>entry(x,x,'SQL关键字',false))];
export function completionCandidates(language:string,lineBeforeCursor:string,source:string):CodeSuggestion[]{
 if(language==='sql')return sql;
 if(language!=='java')return [];
 const member=lineBeforeCursor.match(/([A-Za-z_$][\w$]*)\.\w*$/)?.[1];
 if(member){
  if(member==='exchange')return exchange;
  if(member==='server')return [entry('createContext','createContext("${1:/api/resource}", exchange -> {\n\t$0\n});','注册路径处理器，放在start之前'),entry('start','start();','启动HttpServer')];
  if(member==='System')return [entry('out','out','标准输出',false)];
  if(member==='out')return [entry('println','println(${1:value});','输出观察值')];
  if(member==='StandardCharsets')return [entry('UTF_8','UTF_8','UTF-8字符编码',false)];
  if(member==='ResponseEntity')return [entry('ok','ok(${1:body})','返回200响应'),entry('status','status(${1:201}).body(${2:body})','返回指定状态码和响应体'),entry('notFound','notFound().build()','返回404')];
  if(member==='Map')return [entry('of','of("${1:key}", ${2:value})','创建Map响应')];
  if(member==='jdbc')return [entry('queryForList','queryForList("${1:SELECT ...}", ${2:args})','参数化查询'),entry('update','update("${1:UPDATE ... WHERE id = ?}", ${2:id})','参数化写入')];
  return [entry('equals','equals(${1:other})','比较对象值'),entry('getBytes','getBytes(StandardCharsets.UTF_8)','转为UTF-8字节'),entry('trim','trim()','去除首尾空白'),entry('isBlank','isBlank()','判断空白字符串'),entry('length','length()','字符串长度')];
 }
 const words=[...new Set(source.match(/\b[A-Za-z_$][\w$]{2,}\b/g)||[])].slice(0,200);
 return [...java,...words.filter(w=>!java.some(s=>s.label===w)).map(w=>entry(w,w,'当前文件中的名称',false))];
}
