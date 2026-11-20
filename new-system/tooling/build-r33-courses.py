"""Author the versioned Boot/Project A packages from local teaching/source material."""
from pathlib import Path
import json, shutil

root=Path(__file__).resolve().parents[1]
# Historical authoring recipe: published bytes must never be regenerated in place.
for course_id in ('boot-foundations', 'task-manager'):
    published = root/'course-packs'/course_id/'1.0.0'/'project.json'
    if published.exists() and json.loads(published.read_text(encoding='utf-8')).get('status') == 'published':
        raise SystemExit(f'Published version is immutable: {course_id}/1.0.0. Author changes in a new version directory and validate before release.')
java='src/main/java/dev/codesomething/lab/'
app=(root/'runner/boot/starter'/java/'Application.java').read_text(encoding='utf-8')
health=(root/'runner/boot/starter'/java/'HealthController.java').read_text(encoding='utf-8')
base=(root/'backend/src/main/resources/runner/boot/pom.xml').read_text(encoding='utf-8')
jdbc=base.replace('</dependencies>','''<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-jdbc</artifactId></dependency>
    <dependency><groupId>com.mysql</groupId><artifactId>mysql-connector-j</artifactId><scope>runtime</scope></dependency>
    <dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><scope>test</scope></dependency></dependencies>''')
(root/'backend/src/main/resources/runner/boot/jdbc-pom.xml').write_text(jdbc,encoding='utf-8')

