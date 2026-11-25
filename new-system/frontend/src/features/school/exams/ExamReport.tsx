import {BookmarkButton} from '../../bookmarks/BookmarkButton';
import type {BookmarkTarget} from '../../bookmarks/BookmarksProvider';
import {useEffect,useRef,useState} from 'react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {examApi,examRoute,kindNames,kinds,stateNames,useExamRead,type Attempt,type Item,type Kind,type PaperInfo} from './exam-api';
import {ExamHeader,ExamReadState,ExportActions,HistoryList,ItemFeedback,itemMarkdown,SyntaxGuide,questionHeading,QuestionTables} from './ExamShared';
import {ExamQuestion} from './ExamQuestion';

export default function ExamReport() {
  const {courseId='',paperId='',attemptId=''} = useParams();
  const [params] = useSearchParams();
  const linkedQuestion = params.get('question');
  const base = examRoute(courseId);
  const paperApi = examApi(courseId)+'/'+encodeURIComponent(paperId);
  const api = paperApi+'/attempts/'+encodeURIComponent(attemptId);
  const report = useExamRead<Attempt>(api);
  const info = useExamRead<PaperInfo>(paperApi);
  const [onlyMissed,setOnlyMissed] = useState(false);
  const [kind,setKind] = useState<Kind|''>('');
  const [expansion,setExpansion] = useState<{open:boolean;revision:number}>();
  if (!report.data) return <div className="page exam-page">
    <ExamHeader title="阅卷报告" back={base}/><ExamReadState error={report.error} reload={report.reload} label="正在读取阅卷报告…"/>
  </div>;

  const {summary,items} = report.data;
  const paper = base+'/'+paperId;
  const misses = items.filter(item=>item.score<item.question.points).length;
  const matches = (item:Item) => (!onlyMissed||item.score<item.question.points) && (!kind||item.question.kind===kind);
  const elapsed = Math.floor(summary.elapsedSeconds/60)+' 分 '+summary.elapsedSeconds%60+' 秒';
  return <div className="page exam-page exam-print-page">
    <ExamHeader title={summary.title} back={base} summary="阅卷报告">
      <SyntaxGuide/>
      <ExportActions name={paperId+'-'+attemptId} content={()=>['# '+summary.title,
        '得分 '+summary.score+'/'+summary.maxScore+' · '+summary.level+' · '+elapsed,
        ...kinds.map(kind=>'- '+kindNames[kind]+' '+summary.scores[kind]+'/'+items.filter(item=>item.question.kind===kind)
          .reduce((sum,item)=>sum+item.question.points,0)+' 分'),...items.map(itemMarkdown)].join('\n\n')}/>
    </ExamHeader>
    <section className="card exam-panel">
      <div className="exam-report-result">
        <div><h2>{summary.score}<small> / {summary.maxScore} 分</small></h2><p>{summary.level} · 用时 {elapsed} · {misses} 题未满分</p></div>
        <div className="exam-actions exam-screen">
          {paperId!=='mistake-review' && <>
            <Link className="button primary" to={paper}>整卷重刷</Link>
            {misses>0 && <Link className="button secondary" to={paper+'?from='+attemptId}>仅重做本次错题</Link>}
          </>}
          <Link className="button secondary" to={base+'/mistakes'}>打开错题本</Link>
        </div>
      </div>
      {!summary.completeGrading && <p className="note">隔离 MySQL 不可用。本次已保存客观题与填空得分，已作答的 SQL 大题标为待判。</p>}
      <dl className="exam-stats exam-score-types">{kinds.map(kind=><div key={kind}>
        <dt>{kindNames[kind]} · {items.filter(item=>item.question.kind===kind).length} 题</dt><dd>{summary.scores[kind]}/{items.filter(item=>item.question.kind===kind).reduce((sum,item)=>sum+item.question.points,0)}</dd>
      </div>)}</dl>
    </section>
    <section className="card exam-panel exam-screen"><h2>历次成绩</h2>
      {info.data ? <HistoryList history={info.data.history} base={base}/>
        : <ExamReadState error={info.error} reload={info.reload} label="正在读取历史…"/>}
    </section>
    <section className="card exam-panel">
      <div className="exam-review-header">
        <h2>逐题复盘</h2>
        <div className="exam-actions exam-screen">
          <div className="exam-segmented" role="group" aria-label="答题结果范围">
            <button type="button" aria-pressed={!onlyMissed} onClick={()=>setOnlyMissed(false)}>全部 {items.length} 题</button>
            <button type="button" aria-pressed={onlyMissed} onClick={()=>setOnlyMissed(true)}>仅看错题 · {misses}</button>
          </div>
          <select aria-label="按题型筛选" className="select exam-input" value={kind} onChange={e=>setKind(e.target.value as Kind|'')}>
            <option value="">全部题型</option>
            {kinds.map(value=><option value={value} key={value}>{kindNames[value]}</option>)}
          </select>
          <details className="exam-debug-more">
            <summary className="button secondary">展开方式</summary>
            <div className="exam-debug-menu">
              <button type="button" onClick={event=>{event.currentTarget.closest('details')!.open=false;setExpansion(previous=>({open:true,revision:(previous?.revision??0)+1}));}}>全部展开</button>
              <button type="button" onClick={event=>{event.currentTarget.closest('details')!.open=false;setExpansion(previous=>({open:false,revision:(previous?.revision??0)+1}));}}>全部收起</button>
            </div>
          </details>
        </div>
      </div>
      <div className="exam-review-list">
        {items.map((item,index)=><ReportQuestion item={item} key={item.question.id} index={index}
          visible={matches(item)} expansion={expansion} selected={linkedQuestion===item.question.id}
          target={{id:['school-exam',courseId,paperId,attemptId,item.question.id].join('.'),category:'school',
            source:summary.title+' · 阅卷报告',title:questionHeading(item.question.prompt),
            href:paper+'/attempts/'+attemptId+'?question='+encodeURIComponent(item.question.id)}}
          endpoint={api+'/questions/'+item.question.id}/>)}
        {!items.some(matches) && <p className="exam-muted" role="status">当前筛选没有题目。</p>}
      </div>
    </section>
  </div>;
}

