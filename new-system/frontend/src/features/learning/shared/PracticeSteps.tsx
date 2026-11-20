import {useWorkspaceView} from './WorkspaceLayout';
import {useEffect,useState,useRef,type ReactNode} from 'react';
import {ArrowLeft,ArrowRight,Target,BookOpen,MapPin} from 'lucide-react';
import {curriculumFor,resolveLesson} from './curriculum';
import {useSearchParams} from 'react-router-dom';
import {LessonContent} from '../journey/LessonContent';
import {lessonById} from '../journey/catalog';
import '../../../styles/practice-steps.css';

export type PracticeStep={title:string;instruction:string;expected:string;id?:string;file?:string;sample?:string};
/** Operation notes are intentionally separate from server-verified completion. */
export function PracticeSteps({scope,goal,steps,courseId,stageId,onOpenWorkspace,core,runReference}:{scope:string;goal:string;steps?:PracticeStep[];courseId?:string;stageId?:string;onOpenWorkspace?:()=>void;core?:(step:number,select:(step:number)=>void)=>ReactNode;runReference?:ReactNode}){
 const workspaceView=useWorkspaceView();
 const plan=courseId&&stageId?curriculumFor(courseId,stageId):null;
 const units=plan?.lessons.length?plan.lessons:steps||[];
 const key=(plan?'cs-practice-lessons-v2-':'cs-practice-steps-')+scope;
 const [params,setParams]=useSearchParams();
 const journeyLesson=lessonById.get(params.get('journey')||'');
 const matchingLesson=journeyLesson?.courseId===courseId&&journeyLesson?.stage===stageId?journeyLesson:undefined;
 const [index,setIndex]=useState(()=>{try{const saved=params.get('lesson')||localStorage.getItem(key);if(plan)return resolveLesson(plan.lessons,saved);const n=Number(saved);return Number.isInteger(n)&&n>=0&&n<units.length?n:0}catch{return 0}});
 const currentPanel=useRef<HTMLDivElement>(null);
 const [warning,setWarning]=useState('');
 useEffect(()=>{const lesson=params.get('lesson');if(plan&&lesson)setIndex(resolveLesson(plan.lessons,lesson))},[params.get('lesson')]);
 useEffect(()=>{try{localStorage.setItem(key,plan?units[index]?.id||'':String(index))}catch{setWarning('步骤位置未能保存，刷新后可手动回到这一步。')}},[key,index]);
 const current=units[Math.min(index,units.length-1)];
 function move(next:number){setIndex(next);if(plan){const search=new URLSearchParams(params);search.set('lesson',units[next].id!);setParams(search,{replace:true})}requestAnimationFrame(()=>{currentPanel.current?.focus({preventScroll:true});currentPanel.current?.scrollIntoView({block:'nearest',behavior:'instant'})})}
 const overview=<section className="practice-goal" aria-label="工程增量概览"><h3><Target size={16} aria-hidden="true"/>本章目标</h3>{plan&&<p><strong>开始时</strong>{plan.before}</p>}<p><strong>本章做出</strong>{goal}</p>{plan&&<p><strong>接下来</strong>{plan.after}</p>}</section>;
 const reference=runReference&&<details className="practice-run-reference">
  <summary>本地运行与配置参考</summary>{runReference}
 </details>;
 if(matchingLesson)return <section className="practice-steps" aria-label="当前全流程课次">{overview}<LessonContent lesson={matchingLesson} embedded from={params.get('from')||undefined} onOpenWorkspace={onOpenWorkspace||(()=>{workspaceView?.select('code');requestAnimationFrame(()=>document.querySelector('[data-local-reader],.local-project-guide')?.scrollIntoView({block:'start'}))})}/>{reference}</section>;
 if(!current)return null;
 return <section className="practice-steps" aria-label="逐步实践">{overview}{core?.(index,move)}<div ref={currentPanel} className="practice-current" role="group" tabIndex={-1} aria-label="当前操作指引"><div className="practice-current-heading"><BookOpen size={18} aria-hidden="true"/><strong>{core?'当前操作':'核心操作步骤'}</strong><span>第{index+1}节 / 共{units.length}节</span></div><h2>{current.title}</h2>{current.file&&<p className="practice-file"><MapPin size={14} aria-hidden="true"/><span>修改位置：{current.file}</span><button type="button" className="text-button" onClick={()=>onOpenWorkspace?onOpenWorkspace():document.querySelector('[data-local-reader], .local-project-guide, .code-editor-toolbar')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}>查看工程</button></p>}<p className="practice-instruction">{current.instruction}</p>{current.sample&&<details className="practice-sample"><summary>看一小段语法提示</summary><pre tabIndex={0} role="region" aria-label="本节语法提示"><code>{current.sample}</code></pre><p>提示只说明写法，当前功能由你补齐。</p></details>}<p className="practice-expected"><strong>做完观察</strong>{current.expected}</p><div className="practice-step-actions"><button type="button" className="btn button secondary" disabled={index===0} onClick={()=>move(index-1)}><ArrowLeft size={14} aria-hidden="true"/>上一步操作</button>{index<units.length-1?<button type="button" className="btn button primary" onClick={()=>move(index+1)}>下一步操作<ArrowRight size={14} aria-hidden="true"/></button>:<button type="button" className="btn button primary" onClick={()=>onOpenWorkspace?onOpenWorkspace():document.querySelector('[data-local-reader], .local-project-guide, .code-editor-toolbar')?.scrollIntoView({block:'center',behavior:'smooth'})}>去读取工程并检查<ArrowRight size={14} aria-hidden="true"/></button>}</div><small>按自己的节奏操作，可以随时暂停；小节位置自动保存。</small></div>
 {reference}{warning&&<p role="status">{warning}</p>}</section>;
}
