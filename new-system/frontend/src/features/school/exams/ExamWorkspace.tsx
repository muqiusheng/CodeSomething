import {ArrowLeft,Bookmark,ChevronLeft,ChevronRight,ClipboardList,Clock3} from 'lucide-react';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {sessionState} from '../../../api/browser-state.mjs';
import {currentAccess} from '../../../api/auth-api';
import {useMysqlActivity} from '../../../hooks/useMysqlActivity';
import {Modal} from '../../../components/ui/modal';
import {errorMessage,schoolRequest} from '../school-api';
import {discardExamDraft,draftPath,examApi,examRoute,kindNames,kinds,stateNames,useExamRead,useExamWork,
  type Attempt,type Draft,type Mode,type Overview,type PaperInfo,type Question,type Work} from './exam-api';
import {answerState,remainingTime,restoreDraft,screenPosition} from './exam-state.mjs';
import {DiscardDraftButton,ExamHeader,ExamReadState,HistoryList,QuestionText,shortPaperTitle,SyntaxGuide,questionHeading} from './ExamShared';
import {ExamQuestion,type QuestionSession} from './ExamQuestion';

export default function ExamWorkspace() {
  const {courseId='',paperId=''} = useParams();
  const [params,setParams] = useSearchParams();
  const id = params.get('draft');
  const fromAttempt = params.get('from');
  const api = examApi(courseId)+'/'+encodeURIComponent(paperId);
  const base = examRoute(courseId);
  const work = useExamWork(id ? api+'/drafts/'+encodeURIComponent(id) : null);
  const info = useExamRead<PaperInfo>(id ? null : api);
  const overview = useExamRead<Overview>(id ? null : examApi(courseId));
  const navigate = useNavigate();
  function returnToStart() {
    if (paperId==='mistake-review') navigate(base+'/mistakes',{replace:true});
    else setParams(fromAttempt?{from:fromAttempt}:{},{replace:true});
  }
  if (work.data?.outdated && id) {
    const {draft}=work.data;
    return <div className="page exam-page">
      <ExamHeader title={draft.title} back={base}/>
      <section className="card exam-panel">
        <h2>试卷已更新</h2>
        <p>这份草稿使用了旧题。可先复制已保存作答，再放弃草稿并使用新版试卷。</p>
        <details><summary>查看已保存作答</summary><pre>{JSON.stringify(draft.answers,null,2)}</pre></details>
        <div className="exam-actions">
          <DiscardDraftButton onDiscard={async()=>{
            const endpoint=api+'/drafts/'+encodeURIComponent(id);
            await discardExamDraft(endpoint,draft.revision);
            backup('school-exam:'+endpoint,currentAccess().user?.userId??'');
            returnToStart();
          }}/>
        </div>
      </section>
    </div>;
  }
  if (id) return work.data ? <ActiveExam key={id} work={work.data} api={api+'/drafts/'+id} base={base} onDiscard={returnToStart}/>
    : <div className="page exam-page"><ExamHeader title="试卷作答" back={base}/>
      <ExamReadState error={work.error} reload={work.reload} label="正在恢复作答…"/>
      {work.error && <Link to={base+'/'+paperId}>打开试卷与历史</Link>}</div>;
  const active = overview.data?.papers.find(paper=>paper.id===paperId)?.draftId ??
    (paperId==='mistake-review' ? overview.data?.reviewDraft : null);
  const latestAttempt = info.data?.history[0];
  const questions = info.data?.questions ?? [];
  const counts = Object.fromEntries(kinds.map(kind=>[kind,questions.filter(q=>q.kind===kind).length]));
  const maxPoints = questions.reduce((sum,question)=>sum+question.points,0);
  return <div className="page exam-page">
    {info.data ? <>
      <ExamHeader title={info.data.title} back={base} summary={questions.length && !fromAttempt ? questions.length+' 题 · 满分 '+maxPoints+' 分' : undefined} questionCounts={counts}/>
      {active && <section className="card exam-panel"><h2>继续已有作答</h2>
        <div className="exam-actions">
          <Link className="button primary" to={base+'/'+draftPath(paperId,active)}>续做草稿</Link>
          <DiscardDraftButton onDiscard={async()=>{
            const endpoint=api+'/drafts/'+encodeURIComponent(active);
            const current=await schoolRequest<Work>(endpoint);
            await discardExamDraft(endpoint,current.draft.revision);
            backup('school-exam:'+endpoint,currentAccess().user?.userId??'');
            await overview.reload();
          }}/>
        </div></section>}
      {!active && (paperId==='mistake-review' ? <Link className="button primary" to={base+'/mistakes'}>到错题本组卷</Link>
        : <StartForm key={fromAttempt??'full'} fromAttempt={fromAttempt} onStart={async (mode,minutes,shuffle)=>{
          const result = await schoolRequest<Work>(api+'/start',{mode,minutes,shuffle,fromAttempt});
          setParams({draft:result.draft.id},{replace:true});
        }}/>)}
      {!active && !fromAttempt && paperId!=='mistake-review' && latestAttempt && latestAttempt.score<latestAttempt.maxScore &&
        <Link className="exam-text-link" to={'?from='+latestAttempt.id}>仅重做本卷上次错题</Link>}
      <section className="card exam-panel"><h2>历次成绩</h2><HistoryList history={info.data.history} base={base}/></section>
    </> : <><ExamHeader title="准备作答" back={base}/><ExamReadState error={info.error} reload={info.reload} label="正在读取试卷…"/></>}
    {paperId==='mistake-review' && <button type="button" className="button secondary" onClick={()=>navigate(base+'/mistakes')}>返回错题本</button>}
  </div>;
}

