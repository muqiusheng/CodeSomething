import {Link} from 'react-router-dom';
import {learningRequest,type LearningProgress} from '../../api/learning-api';
import type {ReadTrigger} from '../../api/learner-read-cache';
import {readScopedData,useScopedRead,visibleRefreshInterval} from '../../hooks/useScopedRead';

const modules=[
 {title:'HTTP 基础',courses:['http-json-basics'],href:'/projects/backend-foundations'},
 {title:'SQL 基础',courses:['sql-foundations'],href:'/projects/sql-foundations'},
 {title:'Spring Boot',courses:['boot-foundations'],href:'/projects/boot-foundations'},
 {title:'业务项目',courses:['task-manager','collaboration'],href:'/projects'},
 {title:'独立作品',courses:['portfolio'],href:'/portfolio'},
];
const courseIds=modules.flatMap(module=>module.courses).filter(id=>id!=='portfolio');
type Count={done:number;total:number};

async function readCounts(previous: Record<string,Count> | null, trigger: ReadTrigger) {
 const course=trigger instanceof CustomEvent && typeof trigger.detail==='string' ? trigger.detail : undefined;
 const progress=courseIds.map(async id=>{
  const version=id==='http-json-basics'?'1.1.0':'1.0.0';
  const path=`/learning/progress/${id}/${version}`;
  const data=await readScopedData(path,()=>learningRequest<LearningProgress>(path),course&&course!==id?'mount':trigger,{persist:true});
  if(!data)return null;
  const practices=id==='http-json-basics'?['workspace','workspace-http-text']:[];
  return [id,{done:data.completedCount+practices.filter(stage=>data.passedPractices?.includes(stage)).length,total:data.totalCodeStages+practices.length}] as const;
 });
 const portfolio=readScopedData('/portfolio',()=>learningRequest<{state:string}[]>('/portfolio'),course&&course!=='portfolio'?'mount':trigger,{persist:true})
  .then(works=>works?['portfolio',{done:Number(works.some(work=>work.state==='evidence-ready')),total:1}] as const:null);
 const results=await Promise.all([...progress,portfolio]);
 return {...previous,...Object.fromEntries(results.filter(result=>result!==null))};
}

export function ProgressTrail({activeCourse}:{activeCourse?:string}){
 const {data}=useScopedRead('home:module-counts',readCounts,{persist:true,interval:visibleRefreshInterval});
 const counts=data??{};
 const loading=data===null;
 return <section className="home-trail" aria-labelledby="home-trail-title">
  <h2 id="home-trail-title">模块进度</h2>
  <ol>{modules.map(({title,courses,href})=>{
   const current=activeCourse !== undefined && courses.includes(activeCourse);
   const available=courses.every(id=>counts[id]);
   const done=courses.reduce((sum,id)=>sum+(counts[id]?.done??0),0);
   const total=courses.reduce((sum,id)=>sum+(counts[id]?.total??0),0);
   const complete=available&&total>0&&done>=total;
   const percentage=available&&total>0?Math.min(100,Math.floor(100*done/total)):null;
   return <li key={title}><Link to={href} data-complete={complete} aria-current={current?'step':undefined}>
    <span className="trail-top"><span className="trail-state"><span className="trail-dot" aria-hidden="true"/>{current?'当前阶段':complete?'已完成':''}</span><strong title={available?`${done}/${total} 项已通过`:'进度暂未读取'}>{percentage===null?'—':percentage+'%'}</strong></span>
    <span className="trail-name">{title}</span>
    <progress aria-label={title+'进度'} max={100} value={percentage??0} hidden={percentage===null}/>
    {percentage===null&&<span className="trail-placeholder" aria-hidden="true">{loading&&<span className="loading-delay"><span className="loading-line"/></span>}</span>}
    <span className="trail-count">{available?(courses.includes('portfolio')?'作品 '+done+' / '+total:done+' / '+total+' 项已通过'):loading?<span className="sr-only">读取中…</span>:'进度暂不可用'}</span>
   </Link></li>;
  })}</ol>
 </section>;
}
