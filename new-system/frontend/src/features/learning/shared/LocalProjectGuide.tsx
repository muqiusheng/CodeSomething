import {FolderPlus, FolderKey, Play} from 'lucide-react';
import {useState} from 'react';
import {learningRequest} from '../../../api/learning-api';
import '../../../styles/local-project.css';

/** Creation happens in the learner's IDE. Opening it never creates business code. */
export function LocalProjectGuide({courseId,configuration,practiceOnly=false}:{courseId:string;configuration?:Record<string,string>;practiceOnly?:boolean}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const sql=courseId==='sql-foundations',http=courseId==='http-json-basics',tlias=courseId==='tlias';
 async function open(){setBusy(true);setError('');try{const result=await learningRequest<{message:string}>('/local-ide/open',{});setMessage(result.message)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <section className="local-project-guide" aria-label="创建与开发本地工程"><h3>{sql?'在本地创建数据库工程':'在IDEA创建项目'}</h3><p>本项目始终使用同一个本地目录。按左侧章节开发，在IDE保存后回到网站读取文件、查看{tlias?'；按课程自查，自动判题尚未接入':practiceOnly?'，并按本节说明核对运行结果':'并检查'}。</p><button type="button" className="btn button secondary" disabled={busy} onClick={()=>void open()}>{busy?'正在打开…':'打开IDEA'}</button><details><summary>第一次创建怎么做</summary><ol><li>打开IDEA，选择New Project，在网站代码目录之外为本项目新建独立目录；已有工程用Open打开原目录。</li><li>{sql?'创建一个普通目录，将每章SQL保存为单独的.sql文件；使用自己的数据库工具连接练习库。':http?'选择Java、JDK21，不添加框架。在工程根目录亲手创建TaskServer.java，按本章指引编写 Java 代码。':'选择Java、Maven、JDK21。可用Spring Initializr创建Maven项目，选择所需的Web依赖，使用你自己的包名和启动类；业务类随章节亲手加入。'}</li><li>{sql?'在网站导入本章.sql文件，核对内容后提交正式检查。':tlias?'保存所有文件，使用下方读取本地Tlias工程入口查看。按本章命令在本机运行，对照预期与自查清单核对结果。':'完成当前小节后保存所有文件，通过下方本机工程连接选择项目根目录；浏览器授权连接可作备用。网站会记住工程目录。'}</li><li>下一章继续这个目录，添加当前功能；回看前章时保留最新源码。</li></ol><p>{http?(practiceOnly?'按本节指引在 IDEA 运行当前练习。':'本机运行：javac --add-modules jdk.httpserver TaskServer.java，再执行java --add-modules jdk.httpserver TaskServer。'):sql?'网站正式检查使用隔离数据库，与你自己的练习库分开。':'包名、启动类名和项目名可以自行命名；接口行为按本章要求实现。下方最小配置是参考，不会替换你的pom.xml。'}</p></details>{configuration&&Object.keys(configuration).length>0&&<details><summary>创建时核对最小配置</summary>{Object.entries(configuration).filter(([path])=>(http&&path==='TaskServer.java')||path==='pom.xml'||path.endsWith('/Application.java')||path.endsWith('application.properties')).map(([path,content])=><details key={path}><summary>{path}</summary><pre className="local-source-view" tabIndex={0} role="region" aria-label={path}>{content}</pre></details>)}</details>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error} 可手动打开IDEA继续创建，读取和检查不依赖此按钮。</p>}</section>;
}

export function ProjectStartCard({onConnect,disabled,practiceOnly}:{onConnect:()=>void;disabled:boolean;practiceOnly:boolean}){
 return <section className="card project-start-card" aria-label="首次连接本地工程">
  <ol>
   <li><FolderPlus aria-hidden="true"/><strong>① 新建文件夹</strong><span>用 IDE 打开项目目录</span></li>
   <li><FolderKey aria-hidden="true"/><strong>② 授权读取</strong><span>选择同一个目录</span></li>
   <li><Play aria-hidden="true"/><strong>③ 运行并检查</strong><span>{practiceOnly?'在 IDE 运行并核对结果':'保存代码，查看本节结果'}</span></li>
  </ol>
  <button type="button" className="btn button primary" disabled={disabled} onClick={onConnect}>选择本地工程文件夹</button>
 </section>;
}