function StartForm({fromAttempt,onStart}:{fromAttempt:string|null;onStart:(mode:Mode,minutes:number,shuffle:boolean)=>Promise<void>}) {
  const [mode,setMode] = useState<Mode>(fromAttempt?'practice':'exam');
  const [minutes,setMinutes] = useState(90);
  const [shuffle,setShuffle] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  return <form className="card exam-panel exam-start" onSubmit={async event=>{
    event.preventDefault();setBusy(true);setError('');
    try {await onStart(mode,mode==='exam'?minutes:0,shuffle);}
    catch (error) {setError(errorMessage(error));}
    finally {setBusy(false);}
  }}>
    <h2>{fromAttempt?'仅重做本次错题':'作答设置'}</h2>
    <fieldset disabled={busy} className="exam-answer">
      <legend>作答模式</legend>
      <div className="exam-options">
        <label className="exam-option"><input type="radio" className="radio radio-sm" checked={mode==='exam'} name="exam-mode"
          onChange={()=>setMode('exam')}/><span><strong>考场模拟模式</strong><small>交卷后查看答案与解析，可启用倒计时。</small></span></label>
        <label className="exam-option"><input type="radio" className="radio radio-sm" checked={mode==='practice'} name="exam-mode"
          onChange={()=>setMode('practice')}/><span><strong>刷题练习模式</strong><small>不限时，每题都能即时核对。</small></span></label>
      </div>
      {mode==='exam' && <label className="exam-filter">考试时长<select className="select exam-input" name="minutes" value={minutes}
        onChange={event=>setMinutes(Number(event.target.value))}>
        {[60,90,120,0].map(value=><option key={value} value={value}>{value?value+' 分钟':'不限时'}</option>)}
      </select></label>}
      <label className="exam-check"><input type="checkbox" className="checkbox checkbox-sm" name="shuffle" checked={shuffle}
        onChange={event=>setShuffle(event.target.checked)}/>打乱单选题选项顺序</label>
    </fieldset>
    {error && <p role="alert" className="note">{error}</p>}
    <button type="submit" className="button primary" disabled={busy}>{busy?'正在建立草稿…':'开始答题'}</button>
  </form>;
}

type LocalAnswers = Pick<Draft,'answers'|'stars'>;
function readBackup(key:string,account:string) {try {return sessionState.getItem(key,account);} catch {return null;}}
function backup(key:string,account:string,value?:string) {
  try {if(value===undefined)sessionState.removeItem(key,account);else sessionState.setItem(key,value,account);} catch { /* Server autosave remains available. */ }
}
const formatTime = (seconds:number) => [Math.floor(seconds/60),seconds%60].map(unit=>String(unit).padStart(2,'0')).join(':');

