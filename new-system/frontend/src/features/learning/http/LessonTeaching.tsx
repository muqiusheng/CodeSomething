import {useState, useEffect, useRef} from 'react';
import {ArrowRight, Play, LoaderCircle, Check, X} from 'lucide-react';
import {JsonExplorer} from './JsonExplorer';

export function LessonTeaching({onStart}:{onStart:()=>void}){
 const [id,setId]=useState('1');const [response,setResponse]=useState('');
 const [title,setTitle]=useState('学习 HTTP');const [completed,setCompleted]=useState(false);const [busy,setBusy]=useState(false);const [tried,setTried]=useState<string[]>([]);const [message,setMessage]=useState('');
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);const inFlight=useRef(false);
 useEffect(()=>()=>{if(timer.current!==null)clearTimeout(timer.current);inFlight.current=false},[]);
 function send(){if(inFlight.current)return;inFlight.current=true;setBusy(true);setResponse('');setMessage('正在运行本地请求示例');const requestedId=id;timer.current=setTimeout(()=>{const success=requestedId==='1';setResponse(success?'200 OK\nContent-Type: application/json\n\n'+JSON.stringify({id:1,title,completed},null,2):'404 Not Found\nContent-Type: application/json\n\n'+JSON.stringify({message:'没有找到这条任务'},null,2));setTried(previous=>Array.from(new Set([...previous,success?'200':'404'])));setMessage(success?'已收到 200 响应':'已收到 404 响应');setBusy(false);inFlight.current=false;timer.current=null},450)}
 function cancel(){if(timer.current!==null)clearTimeout(timer.current);timer.current=null;inFlight.current=false;setBusy(false);setMessage('模拟请求已取消')}
 return <div className="teaching-flow">
 <section className="teaching-section" aria-labelledby="json-concept"><h2 id="json-concept"><span className="teaching-step" aria-hidden="true">1</span>用 JSON 表达一条任务</h2><p>一条任务有编号、标题和完成状态。如果把它们拼成一句话，前端就很难单独取出标题。</p><p className="concept-definition"><strong>JSON 用键值对组织数据。</strong>键是字段的名称，值是字段的具体内容。前端通过 <code>title</code>，就能读取任务标题。</p></section>
 <section className="teaching-section" aria-labelledby="json-example"><h2 id="json-example"><span className="teaching-step" aria-hidden="true">2</span>读懂响应中的三个字段</h2>
 <JsonExplorer title={title} completed={completed} disabled={busy} onChange={(nextTitle,nextCompleted)=>{setTitle(nextTitle);setCompleted(nextCompleted);setResponse('');setMessage('')}}/>
 <p className="syntax-note">键必须用双引号。值可以是字符串、数字或布尔值等；字符串加双引号，数字和布尔值不加。</p></section>
 <section className="teaching-section" aria-labelledby="json-practice"><h2 id="json-practice"><span className="teaching-step" aria-hidden="true">3</span>发送请求，观察返回结果</h2><p>先查询编号 <code>1</code>，再换成 <code>2</code>。对比两次请求的状态码和响应体。</p>
 <form className="request-demo" onSubmit={e=>{e.preventDefault();send()}}><label htmlFor="task-id">任务编号</label><div className="request-controls"><span className="method">GET</span><span className="endpoint">/api/tasks/</span><input id="task-id" name="taskId" autoComplete="off" type="number" min="1" required disabled={busy} value={id} onChange={e=>{setId(e.target.value);setResponse('');setMessage('')}}/><button className="button primary" type="submit" disabled={busy}>{busy?<LoaderCircle className="request-spinner" size={14} aria-hidden="true"/>:<Play size={14} aria-hidden="true"/>}{busy?'发送中…':'发送请求'}</button>{busy&&<button className="cancel-request" type="button" onClick={cancel} aria-label="取消模拟请求"><X size={15} aria-hidden="true"/></button>}</div><small>本地模拟 · 仅编号 1 的任务存在</small>
 <div className={`request-journey ${busy?'is-running':''} ${response?'has-result':''}`} aria-hidden="true"><span className="journey-node"><span className="journey-light"/>发出请求</span><span className="journey-wire"/><span className="journey-node"><span className="journey-light"/>查找任务</span><span className="journey-wire"/><span className="journey-node"><span className="journey-light"/>返回响应</span></div><span className="sr-only" role="status">{message}</span>
 {response&&<div className="request-result"><div className="response-heading"><h3>响应结果</h3><span className={`response-status ${response.startsWith('200')?'ok':'missing'}`}>{response.startsWith('200')?<Check size={13} aria-hidden="true"/>:<X size={13} aria-hidden="true"/>}{response.split('\n')[0]}</span></div><pre className="demo-output">{response}</pre></div>}
 {message==='模拟请求已取消'&&<p className="request-cancelled">{message}</p>}</form>
 <div className="exploration-status" role="group" aria-label="本次示例对比"><span>本次对比</span>{['200','404'].map(status=><span key={status} className={tried.includes(status)?'case-chip tried':'case-chip'}>{tried.includes(status)&&<Check size={12} aria-hidden="true"/>}{status} {status==='200'?'找到任务':'任务不存在'}</span>)}{tried.length===2&&<span className="comparison-done" role="status">两种响应都试过了</span>}</div>
 <div className="response-guide"><h3>观察什么？</h3><dl><div><dt>状态码</dt><dd><code>200</code> 表示请求成功；<code>404</code> 表示任务不存在。</dd></div><div><dt>响应体</dt><dd>携带任务数据或错误原因。即使返回 200，也要核对字段与类型。</dd></div></dl></div></section>
 <div className="teaching-next"><button className="button primary" onClick={onStart}>开始编码<ArrowRight size={15} aria-hidden="true"/></button></div>
 </div>
}
