import {Link} from 'react-router-dom';
import {type JourneyLesson, groupedLessons, lessonHref, mainLessons, workspaceHref} from './catalog';
import {firstResponse} from './foundations';
import {saveStudyPosition} from './study-position';
import '../../../styles/journey.css';

export const firstMain = `public class TaskServer {
    public static void main(String[] args) {
        System.out.println("今天我写出了第一个程序");
    }
}`;

const sendJson = `$body = @{ title = '我的一条任务'; completed = $false } | ConvertTo-Json
$response = Invoke-WebRequest -Method Post -Uri 'http://127.0.0.1:8080/api/tasks' -ContentType 'application/json; charset=utf-8' -Body $body
$response.StatusCode
$response.Content`;

const login = `$credentials = @{ username = '你的练习账号'; password = '课程提供的练习密码' } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:5195/api/auth/login' -ContentType 'application/json; charset=utf-8' -Body $credentials
$headers = @{ Authorization = "Bearer $($login.token)" }
Invoke-WebRequest -Uri 'http://127.0.0.1:5195/api/auth/me' -Headers $headers`;

const collaborationRun = String.raw`$project = Read-Host '输入你的项目 B 根目录绝对路径'
& .\new-system\tooling\deploy-r7.ps1 -Action start -ProjectDirectory $project -Instance journey-b -Port 5195
Invoke-RestMethod 'http://127.0.0.1:5195/api/health'`;

export const composeExample = `services:
  db:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: cs_lab
      MYSQL_USER: learner
      MYSQL_PASSWORD: \${PRACTICE_DB_PASSWORD:?Set PRACTICE_DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: \${PRACTICE_ROOT_PASSWORD:?Set PRACTICE_ROOT_PASSWORD}
    volumes:
      - mysql-data:/var/lib/mysql
      - ./schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
    healthcheck:
      test: [CMD, mysqladmin, ping, -h, localhost]
      interval: 5s
      timeout: 3s
      retries: 20
  app:
    image: eclipse-temurin:21-jdk-jammy
    command: [java, -jar, /app.jar, --server.address=0.0.0.0, --server.port=8080]
    ports: ["127.0.0.1:5197:8080"]
    volumes:
      - ./compose-app.jar:/app.jar:ro
    environment:
      SPRING_DATASOURCE_URL: jdbc:mysql://db:3306/cs_lab?allowPublicKeyRetrieval=true&useSSL=false
      SPRING_DATASOURCE_USERNAME: learner
      SPRING_DATASOURCE_PASSWORD: \${PRACTICE_DB_PASSWORD:?Set PRACTICE_DB_PASSWORD}
    depends_on:
      db:
        condition: service_healthy
volumes:
  mysql-data:`;

const checkpoints = new Set(['11','14','15','16','18','20','21','22','24','27','30','38','41','42','44','45','46','48','51','52','53','54','56','57','58','64']);

export const lessonLabel = (lesson: JourneyLesson) => lesson.elective?`补练 ${lesson.number}`:`第 ${lesson.number} 节`;