function ReportQuestion({item,index,endpoint,visible,expansion,selected,target}:{item:Item;index:number;endpoint:string;visible:boolean;selected:boolean;target:BookmarkTarget;
  expansion?:{open:boolean;revision:number}}) {
  const [retry,setRetry] = useState(false);
  const [answer,setAnswer] = useState(item.answer);
  const details=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if (details.current && expansion) details.current.open=expansion.open;},[expansion]);
  useEffect(()=>{
    if (!selected || !details.current) return;
    const frame = requestAnimationFrame(()=>details.current?.scrollIntoView({block:'start'}));
    return ()=>cancelAnimationFrame(frame);
  },[selected]);
  return <div className="exam-bookmark-entry" hidden={!visible}>
    <details ref={details} className="exam-item" open={selected||index===0||undefined}>
    <summary><span>{index+1}. {kindNames[item.question.kind]} · {questionHeading(item.question.prompt)}</span>
      <strong>{stateNames[item.status]} · {item.score}/{item.question.points} 分</strong></summary>
    {item.question.options.length>0 && <ol className="exam-report-options" type="A">
      {item.question.options.map(option=><li key={option.id}>{option.text}{item.answer[0]===option.id?' · 你的选择':''}</li>)}
    </ol>}
    {!retry && <QuestionTables text={item.question.prompt}/>}
    {item.question.template && <pre>{item.question.template}</pre>}
    {item.question.kind!=='choice' && <><h4>你的作答</h4>
      <pre>{item.answer.map(value=>item.question.kind==='boolean'?value==='true'?'对':'错':value||'未作答').join('\n')||'未作答'}</pre></>}
    <ItemFeedback item={item}/>
    {item.question.kind==='sql' && <div className="exam-screen">
      <button type="button" className="button secondary" aria-expanded={retry} onClick={()=>setRetry(!retry)}>调试与对比</button>
      {retry && <ExamQuestion question={item.question} answer={answer} onAnswer={setAnswer} endpoint={endpoint} allowCheck/>}
    </div>}
    </details>
    <div className="exam-screen"><BookmarkButton target={target}/></div>
  </div>;
}
