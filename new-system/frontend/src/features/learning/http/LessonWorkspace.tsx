import {CodeCompletion} from '../shared/CodeCompletion';
import {WorkspaceLayout} from '../shared/WorkspaceLayout';
import {WorkspaceTaskPane} from '../shared/WorkspaceTaskPane';
import {WorkspaceDivider} from '../shared/WorkspaceDivider';
import {PracticeSteps} from '../shared/PracticeSteps';
import {keepJourney,lessonById,lessonHref,nextMainLesson} from '../journey/catalog';
import {isJourneyWorkspace,saveStudyTab} from '../journey/study-position';
import {HttpProjectPractice} from './HttpProjectPractice';
import {webChapter} from './web-chapter';
import {useRef,useCallback,useEffect,useState} from 'react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {ArrowLeft,ArrowRight,ChevronRight,Check,Clock3,ShieldCheck} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '../../../components/ui/tabs';
import {LessonTutorDrawer} from '../../tutor/LessonTutor';
import {TutorProvider} from '../../tutor/TutorSession';
import {LocalFirstWorkspace} from '../shared/LocalFirstWorkspace';
import {CheckJobReport} from '../shared/CheckJobReport';
import {UnderstandingVerification} from '../shared/UnderstandingVerification';
import {useLearningProgress} from '../../../hooks/useLearningProgress';
import {saveLearningPosition} from '../../../api/learning-api';
import type {CheckJob} from '../../../api/learning-api';
import {ChapterTeaching,TaskSteps,ChapterQuestion} from './LessonBlocks';
import {coursePath,foundationPath,foundationProjectRoute,chapterRoute,milestoneTitles,learningRequest,type FoundationProject,type CourseStage} from '../../../api/learning-api';

