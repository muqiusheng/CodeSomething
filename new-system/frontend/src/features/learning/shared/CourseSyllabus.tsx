import {milestoneTitles} from '../../../api/learning-api';
import {LearningSupport} from './LearningSupport';
import {CourseResources} from './CourseResources';
import {useEffect,useRef} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {curriculum,curriculumFor} from './curriculum';
import {JourneyDirectory} from '../journey/JourneyDirectory';
import {groupedLessons,modulesForCourse} from '../journey/catalog';
import '../../../styles/practice-steps.css';

export function ProjectLessonDirectory({courseId}:{courseId:string}){
 const selection=modulesForCourse(courseId);
 const section=useRef<HTMLElement>(null);
 const {hash}=useLocation();
 useEffect(()=>{
  if(hash!=='#project-lessons')return;
  const frame=requestAnimationFrame(()=>section.current?.scrollIntoView({block:'start'}));
  return ()=>cancelAnimationFrame(frame);
 },[hash]);
 if(!selection.length)return null;
 const lessons=selection.flatMap(index=>groupedLessons[index]);
 const mainCount=lessons.filter(lesson=>!lesson.elective).length;
 const practiceCount=lessons.length-mainCount;
 return <section id="project-lessons" ref={section} className="course-syllabus project-journey" aria-label="项目学习过程">
  <h2>项目学习过程</h2>
  <p>{mainCount} 节主线{practiceCount>0&&` · ${practiceCount} 节补练`} · 按课次在同一个工程里推进</p>
  <JourneyDirectory selection={selection} label="本项目课次"/>
 </section>;
}

export function CourseSyllabus({courseId,route}:{courseId:string;route:(stage:string)=>string}){
 const chapters=Object.entries(curriculum[courseId]||{});if(!chapters.length)return null;
 const count=chapters.reduce((n,[,c])=>n+c.lessons.length,0);
 return <><section className="course-syllabus" aria-label="分章学习目录"><h2>项目开发路线</h2><p>{chapters.length}章 · {count}个动手小节。一次完成一小节，在同一工程继续；功能完成由实际运行检查另行记录。</p>{chapters.map(([id,c],i)=><details key={id}><summary>{milestoneTitles[id]||'第'+(i+1)+'章 · '+c.title}<span>{c.lessons.length}节</span></summary><p>{c.before}</p><ol>{c.lessons.map(l=><li key={l.id}><Link to={route(id)+(route(id).includes('?')?'&':'?')+'lesson='+l.id}>{l.title}</Link></li>)}</ol><p>{c.after}</p></details>)}<details><summary>课程编排参考</summary><p>参考黑马公开路线的基础→Web→单体项目顺序，以及按功能分析、实现、测试拆分小节的方式。本页任务按当前项目和运行契约重新编写。</p><a href="https://www.bilibili.com/opus/494817843530680807" target="_blank" rel="noreferrer">查看黑马Java学习路线</a></details></section><ProjectLessonDirectory courseId={courseId}/></>;
}
export function ChapterBridge({courseId,stageId}:{courseId:string;stageId:string}){const p=curriculumFor(courseId,stageId);return <section className="chapter-bridge"><LearningSupport key={courseId+stageId} courseId={courseId} stageId={stageId}/><h2>{p.title}</h2><p><strong>已经有</strong>{p.before}</p><p><strong>本章新增</strong>{p.lessons.map(l=>l.title).join(' → ')}</p><p><strong>继续开发</strong>{p.after}</p><CourseResources courseId={courseId} stageId={stageId}/></section>}
