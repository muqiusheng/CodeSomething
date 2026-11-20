import {useState} from 'react';
import {Check, RotateCcw} from 'lucide-react';

type Field='id'|'title'|'completed';
const fields:Field[]=['id','title','completed'];
const explanations={id:{type:'数字',name:'任务编号',detail:'数字不加双引号。客户端用编号查找对应的任务。'},title:{type:'字符串',name:'任务标题',detail:'字符串需要双引号。前端读取 title，就能显示任务标题。'},completed:{type:'布尔值',name:'完成状态',detail:'true 表示已完成，false 表示未完成。布尔值不加双引号。'}};
export function JsonExplorer({title,completed,onChange,disabled=false}:{title:string;completed:boolean;onChange:(title:string,completed:boolean)=>void;disabled?:boolean}){
 const [field,setField]=useState<Field>('title');const info=explanations[field];
 return <div className="json-explorer"><figure className="json-example interactive-json"><figcaption><span>点选字段，查看含义</span><button className="reset-example" disabled={disabled} onClick={()=>{onChange('学习 HTTP',false);setField('title')}}><RotateCcw size={13} aria-hidden="true"/>重置</button></figcaption><div className="json-source" role="group" aria-label="交互 JSON 示例"><span className="json-brace">{'{'}</span>{fields.map((key,index)=><button type="button" key={key} className="json-line" aria-pressed={field===key} aria-controls="field-explanation" aria-label={`查看 ${key} 字段`} onClick={()=>setField(key)}><span className="json-key">"{key}"</span><span>: </span><span className={key==='title'?'json-string':'json-number'}>{key==='id'?'1':key==='title'?JSON.stringify(title):String(completed)}</span><span>{index<2?',':''}</span></button>)}<span className="json-brace">{'}'}</span></div></figure>
 <div className="field-explanation" id="field-explanation" role="status" aria-live="polite"><div><code>{field}</code><span className="field-type">{info.type}</span><strong>{info.name}</strong></div><p>{info.detail}</p></div>
 <div className="example-controls"><label htmlFor="example-title">任务标题<input id="example-title" name="exampleTitle" autoComplete="off" disabled={disabled} maxLength={80} value={title} onChange={e=>onChange(e.target.value,completed)}/></label><div className="completed-control"><span id="completed-label">完成状态</span><button type="button" role="switch" aria-checked={completed} aria-labelledby="completed-label" disabled={disabled} className="task-switch" onClick={()=>{setField('completed');onChange(title,!completed)}}><span className="switch-thumb">{completed&&<Check size={10} aria-hidden="true"/>}</span></button><span className="switch-value">{String(completed)}</span></div></div>
 </div>
}