export function LessonWorkspace(){
 const verifyRef=useRef<(()=>Promise<void>)|null>(null);
 const [checkState,setCheckState]=useState<{job:CheckJob|null;identity:string;token?:string;submissionId?:string}|null>(null);
 const onJobChange=useCallback((job:CheckJob|null,identity:string,token?:string,submissionId?:string)=>setCheckState({job,identity,token,submissionId}),[]);
 const [legacyOpen,setLegacyOpen]=useState(false);const route=useParams();const [params,setParams]=useSearchParams();const tab=['教学','任务','检查报告','理解验证'].includes(params.get('tab')||'')?params.get('tab')!:'任务';
 const {progress,error:progressError,reload}=useLearningProgress();
 const [project,setProject]=useState<FoundationProject|null>(null);const [legacy,setLegacy]=useState<CourseStage|null>(null);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
 const isLegacy=route.version==='1.0'&&route.stage==='json-response';
 const supported=route.course==='http-json'&&(isLegacy||route.version==='1.1');
 const fromJourney=isJourneyWorkspace(params,'http-json-basics',route.stage||'');
 useEffect(()=>{
  if(!supported||fromJourney)return;
  let active=true;
  const step=({'教学':'teaching','任务':'task','检查报告':'report','理解验证':'understanding'} as Record<string,string>)[tab];
  void saveLearningPosition({courseId:'http-json-basics',courseVersion:isLegacy?'1.0.0':'1.1.0',stageId:isLegacy?'json-task-response':route.stage!},step,()=>active).catch(()=>{});
  return()=>{active=false};
 },[supported,isLegacy,route.stage,tab,fromJourney]);
 useEffect(()=>{let active=true;if(!supported)return;setError('');void Promise.all([learningRequest<FoundationProject>(foundationPath),isLegacy?learningRequest<CourseStage>(coursePath):Promise.resolve(null)]).then(([value,old])=>{if(active){setProject(value);setLegacy(old)}}).catch(()=>{if(active)setError('正式课程暂时无法读取，请检查本机服务后重试。')});return()=>{active=false}},[retry,supported,isLegacy]);
 function changeTab(value:string){if(fromJourney)saveStudyTab(params,value);setParams(keepJourney(params,{tab:value}))}
 function download(){if(!project)return;const url=URL.createObjectURL(new Blob([legacy?.starter||project.starter],{type:'text/plain;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='TaskServer.java';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 if(!supported)return <div className="page"><h1>此课程尚未发布</h1><Link to={foundationProjectRoute}>查看入门项目</Link></div>;
 if(!project)return <div className="page" role="status"><h1>{error?'课程读取失败':'正在读取课程…'}</h1>{error&&<><p>{error}</p><button className="button secondary" onClick={()=>setRetry(value=>value+1)}>重试</button></>}</div>;
 const index=project.chapters.findIndex(chapter=>chapter.stageId===(isLegacy?'fix-response':route.stage));
 if(index<0)return <div className="page"><h1>此章节尚未发布</h1><Link to={foundationProjectRoute}>返回项目目录</Link></div>;
 const chapter=webChapter(project.chapters[index]);const version=legacy?.courseVersion||project.courseVersion;
 const context={courseId:project.courseId,courseVersion:version,stageId:legacy?.stageId||chapter.stageId};
 const completedStages=new Set(progress?.completions.map(item=>item.stageId));
 for(const stageId of progress?.passedPractices||[])completedStages.add(stageId);
 const completion=!isLegacy?progress?.completions.find(item=>item.stageId===chapter.stageId):undefined;
 const requiredStage=progress?.nextCodeStage&&project.chapters.findIndex(item=>item.stageId===progress.nextCodeStage)<index?progress.nextCodeStage:null;
 const journeyLesson=lessonById.get(params.get('journey')||'');
 const nextLesson=nextMainLesson(params,context.courseId,context.stageId);
 const nextHref=nextLesson?lessonHref(nextLesson.id):project.chapters[index+1]?chapterRoute(project.chapters[index+1].stageId):foundationProjectRoute;
 const nextLabel=project.chapters[index+1]?`第 ${index+2} 节 ${project.chapters[index+1].title}`:undefined;
 const tutorScope=chapter.stageId==='workspace'&&journeyLesson?.id==='02'?{...context,stageId:'workspace-http-text'}:context;
 const identity=context.courseVersion+tutorScope.stageId;const currentCheck=checkState?.identity===identity?checkState:null;
 const tabs=chapter.mode==='code'?['教学','任务',...(currentCheck?.job?['检查报告']:[]),'理解验证']:['教学','任务'];
 return <TutorProvider key={identity} scope={tutorScope} submissionId={currentCheck?.submissionId} job={currentCheck?.job} token={currentCheck?.token}><div className="lesson-page foundation-lesson" data-practice={tab==='任务'}><header className="lesson-header-bar"><div className="header-title-group"><div className="lesson-breadcrumb"><Link to={foundationProjectRoute}>{project.title}</Link><ChevronRight size={13} aria-hidden="true"/><span>{!isLegacy&&milestoneTitles[chapter.stageId]||'第'+(index+1)+'章 · '+chapter.phase}</span><span className="saved">本地工程学习 · v{version}{isLegacy?' · 原版单元':''}</span></div>
 <div className="lesson-title"><div><h1>{legacy?.title||milestoneTitles[chapter.stageId]||chapter.title}</h1></div></div></div><div className="header-action-group"><div className="lesson-title-tools"><span className="lesson-duration"><Clock3 size={14} aria-hidden="true"/>{chapter.stageId==='workspace'?'建议20—45分钟，安装排错另计':`参考${chapter.minutes}分钟，可分次完成`}</span><LessonTutorDrawer/></div>
 <details className="coding-chapters"><summary>章节目录</summary><nav className="chapter-strip" aria-label="项目章节">{project.chapters.map((item,position)=>{
  const complete=completedStages.has(item.stageId);
  const current=!isLegacy&&position===index;
  return <Link key={item.stageId} to={chapterRoute(item.stageId)} aria-current={current?'page':undefined} className={current?'current':''}>
   <span className="strip-order chapter-order">{complete?<><Check className="chapter-completion-icon" size={15} aria-hidden="true"/><span className="sr-only">已完成</span></>:String(position+1).padStart(2,'0')}</span>
   <span>{milestoneTitles[item.stageId]||item.title}</span>
  </Link>;
 })}</nav></details>
 {(completion||requiredStage)&&<p className="learning-position" role="status">{completion?'本关已达标':'后续章节预览'}</p>}</div></header>
 {progressError&&<p role="alert">{progressError}<button className="button secondary" onClick={reload}>重试进度</button></p>}
 <div className="work-grid"><Tabs value={tabs.includes(tab)?tab:'教学'} onValueChange={changeTab} className="lesson-main"><TabsList className="tabs" aria-label="课程内容">{tabs.map((value,position)=><TabsTrigger key={value} value={value}><span className="tab-index" aria-hidden="true">0{position+1}</span>{value==='任务'?'动手实践':value==='理解验证'?'补充巩固':value}</TabsTrigger>)}</TabsList>
 <TabsContent forceMount value="教学" hidden={tab!=='教学'} className="lesson-article chapter-article"><ChapterTeaching key={chapter.stageId} chapter={chapter} onPractice={()=>changeTab('任务')}/><details className="supplementary-practice"><summary>选择题补充（可选）</summary><ChapterQuestion key={chapter.stageId+'-question'} chapter={chapter}/></details> <details className="course-sources"><summary>课程来源与教学依据</summary><ul>{project.sources.map(source=><li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></details></TabsContent>
 <TabsContent forceMount value="任务" hidden={tab!=='任务'} className="lesson-article chapter-article">{chapter.mode==='code'?<><WorkspaceLayout className="web-task-layout"><WorkspaceTaskPane className="web-task-brief"><PracticeSteps key={identity} scope={identity} courseId="http-json-basics" stageId={chapter.stageId} goal={chapter.taskSummary}/><details><summary>完整需求与提示</summary><span className="text-pill">本章编程任务</span><h2>{chapter.taskTitle}</h2><p>{chapter.taskSummary}</p><h3>你要完成什么</h3><ul>{chapter.requirements.map(r=><li key={r}>{r}</li>)}</ul><details><summary>{chapter.pitfall.title}</summary><p>{chapter.pitfall.body}</p></details></details></WorkspaceTaskPane><WorkspaceDivider/><LocalFirstWorkspace key={identity} context={context} verifyRef={verifyRef} nextLabel={nextLabel} onJobChange={onJobChange} onContinue={()=>changeTab('理解验证')} nextHref={nextHref}/></WorkspaceLayout></>:<HttpProjectPractice onJobChange={onJobChange} key={chapter.stageId} stage={chapter.stageId} version={version}/>}</TabsContent>
 <TabsContent forceMount value="检查报告" hidden={tab!=='检查报告'} className="lesson-article chapter-article">{checkState?.identity===context.courseVersion+context.stageId&&checkState.job?<CheckJobReport job={checkState.job} action={<CodeCompletion job={checkState.job} context={context} token={checkState.token} nextLabel={nextLabel} nextHref={nextHref} beforeComplete={()=>verifyRef.current?.()??Promise.resolve()}/>}/>:<div className="chapter-report-state"><ShieldCheck size={28} aria-hidden="true"/><h2>{chapter.mode==='code'?'还没有检查报告':'先练习，再形成证据'}</h2><p>{chapter.mode==='code'?'在任务页保存代码快照并运行检查，这里将显示同一份检查结果。':'本章的随堂判断即时反馈。阅读、步骤勾选和答题结果不会自动变成正式能力证明。'}</p><button className="button secondary" onClick={()=>changeTab(chapter.mode==='code'?'任务':'教学')}>{chapter.mode==='code'?'回到任务提交':'回到教学练习'}<ArrowRight size={15} aria-hidden="true"/></button></div>}<p className="completion-rule">当前代码通过功能检查后可完成编码；选择题按需补充，独立讲解另行验证。</p></TabsContent>
 {chapter.mode==='code'&&<TabsContent forceMount value="理解验证" hidden={tab!=='理解验证'} className="lesson-article chapter-article"><UnderstandingVerification key={identity} stageId={context.stageId} courseVersion={version} job={currentCheck?.job||null} token={currentCheck?.token} completion={completion} requiredStage={requiredStage} nextStage={project.chapters[index+1]?.stageId} onComplete={reload}/></TabsContent>}
 <footer className="article-bottom-actions" hidden={tab==='任务'&&chapter.mode==='code'}> <div className="lesson-actions" hidden={tab==='任务'&&chapter.mode==='code'}><span>第{index+1} / {project.chapters.length}章 · {chapter.phase}</span>{completion?<Link className="button primary" to={nextHref}>{project.chapters[index+1]?'下一关':'查看项目总结'}<ArrowRight size={14} aria-hidden="true"/></Link>:<button className="button primary" onClick={()=>changeTab(tab==='教学'?'任务':currentCheck?.job?.status==='passed'&&!currentCheck.job.stale&&tab!=='理解验证'?'理解验证':tab==='任务'?(chapter.mode==='code'&&currentCheck?.job?'检查报告':'教学'):'任务')}>{tab==='教学'?'开始动手实践':currentCheck?.job?.status==='passed'&&!currentCheck.job.stale&&tab!=='理解验证'?'验证理解':tab==='任务'?(chapter.mode==='code'?'查看运行结果':'回到教学'):'回到任务'}<ArrowRight size={14} aria-hidden="true"/></button>}</div>
 <nav className="chapter-pagination" aria-label="前后章节">{index>0?<Link to={chapterRoute(project.chapters[index-1].stageId)}><ArrowLeft size={16} aria-hidden="true"/>上一章</Link>:<Link to={foundationProjectRoute}><ArrowLeft size={16} aria-hidden="true"/>项目介绍</Link>}{index<project.chapters.length-1?<Link to={chapterRoute(project.chapters[index+1].stageId)}>查看下一章<ArrowRight size={16} aria-hidden="true"/></Link>:<Link to={foundationProjectRoute}>回到项目目录<ArrowRight size={16} aria-hidden="true"/></Link>}</nav>
 </footer>
</Tabs></div></div></TutorProvider>
}


