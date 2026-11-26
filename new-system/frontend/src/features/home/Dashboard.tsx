import {ArrowRight,Clock3,FileCode2} from 'lucide-react';
import {useCallback} from 'react';
import {Link} from 'react-router-dom';
import {LoadingLines} from '../../components/shared/LoadingState';
import {useScopedRead} from '../../hooks/useScopedRead';
import {labUrl,recentSchoolLab,schoolRequest,type LabDetails,type SchoolCourseProgress,type LabProgress} from '../school/school-api';
import {labIsComplete,schoolLabRoute,useSchoolCourses} from '../school/SchoolLearningProgress';
import {HomeReviewEntry} from '../reviews/HomeReviewEntry';
import {HomeDirectory} from './HomeDirectory';
import {HomePlayground} from './HomePlayground';
import {OptionalProjects} from './OptionalProjects';
import {currentLabGrade} from '../school/lab-progress.mjs';
import '../../styles/learning-home.css';

const examples: Record<string,{sql:string;result:string}> = {
  'lab-01-workbench': {sql:'SHOW DATABASES;',result:'列出当前连接可见的数据库。'},
  'lab-02-ddl-tables': {sql:'CREATE TABLE practice_course (\n  Cno CHAR(3) PRIMARY KEY,\n  Cname VARCHAR(40) NOT NULL\n);',result:'创建课程表，课程号唯一，课程名必填。'},
  'lab-03-single-query': {sql:'SELECT Cno, COUNT(*) AS enrolled\nFROM sc\nGROUP BY Cno;',result:'每门已有选课记录的课程返回一行，显示选课人数。'},
  'lab-04-complex-query': {sql:'SELECT s.Sname, x.Grade\nFROM student AS s\nJOIN sc AS x ON x.Sno = s.Sno\nWHERE x.Cno = \'002\';',result:'返回选修 002 课程的学生姓名和成绩。'},
  'lab-05-views': {sql:'CREATE VIEW passed_sc AS\nSELECT Sno, Cno, Grade\nFROM sc WHERE Grade >= 60;',result:'创建只显示及格选课记录的视图。'},
  'lab-06-procedures': {sql:'CREATE PROCEDURE count_enrollment()\nSELECT COUNT(*) AS enrolled FROM sc;\n\nCALL count_enrollment();',result:'调用过程，返回一行选课记录总数。'},
  'lab-07-triggers': {sql:'CREATE TRIGGER audit_grade\nAFTER UPDATE ON sc FOR EACH ROW\nINSERT INTO grade_log (Sno, Grade)\nVALUES (NEW.Sno, NEW.Grade);',result:'准备 grade_log 表后，更新选课记录会写入一条日志。'},
};

function LabHero({course,lab}: {course:SchoolCourseProgress['course'];lab:LabProgress}) {
  const url = labUrl(course.id,lab.id);
  const read = useCallback(()=>schoolRequest<LabDetails>(url),[url]);
  const {data,error} = useScopedRead(url,read);
  const recent = recentSchoolLab();
  const continuing = lab.executed > 0 || (recent?.courseId === course.id && recent.labId === lab.id);
  const example = course.id === 'database-systems' ? examples[lab.id] : undefined;
  const next = data?.lab.questions.find(question=>!question.optional && (data.grading
    ? currentLabGrade(lab.id,question,data.work)?.status!=='correct'
    : data.work.executions[question.id]?.result.status!=='ok'));
  const previewQuestion = next ?? (!lab.questions ? data?.lab.questions[0] : undefined);
  const previewTitle = previewQuestion?.title || (data ? '必做题已完成' : error ? '题目摘要暂未加载' : '正在读取题目');
  const previewDescription = previewQuestion?.requirement.split('\n\n### 涉及数据表：',1)[0]
    || (data ? '打开实验可查看全部题目与选做内容。' : '打开实验可查看要求和题目。');
  return <section className="learning-home-task home-hero" data-tour="home-hero" aria-labelledby="resume-title">
    <div className="home-hero-copy">
      <p className="learning-home-location">{course.title}</p>
      <h2 id="resume-title">{lab.title}</h2>
      <p>{data?.lab.objective || '按题目要求完成实验，查看运行反馈并保存进度。'}</p>
      <div className="learning-home-actions">
        <Link className="btn button primary" to={schoolLabRoute(course.id,lab.id)}>
          {continuing ? '继续当前实验' : '开始实验'}<ArrowRight size={16} aria-hidden="true"/>
        </Link>
        <Link className="btn button secondary" to="/school">全部课内实验</Link>
      </div>
    </div>
    <div className="home-deliverable">
      <h3><FileCode2 size={17} aria-hidden="true"/>{example?'实验目标示例':lab.questions?'下一道必做题':'题目预览'}</h3>
      <p>{lab.questions ? lab.executed+'/'+lab.questions+' 道必做题已'+(course.engine==='mysql'?'通过':'完成') : lab.totalQuestions+' 项任务'}</p>
      <div className="home-code-card home-expected" tabIndex={0}>
        {example ? <><span>SQL 示例</span><pre><code>{example.sql}</code></pre>
          <p><span className="home-sql-keyword">预期</span>　{example.result}</p></>
          : <><strong>{previewTitle}</strong><p className="home-question-preview">{previewDescription}</p></>}
      </div>
    </div>
  </section>;
}