repo='''package dev.codesomething.lab;
import org.springframework.stereotype.Repository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import java.sql.Statement;
import java.util.*;
@Repository
public class TaskRepository {
    private final JdbcTemplate jdbc;
    public TaskRepository(JdbcTemplate jdbc) {this.jdbc=jdbc;}
    public record Task(long id,String title,boolean completed) {}
    public List<Task> all(String table) {return jdbc.query("SELECT id,title,completed FROM "+table+" ORDER BY id",(r,n)->new Task(r.getLong(1),r.getString(2),r.getBoolean(3)));}
    public Task get(String table,long id) {var rows=jdbc.query("SELECT id,title,completed FROM "+table+" WHERE id=?",(r,n)->new Task(r.getLong(1),r.getString(2),r.getBoolean(3)),id);return rows.isEmpty()?null:rows.getFirst();}
    public Task create(String table,String title,boolean completed) {
        var key=new GeneratedKeyHolder();
        jdbc.update(c->{var s=c.prepareStatement("INSERT INTO "+table+"(title,completed) VALUES(?,?)",Statement.RETURN_GENERATED_KEYS);s.setString(1,title);s.setBoolean(2,completed);return s;},key);
        return get(table,Objects.requireNonNull(key.getKey()).longValue());
    }
    public int update(String table,long id,String title,boolean completed) {return jdbc.update("UPDATE "+table+" SET title=?,completed=? WHERE id=?",title,completed,id);}
    public int delete(String table,long id) {return jdbc.update("DELETE FROM "+table+" WHERE id=?",id);}
}
'''
service='''package dev.codesomething.lab;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
@Service
public class TaskService {
    private final TaskRepository repository;
    public TaskService(TaskRepository repository) {this.repository=repository;}
    public record Input(String title,Object completed) {}
    public record Page(List<TaskRepository.Task> items,int page,int size,long total) {}
    private void table(String table) {if(!Set.of("tasks","bookmarks").contains(table))throw new ResponseStatusException(HttpStatus.NOT_FOUND,"资源不存在");}
    public List<TaskRepository.Task> all(String table) {table(table);return repository.all(table);}
    public TaskRepository.Task get(String table,long id) {table(table);var task=repository.get(table,id);if(task==null)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"资源不存在");return task;}
    public String title(Input input) {
        if(input==null||input.title()==null||input.title().strip().isEmpty()||input.title().strip().codePointCount(0,input.title().strip().length())>100||!(input.completed() instanceof Boolean))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"title需为1—100字符，completed需为布尔值");
        return input.title().strip();
    }
    public TaskRepository.Task create(String table,Input input) {table(table);return repository.create(table,title(input),(Boolean)input.completed());}
    public TaskRepository.Task update(String table,long id,Input input) {get(table,id);repository.update(table,id,title(input),(Boolean)input.completed());return get(table,id);}
    public void delete(String table,long id) {get(table,id);repository.delete(table,id);}
    public Page page(String table,int page,int size,Boolean completed) {
        if(page<0||size<1||size>50)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"page不能为负，size需在1—50之间");
        var filtered=all(table).stream().filter(t->completed==null||t.completed()==completed).toList();
        long offset=(long)page*size;int start=(int)Math.min(offset,filtered.size());
        return new Page(filtered.subList(start,Math.min(start+size,filtered.size())),page,size,filtered.size());
    }
}
'''
controller='''package dev.codesomething.lab;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.*;
@RestController
@RequestMapping("/api/{resource:tasks|bookmarks}")
public class TaskController {
    private final TaskService service;
    public TaskController(TaskService service) {this.service=service;}
    @GetMapping public Object list(@PathVariable String resource,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="10") int size,@RequestParam(required=false) Boolean completed) {return LIST_RESULT;}
    @GetMapping("/{id}") public TaskRepository.Task get(@PathVariable String resource,@PathVariable long id) {return service.get(resource,id);}
    @PostMapping public ResponseEntity<TaskRepository.Task> create(@PathVariable String resource,@RequestBody TaskService.Input input) {return ResponseEntity.status(201).body(service.create(resource,input));}
    @PutMapping("/{id}") public TaskRepository.Task update(@PathVariable String resource,@PathVariable long id,@RequestBody TaskService.Input input) {return service.update(resource,id,input);}
    @DeleteMapping("/{id}") public ResponseEntity<Void> delete(@PathVariable String resource,@PathVariable long id) {service.delete(resource,id);return ResponseEntity.noContent().build();}
}
'''
errors='''package dev.codesomething.lab;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import java.util.Map;
@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(ResponseStatusException.class) public ResponseEntity<?> status(ResponseStatusException e) {return ResponseEntity.status(e.getStatusCode()).body(Map.of("message",e.getReason()==null?"请求失败":e.getReason()));}
    @ExceptionHandler({HttpMessageNotReadableException.class,MethodArgumentTypeMismatchException.class}) public ResponseEntity<?> input(Exception e) {return ResponseEntity.badRequest().body(Map.of("message","JSON或请求参数格式不正确"));}
}
'''
echo='''package dev.codesomething.lab;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
@RestController
public class EchoController {
    public record Input(String title,Object completed) {}
    public record Echo(String title,boolean completed) {}
    @GetMapping("/api/echo/{id}") public Object get(@PathVariable int id,@RequestParam String name) {return java.util.Map.of("id",id,"name",name);}
    @PostMapping("/api/echo") public ResponseEntity<?> post(@RequestBody Input input) {
        if(input.title()==null||!(input.completed() instanceof Boolean))return ResponseEntity.badRequest().body(java.util.Map.of("message","title与布尔completed必填"));
        return ResponseEntity.status(201).body(new Echo(input.title(),(Boolean)input.completed()));
    }
}
'''
layersrepo='''package dev.codesomething.lab;
@org.springframework.stereotype.Repository
public class TaskRepository {public String title(){return "构造器注入";}}
'''
layersservice='''package dev.codesomething.lab;
@org.springframework.stereotype.Service
public class TaskService {private final TaskRepository repository;public TaskService(TaskRepository repository){this.repository=repository;}public String title(){return repository.title();}}
'''
layerscontroller='''package dev.codesomething.lab;
@org.springframework.web.bind.annotation.RestController
public class TaskController {private final TaskService service;public TaskController(TaskService service){this.service=service;}@org.springframework.web.bind.annotation.GetMapping("/api/layers") public Object get(){return java.util.Map.of("title",service.title());}}
'''
unit='''package dev.codesomething.lab;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class TitleTest {
    @Test void blankTitleIsRejectedAndSpacesAreRemoved() {
        var service=new TaskService(null);
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.title(new TaskService.Input(" ",false)));
        assertEquals("Java",service.title(new TaskService.Input(" Java ",false)));
    }
}
'''

