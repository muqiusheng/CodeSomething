import {PageSkeleton} from '../../components/shared/LoadingState';
import {useScopedRead,visibleRefreshInterval} from '../../hooks/useScopedRead';
import {ArrowUpRight, Check, Database, GraduationCap} from 'lucide-react';
import {Link} from 'react-router-dom';
import {schoolRequest, type CourseGroup} from './school-api';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '../../components/ui/tabs';
import {examApi,examRoute,useExamRead,type Overview} from './exams/exam-api';
import {ExamReadState} from './exams/ExamShared';
import {useState,type ReactNode} from 'react';
import '../../styles/school.css';

const readCourses=()=>schoolRequest<CourseGroup[]>('/api/school/courses');

export function SchoolHome() {
  const {data:groups,error,reload}=useScopedRead('/api/school/courses',readCourses,{persist:true,interval:visibleRefreshInterval});

  return <div className="page school-home">
    <div className="school-heading">
      <span className="school-icon"><GraduationCap aria-hidden="true" size={22}/></span>
      <div><h1>课内实战</h1><p>课程实验、作业与课程设计</p></div>
    </div>
    {error ? <div className="note" role="alert"><p>{error}</p><button className="button secondary" onClick={reload}>重试</button></div>
      : !groups ? <PageSkeleton variant="cards" label="正在读取课程…"/> : groups.length === 0 ? <p>暂无已接入课程。</p> : groups.map(group =>
      <section className="school-term" key={group.term} aria-labelledby={'term-' + group.term}>
        <h2 id={'term-' + group.term}>{group.title}</h2>
        {group.courses.map(({course, labs, examCount}) => <article className="card school-course-card" key={course.id}>
          <header>
            <span className="school-icon">{course.engine === 'mysql' ? <Database aria-hidden="true" size={21}/> : <GraduationCap aria-hidden="true" size={21}/>}</span>
            <div><h3>{course.title}</h3><p>{course.school} · {course.major}</p></div>
          </header>
          <p className="school-course-summary">{course.summary}</p>
          <CourseRoutes courseId={course.id} examCount={examCount}><ul className="school-lab-list">
            {labs.map(lab => <li key={lab.id}><Link to={'/school/' + course.id + '/' + lab.id}>
              <span>{lab.title}</span>
              <span className="school-lab-progress">{course.engine === 'mysql'
                ? <>共 {lab.totalQuestions} 题 {lab.questions > 0 && lab.executed === lab.questions
                  ? <span className="badge badge-success school-badge"><Check size={13} aria-hidden="true"/>已完成</span>
                  : <> · 必做 {lab.executed}/{lab.questions} 已通过</>}</>
                : `共 ${lab.totalQuestions} 项任务`}</span>
              <ArrowUpRight size={16} aria-hidden="true"/>
            </Link></li>)}
          </ul></CourseRoutes>
        </article>)}
      </section>)}
    {groups && <details className="school-future">
      <summary>后续课程</summary>
      <p>操作系统、计算机网络和软件工程课设可按学期接入。添加课程包后，课程会在这里显示。</p>
    </details>}
  </div>;
}

function CourseRoutes({courseId,examCount,children}:{courseId:string;examCount?:number;children:ReactNode}) {
  const [route,setRoute] = useState('labs');
  if (!examCount) return children;
  return <Tabs value={route} onValueChange={setRoute}>
    <TabsList className="exam-route-tabs" aria-label="课程学习路线">
      <TabsTrigger value="labs">实验回顾刷题</TabsTrigger>
      <TabsTrigger value="exams">考试冲刺备考</TabsTrigger>
    </TabsList>
    <TabsContent value="labs" className="exam-route-panel">
      <p className="exam-route-caption">预置环境与数据表，沉浸式逐题重温 7 个课内实验</p>
      {children}
    </TabsContent>
    <TabsContent value="exams" className="exam-route-panel">
      <p className="exam-route-caption">全真 100 分模拟卷，紧扣第 3 章高频大题，配有倒计时、错题本与重新练习</p>
      {route==='exams' && <ExamRouteCard courseId={courseId} examCount={examCount}/>}
    </TabsContent>
  </Tabs>;
}

function ExamRouteCard({courseId,examCount}:{courseId:string;examCount:number}) {
  const {data,error,reload} = useExamRead<Overview>(examApi(courseId));
  const base = examRoute(courseId);
  return <>
    <p className="exam-route-caption">{examCount} 套试卷{data?.completed?' · 已完成 '+data.completed+' 套':''}
      {data?.best!=null?' · 最高 '+data.best+' 分':''}{data?.average!=null?' · 均分 '+data.average:''}{data?.pending?' · '+data.pending+' 道错题待复习':''}</p>
    {error && <ExamReadState error={error} reload={reload} label="正在读取备考记录…"/>}
    <div className="exam-actions">
      <Link className="button primary" to={base}>进入备考大厅 <ArrowUpRight size={16} aria-hidden="true"/></Link>
      <Link className="button secondary" to={base+'/mistakes'}>打开错题本</Link>
    </div>
  </>;
}
