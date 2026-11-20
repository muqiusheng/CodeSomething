import {Link} from 'react-router-dom';
import {groupedLessons,lessonHref,modules,type JourneyLesson} from './catalog';
import '../../../styles/journey.css';

const allModules=modules.map((_,index)=>index);
export function JourneyDirectory({selection=allModules,current,from,selected=selection[0],label='逐课目录'}:{
 selection?:readonly number[];current?:JourneyLesson;from?:string;selected?:number;label?:string;
}){
 return <nav className="journey-directory" aria-label={label}>
  {selection.map(index=>{
   const {name,goal}=modules[index];
   const lessons=groupedLessons[index];
   return <details key={name} open={selected===index||undefined}>
    <summary><span>{name}</span><small>{index>=9?'补练 · ':''}{lessons.length} 节</small></summary>
    {!current&&<p>{goal}</p>}
    <ol start={lessons[0].number}>
     {lessons.map(lesson=><li key={lesson.id}><Link to={lessonHref(lesson.id,lesson.elective?from:undefined)} aria-current={lesson.id===current?.id?'page':undefined}>{lesson.title}</Link></li>)}
    </ol>
   </details>;
  })}
 </nav>;
}
