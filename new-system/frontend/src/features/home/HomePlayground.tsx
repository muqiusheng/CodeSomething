import {useState} from 'react';
import {Check, Radio, CircleAlert} from 'lucide-react';

const states = {
 200:{label:'200 OK',body:{id:1,title:'学习制作任务接口'}},
 404:{label:'404 Not Found',body:{error:'未找到这条任务'}},
 500:{label:'500 Internal Server Error',body:{error:'服务暂时无法读取任务'}},
} as const;

export function HomePlayground(){
 const [status,setStatus]=useState<keyof typeof states>(200);
 const [done,setDone]=useState(false);
 const sample=states[status];
 const body=status===200?{...states[200].body,completed:done}:sample.body;
 const fields=Object.entries(body);
 return <div className="home-sandbox">
  <div className="sandbox-controls"><div className="sandbox-request"><Radio size={16} aria-hidden="true"/><code>GET /api/tasks/1</code></div>
  <div className="sandbox-states" role="group" aria-label="HTTP 响应状态">
   {([200,404,500] as const).map(code=><button key={code} type="button" className="btn button secondary" aria-pressed={status===code} onClick={()=>setStatus(code)}>{code}</button>)}
  </div></div>
  <div className="home-example-flow">
   <div className="home-example-response home-code-card"><div className="sandbox-response-heading"><h3>模拟 JSON 响应</h3><span className="home-status" data-status={status}>{sample.label}</span></div><pre><code>{'{\n'}{fields.map(([key,value],index)=><span key={key}>
     {'  '}<span className="sandbox-json-key">{JSON.stringify(key)}</span>{': '}
     <span className={typeof value==='string'?'sandbox-json-string':'sandbox-json-value'}>{JSON.stringify(value)}</span>
     {index<fields.length-1?',\n':'\n'}
    </span>)}{'}'}</code></pre></div>
   <div className="home-example-preview">
    <div className="home-example-task" data-completed={status===200&&done} role="status">
     {status===200?<><span className="home-example-check" aria-hidden="true">{done&&<Check size={16}/>}</span><span>{done?<s>{states[200].body.title}</s>:states[200].body.title}<small>{done?'已完成':'待完成'}</small></span></>:<><CircleAlert size={18} aria-hidden="true"/><span>{status===404?states[404].body.error:states[500].body.error}</span></>}
    </div>
    {status===200&&<button type="button" className="btn button secondary" aria-pressed={done} onClick={()=>setDone(value=>!value)}>切换完成</button>}
   </div>
  </div>
 </div>;
}
