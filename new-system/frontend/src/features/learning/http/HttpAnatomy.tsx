import {useState} from 'react';
import {ArrowDown,ArrowRight} from 'lucide-react';

export function HttpAnatomy({kind}:{kind:'request'|'response'|'trace'}){
 const [selected,setSelected]=useState(0);const [missing,setMissing]=useState(false);
 const pieces=kind==='request'?[
  {label:'方法',value:'GET',title:'GET：读取一份资源',body:'这一关用GET查询数据。方法与路径一起表达你希望服务端做什么。'},
  {label:'主机与端口',value:'localhost:8080',title:'找到正在监听的程序',body:'localhost指本机，8080选择练习服务。它与平台网页使用的5178端口不同。'},
  {label:'资源路径',value:'/api/tasks/1',title:'找到这条任务',body:'tasks是资源名称，末尾1是编号。只查询另一条任务时，改编号，保留主机和端口。'}
 ]:kind==='response'?[
  {label:'状态码',value:missing?'404 Not Found':'200 OK',title:missing?'404：没有找到目标任务':'200：请求成功',body:missing?'这是正常的未找到情形，用404说明资源不存在。它不表示服务器崩溃。':'状态码是第一层检查，接下来仍需核对响应体字段与类型。'},
  {label:'响应头',value:'Content-Type: application/json',title:'先说明数据格式',body:'响应头告诉客户端用JSON解析响应体。它本身不是任务数据。'},
  {label:'响应体',value:missing?'{ "message": "没有找到这条任务" }':'{ "id": 1, "title": "学习 HTTP", "completed": false }',title:missing?'把原因也说清楚':'业务数据在这里',body:missing?'错误说明也可以使用JSON；格式与状态码分别承担不同职责。':'这是一个对象，三个字段分别是数字、字符串与布尔值。'}
 ]:[
  {label:'读取路径',value:missing?'/api/tasks/2':'/api/tasks/1',title:'从请求取出路径',body:'getRequestURI().getPath()得到路径。端口不会混进path变量。'},
  {label:'选择分支',value:missing?'else → 未找到':'if → 找到任务',title:missing?'编号2进入else':'编号1进入成功分支',body:'骨架比较path是否等于/api/tasks/1。修改编号后，可以预测将进入哪个分支。'},
  {label:'准备响应',value:missing?'status = 200  // 待修复':'completed: "false"  // 待修复',title:'找到需要修改的变量',body:missing?'这里的status应该是404。修改message文字，不会自动改变状态码。':'这里的completed仍是字符串。应该去掉JSON值周围的双引号，表达布尔值false。'}
 ];
 return <section className={`http-anatomy anatomy-${kind}`} aria-label={kind==='request'?'请求剖析':kind==='response'?'响应剖析':'代码追踪'}><div className="anatomy-toolbar"><strong>{kind==='request'?'拆开一条请求':kind==='response'?'响应剖析台':'跟着请求走'}</strong>{kind!=='request'&&<div role="group" aria-label="选择任务编号"><button aria-pressed={!missing} onClick={()=>setMissing(false)}>编号1</button><button aria-pressed={missing} onClick={()=>setMissing(true)}>编号2</button></div>}<span className="anatomy-example">教学示例</span></div><div className="anatomy-pieces">{pieces.map((piece,index)=><button key={piece.label} aria-pressed={selected===index} onClick={()=>setSelected(index)}><span>{piece.label}</span><code>{piece.value}</code>{kind==='trace'&&index<2&&<ArrowDown className="trace-arrow" size={16} aria-hidden="true"/>}</button>)}</div><div className="anatomy-explanation" role="status"><span className="anatomy-cursor"><ArrowRight size={18} aria-hidden="true"/></span><div><h3>{pieces[selected].title}</h3><p>{pieces[selected].body}</p></div></div></section>
}