data=[
('boot-start','启动Spring Boot',45,'用Maven构建并运行第一个Boot健康接口。','启动类与组件扫描','@SpringBootApplication把当前包及其子包交给Spring管理；main启动应用上下文与内嵌服务器。类存在于目录中并不等于已注册为组件。','Maven依赖与端口','pom.xml描述依赖和构建插件；首次IDE导入可能需要下载。依赖失败发生在编译前，端口冲突发生在启动时，应分别查看日志。','恢复健康接口，使GET /api/health返回200与{"status":"ok"}。','将端口改为8090但8080旧进程仍运行，如何验证？',['保存后只刷新8080','停止旧进程、重启并请求8090','修改JSON字段'],1,'依赖缓存缺失时应当怎样处理？',['修复依赖环境后重试','认为HTTP知识不合格','删除Controller'],0),
('boot-http','路由、请求体与DTO',50,'从路径、查询参数和JSON请求体接收不同数据。','三种输入位置','/api/echo/7中的7通过@PathVariable绑定，?name=Java通过@RequestParam绑定，请求体通过@RequestBody交给DTO。三者不能相互替代。','DTO与JSON类型','record简洁表达传输数据。本例用Object保留completed的原始JSON类型，再检查Boolean，避免把字符串false悄悄当成布尔值。返回对象由框架序列化为JSON。','实现GET /api/echo/{id}?name=...与POST /api/echo，POST有效时201，缺字段或字符串布尔时400。','JSON中completed为"false"，接口要求布尔，如何处理？',['直接按非空字符串转true','返回400并要求JSON布尔值','返回201'],1,'路径编号和查询名称分别用什么读取？',['两者都从请求体取','都从响应头取','PathVariable与RequestParam'],2),
('boot-layers','分层与构造器注入',40,'沿Controller→Service→Repository解释一次真实组件调用。','各层职责','Controller负责HTTP输入输出，Service组织业务规则，Repository负责数据读写。分层把变化集中到对应位置，接口层不拼SQL。','构造器注入','Spring先构建Repository，再把它传给Service，最后传给Controller。单构造器不必写@Autowired；手工new且依赖为空时不会得到容器管理的依赖。','补齐三层构造器调用，使GET /api/layers返回{"title":"构造器注入"}。','new TaskService(null)能否自动获得Repository？',['不能，需由容器注入或显式传入','可以，因为类有@Service','只要重启浏览器即可'],0,'数据库读取应主要放在哪层？',['Controller','Repository','DTO'],1),
('boot-jdbc','JDBC连接与参数绑定',55,'把Java接口接到隔离MySQL，并验证引号标题和重启后的持久数据。','DataSource与JdbcTemplate','DataSource管理数据库连接，JdbcTemplate执行SQL并映射结果。平台的SQLite保存学习记录，课程的MySQL保存任务，两者用途和凭据独立。','占位符绑定值','WHERE id=?和VALUES(?,?)将数据作为值传入。用户标题中的单引号无需手工拼接或删除。表名只能来自程序固定白名单，不能作为普通占位值替换。','实现任务读取与新增，参数化保存包含单引号的标题，重启服务后仍可读取。','标题是O\'Reilly，安全写法是什么？',['把单引号全部删除','直接拼SQL字符串','使用?占位符并绑定值'],2,'重启Java服务后MySQL记录应怎样？',['保留，只要未清库','随内存对象消失','写入平台SQLite'],0),
('a-read','读取任务',50,'查询列表和单条任务，区分空列表与不存在的编号。','集合与资源','GET /api/tasks返回数组，空集合为[]与200。GET /api/tasks/999访问单个不存在资源，返回404与非空message。空集合不等于请求出错。','映射与持久化','SQL的completed通常保存0/1，ResultSet.getBoolean映射到Java布尔，再序列化为JSON布尔。id是数值，title是字符串。','补齐分层读取、200/404和字段类型，保留数据库原始记录。','空数据库的列表查询应返回什么？',['404','200与空数组','500'],1,'查询不存在的单条任务应返回什么？',['200与第一条任务','200与空字符串','404与错误JSON'],2),
('a-create','新增与生成编号',50,'让数据库生成编号，返回201和可再次查询的新任务。','生成主键','INSERT不传id，让AUTO_INCREMENT生成；GeneratedKeyHolder取回同一连接的生成键。不能用列表长度或固定1充当新编号。','写入与响应','201表示资源已创建。返回id/title/completed后，应再次GET核对数据库状态；仅返回成功文案不能证明已保存。','实现POST /api/tasks，连续新增编号不同，引号标题完整保存。','连续新增两个任务的id应怎样？',['由数据库分别生成且不同','都设为1','用title长度'],0,'返回201后如何验证持久化？',['只看控制台成功文字','GET新id并核对数据库读取','刷新课程页面'],1),
('a-update-delete','修改、删除与404',55,'只修改或删除指定编号，保留其他任务。','更新目标','PUT /api/tasks/{id}同时更新title与completed。WHERE id=?限定目标；未知id应返回404，不能把整个任务表改掉。','删除语义','DELETE成功返回204且无响应体；再次删除已不存在的编号返回404。删除前后查询其他id验证范围。','实现PUT和DELETE，核对目标、204空体、重复删除和其他记录不变。','漏写UPDATE的WHERE会怎样？',['自动只改第一条','可能修改整张表','只更新最后一条'],1,'删除成功后再次删除同一id应返回什么？',['按本项目约定404','201','始终返回任务1'],0),
('a-validation','校验与统一错误',55,'在写库前拒绝无效输入，保留一致的错误JSON。','业务校验','title先strip，长度1—100个字符；completed必须为JSON布尔且不能缺失。输入错误返回400，未找到资源返回404。校验应先于写入。','集中处理异常','RestControllerAdvice把错误转换为包含非空message的JSON。JSON语法错误和参数类型错误也返回400，避免向用户暴露堆栈和数据库细节。','拒绝空白、超长、缺字段、字符串布尔与非法JSON，并核对失败前后记录不变。','校验失败的请求应怎样影响数据库？',['先写入再返回400','完全不写入','删除原记录'],1,'合法标题前后有空格，保存时如何处理？',['保留全部空格','拒绝所有空格','去首尾空白后校验和保存'],2),
('a-pagination','稳定分页与筛选',55,'实现可预测的分页结构和一致的筛选总数。','页码与边界','page从0开始，size在1—50之间；非法值400，超出末页返回items空数组。offset用long计算，避免大page乘法溢出。','稳定排序与总数','先按completed筛选，再按唯一id升序分页。total是相同筛选下的全部条数，不能用当前页长度代替。','GET /api/tasks?page=0&size=2&completed=false返回items/page/size/total，稳定跨页，非法参数400。','筛选后total应统计什么？',['当前页长度','全部任务数且忽略筛选','相同筛选的全部匹配记录'],2,'两行completed相同时如何稳定分页？',['用唯一id作为排序依据','依赖偶然返回顺序','每次随机排序'],0),
('a-transfer','独立迁移：书签接口',90,'从最小工程实现书签CRUD、校验、分页和能检出错误的自动化测试。','迁移契约','把资源路径和存储表从tasks迁移到bookmarks，本关使用title/saved字段，协调DTO、SQL与JSON映射。任务与书签的数据必须隔离，接口仍遵守201/204/400/404和分页规则。','测试与讲解','编写JUnit测试覆盖空白标题拒绝和首尾空格处理。检查器会把title校验故意改错再运行你的测试，只有能检出该错误才通过。附RUN.md说明环境、运行命令及请求→DTO→Service→SQL→响应的数据流。','独立完成/api/bookmarks全套接口，提交TitleTest.java与RUN.md；单元测试应能识别空白标题被误接收的变式。','只改URL不改存储表会怎样？',['自动隔离数据','可能把书签写进任务表','框架自动建新表'],1,'测试只断言true能证明校验有效吗？',['能','能，只要测试是绿色','不能，需触发实际校验并识别故意错误'],2),
]
def todo_method(content,marker):
    start=content.index('{',content.index(marker));end=start+1;depth=1
    while depth:
        if content[end]=='{':depth+=1
        elif content[end]=='}':depth-=1
        end+=1
    return content[:start]+'{throw new UnsupportedOperationException("TODO: implement this stage");}'+content[end:]
