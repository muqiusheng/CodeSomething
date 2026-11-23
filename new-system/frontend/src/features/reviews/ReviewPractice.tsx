import {PageSkeleton} from '../../components/shared/LoadingState';
import {useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {ArrowRight,RotateCcw} from 'lucide-react';
import {courses,reviewLabels,stateLabels,learnerRequest,useLearnerResource,type Review,type ReviewQueue,type Skill} from '../../api/learner-api';
import '../../styles/learner.css';

const reviewKey=({courseId,courseVersion,stageId}:Skill)=>`${courseId}/${courseVersion}/${stageId}`;
const helpLabel=(help:string)=>help==='none'?'自行作答':help==='hint'?'借助提示':'借助示例或答案';

export function ReviewPractice(){
 const {data,error,reload}=useLearnerResource<ReviewQueue>('/reviews');const [params]=useSearchParams();
 const [stage,setStage]=useState(params.get('stage')||'run-server');const [help,setHelp]=useState('none');
 const [review,setReview]=useState<Review|null>(null);const [answer,setAnswer]=useState<number|null>(null);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const result=useRef<HTMLDivElement>(null);const question=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{if(review?.status==='open')question.current?.focus();else if(review)result.current?.focus()},[review?.id,review?.status]);
 function resumeRound(round:Review){
  setReview(round);setAnswer(null);setStage(round.skill.stageId);setHelp(round.help);setFailure('');
 }
 async function start(id=stage,level=help){setBusy(true);setFailure('');try{const r=await learnerRequest<Review>('/reviews',{stageId:id,help:level});setReview(r);setHelp(r.help);setAnswer(null);setStage(id)}catch(e){setFailure((e as Error).message)}finally{setBusy(false)}}
 async function finish(action:'answer'|'later'|'skip'){if(!review)return;setBusy(true);setFailure('');try{const r=await learnerRequest<Review>('/reviews/'+review.id+(action==='answer'?'/answer':'/defer'),action==='answer'?{answer,help}:{action});setReview(r)}catch(e){setFailure((e as Error).message)}finally{setBusy(false)}}
 const openRounds=data?.history.filter(round=>round.status==='open')||[];
 const pendingKeys=new Set(openRounds.filter(round=>round.id!==review?.id||review.status==='open').map(round=>reviewKey(round.skill)));
 if(review?.status==='open')pendingKeys.add(reviewKey(review.skill));
 const recommendations=data?.items.filter(item=>item.recommended&&!pendingKeys.has(reviewKey(item.skill))).slice(0,data.dailyLimit)||[];
 const pending=openRounds.filter(round=>round.id!==review?.id);
 const selected=data?.items.find(item=>item.skill.stageId===stage);
 const selectedRound=selected&&openRounds.find(round=>reviewKey(round.skill)===reviewKey(selected.skill));
 return <div className="page narrow learner-page"><div className="page-title"><h1>复习</h1><Link className="button secondary" to="/profile">查看画像<ArrowRight size={15} aria-hidden="true"/></Link></div>
 {error&&<p role="alert">{error} <button className="button secondary" onClick={reload}>重新读取</button></p>}{!data&&!error&&<PageSkeleton variant="cards" label="正在读取复习安排…"/>}
 <p className="learner-intro">每题预计5分钟，换个场景验证概念。结果记录在画像中，代码关卡仍按功能与正式理解验证完成。</p>
 {data&&<><section className="profile-panel review-recommendations"><div className="section-heading"><h2>建议复习</h2><span className="text-pill">{data.plan.review_minutes?`每日额外${data.plan.review_minutes}分钟`:'按需选择'}</span></div>{(pending.length>0||recommendations.length>0)?<ul>
  {pending.map(round=><li key={round.id}><div><h3>{round.skill.title}</h3><p>待作答 · {helpLabel(round.help)}</p></div>
   <button className="btn button primary" disabled={busy} onClick={()=>resumeRound(round)}>恢复这轮复习</button>
  </li>)}
  {recommendations.map(item=><li key={reviewKey(item.skill)}><div><h3>{item.skill.title}</h3><p>{item.reason}</p></div><button className="btn button secondary" disabled={busy} onClick={()=>void start(item.skill.stageId)}>复习{item.skill.title}</button></li>)}
 </ul>:<p>当前没有到期建议。可以主动选一关练习，也可以继续主线。</p>}
 <Link className="inline-action" to="/learn">继续主线学习<ArrowRight size={14} aria-hidden="true"/></Link></section>
 <section className="profile-panel"><h2><RotateCcw size={18} aria-hidden="true"/>主动复习</h2><form className="learner-form" onSubmit={e=>{e.preventDefault();if(selectedRound){if(selectedRound.id===review?.id)question.current?.focus();else resumeRound(selectedRound)}else void start()}}><label>选择知识关卡<select value={stage} disabled={busy} onChange={e=>setStage(e.target.value)}>{Object.keys(courses).map(c=><optgroup label={courses[c]} key={c}>{data.items.filter(i=>i.skill.courseId===c).map(i=><option key={i.skill.stageId} value={i.skill.stageId}>{i.skill.title} · {stateLabels[i.state]}</option>)}</optgroup>)}</select></label><label>预计使用的帮助<select value={selectedRound?.help||help} disabled={busy||!!selectedRound} onChange={e=>setHelp(e.target.value)}><option value="none">自行作答</option><option value="hint">借助提示</option><option value="example">借助示例、答案或他人</option></select></label>{selected&&<p className="muted">{selected.retention} · {reviewLabels[selected.lastStatus]} · {selected.reason}</p>}<button className="button secondary" disabled={busy}>{busy?'正在处理…':selectedRound?'打开待作答题目':'开始本次复习'}</button></form></section>
 </>}
 {failure&&<p role="alert" className="learner-notice">{failure}</p>}
 {review&&<section className="profile-panel review-session" aria-label="当前复习"><div className="section-heading"><span className="text-pill">{review.skill.title}</span><span className="muted">规则 {review.ruleVersion} · 变式{review.variant+1}</span></div>{review.status==='open'?<><h2 ref={question} tabIndex={-1}>{review.prompt}</h2><form onSubmit={e=>{e.preventDefault();void finish('answer')}}><fieldset className="review-options" disabled={busy}><legend className="sr-only">选择复习答案</legend>{review.options.map((option,i)=><label key={i}><input required type="radio" name={'review-'+review.id} checked={answer===i} onChange={()=>setAnswer(i)}/><span>{option}</span></label>)}</fieldset><label className="learner-help">本轮实际使用的帮助<select value={help} disabled={busy} onChange={e=>setHelp(e.target.value)}><option value="none" disabled={review.help!=='none'}>自行作答</option><option value="hint" disabled={review.help==='example'}>借助提示</option><option value="example">借助示例、答案或他人</option></select></label><div className="button-row"><button className="button primary" disabled={busy||answer===null}>{busy?'正在保存…':'提交并查看解析'}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>void finish('later')}>稍后一天</button><button type="button" className="text-button" disabled={busy} onClick={()=>void finish('skip')}>跳过七天</button></div></form></>:<div ref={result} tabIndex={-1} className="review-result"><h2>{review.status==='completed'?(review.passed?'变式答对了':'这题需要再巩固'):reviewLabels[review.status]}</h2>{review.status==='completed'?<><p>{review.explanation}</p><p>正确选项：{review.options[review.correct??0]}</p><p>{review.help==='none'?'本轮自行作答':'本轮借助了帮助'} · 下次建议：{new Date(review.dueAt).toLocaleDateString('zh-CN')}</p></>:<p>已保存安排，主线可继续。你也可以随时主动开始新一轮。</p>}<p role="status">本次记录已保存。</p><div className="button-row"><button className="button secondary" disabled={busy} onClick={()=>{setReview(null);setAnswer(null);setHelp('none');setFailure('')}}>选择下一关</button><Link className="button primary" to={review.skill.route}>回看课程<ArrowRight size={15} aria-hidden="true"/></Link></div></div>}</section>}
 {data&&data.history.length>0&&<details className="profile-panel"><summary>最近复习（{data.history.length}轮）</summary><ol className="review-history">{data.history.map(r=><li key={r.id}><div><strong>{r.skill.title}</strong><p>{reviewLabels[r.status]}{r.status==='completed'?' · '+(r.passed?'答对':'待巩固'):''} · {r.help==='none'?'自行作答':'借助帮助'}</p></div><button className="text-button" disabled={busy} onClick={()=>{setReview(r);setAnswer(r.answer??null);setHelp(r.help)}}>查看这轮</button></li>)}</ol></details>}
 </div>;
}
