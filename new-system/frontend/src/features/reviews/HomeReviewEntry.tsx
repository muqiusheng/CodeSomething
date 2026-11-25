import {Link} from 'react-router-dom';
import {ArrowRight,Radar} from 'lucide-react';
import type {SchoolCourseProgress} from '../school/school-api';
import {draftPath,examApi,examRoute,useExamRead,type Overview} from '../school/exams/exam-api';

export function HomeReviewEntry({course,loaded,onRetry}: {course?:SchoolCourseProgress;loaded:boolean;onRetry?:()=>void}) {
  const {data,error,reload} = useExamRead<Overview>(course ? examApi(course.course.id) : null);
  const labMistakes = course?.labs.reduce((sum,lab)=>sum+(lab.review?.length ?? 0),0) ?? 0;
  const pending = data ? labMistakes+data.pending : null;
  const weak = data?.topics.filter(topic=>topic.percent<80).sort((a,b)=>a.percent-b.percent)[0];
  const draft = data?.papers.find(paper=>paper.draftId);
  const base = course ? examRoute(course.course.id) : null;

  return <section className="review-card review-entry" aria-labelledby="home-review-title">
    <div className="section-heading"><h2 id="home-review-title"><Radar size={19} aria-hidden="true"/>复习雷达</h2>
      {course && <span className="home-status">{course.course.title}</span>}</div>
    <div className="home-review-counts">
      <span><strong>{pending ?? (labMistakes || '—')}</strong>{pending === null && labMistakes ? '待复习实验题' : '待复习错题'}</span>
      <span><strong>{data?.completed ?? '—'}</strong>已交卷次数</span>
    </div>
    {error || onRetry ? <p role="status">复习记录暂未加载。 <button type="button" className="text-button" onClick={error ? reload : onRetry}>重试</button></p>
      : !loaded || course && !data ? <p role="status">正在读取备考记录…</p>
      : weak ? <p>优先复习「{weak.tag}」，最近得分率 {weak.percent}%。</p>
      : <p>{base ? '按考点做专项练习，或用计时模拟卷检查掌握情况。' : '从已练过的实验回顾知识点。'}</p>}
    {base && <div className="home-review-links">
      {draft?.draftId && <Link to={draftPath(base+'/'+draft.id,draft.draftId)}>继续备考 · {draft.title}<ArrowRight size={14} aria-hidden="true"/></Link>}
      <Link to={base}>专项练习与模拟卷<ArrowRight size={14} aria-hidden="true"/></Link>
      <Link to={base+'/mistakes'}>备考错题本<ArrowRight size={14} aria-hidden="true"/></Link>
    </div>}
    <Link className="btn button secondary home-review-action" to="/reviews">查看复习与错题<ArrowRight size={15} aria-hidden="true"/></Link>
  </section>;
}
