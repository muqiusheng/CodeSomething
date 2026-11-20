import {useEffect} from 'react';
import {ArrowLeft,ArrowRight} from 'lucide-react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {groupedLessons,journeyRoot,lessonById,lessonHref,mainLessons,modules,type JourneyLesson} from './catalog';
import {LessonContent,lessonLabel} from './LessonContent';
import {JourneyDirectory} from './JourneyDirectory';
import {useLearningProgress} from '../../../hooks/useLearningProgress';

import {readStudyPosition,saveStudyPosition} from './study-position';

export function JourneyEntry({children='全流程课程 · 90 节'}:{children?:string}){
 return <Link className="btn button secondary" to={journeyRoot}>{children}<ArrowRight size={16} aria-hidden="true"/></Link>;
}

function LessonPage({lesson,from}:{lesson:JourneyLesson;from?:string}){
 const practiceStage=lesson.id==='01'?'workspace':lesson.id==='02'?'workspace-http-text':undefined;
 const sequence=lesson.elective?groupedLessons[lesson.module]:mainLessons;
 const index=sequence.indexOf(lesson), previous=sequence[index-1], next=sequence[index+1];
 const references=modules[lesson.module].references;
 const suggested=lesson.module<=4?groupedLessons[9]:lesson.module===5?groupedLessons[10]:lesson.module<=7?groupedLessons[11]:[];
 useEffect(()=>{
  window.scrollTo(0,0);
 },[lesson]);
 return <div className="page journey-page">
  <Link className="back-link" to={journeyRoot}>← 全流程课程目录</Link>
  <div className="journey-layout">
   <article className="journey-article">
    <header><p className="journey-module">{modules[lesson.module].name} · {lessonLabel(lesson)}</p><h1>{lesson.title}</h1></header>
    {practiceStage&&<VerifiedPractice stage={practiceStage}/>}
    <LessonContent lesson={lesson} from={from}/>
    {references.length>0&&<details className="journey-references"><summary>查阅本模块教程</summary><ul>{references.map(([title,url])=><li key={url}><a href={url} target="_blank" rel="noreferrer">{title}</a></li>)}</ul></details>}
    {!lesson.elective&&suggested.length>0&&<details className="journey-references"><summary>卡住了？选一节补练</summary><ul>{suggested.map(item=><li key={item.id}><Link to={lessonHref(item.id,lesson.id)}>{item.title}</Link></li>)}</ul></details>}
    <nav className="journey-next" aria-label="前后课次">
     {previous?<Link className="btn button secondary" to={lessonHref(previous.id,from)}><ArrowLeft size={16} aria-hidden="true"/>上一节</Link>:<Link className="btn button secondary" to={journeyRoot}>课程目录</Link>}
     {lesson.elective&&from&&<Link className="btn button secondary" to={lessonHref(from)}>返回主线第 {Number(from)} 节</Link>}
     {next?<Link className="btn button primary" to={lessonHref(next.id,from)} onClick={()=>saveStudyPosition(next)}>下一节 · {next.title}<ArrowRight size={16} aria-hidden="true"/></Link>:<Link className="btn button primary" to={from?lessonHref(from):journeyRoot}>{from?'回到主线':'查看课程目录'}</Link>}
    </nav>
   </article>
   <aside className="journey-outline"><h2>课程目录</h2><JourneyDirectory current={lesson} selected={lesson.module} from={from}/></aside>
  </div>
 </div>;
}

function VerifiedPractice({stage}:{stage:string}){
 const {progress}=useLearningProgress();
 return progress?.passedPractices?.includes(stage)?<p className="check-pass">已通过自动检查 · 通关已保存</p>:null;
}

export function Journey(){
 const {lessonId}=useParams();
 const [search]=useSearchParams();
 const origin=lessonById.get(search.get('from')||'');
 if(lessonId){
  const lesson=lessonById.get(lessonId);
  if(!lesson)return <div className="page journey-page"><h1>找不到这节课</h1><Link className="btn button primary" to={journeyRoot}>返回课程目录</Link></div>;
  return <LessonPage key={lesson.id} lesson={lesson} from={lesson.elective&&!origin?.elective?origin?.id:undefined}/>;
 }
 const position=readStudyPosition();
 const resume=position?.lesson;
 return <div className="page journey-page">
  <Link className="back-link" to="/path">← 学习路径</Link>
  <header className="journey-index-heading"><h1>Java 后端全流程课程</h1><p>从第一次运行 Java 程序，到交付并讲清自己的后端作品。</p><p>{mainLessons.length} 节主线 · {groupedLessons.slice(9).flat().length} 节补练与选修</p><Link className="btn button primary" to={position?.href||lessonHref('01')} onClick={()=>saveStudyPosition(resume||mainLessons[0],position?.working,position?.tab)}>{resume?`继续第 ${resume.number} 节 · ${resume.title}`:'开始第 1 节'}<ArrowRight size={16} aria-hidden="true"/></Link></header>
  <JourneyDirectory selected={resume?.module}/>
 </div>;
}
