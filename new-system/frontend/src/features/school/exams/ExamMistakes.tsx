import {useState} from 'react';
import {Link,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {errorMessage,schoolRequest} from '../school-api';
import {discardExamDraft,draftPath,examApi,examRoute,kindNames,kinds,useExamRead,type Mistake,type Overview,type Work} from './exam-api';
import {DiscardDraftButton,ExamHeader,ExamReadState,ExportActions,ItemFeedback,itemMarkdown,SyntaxGuide,questionHeading} from './ExamShared';
import {ExamQuestion} from './ExamQuestion';

export default function ExamMistakes() {
  const {courseId=''} = useParams();
  const [params,setParams] = useSearchParams();
  const base = examRoute(courseId);
  const courseApi = examApi(courseId);
  const api = courseApi+'/mistakes';
  const {data,error,reload,setData} = useExamRead<Mistake[]>(api);
  const overview = useExamRead<Overview>(courseApi);
  const [batchBusy,setBatchBusy] = useState(false);
  const [batchError,setBatchError] = useState('');
  const navigate = useNavigate();
  const lab = params.get('lab')??'';
  const tag = params.get('tag')??'';
  const type = params.get('type')??'';
  const status = params.get('status')??'';
  const sort = params.get('sort')??'frequency';
  const all = data??[];
  const filtered = all.filter(mistake=>{
    const q = mistake.item.question;
    return (!lab||q.labId===lab) && (!tag||q.tags.includes(tag)) && (!type||q.kind===type)
      && (!status||mistake.mastered===(status==='mastered'));
  }).sort((a,b)=>sort==='latest'?b.updatedAt-a.updatedAt:b.count-a.count || b.updatedAt-a.updatedAt);

  function filter(key:string,value:string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key,value); else next.delete(key);
    setParams(next,{replace:true});
  }

  async function group() {
    setBatchBusy(true);setBatchError('');
    try {
      const work = await schoolRequest<Work>(courseApi+'/mistake-review/start',{
        mode:'practice',minutes:0,shuffle:true,mistakes:filtered.slice(0,25).map(mistake=>mistake.item.question.id),
      });
      navigate(base+'/'+draftPath('mistake-review',work.draft.id));
    } catch (error) {setBatchError(errorMessage(error));}
    finally {setBatchBusy(false);}
  }

  return <div className="page exam-page exam-print-page">
    <ExamHeader title="错题回顾与重练" back={base} summary={data?'筛选结果 '+filtered.length+' 题 · 全部 '+all.length+' 题':undefined}>
      {data && <><SyntaxGuide/><ExportActions name="数据库原理-错题回顾" content={()=>
        ['# 错题回顾',...filtered.map(m=>m.paperTitle+' · 答错 '+m.count+' 次 · '+(m.mastered?'已掌握':'待攻克')+'\n\n'+itemMarkdown(m.item))].join('\n\n')}/></>}
    </ExamHeader>
    {data ? <>
      <section className="card exam-panel exam-screen">
        <h2>筛选错题</h2>
        <div className="exam-filter-grid">
          <label>所属实验<select className="select exam-input" name="lab" value={lab} onChange={e=>filter('lab',e.target.value)}>
            <option value="">全部实验</option>
            {[...new Set(all.map(m=>m.item.question.labId).concat(lab||[]))].sort().map(value=>
              <option key={value} value={value}>{overview.data?.labTitles?.[value]??value}</option>)}
          </select></label>
          <label>题型<select className="select exam-input" name="type" value={type} onChange={e=>filter('type',e.target.value)}>
            <option value="">全部题型</option>{kinds.map(kind=><option value={kind} key={kind}>{kindNames[kind]}</option>)}
          </select></label>
          <label>知识点<select className="select exam-input" name="tag" value={tag} onChange={e=>filter('tag',e.target.value)}>
            <option value="">全部知识点</option>
            {[...new Set(all.flatMap(m=>m.item.question.tags).concat(tag||[]))].sort().map(value=><option key={value}>{value}</option>)}
          </select></label>
          <label>掌握状态<select className="select exam-input" name="status" value={status} onChange={e=>filter('status',e.target.value)}>
            <option value="">全部状态</option><option value="pending">待攻克</option><option value="mastered">已掌握</option>
          </select></label>
          <label>排序<select className="select exam-input" name="sort" value={sort} onChange={e=>filter('sort',e.target.value)}>
            <option value="frequency">高频错题优先</option><option value="latest">最近更新优先</option>
          </select></label>
        </div>
        <div className="exam-actions">
          {overview.data?.reviewDraft ? <>
            <Link className="button primary" to={base+'/'+draftPath('mistake-review',overview.data.reviewDraft)}>继续错题组卷</Link>
            <DiscardDraftButton onDiscard={async()=>{
              const endpoint=courseApi+'/mistake-review/drafts/'+encodeURIComponent(overview.data!.reviewDraft!);
              const current=await schoolRequest<Work>(endpoint);
              await discardExamDraft(endpoint,current.draft.revision);
              await overview.reload();
            }}/>
          </> : <button type="button" className="button primary" disabled={!filtered.length||batchBusy} onClick={()=>void group()}>
              {batchBusy?'正在组卷…':'错题组卷重练'}{filtered.length>25?'（前 25 题）':''}</button>}
        </div>
        {batchError && <p className="note" role="alert">{batchError}</p>}
      </section>
      <div className="exam-review-list">
        {filtered.length ? filtered.map(mistake=><MistakeCard key={mistake.item.question.id} mistake={mistake} base={base} api={api}
          onChange={next=>setData(all.map(m=>m.item.question.id===next.item.question.id?next:m))}/>)
          : <section className="card exam-panel"><h2>{all.length?'当前筛选没有错题':'暂时没有错题'}</h2>
            <p>{all.length?'调整筛选条件即可查看其他错题。':'交卷后，未满分的题会自动收录在这里。'}</p></section>}
      </div>
    </> : <ExamReadState error={error} reload={reload} label="正在读取错题…"/>}
  </div>;
}

