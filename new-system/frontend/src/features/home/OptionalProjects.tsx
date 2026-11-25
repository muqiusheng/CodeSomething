import {ArrowRight,Braces,Database,Layers3,Server,Trophy} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useLearnerResource,type LearnerProfile} from '../../api/learner-api';
import {learningRequest,type LearningResume} from '../../api/learning-api';
import {useScopedRead} from '../../hooks/useScopedRead';
import {readStudyPosition} from '../learning/journey/study-position';
import {homeContext} from './home-context.mjs';

const resumePath = '/learning/continue';
const readResume = () => learningRequest<LearningResume>(resumePath);
const readWorks = () => learningRequest<{state:string}[]>('/portfolio');
const route = [
  {name:'HTTP / JSON',courses:['http-json-basics'],href:'/projects/backend-foundations',icon:Braces},
  {name:'SQL 实战',courses:['sql-foundations'],href:'/projects/sql-foundations',icon:Database},
  {name:'Spring Boot',courses:['boot-foundations'],href:'/projects/boot-foundations',icon:Server},
  {name:'业务项目',courses:['task-manager','collaboration'],href:'/projects',icon:Layers3},
  {name:'独立作品',courses:['portfolio'],href:'/portfolio',icon:Trophy},
];
const featured = [
  {title:'从零写出 HTTP 接口',description:'让 Java 接收浏览器请求，返回状态码和 JSON。',tag:'Java · HTTP',href:'/projects/backend-foundations',icon:Braces,tone:'primary'},
  {title:'Spring Boot 业务项目',description:'连接 MySQL，完成任务的新增、查询、修改和删除。',tag:'Spring Boot · MySQL',href:'/projects/task-manager',icon:Layers3,tone:'secondary'},
  {title:'独立作品实践',description:'自行选题，从需求和数据设计走到验证与作品讲解。',tag:'自主选题 · 独立实现',href:'/portfolio',icon:Trophy,tone:'accent'},
] as const;

export function OptionalProjects() {
  const {data:resume} = useScopedRead(resumePath,readResume,{persist:true});
  const {data:profile} = useLearnerResource<LearnerProfile>('/profile');
  const {data:works} = useScopedRead('/portfolio',readWorks,{persist:true});
  const context = homeContext(resume,readStudyPosition());
  const summary = profile?.summary;
  const readyWorks = works?.filter(work=>work.state==='evidence-ready').length;
  const active = context.firstVisit ? undefined : context.courseId;
  const stages = summary?.courses ?? [];

  return <section className="home-explore" aria-labelledby="home-explore-title">
    <header className="home-explore-header">
      <div><h2 id="home-explore-title">课外探索 · 进阶实战</h2><p>按兴趣选学，沿同一份工程做出可运行的项目。</p></div>
      <dl className="home-explore-totals">
        <div><dt>已验证关卡</dt><dd>{summary ? summary.completed+'/'+summary.total : '—'}</dd></div>
        <div><dt>作品验证齐备</dt><dd>{readyWorks ?? '—'}{works ? ' / '+works.length : ''}</dd></div>
      </dl>
    </header>
    <ol className="home-explore-steps" aria-label="课外进阶路线">
      {route.map(step=>{
        const courses = stages.filter(course=>step.courses.includes(course.courseId));
        const complete = step.href==='/portfolio' ? (readyWorks ?? 0)>0
          : courses.length===step.courses.length && courses.every(course=>course.total>0 && course.completed===course.total);
        const current = !!active && step.courses.includes(active);
        return <li key={step.name} data-done={complete}>
          <Link to={step.href} aria-current={current?'step':undefined}>
            <span className="explore-step-node"><step.icon size={17} aria-hidden="true"/></span>
            <span>{step.name}{complete && <span className="sr-only">，已完成</span>}</span>
          </Link>
        </li>;
      })}
    </ol>
    <div className="home-explore-featured" aria-label="精选实践方向">
      {featured.map(({title,description,tag,href,icon:Icon,tone})=><Link className="explore-feature" key={href} to={href} data-tone={tone}>
        <span className="explore-feature-mark"><Icon size={21} aria-hidden="true"/></span>
        <h3>{title}</h3><p>{description}</p>
        <span className="explore-feature-bottom"><span>{tag}</span><ArrowRight size={17} aria-hidden="true"/></span>
      </Link>)}
    </div>
    <div className="learning-home-actions">
      {!context.firstVisit && <Link className="btn button primary" to={context.href}>继续课外练习<ArrowRight size={16} aria-hidden="true"/></Link>}
      <Link className="btn button secondary" to="/projects">浏览项目库</Link>
      <Link className="btn button secondary" to="/path">查看拓展路线</Link>
    </div>
  </section>;
}
