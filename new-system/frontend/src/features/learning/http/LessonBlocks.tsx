import {LearningSupport} from '../shared/LearningSupport';
import {CourseResources} from '../shared/CourseResources';
import {useState} from 'react';
import {Check,ChevronDown,ArrowRight,Play,Code2,Lightbulb,RotateCcw} from 'lucide-react';
import type {Chapter} from '../../../api/learning-api';
import {HttpAnatomy} from './HttpAnatomy';
import {JsonExplorer} from './JsonExplorer';

export function ChapterTeaching({chapter,onPractice}:{chapter:Chapter;onPractice:()=>void}){
 const [title,setTitle]=useState('学习 HTTP');const [completed,setCompleted]=useState(false);
 return <div className="chapter-teaching"><LearningSupport key={chapter.stageId} courseId="http-json-basics" stageId={chapter.stageId}/><div className="chapter-goal"><Lightbulb size={19} aria-hidden="true"/><div><span>本章目标</span><p>{chapter.goal}</p></div></div>
 {chapter.concepts.map((concept,index)=><section className="concept-block" key={concept.title}><div className="concept-heading"><span aria-hidden="true">{String(index+1).padStart(2,'0')}</span><h2>{concept.title}</h2></div><div className="concept-content"><p>{concept.body}</p>{concept.items&&<ul className="concept-facts">{concept.items.map(item=><li key={item}><span aria-hidden="true"/><span>{item}</span></li>)}</ul>}{concept.example&&<pre className="concept-code"><code>{concept.example}</code></pre>}{concept.caption&&<p className="concept-caption">{concept.caption.replace("隔离运行器仍待接入。","功能结果请以本次检查报告为准。")}</p>}</div></section>)}
 {chapter.interactive==='json'?<section className="chapter-playground"><h2>动手改一份数据</h2><p>点选字段查看解释，再修改标题与完成状态。</p><JsonExplorer title={title} completed={completed} onChange={(nextTitle,nextCompleted)=>{setTitle(nextTitle);setCompleted(nextCompleted)}}/></section>:chapter.interactive&&<HttpAnatomy kind={chapter.interactive}/>}
 <CourseResources courseId="http-json-basics" stageId={chapter.stageId}/>
 <div className="chapter-next-action"><span>先理解，再做一次</span><button className="button primary" onClick={onPractice}>进入本章实践<ArrowRight size={15} aria-hidden="true"/></button></div></div>
}

export function TaskSteps({chapter,starter,onDownload}:{chapter:Chapter;starter:string;onDownload:()=>void}){
 const [active,setActive]=useState(0);const [completed,setCompleted]=useState<number[]>([]);const [copied,setCopied]=useState(false);const [copyError,setCopyError]=useState('');
 const step=chapter.steps[active];
 async function copy(){if(!step.command)return;try{await navigator.clipboard.writeText(step.command);setCopied(true);setCopyError('')}catch{setCopyError('复制不可用，请选中命令手动复制。')}}
 return <><section className="task-brief"><div className="task-brief-icon"><Code2 size={23} aria-hidden="true"/></div><div><h2>{chapter.taskTitle}</h2><p>{chapter.taskSummary}</p></div></section>
 <section className="task-runbook" aria-labelledby="runbook-heading"><div className="runbook-heading"><h3 id="runbook-heading">跟着步骤做</h3><span>勾选仅作个人备忘</span></div><div className="runbook-body"><ol className="runbook-nav">{chapter.steps.map((item,index)=><li key={item.title}><button aria-current={active===index?'step':undefined} onClick={()=>{setActive(index);setCopied(false);setCopyError('')}}><span className={completed.includes(index)?'step-marker marked':'step-marker'}>{completed.includes(index)?<Check size={13} aria-hidden="true"/>:index+1}</span><span>{item.title}</span></button></li>)}</ol><div className="runbook-current"><span className="step-position">步骤{active+1} / {chapter.steps.length}</span><h4>{step.title}</h4><p>{step.instruction}</p>{chapter.stageId==='run-server'&&active===0&&<button className="button secondary" onClick={onDownload}><Play size={14} aria-hidden="true"/>下载完整Java骨架</button>}{step.command&&<div className="command-example"><div><span>在练习目录执行</span><button onClick={()=>void copy()}>{copied?'已复制':'复制命令'}</button></div><pre><code>{step.command}</code></pre></div>}{copyError&&<p role="alert">{copyError}</p>}<div className="step-expected"><span>应该看到</span><p>{step.expected}</p></div><div className="runbook-actions"><label><input type="checkbox" checked={completed.includes(active)} onChange={e=>setCompleted(previous=>e.target.checked?[...previous,active]:previous.filter(index=>index!==active))}/>这一步我已操作</label>{active<chapter.steps.length-1?<button className="button secondary" onClick={()=>{setActive(value=>value+1);setCopied(false);setCopyError('')}}>下一步<ArrowRight size={14} aria-hidden="true"/></button>:<button className="text-button" onClick={()=>setActive(0)}><RotateCcw size={13} aria-hidden="true"/>回看步骤</button>}</div></div></div></section>
 <section className="acceptance-block"><h3>做对的标准</h3><ul>{chapter.requirements.map((requirement,index)=><li key={requirement}><span className="acceptance-order" aria-hidden="true">{index+1}</span><p>{requirement}</p></li>)}</ul></section>
 <details className="task-troubleshooting"><summary><Lightbulb size={17} aria-hidden="true"/>{chapter.pitfall.title}<ChevronDown size={16} aria-hidden="true"/></summary><p>{chapter.pitfall.body}</p></details>
 {chapter.mode==='code'&&<details className="starter-details"><summary>回看起步骨架（含待修复TODO）</summary><pre className="demo-output"><code>{starter}</code></pre></details>}</>
}

export function ChapterQuestion({chapter}:{chapter:Chapter}){
 const [answer,setAnswer]=useState<number|null>(null);const [checked,setChecked]=useState(false);const correct=answer===chapter.question.answer;
 return <section className="chapter-question"><div className="question-heading"><span>随堂练习</span><span>只反馈本次答案</span></div><fieldset><legend>{chapter.question.prompt}</legend><div className="question-options">{chapter.question.options.map((option,index)=><label key={option} className={answer===index?'selected':''}><input type="radio" name={'chapter-question-'+chapter.stageId} checked={answer===index} onChange={()=>{setAnswer(index);setChecked(false)}}/><span>{option}</span></label>)}</div></fieldset><button className="button primary" disabled={answer===null} onClick={()=>setChecked(true)}>核对答案<ArrowRight size={15} aria-hidden="true"/></button>{checked&&<div className={`question-result ${correct?'correct':'retry'}`} role="status"><strong>{correct?'这次判断正确':'再对照一下概念'}</strong><p>{chapter.question.explanation}</p></div>}</section>
}


