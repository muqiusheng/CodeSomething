import {PageSkeleton} from '../../components/shared/LoadingState';
import {CourseSyllabus} from '../learning/shared/CourseSyllabus';
import {webChapter} from '../learning/http/web-chapter';
import {useCourseRead} from '../../hooks/useCourseRead';
import {Link} from 'react-router-dom';
import {ArrowRight,ArrowUpRight,BookOpen,Clock3,FlaskConical} from 'lucide-react';
import {foundationPath,chapterRoute,type FoundationProject as Project} from '../../api/learning-api';
import {useLearningProgress} from '../../hooks/useLearningProgress';

export function FoundationProject(){
 const {progress,error:progressError,reload}=useLearningProgress();
 const {data,error:readError,reload:retry}=useCourseRead<Project>(foundationPath);
 const project=data&&{...data,chapters:data.chapters.map(webChapter)};
 const error=readError?'入门项目暂时无法读取，请检查本机服务后重试。':'';
 if(!project)return <div className="page">{error?<div role="status"><h1>项目读取失败</h1><p>{error}</p><button className="button secondary" onClick={retry}>重试</button></div>:<PageSkeleton variant="course" label="正在打开入门项目…"/>}</div>;
 return <div className="page foundation-project"><Link className="back-link" to="/projects">← 所有项目</Link>
 <section className="foundation-masthead" aria-labelledby="foundation-title"><div className="foundation-intro"><div className="foundation-mark"><FlaskConical size={22} aria-hidden="true"/><span>基础项目</span></div><h1 id="foundation-title">{project.title}</h1><p className="foundation-subtitle">{project.subtitle}</p><p className="foundation-description">{project.description}</p><div className="foundation-facts"><span><BookOpen size={15} aria-hidden="true"/>{project.chapters.length}章</span><span><Clock3 size={15} aria-hidden="true"/>预计{project.chapters.reduce((sum,c)=>sum+c.minutes,0)}分钟，可分次学</span></div><Link className="button primary" to={chapterRoute('workspace')}>从第1章开始<ArrowRight size={16} aria-hidden="true"/></Link></div>
 <div className="foundation-outcome"><div className="outcome-caption"><span>这个项目，你会做出</span><span>目标示例</span></div><div className="outcome-request"><span>GET</span><code>/api/tasks/1</code><ArrowUpRight size={17} aria-hidden="true"/></div><pre>{'{\n  "id": 1,\n  "title": "学习 HTTP",\n  "completed": false\n}'}</pre><div className="outcome-foot"><span>200 OK</span><span>从读懂，到自己实现</span></div></div></section>
 <section className="project-progress" aria-label="正式学习进度"><h2>{progress?.projectCompleted?'HTTP/JSON项目已达标':'正式学习进度'}</h2>{progressError||progress?<p role="status">{progressError||`已达标 ${progress?.completedCount} / ${progress?.totalCodeStages} 个代码关卡。入门小练习保留草稿，选择题按需巩固。`}</p>:<PageSkeleton variant="inline" label="正在读取进度…"/>}{progressError&&<button className="button secondary" onClick={reload}>重试进度</button>}{progress?.completions.map(item=><p key={item.id}><Link to={chapterRoute(item.stageId)+'?tab='+encodeURIComponent('理解验证')}>{project.chapters.find(chapter=>chapter.stageId===item.stageId)?.title} · {item.understandingId?'编码完成 · 概念已巩固':'编码完成 · 概念巩固可选'}</Link><br/><span className="snapshot-digest">证据代码 <code>{item.snapshotDigest}</code></span></p>)}{progress?.nextCodeStage&&<Link className="button secondary" to={chapterRoute(progress.nextCodeStage)+'?tab='+encodeURIComponent('任务')}>继续编程任务<ArrowRight size={15} aria-hidden="true"/></Link>}</section>
 <div className="foundation-readiness"><section><h2>开始前</h2><p>{project.prerequisites.join('；')}。本项目不要求先会Spring Boot。</p></section><section><h2>学完能做什么</h2><ul>{project.outcomes.map(outcome=><li key={outcome}>{outcome}</li>)}</ul></section></div>
 <CourseSyllabus courseId="http-json-basics" route={chapterRoute}/>
 <section className="foundation-next"><div><h2>接下来，走向完整后端</h2><p>本项目先建立HTTP与Java接口基础。数据库与SQL六章已开放。下一步完成任务数据实验室，再学习Spring Boot基础。</p></div><Link to="/projects/sql-foundations">进入SQL项目<ArrowRight size={15} aria-hidden="true"/></Link></section>
 </div>
}

