import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight,Clock3,FileCode2} from 'lucide-react';
import {learningRequest,chapterTitles,type LearningResume} from '../../api/learning-api';
import {useLearningProgress} from '../../hooks/useLearningProgress';
import {lessonById,modules} from '../learning/journey/catalog';
import {curriculumFor} from '../learning/shared/curriculum';
import {readStudyPosition,saveStudyPosition} from '../learning/journey/study-position';
import {HomeReviewEntry} from '../reviews/HomeReviewEntry';
import {ProgressTrail} from './ProgressTrail';
import {HomePlayground} from './HomePlayground';
import {homeContext} from './home-context.mjs';
import '../../styles/learning-home.css';

export function Dashboard({duration}:{duration:string}){
 const [resume,setResume]=useState<LearningResume|null>(null);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 const [attempt,setAttempt]=useState(0);
 const {progress}=useLearningProgress();
 const position=readStudyPosition();
 const context=homeContext(resume,position);
 const resumingLesson=!!position&&context.href===position.href;
 const location=resumingLesson?context.location:chapterTitles[context.location]||context.location;
 const lessonId=context.href.match(/^\/learn\/journey\/([^?]+)$/)?.[1];
 const lesson=resumingLesson?position?.lesson:lessonById.get(lessonId||'');
 const stage=resume?.session;
 const plan=!lesson&&stage?curriculumFor(stage.courseId,stage.stageId):undefined;
 const sample=plan?.lessons.find(unit=>unit.sample)?.sample;
 const output=lesson?.result||plan?.lessons.at(-1)?.expected;
 const project=lesson?modules[lesson.module]?.name:context.title;
 const title=lesson?.title||plan?.title||context.title;

 useEffect(()=>{
  let active=true;
  setStatus('loading');
  void learningRequest<LearningResume>('/learning/continue').then(value=>{
   if(active){setResume(value);setStatus('ready');}
  }).catch(()=>{if(active)setStatus('error');});
  return ()=>{active=false;};
 },[attempt,progress]);

 function start(){
  if(resumingLesson&&position){
   saveStudyPosition(position.lesson,position.working,position.tab);
   return;
  }
  const lesson=context.href.startsWith('/learn/journey/')?lessonById.get(context.href.split('/').at(-1)||''):undefined;
  if(lesson)saveStudyPosition(lesson);
 }

 return <div className="page learning-home">
  <div className="learning-home-heading">
   <div><h1>继续学习</h1>{status==='ready'&&<p>{project}</p>}</div>
   <Link className="daily home-daily" to="/settings"><Clock3 size={19} aria-hidden="true"/>每日 {duration} 分钟计划</Link>
  </div>
  <div className="learning-home-grid">
  {status==='loading'&&<p role="status">正在读取学习位置…</p>}
  {status==='error'&&<section className="learning-home-task" aria-labelledby="resume-error">
   <h2 id="resume-error">学习位置暂未加载</h2>
   <div className="learning-home-actions">
    <button type="button" className="btn button primary" onClick={()=>setAttempt(value=>value+1)}>重新读取</button>
    <Link to={position?.href||'/learn/journey'}>{position?'打开本机记录的课次':'查看课程目录'}</Link>
   </div>
  </section>}
  {status==='ready'&&<section className="learning-home-task home-hero" aria-labelledby="resume-title">
   <div className="home-hero-copy">
   <p className="learning-home-location">{lesson?'第 '+lesson.number+' 节':location}</p>
   <h2 id="resume-title">{title}</h2>
   <p>{context.development}</p>
   <div className="learning-home-actions">
    <Link className="btn button primary" to={context.href} onClick={start}>{context.action}<ArrowRight size={16} aria-hidden="true"/></Link>
    <Link className="btn button secondary" to={context.projectHref}>项目目录</Link>
   </div>
   </div>
   {output&&<div className="home-deliverable">
    <h3><FileCode2 size={17} aria-hidden="true"/>{lesson?'本节目标产物':'本章目标产物'}</h3>
    <p>{lesson?.file||plan?.lessons.find(unit=>unit.sample)?.file||plan?.lessons[0]?.file}</p>
    <div className="home-code-card home-expected" tabIndex={sample?0:undefined}>
     <span>{sample?'课程代码示例':'预期运行结果'}</span>
     {sample&&<pre><code>{sample}</code></pre>}
     <p>{output}</p>
    </div>
   </div>}
  </section>}
  <ProgressTrail activeCourse={status==='ready'?context.courseId:undefined}/>
  <div className="home-interactions">
   <section className="learning-home-example" aria-labelledby="example-title">
    <h2 id="example-title">接口数据沙盒</h2>
    <HomePlayground/>
   </section>
   <HomeReviewEntry/>
  </div>
  <nav className="learning-home-directory" aria-label="学习目录">
   <Link to="/path">查看学习路径<ArrowRight size={15} aria-hidden="true"/></Link>
   <Link to="/learn/journey">查看全部课次<ArrowRight size={15} aria-hidden="true"/></Link>
   <Link to="/projects">查看项目<ArrowRight size={15} aria-hidden="true"/></Link>
  </nav>
  </div>
 </div>;
}
