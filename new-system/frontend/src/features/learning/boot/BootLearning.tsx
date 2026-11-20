import {FrontendBridge} from '../shared/LearningSupport';
import {CodeCompletion} from '../shared/CodeCompletion';
import {TutorProvider} from '../../tutor/TutorSession';
import {LessonTutorDrawer} from '../../tutor/LessonTutor';
import {WorkspaceLayout} from '../shared/WorkspaceLayout';
import {WorkspaceTaskPane} from '../shared/WorkspaceTaskPane';
import {WorkspaceDivider} from '../shared/WorkspaceDivider';
import {CourseSyllabus,ChapterBridge} from '../shared/CourseSyllabus';
import {PracticeSteps} from '../shared/PracticeSteps';
import {curriculumFor} from '../shared/curriculum';
import {isJourneyWorkspace,saveStudyTab} from '../journey/study-position';
import {keepJourney,lessonHref,nextMainLesson} from '../journey/catalog';
import {useRef,useEffect,useState,useCallback} from 'react';
import {Link,useParams,useSearchParams,useNavigate} from 'react-router-dom';
import {learningRequest,milestoneTitles,saveLearningPosition,refreshLearning,type CheckJob,type LearningProgress} from '../../../api/learning-api';
import {LocalFirstWorkspace} from '../shared/LocalFirstWorkspace';
import {UnderstandingVerification} from '../shared/UnderstandingVerification';
import {CheckJobReport} from '../shared/CheckJobReport';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '../../../components/ui/tabs';
import {Check} from 'lucide-react';
import '../../../styles/sql-learning.css';
import '../../../styles/boot-learning.css';
type Chapter={stageId:string;title:string;minutes:number;goal:string;concepts:{title:string;body:string}[];task:string;steps:string[];requirements:string[];pitfall:string;example:string;starterFiles:{path:string;content:string}[]};
type Course={title:string;subtitle:string;description:string;prerequisites:string[];outcomes:string[];chapters:Chapter[]};
export function BootLearning({project=false,course:givenCourse}:{project?:boolean;course?:string}) {
 const verifyRef=useRef<(()=>Promise<void>)|null>(null);
 const params=useParams(),navigate=useNavigate(),courseId=givenCourse||params.course||'boot-foundations';
 const [search,setSearch]=useSearchParams(),rawTab=search.get('tab')||'任务',tab=rawTab==='理解验证'?'检查报告':rawTab;
 const [course,setCourse]=useState<Course|null>(null),[progress,setProgress]=useState<LearningProgress|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [job,setJob]=useState<CheckJob|null>(null),[token,setToken]=useState<string|undefined>();
 const route=(stage:string)=>'/learn/'+courseId+'/1.0/'+stage;
 const stage=params.stage||course?.chapters[0]?.stageId||'';
 const chapter=course?.chapters.find(c=>c.stageId===stage);
 const load=useCallback(async()=>{try{const [c,p]=await Promise.all([learningRequest<Course>('/courses/'+courseId+'/versions/1.0.0'),learningRequest<LearningProgress>('/learning/progress/'+courseId+'/1.0.0')]);setCourse(c);setProgress(p);setError('')}catch(e){setError(e instanceof Error?e.message:'读取课程失败。')}},[courseId]);
 useEffect(()=>{void load();window.addEventListener('learning-progress',load);return()=>window.removeEventListener('learning-progress',load)},[load]);
 const fromJourney=isJourneyWorkspace(search,courseId,stage);
 function changeTab(value:string){if(fromJourney)saveStudyTab(search,value);setSearch(keepJourney(search,{tab:value}));}
 useEffect(()=>{if(project||!chapter||fromJourney)return;let active=true;void saveLearningPosition({courseId,courseVersion:'1.0.0',stageId:stage},tab==='教学'?'teaching':tab==='任务'?'task':'report',()=>active).then(value=>{if(active)setNotice(value)}).catch(e=>{if(active)setNotice(e instanceof Error?e.message:'位置保存失败')});return()=>{active=false}},[project,courseId,stage,tab,chapter?.stageId,fromJourney]);
 const onJob=useCallback((value:CheckJob|null,_identity:string,auth?:string)=>{setJob(value);setToken(auth)},[]);
 if(error&&!course)return <div className="page narrow"><h1>课程暂时无法读取</h1><p role="alert">{error}</p><button className="button secondary" onClick={()=>void load()}>重试</button></div>;
 if(!course||!progress)return <div className="page narrow" role="status">正在读取课程…</div>;
 if(project)return <div className="page narrow boot-project"><Link className="back-link" to="/projects">← 返回项目</Link><h1>{course.title}</h1><p className="project-subtitle">{course.subtitle}</p><p>{course.description}</p><section className="detail-section"><h2>完成后你会得到</h2><ul>{course.outcomes.map(o=><li key={o}>{o}</li>)}</ul><h2>开始前</h2>{course.prerequisites.map(p=><p key={p}>{p}</p>)}<p className="text-pill">{progress.completedCount}/{progress.totalCodeStages}关达标 · 独立程度尚未评价</p><Link className="button primary" to={route(progress.nextCodeStage||course.chapters[0].stageId)}>进入学习</Link></section><CourseSyllabus courseId={courseId} route={route}/></div>;
 if(!chapter)return <div className="page narrow"><h1>此章节不存在</h1><Link to={'/projects/'+courseId}>返回课程目录</Link></div>;
 const index=course.chapters.indexOf(chapter),completion=progress.completions.find(c=>c.stageId===stage),required=progress.nextCodeStage&&course.chapters.findIndex(c=>c.stageId===progress.nextCodeStage)<index?progress.nextCodeStage:null;
 const next=course.chapters[index+1];
 const nextLesson=nextMainLesson(search,courseId,stage);
 const nextHref=nextLesson?lessonHref(nextLesson.id):next?route(next.stageId):'/projects/'+courseId;
 const nextLabel=next?milestoneTitles[next.stageId]||next.title:undefined;
 const context={courseId,courseVersion:'1.0.0',stageId:stage};
 const steps=curriculumFor(courseId,stage).lessons;
 const usesLocalDatabase=stage==='boot-jdbc'||courseId==='task-manager';
 return <TutorProvider key={courseId+stage} scope={{courseId,courseVersion:'1.0.0',stageId:stage}} job={job} submissionId={job?.submissionId} token={token}><div className="page boot-learning"><header className="lesson-header-bar lesson-page-heading"><div className="header-title-group"><Link className="back-link" to={'/projects/'+courseId}>{course.title}</Link><h1>{milestoneTitles[stage]||chapter.title}</h1></div><div className="header-action-group"><LessonTutorDrawer/><span className="text-pill">{completion?'本关已达标':required?'预览章节':`${index+1}/${course.chapters.length}章`}</span><details className="coding-chapters"><summary>章节目录</summary><nav className="boot-chapters" aria-label="课程章节">{course.chapters.map((c,i)=><Link key={c.stageId} to={route(c.stageId)} aria-current={c.stageId===stage?'step':undefined}><span className="chapter-order">{progress.completions.some(x=>x.stageId===c.stageId)?<><Check className="chapter-completion-icon" size={15} aria-hidden="true"/><span className="sr-only">已完成</span></>:i+1}</span>{milestoneTitles[c.stageId]||c.title}</Link>)}</nav></details><p className="boot-position" role="status">{notice}</p></div></header>
 <label className="boot-chapter-select">章节<select value={stage} onChange={e=>navigate(route(e.target.value))}>{course.chapters.map(c=><option key={c.stageId} value={c.stageId}>{progress.completions.some(x=>x.stageId===c.stageId)?'✓ ':''}{milestoneTitles[c.stageId]||c.title}</option>)}</select></label>
 {error&&<p role="alert">{error}</p>}
 <div className="boot-layout"><WorkspaceLayout className="boot-content" practice={tab==='任务'}>
 <WorkspaceTaskPane className="coding-reading-pane"><Tabs value={tab} onValueChange={changeTab}><TabsList className="tabs" aria-label="学习环节">{['教学','任务','检查报告'].map(t=><TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}</TabsList>
 <TabsContent value="教学"><article className="lesson-teaching"><ChapterBridge courseId={courseId} stageId={stage}/><p>本项目从起步工程逐步完成，各章共用源码；每章只增加当前需要的功能。</p><h2>本章要解决的问题</h2><p>{chapter.goal}</p>{chapter.concepts.map((c,i)=><section className="teaching-section" key={c.title}><h2>{i+1}. {c.title}</h2><p>{c.body}</p></section>)}<section className="teaching-section"><h2>从输入到输出</h2><pre tabIndex={0} role="region" aria-label="代码与命令，可横向滚动"><code>{chapter.example}</code></pre><p>先预测结果，再运行代码核对。改变输入时，沿数据流定位变化发生在哪一层。</p></section><section className="teaching-section"><h2>容易混淆的地方</h2><p>{chapter.pitfall}</p><button className="button primary" onClick={()=>changeTab('任务')}>开始编程任务</button>{courseId==='task-manager'&&<FrontendBridge/>}</section></article></TabsContent>
 <TabsContent value="任务"><section className="lesson-teaching"><PracticeSteps key={courseId+stage} scope={courseId+stage} courseId={courseId} stageId={stage} goal={chapter.goal}
  core={(current,select)=><section className="boot-core-steps" aria-labelledby="boot-steps-title"><h3 id="boot-steps-title">核心操作步骤</h3>
   <ol className="boot-task-steps" role="list">{steps.map((step,index)=><li key={step.id}>
    <button type="button" aria-current={index===current?'step':undefined} onClick={()=>select(index)}>
     <span className="boot-step-number" aria-hidden="true">{index+1}</span>
     {step.title}
    </button>
   </li>)}</ol>
  </section>}
  runReference={courseId==='collaboration'?<>
   <p>部署演示默认端口 <code>5196</code>。</p>
   <pre><code>&amp; ./new-system/tooling/deploy-r7.ps1 -Action start -ProjectDirectory 你的工程绝对路径</code></pre>
  </>:usesLocalDatabase?<>
   <p>本地 MySQL 端口 <code>13318</code>，配置由练习脚本生成。</p>
   <pre><code>{'& ./new-system/tooling/start-boot-practice.ps1\n& ./new-system/runtime/boot-practice/run.ps1 -ProjectDirectory 你的工程绝对路径'}</code></pre>
  </>:<>
   <p>在工程根目录运行。默认端口 <code>8080</code>，可通过 <code>server.port</code> 调整。</p>
   <pre><code>mvn spring-boot:run</code></pre>
  </>}/></section></TabsContent>
 <TabsContent value="检查报告">{job?<CheckJobReport job={job} action={<CodeCompletion job={job} context={context} token={token} nextHref={nextHref} nextLabel={nextLabel} beforeComplete={()=>verifyRef.current?.()??Promise.resolve()}/>}/>:<p>尚未提交本关检查。在任务页保存快照并运行检查后，这里显示报告。</p>}<details className="supplementary-practice"><summary>选择题补充（可选）</summary><UnderstandingVerification courseId={courseId} courseVersion="1.0.0" stageId={stage} job={job} token={token} completion={completion} requiredStage={required} nextStage={course.chapters[index+1]?.stageId} onComplete={()=>{refreshLearning();void load()}}/></details></TabsContent></Tabs></WorkspaceTaskPane>
 <WorkspaceDivider/><div className="boot-workspace-panel"><LocalFirstWorkspace key={courseId+stage} context={{courseId,courseVersion:'1.0.0',stageId:stage}} onJobChange={onJob} onContinue={()=>changeTab('检查报告')} verifyRef={verifyRef} nextLabel={nextLabel} nextHref={nextHref}/>{job?.status==='passed'&&<button className="button primary" onClick={()=>changeTab('检查报告')}>补充巩固（可选）</button>}</div>
 </WorkspaceLayout></div></div></TutorProvider>;
}
