import {ArrowRight,Check,RotateCcw} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useScopedRead,visibleRefreshInterval} from '../../hooks/useScopedRead';
import {schoolRequest,type CourseGroup,type LabProgress,type SchoolCourseProgress} from './school-api';
import {examApi,examRoute,useExamRead,type Overview} from './exams/exam-api';
import '../../styles/school-progress.css';

const coursesPath = '/api/school/courses';
const readCourses = () => schoolRequest<CourseGroup[]>(coursesPath);

export function useSchoolCourses() {
  return useScopedRead(coursesPath,readCourses,{persist:true,interval:visibleRefreshInterval});
}

export function schoolLabRoute(courseId: string, labId: string) {
  return '/school/'+encodeURIComponent(courseId)+'/'+encodeURIComponent(labId);
}

export function labIsComplete(lab: LabProgress) {
  return lab.questions > 0 && lab.executed === lab.questions;
}

export function countSchoolProgress(courses: SchoolCourseProgress[]) {
  const labs = courses.flatMap(course => course.labs);
  return {
    passed: labs.reduce((count,lab) => count+lab.executed,0),
    required: labs.reduce((count,lab) => count+lab.questions,0),
    completedLabs: labs.filter(labIsComplete).length,
    totalLabs: labs.length,
  };
}

export function SchoolProgressList({courses}: {courses: SchoolCourseProgress[]}) {
  if (!courses.length) return <p>暂无已接入的课内课程。</p>;
  return <div className="school-progress-list">{courses.map(({course,labs}) => {
    const {completedLabs,totalLabs,passed,required} = countSchoolProgress([{course,labs}]);
    return <article className="card study-panel" key={course.id}>
      <header className="section-heading">
        <h3>{course.title}</h3>
        <span>{completedLabs}/{totalLabs} 个实验通关</span>
      </header>
      <p>必做进度 {passed}/{required}</p>
      {required > 0 && <StudyProgress value={passed} total={required} label={course.title+'必做进度'}/>}
      <ul className="study-list">
        {labs.map(lab => <li key={lab.id}>
          <Link to={schoolLabRoute(course.id,lab.id)}>
            <strong>{lab.title}</strong>
            <span>{!!lab.review?.length && <>待复习 {lab.review.length} 题 · </>}{labIsComplete(lab) ? <><Check size={15} aria-hidden="true"/>已通关 · </> : null}
              {lab.questions ? lab.executed+'/'+lab.questions+' 必做' : lab.totalQuestions+' 项任务'}</span>
            <ArrowRight size={15} aria-hidden="true"/>
          </Link>
        </li>)}
      </ul>
    </article>;
  })}</div>;
}

export function StudyProgress({value,total,label}: {value:number;total:number;label:string}) {
  return <progress className="progress progress-primary study-progress" value={value} max={total || 1} aria-label={label}/>;
}

export function SchoolReviewCard({course,detail=false}: {course:SchoolCourseProgress['course'];detail?:boolean}) {
  const {data,error,reload} = useExamRead<Overview>(examApi(course.id));
  const route = examRoute(course.id);
  const weak = data?.topics.filter(topic=>topic.percent < 80).sort((left,right)=>left.percent-right.percent).slice(0,3);
  return <article className="card study-panel school-review-card">
    <header className="section-heading"><h3><RotateCcw size={17} aria-hidden="true"/>{course.title}</h3></header>
    {error ? <p role="alert">暂时无法读取备考记录。<button className="text-button" onClick={reload}>重试</button></p>
      : data ? <p>{data.pending} 道错题待复习 · 已交卷 {data.completed} 次
        {data.best !== null && <> · 最高 {data.best} 分</>}</p>
      : <p role="status">正在读取备考记录…</p>}
    {!!weak?.length && <p>优先复习 {weak.map(topic=>topic.tag+'（'+topic.percent+'%）').join('、')}</p>}
    {detail && data?.history[0] && <p>最近交卷 {data.history[0].score}/{data.history[0].maxScore} 分</p>}
    <div className="button-row">
      <Link className="btn button secondary" to={route}>{data?.reviewDraft ? '继续错题练习或备考' : '专项练习与模拟考试'}</Link>
      <Link className="btn button secondary" to={route+'/mistakes'}>打开错题本</Link>
    </div>
  </article>;
}

export function SchoolReviewRadar({courses,detail=false}: {courses:SchoolCourseProgress[];detail?:boolean}) {
  const available = courses.filter(course=>course.examCount);
  const review = courses.flatMap(({course,labs})=>labs.flatMap(lab=>(lab.review ?? []).map(question=>({
    ...question, lab:lab.title, href:schoolLabRoute(course.id,lab.id)+'?question='+encodeURIComponent(question.id),
  }))));
  return <section className="study-section" aria-label="复习雷达">
    <h2>复习雷达</h2>
    <article className="card study-panel">
      <header className="section-heading"><h3>实验错题</h3><span>{review.length} 道待复习</span></header>
      {review.length ? <>
        <ul className="study-list">{(detail ? review : review.slice(0,3)).map(question=><li key={question.href}>
          <Link to={question.href}><strong>{question.title}</strong><span>{question.lab}</span><ArrowRight size={15} aria-hidden="true"/></Link>
        </li>)}</ul>
        {!detail && review.length > 3 && <Link className="inline-action" to="/reviews">查看全部实验错题<ArrowRight size={15} aria-hidden="true"/></Link>}
      </> : <p>实验判分后，尚未通过的题目会出现在这里。</p>}
    </article>
    {available.map(({course})=><SchoolReviewCard key={course.id} course={course} detail={detail}/>)}
  </section>;
}
