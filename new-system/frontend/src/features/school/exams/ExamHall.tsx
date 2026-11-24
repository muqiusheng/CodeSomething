import {ArrowUpRight, BookOpen, FileCheck2} from 'lucide-react';
import {Link,useParams} from 'react-router-dom';
import {draftPath,examApi,examRoute,useExamRead,type Overview} from './exam-api';
import {ExamHeader,ExamReadState,shortPaperTitle} from './ExamShared';

export default function ExamHall() {
  const {courseId=''} = useParams();
  const api = examApi(courseId);
  const base = examRoute(courseId);
  const {data,error,reload} = useExamRead<Overview>(api);
  const sample = data?.papers[0];
  return <div className="page exam-page exam-hall">
    <ExamHeader title="考试冲刺备考" back="/school" backLabel="返回课内实战"
      summary={data && sample ? data.papers.length+' 套试卷 · 每套 '+sample.questionCount+' 题 / '+sample.maxScore+' 分' : undefined}
      questionCounts={sample?.questionCounts}>
      <Link className="button primary" to={base+'/mistakes'}><BookOpen size={16} aria-hidden="true"/>错题本</Link>
    </ExamHeader>
    {data ? <>
      <dl className="exam-stats">
        <div><dt>已完成整卷</dt><dd>{data.completed}/{data.papers.length}</dd></div>
        <div><dt>最高分 / 均分</dt><dd>{data.best??'—'} / {data.average??'—'}</dd></div>
        <div><dt>待复习错题</dt><dd>{data.pending} 题</dd></div>
      </dl>
      {(['specialty','mock'] as const).map(group=>{
        const papers = data.papers.filter(paper=>paper.group===group);
        if (!papers.length) return null;
        return <section key={group} className="exam-hall-section">
          <h2>{group==='specialty'?'分实验专项卷':'期末综合模拟卷'} <span>{papers.length} 套</span></h2>
          <div className="exam-paper-grid">{papers.map((paper,index)=><article className="card exam-paper" key={paper.id}>
            <span className="exam-paper-tag">{group==='specialty'?'实验':'模拟'}{'一二三四五六七八九十'[index]??index+1}</span>
            <h3>{shortPaperTitle(paper.title)}</h3>
            <p>{paper.count ? [paper.best!=null?'最高 '+paper.best+' 分':'', '已刷 '+paper.count+' 次'].filter(Boolean).join(' · ')
              : paper.draftId?'作答中':'未作答'}</p>
            <div className="exam-actions">
              <Link className="button secondary" to={base+'/'+(paper.draftId?draftPath(paper.id,paper.draftId):paper.id)}>
                {paper.draftId?'继续作答':paper.count?'重练与历史':'开始作答'}<ArrowUpRight size={15} aria-hidden="true"/>
              </Link>
              {paper.labId && <Link className="exam-text-link" to={'/school/'+courseId+'/'+paper.labId}>对应实验</Link>}
            </div>
          </article>)}</div>
        </section>;
      })}
      <section className="card exam-panel">
        <h2><FileCheck2 size={19} aria-hidden="true"/>知识点薄弱诊断</h2>
        {data.topics.length ? <ol className="exam-topics">{data.topics.slice(0,8).map((topic,i)=>{
          const specialty = data.papers.find(paper=>paper.labId===topic.labId);
          return <li key={topic.labId+topic.tag}>
            <div><strong>{topic.tag}</strong>{i===0 && <span className="badge badge-warning">优先复习</span>}<span>{topic.percent}% · {topic.score}/{topic.points} 分</span></div>
            <div className="exam-actions">
              <Link className="exam-text-link" to={'/school/'+courseId+'/'+topic.labId}>实验</Link>
              {specialty && <Link className="exam-text-link" to={base+'/'+specialty.id}>专项卷</Link>}
              <Link className="exam-text-link" to={base+'/mistakes?'+new URLSearchParams({tag:topic.tag,lab:topic.labId})}>知识点错题</Link>
            </div>
          </li>;
        })}</ol> : <p className="exam-muted">交卷后按知识点汇总实际得分。</p>}
      </section>
    </> : <ExamReadState error={error} reload={reload} label="正在读取试卷…"/>}
  </div>;
}
