import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight,Clock3} from 'lucide-react';
import {getPreferences} from '../../api/api';
import {learningRequest,chapterTitles,type LearningResume} from '../../api/learning-api';
import {useLearningProgress} from '../../hooks/useLearningProgress';
import {lessonById} from '../learning/journey/catalog';
import {readStudyPosition,saveStudyPosition} from '../learning/journey/study-position';
import {HomeReviewEntry} from '../reviews/HomeReviewEntry';
import {ProgressTrail} from './ProgressTrail';
import {HomePlayground} from './HomePlayground';
import {homeContext} from './home-context.mjs';
import '../../styles/learning-home.css';

export function Dashboard(){
 const [duration,setDuration]=useState('60');
 const [resume,setResume]=useState<LearningResume|null>(null);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 const [attempt,setAttempt]=useState(0);
 const {progress}=useLearningProgress();
 const position=readStudyPosition();
 const context=homeContext(resume,position);
 const resumingLesson=!!position&&context.href===position.href;
 const location=resumingLesson?context.location:chapterTitles[context.location]||context.location;

 useEffect(()=>{
  let active=true;
  setStatus('loading');
  void learningRequest<LearningResume>('/learning/continue').then(value=>{
   if(active){setResume(value);setStatus('ready');}
  }).catch(()=>{if(active)setStatus('error');});
  return ()=>{active=false;};
 },[attempt,progress]);
 useEffect(()=>{
  try {
   const saved=localStorage.getItem('cs-duration');
   if(saved&&['30','60','90'].includes(saved))setDuration(saved);
  } catch {
   // Use the default while reading preferences.
  }
  let active=true;
  void getPreferences().then(value=>{if(active)setDuration(String(value.dailyMinutes));}).catch(()=>{});
  return ()=>{active=false;};
 },[]);

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
   <h1>学习</h1>
   <Link className="daily" to="/settings"><Clock3 size={16} aria-hidden="true"/>每日{duration}分钟</Link>
  </div>
  <div className="learning-home-grid"><div className="home-main-column">
  {status==='loading'&&<p role="status">正在读取学习位置…</p>}
  {status==='error'&&<section className="learning-home-task" aria-labelledby="resume-error">
   <h2 id="resume-error">学习位置暂未加载</h2>
   <div className="learning-home-actions">
    <button type="button" className="btn button primary" onClick={()=>setAttempt(value=>value+1)}>重新读取</button>
    <Link to={position?.href||'/learn/journey'}>{position?'打开本机记录的课次':'查看课程目录'}</Link>
   </div>
  </section>}
  {status==='ready'&&<section className="learning-home-task" aria-labelledby="resume-title">
   <h2 id="resume-title">{context.title}</h2>
   <p className="learning-home-location">{location}</p>
   <p>{context.development}</p>
   <div className="learning-home-actions">
    <Link className="btn button primary" to={context.href} onClick={start}>{context.action}<ArrowRight size={16} aria-hidden="true"/></Link>
    {!context.firstVisit&&<Link to={context.projectHref}>项目目录</Link>}
   </div>
  </section>}
  <ProgressTrail activeCourse={context.courseId}/>
  <nav className="learning-home-directory" aria-label="学习目录">
   <Link to="/path">查看学习路径<ArrowRight size={15} aria-hidden="true"/></Link>
   <Link to="/learn/journey">查看全部课次<ArrowRight size={15} aria-hidden="true"/></Link>
   <Link to="/projects">查看项目<ArrowRight size={15} aria-hidden="true"/></Link>
  </nav>
  </div><div className="home-side-column">
   <section className="learning-home-example" aria-labelledby="example-title">
    <h2 id="example-title">接口数据沙盒</h2>
    <p>切换 HTTP 状态，观察同一个页面如何显示任务、空结果和服务错误。</p>
    <HomePlayground/>
   </section>
   <HomeReviewEntry/>
  </div></div>
 </div>;
}