function ActiveExam({work,api,base,onDiscard}:{work:Work;api:string;base:string;onDiscard:()=>void}) {
  const {draft,questions} = work;
  const key = 'school-exam:'+api;
  const account = useRef(currentAccess().user?.userId??'').current;
  const [values,setValues] = useState<LocalAnswers>(()=>restoreDraft(draft,readBackup(key,account)));
  const latest = useRef(values);
  const revision = useRef(draft.revision);
  const saved = useRef<LocalAnswers>({answers:draft.answers,stars:draft.stars});
  const inFlight = useRef<Promise<void>|null>(null);
  const dirty = JSON.stringify(values.answers)!==JSON.stringify(saved.current.answers)
    || JSON.stringify(values.stars)!==JSON.stringify(saved.current.stars);
  const [saving,setSaving] = useState(false);
  const [savedOnce,setSavedOnce] = useState(false);
  const [saveError,setSaveError] = useState('');
  const [submitError,setSubmitError] = useState('');
  const [busy,setBusy] = useState(false);
  const [discarding,setDiscarding] = useState(false);
  const [discardConfirm,setDiscardConfirm] = useState(false);
  const [discardError,setDiscardError] = useState('');
  const [confirm,setConfirm] = useState(false);
  const [drawer,setDrawer] = useState(false);
  const [position,setPosition] = useState(0);
  const [questionSessions,setQuestionSessions] = useState<Record<string,QuestionSession>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const skew = useRef(work.serverNow-(work.receivedAt??Date.now()));
  const expiredOnEntry = useRef(remainingTime(draft.startedAt,draft.minutes,Date.now()+skew.current)===0).current;
  const [now,setNow] = useState(()=>Date.now()+skew.current);
  const timer = remainingTime(draft.startedAt,draft.minutes,now);
  const ended = timer===0;
  useMysqlActivity(ended ? null : api.split('/exams/')[0]+'/environment/activity', draft.mode==='exam' && draft.minutes>0);
  const auto = useRef(false);
  const submitting = useRef(false);
  const navigate = useNavigate();
  const question = questions[position];
  const isSql = question.kind==='sql';
  const questionSession = questionSessions[question.id] ?? {};

  useEffect(()=>{
    if (!draft.minutes) return;
    const clock = window.setInterval(()=>setNow(Date.now()+skew.current),500);
    return ()=>window.clearInterval(clock);
  },[draft.minutes]);

  const save = useCallback(() => {
    if (inFlight.current || submitting.current) return;
    setSaving(true);
    const job = (async()=>{
      try {
        while (!submitting.current && remainingTime(draft.startedAt,draft.minutes,Date.now()+skew.current)!==0) {
          const snapshot=latest.current;
          if (JSON.stringify(snapshot)===JSON.stringify(saved.current)) break;
          const next=await schoolRequest<Draft>(api+'/save',{...snapshot,revision:revision.current});
          revision.current=next.revision;
          saved.current=snapshot;
          backup(key,account,JSON.stringify({...latest.current,revision:next.revision}));
          setSavedOnce(true);
          setSaveError('');
        }
      } catch (error) {setSaveError(errorMessage(error));}
    })().finally(()=>{inFlight.current=null;setSaving(false);});
    inFlight.current=job;
  },[account,api,draft.minutes,draft.startedAt,key]);

  useEffect(()=>{
    if (ended || !dirty || busy || discarding || saveError || saving) return;
    const timeout = window.setTimeout(save,600);
    return ()=>window.clearTimeout(timeout);
  },[values,dirty,busy,discarding,ended,save,saveError,saving]);

  useEffect(()=>{
    if (!dirty) return;
    function warn(event:BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue='';
    }
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);

  function update(next:LocalAnswers) {
    latest.current=next;
    setValues(next);
    backup(key,account,JSON.stringify({...next,revision:revision.current}));
  }

  const submit = useCallback(async()=>{
    if (submitting.current) return;
    submitting.current=true;
    setBusy(true);setConfirm(false);setSubmitError('');
    try {
      await inFlight.current;
      const report = await schoolRequest<Attempt>(api+'/submit',{...latest.current,revision:revision.current});
      backup(key,account);
      navigate(base+'/'+report.summary.paperId+'/attempts/'+report.summary.id,{replace:true});
    } catch (error) {setSubmitError(errorMessage(error));}
    finally {submitting.current=false;setBusy(false);}
  },[account,api,base,key,navigate]);

  useEffect(()=>{
    if (ended && !expiredOnEntry && !auto.current) {auto.current=true;void submit();}
  },[ended,expiredOnEntry,submit]);

  async function discard() {
    if (submitting.current) return;
    submitting.current=true;
    setDiscarding(true);setConfirm(false);
    try {
      await inFlight.current;
      await discardExamDraft(api,revision.current);
      backup(key,account);
      onDiscard();
    } finally {submitting.current=false;setDiscarding(false);}
  }

  async function confirmDiscard() {
    setDiscardError('');
    try {
      await discard();
      setDiscardConfirm(false);
    } catch (error) {
      setDiscardError(errorMessage(error));
    }
  }

  function go(index:number) {
    setPosition(index);setDrawer(false);
    window.requestAnimationFrame(()=>heading.current?.focus({preventScroll:true}));
  }

  function progress(q:Question) {
    const answer = values.answers[q.id];
    const review = questionSessions[q.id]?.checked;
    const status = review?.key===JSON.stringify(answer??[]) && review ? stateNames[review.item.status] : answerState(q,answer);
    return (status??'未答')+(values.stars.includes(q.id)?' · 存疑':'');
  }

  const unfinished = questions.filter(q=>answerState(q,values.answers[q.id])!=='已答').length;
  const nextOpen = screenPosition(questions,position,q=>answerState(q,values.answers[q.id])!=='已答'||values.stars.includes(q.id));
  const number = (q:Question,i:number) => <button key={q.id} type="button" className="btn exam-number"
          data-state={progress(q).split(' · ')[0]} aria-current={position===i?'step':undefined}
          aria-label={'第 '+(i+1)+' 题，'+progress(q)} title={'第 '+(i+1)+' 题，'+progress(q)} onClick={()=>go(i)}>{i+1}
          {values.stars.includes(q.id) && <span className="exam-number-mark" aria-hidden="true"/>}</button>;
  const card = <div className="exam-question-list">
    <ul className="exam-card-legend" aria-label="答题状态图例">
      {['未答','已答','存疑','正确','部分得分','错误'].map(state=>
        <li key={state}><span aria-hidden="true" data-state={state}/>{state}</li>)}
    </ul>
    {kinds.map(kind=>{
      const group=questions.map((q,i)=>({q,i})).filter(({q})=>q.kind===kind);
      return group.length>0 && <section key={kind}><h3>{kindNames[kind]}</h3><div className="exam-numbers">
        {group.map(({q,i})=>number(q,i))}
      </div></section>;
    })}
    <button type="button" className="button secondary" disabled={nextOpen<0} onClick={()=>go(nextOpen)}>下一道未答或存疑题</button>
    {!ended && <div className="exam-card-secondary">
      <button type="button" className="button secondary exam-discard-button" disabled={busy||discarding}
        onClick={()=>{setDrawer(false);setDiscardError('');setDiscardConfirm(true);}}>
        放弃当前草稿并重新开始
      </button>
    </div>}
  </div>;

  const questionPrompt = <>
        <div className="exam-question-head">
          <p>{kindNames[question.kind]} · 第 {position+1}/{questions.length} 题 · {question.points} 分</p>
          <button type="button" className="button secondary" disabled={ended||busy||discarding} aria-pressed={values.stars.includes(question.id)} onClick={()=>
            update({...values,stars:values.stars.includes(question.id) ? values.stars.filter(id=>id!==question.id) : [...values.stars,question.id]})}>
            <Bookmark size={16} aria-hidden="true"/>{values.stars.includes(question.id)?'已标存疑':'标记存疑'}
          </button>
        </div>
        <h2 className="exam-question-prompt" tabIndex={-1} ref={heading}><QuestionText text={questionHeading(question.prompt)}/></h2>
  </>;

  return <div className="page exam-page exam-workspace" data-sql={isSql}>
    <header className="exam-workbar">
      <div className="exam-workbar-title">
        <Link className="exam-back" to={base} aria-label="返回备考大厅" title="返回备考大厅"><ArrowLeft size={18} aria-hidden="true"/></Link>
        <h1>{shortPaperTitle(draft.title)}</h1>
        <span className="exam-mode">{draft.mode==='exam'?'考场模拟模式':'刷题练习模式'}</span>
      </div>
      <div className="exam-actions exam-workbar-controls">
        <span role="status" className="exam-save-indicator" data-state={saveError?'error':dirty?'pending':'saved'}>
          {saveError?'保存失败':saving?'正在保存…':dirty?'待保存':savedOnce?'已自动保存':'自动保存'}
        </span>
        {timer!==null && <span className="exam-timer" aria-label="剩余时间"><Clock3 size={15} aria-hidden="true"/>{formatTime(timer)}</span>}
        {draft.mode==='practice' && <SyntaxGuide/>}
        {!ended && <button type="button" className="button primary" disabled={busy} onClick={()=>setConfirm(true)}>
          {busy?'正在阅卷…':'交卷'}</button>}
      </div>
    </header>
    {busy && <p className="exam-submit-progress" role="status">正在批改客观题与填空{questions.some(q=>q.kind==='sql' && values.answers[q.id]?.[0]?.trim())
      ? '，并运行 '+questions.filter(q=>q.kind==='sql' && values.answers[q.id]?.[0]?.trim()).length+' 道 SQL 编程大题':'题'}…</p>}
    {ended && <section className="card exam-panel" aria-label="计时结束">
      <h2>该次考场计时已结束</h2>
      <div className="exam-actions">
        <button type="button" className="button primary" disabled={busy||discarding} onClick={()=>void submit()}>提交已保存草稿阅卷</button>
        <DiscardDraftButton disabled={busy} onDiscard={discard}/>
      </div>
    </section>}
    {saveError && !ended && <p className="note" role="alert">{saveError} <button className="button secondary" onClick={save}>重试保存</button></p>}
    {submitError && <p className="note" role="alert">{submitError}</p>}
    <div className="exam-navigation">
      {isSql && <nav className="exam-compact-numbers" aria-label="快速跳题">{questions.map(number)}</nav>}
      <button type="button" className="button secondary exam-drawer-button" onClick={()=>setDrawer(true)}><ClipboardList size={16} aria-hidden="true"/>打开答题卡</button>
    </div>
    {drawer && <Modal open={drawer} onOpenChange={setDrawer} title="答题卡" description="按题型选择题号">{card}</Modal>}
    <div className="exam-work-grid">
      {!isSql && <aside className="card exam-panel exam-answer-card" aria-label="答题卡"><h2>答题卡</h2>{card}</aside>}
      <article className="card exam-panel exam-work-question">
        {!isSql && questionPrompt}
        <ExamQuestion key={question.id} question={question} endpoint={api+'/questions/'+question.id}
          answer={values.answers[question.id]??[]} onAnswer={answer=>update({...latest.current,answers:{...latest.current.answers,[question.id]:answer}})}
          prompt={isSql ? questionPrompt : undefined} onNavigate={direction=>{
            const index=position+direction;
            if (index>=0 && index<questions.length) go(index);
          }}
          disabled={ended||busy||discarding} allowCheck={draft.mode==='practice'} session={questionSession}
          onSessionChange={change=>setQuestionSessions(previous=>({...previous,[question.id]:change(previous[question.id]??{})}))}/>
        {!isSql && <footer className="exam-question-footer">
          <small className="exam-shortcuts">{question.kind!=='blank' && 'A–D / 1–4 选答案 · '}Enter {draft.mode==='practice'?'核对 / 下一题':'下一题'} · Alt + ← / → 切题</small>
          <button type="button" className="button secondary" disabled={position===0} onClick={()=>go(position-1)}><ChevronLeft size={17} aria-hidden="true"/>上一题</button>
          <button type="button" className="button secondary" disabled={position===questions.length-1} onClick={()=>go(position+1)}>下一题<ChevronRight size={17} aria-hidden="true"/></button>
        </footer>}
      </article>
    </div>
    {confirm && <Modal open={confirm} onOpenChange={setConfirm} title="确认交卷"
      description={unfinished?'有 '+unfinished+' 题未答完，未作答的部分计零分。':'所有题目均已作答。'}>
      <div className="exam-actions"><button type="button" className="button secondary" onClick={()=>setConfirm(false)}>继续检查</button>
        <button type="button" className="button primary" onClick={()=>void submit()}>提交并阅卷</button></div>
    </Modal>}
    {discardConfirm && <Modal open={discardConfirm} onOpenChange={next=>{if(!discarding)setDiscardConfirm(next);}} title="放弃当前草稿？"
      description="此草稿中的作答和标记将被清除。已经交卷的成绩仍可查阅。">
      <div className="exam-actions">
        <button type="button" className="button secondary" disabled={discarding} onClick={()=>setDiscardConfirm(false)}>保留草稿</button>
        <button type="button" className="button danger" disabled={discarding} onClick={()=>void confirmDiscard()}>{discarding?'正在放弃…':'确认放弃'}</button>
      </div>
      {discardError && <p role="alert" className="note">{discardError}</p>}
    </Modal>}
  </div>;
}