function MistakeCard({mistake,base,api,onChange}:{mistake:Mistake;base:string;api:string;onChange:(mistake:Mistake)=>void}) {
  const [rework,setRework] = useState(false);
  const [answer,setAnswer] = useState<string[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const {item} = mistake;
  const endpoint = api+'/'+item.question.id;
  async function mark() {
    setBusy(true);setError('');
    try {onChange(await schoolRequest<Mistake>(endpoint+'/mastery',{mastered:!mistake.mastered}));}
    catch (error) {setError(errorMessage(error));}
    finally {setBusy(false);}
  }
  return <article className="card exam-panel">
    <p className="exam-muted">{kindNames[item.question.kind]} · 错 {mistake.count} 次 · {item.question.tags.join('、')}</p>
    <h2>{questionHeading(item.question.prompt)}</h2>
    <p><Link to={base+'/'+mistake.paperId}>{mistake.paperTitle}</Link> · <strong>{mistake.mastered?'已掌握':'待攻克'}</strong></p>
    <div className="exam-actions exam-screen">
      <button type="button" className="button secondary" aria-expanded={rework} onClick={()=>setRework(!rework)}>单题重做</button>
      <button type="button" className="button secondary" disabled={busy} onClick={()=>void mark()}>{mistake.mastered?'标为待攻克':'标为已掌握'}</button>
    </div>
    {error && <p className="note" role="alert">{error}</p>}
    {rework && <div className="exam-screen"><ExamQuestion question={item.question} answer={answer} onAnswer={setAnswer} endpoint={endpoint} allowCheck
      onChecked={result=>{if(result.score===result.question.points)onChange({...mistake,mastered:true});}}/></div>}
    <details className="exam-item"><summary>最近作答、错因与解析</summary>
      <p>最近作答</p><pre>{item.answer.map(value=>item.question.kind==='choice'?item.question.options.find(o=>o.id===value)?.text??value
        : item.question.kind==='boolean'?value==='true'?'对':'错':value).join('\n')||'未作答'}</pre>
      <ItemFeedback item={item}/>
    </details>
  </article>;
}
