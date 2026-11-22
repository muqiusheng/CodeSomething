import {useEffect, useState} from 'react';
import {ArrowUpRight, Check, Database, GraduationCap} from 'lucide-react';
import {Link} from 'react-router-dom';
import {errorMessage, schoolRequest, type CourseGroup} from './school-api';
import '../../styles/school.css';

export function SchoolHome() {
  const [groups, setGroups] = useState<CourseGroup[]>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    schoolRequest<CourseGroup[]>('/api/school/courses', undefined, controller.signal)
      .then(setGroups).catch(error => {if (!controller.signal.aborted) setError(errorMessage(error));});
    return () => controller.abort();
  }, [attempt]);

  return <div className="page school-home">
    <div className="school-heading">
      <span className="school-icon"><GraduationCap aria-hidden="true" size={22}/></span>
      <div><h1>课内实战</h1><p>课程实验、作业与课程设计</p></div>
    </div>
    {error ? <div className="note" role="alert"><p>{error}</p><button className="button secondary" onClick={() => {setError(''); setAttempt(attempt + 1);}}>重试</button></div>
      : !groups ? <p role="status">正在读取课程…</p> : groups.length === 0 ? <p>暂无已接入课程。</p> : groups.map(group =>
      <section className="school-term" key={group.term} aria-labelledby={'term-' + group.term}>
        <h2 id={'term-' + group.term}>{group.title}</h2>
        {group.courses.map(({course, labs}) => <article className="card school-course-card" key={course.id}>
          <header>
            <span className="school-icon">{course.engine === 'mysql' ? <Database aria-hidden="true" size={21}/> : <GraduationCap aria-hidden="true" size={21}/>}</span>
            <div><h3>{course.title}</h3><p>{course.school} · {course.major}</p></div>
          </header>
          <p className="school-course-summary">{course.summary}</p>
          <ul className="school-lab-list">
            {labs.map(lab => <li key={lab.id}><Link to={'/school/' + course.id + '/' + lab.id}>
              <span>{lab.title}</span>
              <span className="school-lab-progress">{course.engine === 'mysql'
                ? <>共 {lab.totalQuestions} 题 {lab.questions > 0 && lab.executed === lab.questions
                  ? <span className="badge badge-success school-badge"><Check size={13} aria-hidden="true"/>已完成</span>
                  : <> · 必做 {lab.executed}/{lab.questions} 已运行</>}</>
                : `共 ${lab.totalQuestions} 项任务`}</span>
              <ArrowUpRight size={16} aria-hidden="true"/>
            </Link></li>)}
          </ul>
        </article>)}
      </section>)}
    {groups && <details className="school-future">
      <summary>后续课程</summary>
      <p>操作系统、计算机网络和软件工程课设可按学期接入。添加课程包后，课程会在这里显示。</p>
    </details>}
  </div>;
}