function LabTrail({entry,active}: {entry:SchoolCourseProgress;active?:string}) {
  return <section className="home-trail home-lab-trail" data-tour="home-trail" aria-label={entry.course.title+'实验进度'}>
    <div className="section-heading"><h2>课内课程与实验进度</h2><Link to="/school">{entry.course.title}<ArrowRight size={14} aria-hidden="true"/></Link></div>
    <ol>{entry.labs.map(lab=>{
      const current = lab.id === active;
      const completed = labIsComplete(lab);
      const percent = lab.questions ? Math.floor(100*lab.executed/lab.questions) : null;
      const [number,topic] = lab.title.split(' · ',2);
      return <li key={lab.id}><Link to={schoolLabRoute(entry.course.id,lab.id)}
        aria-current={current?'step':undefined} data-complete={completed}>
        <div className="trail-top"><span className="trail-state"><i className="trail-dot" aria-hidden="true"/>{current?'当前实验':completed?'已通关':number}</span>
          <strong>{percent === null ? '—' : percent+'%'}</strong></div>
        <span className="trail-name">{topic && (current || completed) ? number+' · ' : ''}{topic ?? lab.title}</span>
        {percent !== null && <progress max={100} value={percent} aria-label={lab.title+'进度'}/>}
        <span className="trail-count">{lab.questions ? '必做 '+lab.executed+'/'+lab.questions : lab.totalQuestions+' 项任务'}</span>
      </Link></li>;
    })}</ol>
  </section>;
}

export function Dashboard({duration}:{duration:string}) {
  const {data,error,reload} = useSchoolCourses();
  const courses = data?.flatMap(group=>group.courses) ?? [];
  const pending = courses.flatMap(entry=>entry.labs.filter(lab=>!labIsComplete(lab)).map(lab=>({entry,lab})));
  const recent = recentSchoolLab();
  const current = pending.find(({entry,lab})=>entry.course.id===recent?.courseId && lab.id===recent.labId)
    ?? pending.find(({lab})=>lab.executed > 0) ?? pending[0];
  const trail = current?.entry ?? courses.find(course=>course.labs.length);
  const review = trail?.examCount ? trail : courses.find(course=>course.examCount);

  return <div className="page learning-home" data-tour-ready={data||error?'home':undefined}>
    <header className="learning-home-heading">
      <div><h1>继续学习</h1><p>完成课内实验，回顾错题，准备考试。</p></div>
      <Link className="daily home-daily" to="/settings"><Clock3 size={19} aria-hidden="true"/>每日 {duration} 分钟计划</Link>
    </header>
    <div className="learning-home-grid">
      {current ? <LabHero key={current.entry.course.id+'/'+current.lab.id} course={current.entry.course} lab={current.lab}/>
        : !data && !error ? <section className="learning-home-task home-hero-loading" aria-label="实验进度">
          <p role="status" className="sr-only">正在读取课内进度…</p>
          <div className="home-hero-copy home-hero-skeleton loading-delay"><LoadingLines widths={[16,58,84,60]}/></div>
          <div className="home-deliverable home-deliverable-skeleton loading-delay"><LoadingLines widths={[32,58,64,50]}/></div>
        </section> : <section className="learning-home-task home-hero" data-tour="home-hero">
          <div className="home-hero-copy">
            <h2>{error && !data ? '实验进度暂未加载' : trail ? '必做实验已全部通关' : '课内实验'}</h2>
            <p>{error && !data ? '可以重新读取进度，或直接打开课程目录。' : trail ? '可以回顾错题，或用模拟卷检查掌握情况。' : '课程接入后，实验会出现在这里。'}</p>
            <div className="learning-home-actions">
              {error && !data && <button type="button" className="btn button secondary" onClick={reload}>重新读取</button>}
              <Link className="btn button primary" to="/school">全部课内实验<ArrowRight size={16} aria-hidden="true"/></Link>
            </div>
          </div>
        </section>}
      {trail && <LabTrail entry={trail} active={current?.lab.id}/>}
      <div className="home-interactions" data-tour="home-interactions">
        <section className="learning-home-example" aria-labelledby="example-title">
          <h2 id="example-title">SQL 查询互动沙盒</h2><HomePlayground/>
        </section>
        <HomeReviewEntry course={review} loaded={!!data} onRetry={error ? reload : undefined}/>
      </div>
      <OptionalProjects/>
      <HomeDirectory/>
    </div>
  </div>;
}
