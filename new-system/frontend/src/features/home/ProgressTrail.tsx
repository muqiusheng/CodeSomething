import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight,Check} from 'lucide-react';
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

export function ProgressTrail({activeCourse}:{activeCourse:string}){
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
   if(live&&request===revision)setCounts(Object.fromEntries(results.flatMap(result=>result.status==='fulfilled'?[result.value]:[])));
  };
  void load();window.addEventListener('learning-progress',load);
  return()=>{live=false;window.removeEventListener('learning-progress',load)};
 },[]);
 return <section className="home-trail" aria-labelledby="home-trail-title">
  <h2 id="home-trail-title">模块进度</h2>
  <ol>{modules.map(({title,courses,href})=>{
   const current=courses.includes(activeCourse);
   const available=courses.every(id=>counts[id]);
   const done=courses.reduce((sum,id)=>sum+(counts[id]?.done??0),0);
   const total=courses.reduce((sum,id)=>sum+(counts[id]?.total??0),0);
   const complete=available&&total>0&&done>=total;
   return <li key={title}><Link to={href} data-complete={complete} aria-current={current?'step':undefined}>
    <span className="trail-icon">{complete?<Check size={14} aria-label="已完成"/>:<ArrowRight size={14} aria-hidden="true"/>}</span>
    <span>{title}</span><strong title={available?`${done}/${total} 项已通过`:'进度暂未读取'}>{available&&total>0?Math.floor(100*done/total)+'%':'—'}</strong>
   </Link></li>;
  })}</ol>
 </section>;
}
