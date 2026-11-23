import {localState} from '../../api/browser-state.mjs';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {Trophy,ArrowRight,FolderOpen,BookOpen,Check,ShieldCheck,Monitor,Accessibility} from 'lucide-react';
import {Modal} from '../ui/modal';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '../ui/tabs';
export function PortfolioPreview(){const [open,setOpen]=useState(false);return <div className="page"><div className="page-title"><h1>作品</h1></div><div className="empty-panel portfolio-empty" data-pointer-surface="hover"><div className="portfolio-icon"><Trophy size={34} strokeWidth={1.3} aria-hidden="true"/></div><h2>暂无作品</h2><p>完成项目后，整理代码、文档与验证记录。</p><div className="button-row centered"><Link className="button primary" to="/learn/http-json/1.0/json-response">继续学习<ArrowRight size={15} aria-hidden="true"/></Link><button className="button secondary" onClick={()=>setOpen(true)}><FolderOpen size={15} aria-hidden="true"/>看看作品档案</button></div></div><Modal open={open} onOpenChange={setOpen} title="你的作品档案" description="结构预览 · 尚无作品数据。"><Tabs defaultValue="run"><TabsList className="tabs"><TabsTrigger value="run">运行说明</TabsTrigger><TabsTrigger value="api">接口文档</TabsTrigger><TabsTrigger value="evidence">验证与讲解</TabsTrigger></TabsList><TabsContent value="run" className="artifact-sheet"><BookOpen size={26} aria-hidden="true"/><h3>让别人也能运行你的项目</h3><ul><li>项目目标与业务范围</li><li>环境、配置与启动命令</li><li>代码版本与演示入口</li></ul></TabsContent><TabsContent value="api" className="artifact-sheet"><code className="artifact-endpoint">GET /api/tasks</code><h3>说清每个接口的约定</h3><ul><li>请求参数与数据类型</li><li>成功响应与错误处理</li><li>数据库与接口的数据流</li></ul></TabsContent><TabsContent value="evidence" className="artifact-sheet"><ShieldCheck size={26} aria-hidden="true"/><h3>展示实现，也展示理解</h3><ul><li>功能测试与运行证据</li><li>关键技术选择与取舍</li><li>新情境下的独立修改</li></ul></TabsContent></Tabs></Modal></div>}
export function EvidenceGuide(){const [open,setOpen]=useState(false);return <><button className="button secondary" onClick={()=>setOpen(true)}><ShieldCheck size={15} aria-hidden="true"/>能力状态说明</button><Modal open={open} onOpenChange={setOpen} title="能力如何得到验证" description="以下是状态说明，不代表你已获得这些能力。"><ol className="evidence-guide">{[['学习中','正在阅读或尝试，还没有通过记录。'],['初步验证','完成规定任务，有有效的检查与理解结果。'],['独立验证','在减少帮助后独立复现，或完成新的迁移任务。'],['需要巩固','有后续尝试证据提示需要再次练习。']].map(([name,desc],i)=><li key={name}><span>{i+1}</span><div><h3>{name}</h3><p>{desc}</p></div></li>)}</ol></Modal></>}
export function MotionSettings({value,onSave,disabled=false}:{value?:string;onSave?:(value:string)=>Promise<void>;disabled?:boolean}={}) {
 const [preference,setPreference]=useState(()=>{try{return localState.getItem('cs-motion')||'system'}catch{return 'system'}});
 const [status,setStatus]=useState('');const [saving,setSaving]=useState(false);
 useEffect(()=>{if(value)setPreference(value)},[value]);
 async function change(next:string){
   setPreference(next);document.documentElement.dataset.motion=next;setStatus('');
   let cached=false;try{localState.setItem('cs-motion',next);cached=true}catch{}
   if(onSave){setSaving(true);try{await onSave(next);setStatus('已保存到本机数据库')}catch{setStatus(cached?'已在此浏览器生效，本机保存失败。可重新选择以重试。':'本次会话已生效，保存失败。可重新选择以重试。')}finally{setSaving(false)}}else{setStatus(cached?'已保存':'本次会话已生效')}
 }
 return <section className="profile-panel motion-preferences settings-refined" aria-labelledby="motion-title">
   <div className="settings-section-title"><span className="settings-symbol"><Accessibility size={20} aria-hidden="true"/></span><div><h2 id="motion-title">交互与动效</h2><p>选择适合你的界面反馈方式</p></div></div>
   <fieldset className="motion-options" disabled={disabled||saving}><legend className="sr-only">动效偏好</legend>
     {[{id:'system',name:'跟随系统',description:'根据设备偏好显示轻量过渡',Icon:Monitor},{id:'reduce',name:'减少动效',description:'减少位移与动画，状态即时切换',Icon:Accessibility}].map(({id,name,description,Icon})=><label className="motion-option" key={id}>
       <span className="motion-option-icon"><Icon size={20} aria-hidden="true"/></span><span className="motion-option-copy"><strong>{name}</strong><span>{description}</span></span><input type="radio" name="motion-preference" value={id} checked={preference===id} onChange={()=>void change(id)}/>
     </label>)}
   </fieldset>
   <div className="motion-save" role="status">{saving?'正在保存…':status}</div>
 </section>;
}
