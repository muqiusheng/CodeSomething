import {localState} from '../../../api/browser-state.mjs';
import {ChevronRight as SummaryChevron} from 'lucide-react';
import {useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import '../../../styles/learning-improvements.css';

/** Versioned teaching support; never replaces a published package or learner source. */
export const SUPPORT_VERSION='2026-11-18.1';
export function LearningSupport({courseId,stageId}:{courseId:string;stageId:string}){
 const [closed,setClosed]=useState(false),[prediction,setPrediction]=useState('');
 if(closed)return <button className="text-button" onClick={()=>setClosed(false)}>重新查看本章起步讲解</button>;
 const http=courseId==='http-json-basics'&&stageId==='workspace',jdbc=courseId==='boot-foundations'&&stageId==='boot-jdbc';
 if(!http&&!jdbc)return null;
 return <section className="learning-primer" aria-label={http?'请求响应起步讲解':'JDBC完整数据流讲解'}>
 <h2>{http?'先看懂一次请求，再写第一个响应':'跟着一个编号走完数据库查询'}</h2>
 {http?<>
 <p>你会Java方法，现在让浏览器调用一个一直等待请求的Java程序。main负责创建并启动服务；浏览器请求到来时，执行createContext注册的处理器。exchange代表这一次请求和响应；lambda是把处理方法交给服务器的写法。</p>
 <h3>地址怎样找到你的代码</h3><pre tabIndex={0} role="region" aria-label="本节代码或数据示例"><code>{'http://localhost:8080/api/tasks/1\n主机 localhost → 找到自己的电脑\n端口 8080 → 找到正在监听的Java服务\n路径 /api/tasks/1 → 找到处理器与资源编号'}</code></pre>
 <p>在地址栏访问这个URL会发出GET请求。下面是教学演示数据，用来预测输出；真实结果稍后由你编写的TaskServer.java运行产生。</p>
 <pre tabIndex={0} role="region" aria-label="本节代码或数据示例"><code>{'浏览器：GET /api/tasks/1\nJava处理器：准备body并发送响应\n响应状态：200\nContent-Type: application/json; charset=utf-8\n正文：{"id":1,"title":"学习 HTTP","completed":false}'}</code></pre>
 <p>JSON是数据格式。id是数字，title是字符串，completed是布尔值；Java里的body变量是装着这段JSON的字符串。中文编码为UTF-8字节后再发送，所以响应长度使用bytes.length。响应头描述正文格式；状态码描述处理结果；正文承载具体数据。</p>
 <h3>预测一次</h3><p>把地址的8080改成8090，原Java程序仍只监听8080，会直接读到另一条任务吗？</p>
 <div className="primer-actions"><button className="button secondary" onClick={()=>setPrediction('不会。端口选择服务；要查其他任务，应保持端口并修改路径中的资源编号。8090没有服务时通常连接失败。')}>查看解释</button><button className="button secondary" onClick={()=>setClosed(true)}>已经理解，开始动手</button></div>
 <p>先在IDE建最小启动文件，接着按下方小节写出响应。启动配置可暂时模仿，处理器中的路径、数据和响应由你亲手加入。后续章节会继续细讲这些内容；安装和排错按实际所需时间进行。</p>
 <a href="https://docs.oracle.com/en/java/javase/21/docs/api/jdk.httpserver/com/sun/net/httpserver/HttpExchange.html" target="_blank" rel="noreferrer">JDK21请求响应文档</a>
 </>:<>
 <p>前面已把Controller和Service接起来。本章继续这份Boot工程，让Repository通过JdbcTemplate读取tasks表。DataSource提供数据库连接；JdbcTemplate管理执行与资源释放；你负责SQL、绑定参数以及每一行怎样变为Java对象。</p>
 <pre tabIndex={0} role="region" aria-label="本节代码或数据示例"><code>{'教学算例：tasks中已有(7, "读JDBC", false)\nGET /api/tasks/7 → Controller收到id=7\n→ Service.find(7) → Repository.find(7)\n→ SQL的?绑定数值7 → 读取一行\n→ Task(7, "读JDBC", false)\n→ JSON {"id":7,"title":"读JDBC","completed":false}'}</code></pre>
 <details><summary>展开完整读取示例并逐层对照</summary><p>下面是一条读取链的示例。放在你自己启动类所在包或子包中，每个public类分别保存，每个文件最前面写自己的package声明；已有同名类时增量修改。本章新增和生成键仍由你按后续小节实现。</p>
 <pre tabIndex={0} role="region" aria-label="本节代码或数据示例"><code>{`// Task.java：Java对象中的字段类型
public record Task(long id, String title, boolean completed) {}

// TaskRepository.java：把参数交给SQL，把结果行转成对象
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
@Repository
public class TaskRepository {
    private final JdbcTemplate jdbc;
    public TaskRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public Optional<Task> find(long id) {
        return jdbc.query(
            "SELECT id,title,completed FROM tasks WHERE id = ?",
            (rs, rowNum) -> new Task(rs.getLong("id"),
                rs.getString("title"), rs.getBoolean("completed")),
            id).stream().findFirst();
    }
}

// TaskService.java：在业务边界表达未找到
import java.util.Optional;
import org.springframework.stereotype.Service;
@Service
public class TaskService {
    private final TaskRepository repository;
    public TaskService(TaskRepository repository) { this.repository = repository; }
    public Optional<Task> find(long id) { return repository.find(id); }
}

// TaskController.java：映射请求并决定HTTP响应
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController
public class TaskController {
    private final TaskService service;
    public TaskController(TaskService service) { this.service = service; }
    @GetMapping("/api/tasks/{id}")
    public ResponseEntity<?> find(@PathVariable("id") long id) {
        var task = service.find(id);
        if (task.isEmpty()) return ResponseEntity.status(404)
            .body(Map.of("message", "任务不存在"));
        return ResponseEntity.ok(task.get());
    }
}`}</code></pre>
 <p>构造器把下一层交给当前类，单个构造器可省略@Autowired。?与最后一个id绑定，不能写成带引号的'?'。RowMapper每处理一行创建一个Task；数据库的列名与getLong/getString/getBoolean配对，JSON字段来自Task。请使用项目自己的包名，依赖和连接配置沿用本章要求。</p></details>
 <h3>对照三种失败</h3><p>查询不存在的id得到空集合，应返回404；SQL把title写成不存在的列，会抛数据访问异常；数据库连接错误应排查地址、凭据和环境。后两种错误都不能用“任务不存在”掩盖。</p>
 <p>现在动手：保持原接口，先在自己的练习库插入一条不同标题，再请求该编号。逐层写下id与title的值，核对网页真实检查的预期和实际；平台正式检查使用自己的隔离数据。</p>
 <a href="https://spring.io/guides/gs/relational-data-access/" target="_blank" rel="noreferrer">Spring JDBC官方示例</a> <button className="text-button" onClick={()=>setClosed(true)}>收起讲解，继续当前小节</button>
 </>}{prediction&&<p className="primer-feedback" role="status">{prediction}</p>}
 </section>;
}

export function FrontendBridge(){
 return <details className="learning-primer"><summary>可选实践 用自己的页面调用当前Java接口</summary>
 <p>在当前Boot工程的src/main/resources/static中新建tasks.html，保留已有Java代码。从http://localhost:你的端口/tasks.html访问；这样页面与接口同源。JavaScript负责浏览器交互，Java负责接口和业务，它们通过HTTP传JSON。</p>
 <h3>先做一个按钮和输出位置</h3><p>HTML定义结构，button产生点击，p显示结果；事件监听函数在点击后执行。把下面内容写入tasks.html，启动已有工程后点“读取任务”。</p>
 <pre tabIndex={0} role="region" aria-label="本节代码或数据示例"><code>{`<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><title>我的任务页面</title>
<button id="load">读取任务</button><p id="result" role="status"></p>
<script>
const result = document.querySelector('#result');
document.querySelector('#load').addEventListener('click', async () => {
  result.textContent = '正在读取…';
  try {
    const response = await fetch('/api/tasks/1');
    if (!response.ok) throw new Error('请求失败：' + response.status);
    const task = await response.json();
    result.textContent = task.title;
  } catch (error) { result.textContent = error.message; }
});
</script></html>`}</code></pre>
 <p>await等待响应与JSON读取；返回404时fetch仍可正常返回Response，因此要检查response.ok。用textContent展示文字，避免把接口数据作为HTML执行。</p>
 <h3>再加表单与独立变化</h3><p>在已经完成新增接口后，加入form、带label的title输入和submit按钮；监听submit并event.preventDefault()，读输入值，再调用下面的请求。把响应JSON的id与title显示到页面，最后刷新列表核对。</p>
 <pre tabIndex={0} role="region" aria-label="本节代码或数据示例"><code>{`const response = await fetch('/api/tasks', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({title: titleInput.value, completed: false})
});
if (!response.ok) throw new Error('新增失败：' + response.status);
const created = await response.json();`}</code></pre>
 <p>独立任务：把固定编号改成有标签的数字输入，支持读取一个存在与一个不存在的任务；加入提交期间禁用与结束后恢复按钮。打开开发者工具Network核对URL、方法、状态和JSON。若使用不同端口，先识别跨域错误，再按自己接口所需的来源和方法配置CORS；本练习优先同源。</p>
 <p>页面联调验收：读取、创建、失败提示均可演示。部署验收另做：停止并重启后页面和接口可访问，数据保留；按日志定位失败。Vue之前先完成HTML、事件、对象、JSON与异步请求练习，再核对所用Vue/Vite版本与锁文件。</p>
 <a href="https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch" target="_blank" rel="noreferrer">MDN Fetch教程</a>
 </details>;
}

export function TransferPractice({courseId,stageId}:{courseId:string;stageId:string}){
 const [params]=useSearchParams();
 const key='cs-transfer-note-v1-'+courseId+'-'+stageId;
 const [text,setText]=useState(()=>{try{return localState.getItem(key+'-draft')||localState.getItem(key)||''}catch{return ''}}),[notice,setNotice]=useState('');
 const task=courseId==='sql-foundations'?'换一组数据，查询未完成任务并说明空结果和分页边界。':courseId==='http-json-basics'?'在同一工程新增一种资源，自己定义字段、成功与404分支，并解释一次请求经过哪些代码。':courseId==='boot-foundations'||courseId==='task-manager'?'在同一工程新增字段或业务规则，协调数据库、接口和测试，再修复一个映射错误。':'用已有项目演示成功、权限拒绝和重启恢复，再说明你依据哪段日志修复问题。';
 return <details className="learning-primer evidence-practice"><summary><span>独立练习与隔天复查</span><SummaryChevron className="summary-chevron" size={17} aria-hidden="true"/></summary><p>{task}保留本章已通过功能，正式检查仍按原契约执行。</p><p>先关闭示例再动手；记录查阅资料、所用提示、代码位置和运行结果。隔天可回到本小节重做同难度变化任务。</p><label>我的练习与讲解笔记<textarea name="learning-notes" autoComplete="off" maxLength={6000} value={text} onChange={e=>{setText(e.target.value);try{localState.setItem(key+'-draft',e.target.value);setNotice('笔记草稿已暂存到此浏览器')}catch{setNotice('草稿暂存失败，请复制笔记自行保留。')}}}/></label><button className="button secondary" onClick={()=>{try{localState.setItem(key,text);localState.removeItem(key+'-draft');setNotice('笔记已保存到此浏览器；属于个人记录，尚未核实独立能力。')}catch{setNotice('浏览器无法保存，请复制笔记自行保留。')}}}>保存个人笔记</button><p role="status">{notice}</p><Link to={'?'+new URLSearchParams({...Object.fromEntries(params),practice:'revisit'}).toString()}>保留当前小节的复查链接</Link><p>功能通过、正式概念记录与个人笔记分别保存。独立完成和开放讲解由实际学习回访核实。</p></details>;
}
