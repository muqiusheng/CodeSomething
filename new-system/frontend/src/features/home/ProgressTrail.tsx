import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {learningRequest,type LearningProgress} from '../../api/learning-api';

const modules=[
 {title:'HTTP 基础',courses:['http-json-basics'],href:'/projects/backend-foundations'},
 {title:'SQL 基础',courses:['sql-foundations'],href:'/projects/sql-foundations'},
 {title:'Spring Boot',courses:['boot-foundations'],href:'/projects/boot-foundations'},
 {title:'业务项目',courses:['task-manager','collaboration'],href:'/projects'},
 {title:'独立作品',courses:['portfolio'],href:'/portfolio'},
];
const courseIds=modules.flatMap(module=>module.courses).filter(id=>id!=='portfolio');
type Count={done:number;total:number};

export function ProgressTrail({activeCourse}:{activeCourse?:string}){
 const [loading,setLoading]=useState(true);
 const [counts,setCounts]=useState<Record<string,Count>>({});
 useEffect(()=>{
  let live=true;
  let revision=0;
  const load=async()=>{
   const request=++revision;
   const progress=courseIds.map(async id=>{
    const version=id==='http-json-basics'?'1.1.0':'1.0.0';
    const data=await learningRequest<LearningProgress>(`/learning/progress/${id}/${version}`);
    const practices=id==='http-json-basics'?['workspace','workspace-http-text']:[];
    return [id,{done:data.completedCount+practices.filter(stage=>data.passedPractices?.includes(stage)).length,total:data.totalCodeStages+practices.length}] as const;
   });
   const portfolio=learningRequest<{state:string}[]>('/portfolio').then(works=>['portfolio',{done:Number(works.some(work=>work.state==='evidence-ready')),total:1}] as const);
   const results=await Promise.allSettled([...progress,portfolio]);
   if(live&&request===revision){
    setCounts(Object.fromEntries(results.flatMap(result=>result.status==='fulfilled'?[result.value]:[])));
    setLoading(false);
   }
  };
  void load();window.addEventListener('learning-progress',load);
  return()=>{live=false;window.removeEventListener('learning-progress',load)};
 },[]);
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
    {percentage===null&&<span className="trail-placeholder" aria-hidden="true"/>}
    <span className="trail-count">{available?(courses.includes('portfolio')?'作品 '+done+' / '+total:done+' / '+total+' 项已通过'):loading?'读取中…':'进度暂不可用'}</span>
   </Link></li>;
  })}</ol>
 </section>;
}