export function LessonContent({lesson, embedded=false, from, onOpenWorkspace}:{lesson:JourneyLesson;embedded?:boolean;from?:string;onOpenWorkspace?:()=>void}){
 const example = lesson.id==='01'?firstMain:lesson.id==='02'?firstResponse:undefined;
 const showRequest = /POST|PUT|DELETE|令牌|token|PowerShell/.test(lesson.run) && !['sql-foundations','http-json-basics'].includes(lesson.courseId);
 const sequence=lesson.elective?groupedLessons[lesson.module]:mainLessons;
 const next=sequence[sequence.indexOf(lesson)+1];
 return <div className="journey-lesson-content">
  {embedded&&<header><p>{lessonLabel(lesson)}</p><h2>{lesson.title}</h2></header>}
  <p className="journey-start"><strong>开始前</strong> {lesson.start}</p>
  <section className="journey-task" aria-label="这节要写的代码">
   <h2>动手写</h2>
   <p className="journey-file"><code>{lesson.file}</code></p>
   <p>{lesson.action}</p>
   {example&&<details open={lesson.id==='01'||undefined}><summary>{lesson.id==='01'?'查看要输入的代码':'展开第一个可运行的 HTTP 示例'}</summary><pre tabIndex={0} aria-label="代码示例"><code>{example}</code></pre></details>}
   {lesson.id==='62'&&<details open><summary>compose.yaml 起步示例</summary><pre tabIndex={0} aria-label="Compose 示例"><code>{composeExample}</code></pre></details>}
  </section>
  <section aria-label="运行和核对">
   <h2>怎么运行</h2><p>{lesson.run}</p>
   {lesson.courseId==='collaboration'&&lesson.stage!=='b-deploy'&&<details open={lesson.id==='49'||undefined}><summary>重建并启动项目 B 的练习实例</summary><p>先启动 Docker Desktop。在网站仓库根目录的 PowerShell 中执行。项目 B 的 pom.xml 要生成 target/boot-lab.jar。重复执行会重建这个实例并保留它的练习数据。关闭时把 start 改成 stop，保留同一个 Instance。</p><pre tabIndex={0} aria-label="项目 B 启动命令"><code>{collaborationRun}</code></pre></details>}
   {showRequest&&<details><summary>在 PowerShell 发请求的示例</summary><p>端口以当前程序为准。把地址、方法和输入换成本节给出的值。对照本节预期判断结果。</p><pre tabIndex={0} aria-label="PowerShell 请求示例"><code>{lesson.courseId==='collaboration'?login:lesson.stage==='boot-http'?sendJson.replace('/api/tasks','/api/echo'):sendJson}</code></pre></details>}
   <div className="journey-result"><h3>做完应该看到</h3><p>{lesson.result}</p></div>
   {lesson.id==='02'&&<p>点「运行并检查」让网站请求这个接口，自动核对状态码、纯文本格式和正文。想自己用浏览器体验时，可再从 IDEA 启动。</p>}
   {lesson.id==='01'&&<p>保存 TaskServer.java 后，在本节工程工作区点「运行并检查」。系统会运行 main，检查程序是否正常退出并打印了非空文字。</p>}
   {checkpoints.has(lesson.id)&&<p><strong>正式验证</strong> {lesson.id==='11'?'先按上面的步骤核对 200 和 404，再到工作区提交。这里的检查验证服务能持续响应请求。':'在工程工作区提交本章检查。'}通过后点「完成本关编码」保存进度，再继续。{lesson.courseId==='sql-foundations'&&'SQL 关使用「提交正式检查」。'}</p>}
  </section>
  <details className="journey-troubleshoot"><summary>卡住时先查这里</summary><p>{lesson.troubleshoot}</p></details>
  <div className="journey-actions">
   {embedded&&onOpenWorkspace&&<button type="button" className="btn button primary" onClick={onOpenWorkspace}>转到当前代码</button>}
   {embedded?<Link className="btn button secondary" to={lessonHref(lesson.id,from)} onClick={()=>saveStudyPosition(lesson)}>回到全流程课程</Link>:<Link className="btn button primary" to={workspaceHref(lesson,from)} onClick={()=>saveStudyPosition(lesson,true)}>{lesson.courseId==='portfolio'?'打开作品工作台':'打开本节工程工作区'}</Link>}
   {embedded&&next&&!['01','02'].includes(lesson.id)&&<Link className="btn button secondary" to={lessonHref(next.id,from)} onClick={()=>saveStudyPosition(next)}>继续下一节</Link>}
   {lesson.id==='13'&&<Link className="btn button secondary" to="/learn/http-json/1.1/fix-response?tab=任务&journey=12">提交修正后的任务接口</Link>}
  </div>
 </div>;
}