for cid,subset in [('boot-foundations',data[:4]),('task-manager',data[4:])]:
    chapters=[]
    for index,row in enumerate(subset):
        stage,title,minutes,goal,c1,b1,c2,b2,task,q1,o1,a1,q2,o2,a2=row
        files={'pom.xml':jdbc if stage=='boot-jdbc' or stage.startswith('a-') else base,java+'Application.java':app,java+'HealthController.java':health}
        if stage=='boot-http':files[java+'EchoController.java']=echo;files[java+'ApiErrors.java']=errors
        elif stage=='boot-layers':files.update({java+'TaskRepository.java':layersrepo,java+'TaskService.java':layersservice,java+'TaskController.java':layerscontroller})
        elif stage=='boot-jdbc' or stage.startswith('a-'):
            files.update({java+'TaskRepository.java':repo,java+'TaskService.java':service,java+'TaskController.java':controller.replace('LIST_RESULT','service.page(resource,page,size,completed)' if stage in ['a-pagination','a-transfer'] else 'service.all(resource)'),java+'ApiErrors.java':errors})
        if stage=='a-transfer':files['src/test/java/dev/codesomething/lab/TitleTest.java']=unit;files['RUN.md']='# 书签服务\nJava21与Maven3.9.14。设置SPRING_DATASOURCE_URL/USERNAME/PASSWORD后运行Application。\nmvn test；mvn package；java -jar target/boot-lab.jar。\nController读取请求并映射Input，Service校验并组织业务，Repository通过JdbcTemplate绑定SQL值，MySQL持久化，返回对象序列化为JSON。\n'
        directory=root/'course-packs'/cid/'1.0.0'/stage
        for kind in ['reference','starter']:
            target=directory/kind;target.mkdir(parents=True,exist_ok=True)
            for name,content in files.items():
                if stage=='a-transfer' and name.endswith('.java'):
                    content=content.replace('completed','saved').replace('tasks|bookmarks','bookmarks')
                if kind=='starter' and stage!='a-transfer':
                    if stage=='boot-start' and name.endswith('HealthController.java'):content=content.replace('new Health("ok")','new Health("todo")')
                    elif stage=='boot-http' and name.endswith('EchoController.java'):content=content.replace('status(201)','status(200)')
                    elif stage=='boot-layers' and name.endswith('TaskService.java'):content=content.replace('return repository.title();','return "待连接Repository";')
                    elif name.endswith('TaskRepository.java') and (stage=='boot-jdbc' or stage=='a-read'):content=content.replace('WHERE id=?','WHERE id=-1 OR id=? AND 1=0')
                    elif stage=='a-create' and name.endswith('TaskController.java'):content=content.replace('status(201)','status(200)')
                    elif stage=='a-update-delete' and name.endswith('TaskRepository.java'):content=content.replace('WHERE id=?",id);','WHERE id=-1 AND id=?",id);')
                    elif stage=='a-validation' and name.endswith('TaskService.java'):content=content.replace('input.title().strip().isEmpty()','false')
                    elif stage=='a-pagination' and name.endswith('TaskService.java'):content=content.replace('page*size','0*size')
                if kind=='starter' and stage=='a-transfer':
                    if name not in ['pom.xml',java+'Application.java']:continue
                if kind=='starter':
                    if stage=='a-create' and name.endswith('TaskRepository.java'):content=todo_method(content,'public Task create(')
                    if stage=='a-update-delete' and name.endswith('TaskService.java'):
                        content=todo_method(content,'public TaskRepository.Task update(');content=todo_method(content,'public void delete(')
                    if stage=='a-validation' and name.endswith('TaskService.java'):content=todo_method(content,'public String title(')
                    if stage=='a-pagination' and name.endswith('TaskService.java'):content=todo_method(content,'public Page page(')
                path=target/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content,encoding='utf-8')
        chapters.append(dict(stageId=stage,title=title,minutes=minutes,goal=goal,concepts=[dict(title=c1,body=b1),dict(title=c2,body=b2)],task=task,
            steps=['先预测请求的状态、字段和数据变化，再阅读本章示例。','下载本关骨架文件，按相对路径在IDEA建立工程；保持固定pom.xml。'+('数据库运行配置见下方环境说明。' if stage=='boot-jdbc' or stage.startswith('a-') else ''),'实现任务后运行Application，按验收清单逐条请求，记录实际结果。','在网页预览文件范围并配对，保存不可变快照，提交功能检查。','根据报告修复，再完成两道新情境理解题；正式双结果由服务端保存。'],
            requirements=[task,'修改后重新保存快照；旧报告始终对应原摘要。','环境失败可重试，不计为知识错误。'],pitfall=b2,
            example=('GET /api/health → 200 {"status":"ok"}' if stage=='boot-start' else 'POST /api/echo\n{"title":"学Java","completed":false} → 201' if stage=='boot-http' else 'Controller(service) → Service(repository) → Repository' if stage=='boot-layers' else 'SELECT id,title,completed FROM tasks WHERE id=?;\nPOST /api/tasks\n{"title":"O\'Reilly","completed":false}'),
            formalQuestions=[dict(id='apply',prompt=q1,options=o1),dict(id='transfer',prompt=q2,options=o2)],formalAnswer=dict(apply=a1,transfer=a2)))
    project=dict(schemaVersion=3,courseId=cid,courseVersion='1.0.0',status='published',title='接口启动实验室' if cid=='boot-foundations' else '个人任务管理',subtitle='四章，从启动到数据库' if cid=='boot-foundations' else '六关，从读取到独立迁移',description='在真实IDE编码，用隔离检查和新情境理解验证每一关。',outcomes=['可运行的Maven工程','真实接口与数据库操作','版本绑定的功能与理解证据'],prerequisites=['Java基础、HTTP/JSON；JDBC章节还需SQL基础'] if cid=='boot-foundations' else ['HTTP三个代码关、SQL书签迁移、Boot JDBC双结果'],chapters=chapters)
    (root/'course-packs'/cid/'1.0.0/project.json').write_text(json.dumps(project,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Authored 4 Boot chapters and 6 Project A stages with starters and references.')
mutation=root/'backend/src/main/resources/runner/boot/mutation'
mutation.mkdir(parents=True,exist_ok=True)
for name,content in {'Application.java':app,'HealthController.java':health,'TaskRepository.java':repo,'TaskService.java':service.replace('input.title().strip().isEmpty()','false'),'TaskController.java':controller.replace('LIST_RESULT','service.page(resource,page,size,completed)'),'ApiErrors.java':errors}.items():
    (mutation/name).write_text(content.replace('completed','saved').replace('tasks|bookmarks','bookmarks'),encoding='utf-8')
