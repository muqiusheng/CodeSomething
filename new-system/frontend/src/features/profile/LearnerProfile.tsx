import {PageSkeleton} from '../../components/shared/LoadingState';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '../../components/ui/tabs';
import {useScopedRead} from '../../hooks/useScopedRead';
import {learningRequest} from '../../api/learning-api';
import {SchoolProgressList,SchoolReviewRadar,StudyProgress,countSchoolProgress,useSchoolCourses} from '../school/SchoolLearningProgress';
import {LearningStats} from './LearningStats';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight,RotateCcw,CheckCircle2} from 'lucide-react';
import {Modal} from '../../components/ui/modal';
import {courses,stateLabels,learnerRequest,useLearnerResource,type LearnerProfile as ProfileData,type Knowledge,type Adjustment} from '../../api/learner-api';
import {capabilityGroups,summarizeCapability,type Capability} from './capability-map.mjs';
import '../../styles/learner.css';
import '../../styles/capability-map.css';
const labels:Record<string,string>={...stateLabels,unverified:'待验证','in-progress':'正在形成'};
type WorkSummary = {id:string;theme:string;state:string;route:string};
const readWorks = () => learningRequest<WorkSummary[]>('/portfolio');

export function LearnerProfile() {
 const school = useSchoolCourses();
 const outside = useLearnerResource<ProfileData>('/profile');
 const works = useScopedRead('/portfolio',readWorks,{persist:true});
 const classCourses = school.data?.flatMap(group=>group.courses) ?? [];
 const progress = countSchoolProgress(classCourses);
 const projects = outside.data?.summary;
 const finishedWorks = works.data?.filter(work=>work.state==='evidence-ready').length;
 const total = school.data || projects ? progress.passed+(projects?.completed ?? 0) : null;

 return <div className="page study-profile learner-page">
  <header className="study-heading">
   <div><h1>个人中心</h1><p>查看实验、复习与选学项目的学习记录。</p></div>
   <Link className="btn button secondary" to="/settings">设置</Link>
  </header>
  <Tabs defaultValue="overview">
   <TabsList className="exam-route-tabs study-profile-tabs" aria-label="个人中心学习维度">
    <TabsTrigger value="overview">总览</TabsTrigger>
    <TabsTrigger value="school">课内必学</TabsTrigger>
    <TabsTrigger value="outside">课外拓展</TabsTrigger>
   </TabsList>
   <TabsContent value="overview" className="study-section">
    <section className="card study-panel" aria-label="累计学习汇总">
     <h2>累计学习汇总</h2>
     <dl className="study-metrics">
      <div><dt>已完成题目与项目关卡</dt><dd>{total ?? '—'}</dd></div>
      <div><dt>已通关课内实验</dt><dd>{school.data ? progress.completedLabs : '—'}</dd></div>
      <div><dt>已通过验证的项目关卡</dt><dd>{projects?.completed ?? '—'}</dd></div>
      <div><dt>工程验证齐备的作品</dt><dd>{finishedWorks ?? '—'}</dd></div>
     </dl>
     <p>{school.data && projects ? '完成数汇总课内必做题与课外已验证关卡。'
      : total === null ? '学习记录暂未载入。' : school.data ? '暂按已读取的课内必做题统计。' : '暂按已读取的课外验证关卡统计。'}</p>
     {works.error && <p role="alert">作品记录暂未加载。<button className="text-button" onClick={works.reload}>重试</button></p>}
    </section>
    <div className="study-summary-columns">
     <section className="card study-panel study-summary-primary">
      <h2>课内必学</h2>
      {school.error && <p role="alert">{school.error} <button className="text-button" onClick={school.reload}>重试</button></p>}
      {school.data ? <>
       <p><strong>{progress.completedLabs}/{progress.totalLabs}</strong> 个实验通关 · 必做题 {progress.passed}/{progress.required} 已通过</p>
       {progress.required > 0 && <StudyProgress value={progress.passed} total={progress.required} label="课内必做题进度"/>}
      </> : !school.error && <p role="status">正在读取课内进度…</p>}
      <Link className="inline-action" to="/school">查看课内实验<ArrowRight size={15} aria-hidden="true"/></Link>
     </section>
     <section className="card study-panel">
      <h2>课外拓展 <span className="study-optional">可选</span></h2>
      {outside.error && <p role="alert">{outside.error} <button className="text-button" onClick={outside.reload}>重试</button></p>}
      {projects ? <><p>已验证 {projects.completed}/{projects.total} 个项目关卡</p>
       {projects.total > 0 && <StudyProgress value={projects.completed} total={projects.total} label="课外项目关卡进度"/>}
      </> : !outside.error && <p role="status">正在读取拓展进度…</p>}
      <Link className="inline-action" to="/projects">浏览课外项目<ArrowRight size={15} aria-hidden="true"/></Link>
     </section>
    </div>
   </TabsContent>
   <TabsContent value="school" className="study-section">
    <h2>课内实验进度</h2>
    {school.error && <p role="alert">{school.error} <button className="text-button" onClick={school.reload}>重试</button></p>}
    {school.data ? <><SchoolProgressList courses={classCourses}/><SchoolReviewRadar courses={classCourses} detail/></>
      : !school.error && <PageSkeleton variant="cards" label="正在整理课内进度…"/>}
   </TabsContent>
   <TabsContent value="outside" className="study-section">
    <section className="card study-panel">
     <header className="section-heading"><h2>独立作品</h2><Link className="inline-action" to="/portfolio">作品档案<ArrowRight size={15} aria-hidden="true"/></Link></header>
     {works.error ? <p role="alert">{works.error} <button className="text-button" onClick={works.reload}>重试</button></p>
      : !works.data ? <p role="status">正在读取作品…</p>
      : !works.data.length ? <p>开始独立作品后，设计和工程验证记录会在这里显示。</p>
      : <ul className="study-list">{works.data.map(work=><li key={work.id}><Link to={work.route}><strong>{work.theme}</strong>
       <span>{work.state==='evidence-ready'?'工程验证齐备':work.state==='draft'?'设计草稿':'正在实践'}</span><ArrowRight size={15} aria-hidden="true"/></Link></li>)}</ul>}
    </section>
    <ProjectLearningProfile {...outside}/>
   </TabsContent>
  </Tabs>
 </div>;
}

function ProjectLearningProfile({data,error,reload}: Pick<ReturnType<typeof useLearnerResource<ProfileData>>,'data'|'error'|'reload'>){
 const [focus,setFocus]=useState<Capability|null>(null),[selected,setSelected]=useState<Knowledge|null>(null),[kind,setKind]=useState('dispute'),[reason,setReason]=useState(''),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saveError,setSaveError]=useState('');
 async function save(){if(!selected)return;setBusy(true);setSaveError('');try{await learnerRequest('/corrections',{stageId:selected.skill.stageId,kind,reason,idempotencyKey:key});setSelected(null);setMessage('画像已更新。')}catch(e){setSaveError((e as Error).message)}finally{setBusy(false)}}
 const focused=focus&&data?summarizeCapability(focus,data.knowledge):null;
 const next=data?.knowledge.find(k=>['needs-review','disputed'].includes(k.state))||data?.knowledge.find(k=>k.state==='unverified');
 const recent=data?[...new Map(data.knowledge.flatMap(k=>k.evidence.filter(e=>e.type==='completion'||e.type==='review').map(e=>[e.type+e.id,{...e,title:k.skill.title}] as const))).values()].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,3):[];
 return <div className="capability-page">
 <div className="page-title"><h2>项目进度与能力记录</h2><Link className="button secondary" to="/reviews?view=projects"><RotateCcw size={16} aria-hidden="true"/>复习项目知识</Link></div>
 {error&&<p role="alert">{error}<button className="button secondary" onClick={reload}>重新读取</button></p>}{!data&&!error&&<PageSkeleton variant="profile" label="正在整理你的能力图…"/>}{message&&<p role="status">{message}</p>}
 {data&&<>
 <section className="card study-panel"><h3>课外项目关卡</h3>
  <ul className="study-list">{data.summary.courses.map(course=><li key={course.courseId}>
   <Link to={course.nextRoute || '/projects'}><strong>{courses[course.courseId] || course.courseId}</strong>
    <span>{course.completed}/{course.total} 已验证</span><ArrowRight size={15} aria-hidden="true"/></Link></li>)}</ul>
 </section>
 <LearningStats profile={data}/><section className="capability-panel" aria-labelledby="capability-title"><div className="section-heading"><h2 id="capability-title">我的能力图</h2><span className="text-pill">点击技能查看详情</span></div><p className="capability-intro">{data.summary.completed?'能力来自代码检查、理解验证与后续复习。':'完成第一次编程练习后，对应技能会在这里亮起。'}</p>
 <div className="capability-map" role="group" aria-label="按知识领域展示的能力地图">{capabilityGroups.map(group=><section className="capability-lane" id={'cap-domain-'+group.id} key={group.id} aria-label={group.title}><div className="capability-domain"><span aria-hidden="true"/><div><h3>{group.title}</h3><p>{group.description}</p></div></div><div className="capability-nodes">{group.skills.map(skill=>{const summary=summarizeCapability(skill,data.knowledge);return <button key={skill.title} className={'capability-node '+summary.state} aria-pressed={focus?.title===skill.title} aria-label={skill.title+'，'+labels[summary.state]} onClick={()=>setFocus(focus?.title===skill.title?null:skill)}><span className={'capability-dot '+summary.state} aria-hidden="true"/><span><strong>{skill.title}</strong><small>{labels[summary.state]}</small></span>{summary.state==='verified'&&<CheckCircle2 size={14} aria-hidden="true"/>}</button>})}</div></section>)}</div>
 <div className="capability-legend">{['unverified','in-progress','verified','assisted','needs-review','disputed'].map(state=><span key={state}><i className={'capability-dot '+state} aria-hidden="true"/>{labels[state]}</span>)}</div>
 {focus&&focused&&<section className="capability-detail" aria-label={focus.title+'详情'}><div className="section-heading"><h3>{focus.title}</h3><button className="text-button" onClick={()=>setFocus(null)}>收起详情</button></div><p>{labels[focused.state]} · 以下练习共同验证这项能力。</p>{focused.sources.map(k=><article key={k.skill.stageId}><h4>{k.skill.title}</h4><span className="text-pill">{labels[k.state]}</span><p>{k.reason}</p><p>{k.retention}</p><details><summary>查看依据与纠正记录</summary><p>{k.independence}</p><p>规则 {data.ruleVersion} · 代码/业务问题 {k.businessErrors}次 · 环境问题 {k.environmentErrors}次</p>{k.evidence.length?<ol>{k.evidence.map(e=><li key={e.type+e.id}><strong>{({completion:'编程完成记录',business:'代码检查',environment:'运行环境',help:'辅导帮助',review:'复习'} as Record<string,string>)[e.type]||e.type}</strong> · {new Date(e.at).toLocaleString('zh-CN')}<p>{e.detail}</p></li>)}</ol>:<p>还没有验证记录。</p>}{k.corrections.map(c=><p key={c.id}>你的说明：{c.reason}</p>)}</details><div className="button-row"><Link className="button secondary" to={k.skill.route+'?tab='+encodeURIComponent('任务')}>进入对应练习<ArrowRight size={14} aria-hidden="true"/></Link><button className="text-button" onClick={()=>{setSelected(k);setKind('dispute');setReason('');setKey(crypto.randomUUID());setSaveError('')}}>纠正结论</button></div></article>)}</section>}
 </section>
 <section className="profile-next"><div><h2>{next&&['needs-review','disputed'].includes(next.state)?'下一次，巩固这一项':'下一次，点亮这一项'}</h2><p>{next?next.skill.title:'已有课程验证完成，可以进入独立作品实践。'}</p></div><Link className="button secondary" to={next?(['needs-review','disputed'].includes(next.state)?'/reviews?view=projects&stage='+next.skill.stageId:next.skill.route+'?tab='+encodeURIComponent('任务')):'/portfolio'}>{next&&['needs-review','disputed'].includes(next.state)?'开始巩固':'进入练习'}<ArrowRight size={15} aria-hidden="true"/></Link></section>
 {recent.length>0&&<section className="profile-recent"><h2>最近的学习变化</h2><ul>{recent.map(e=><li key={e.id}><time>{new Date(e.at).toLocaleDateString('zh-CN')}</time>{e.title} · {e.type==='completion'?'完成课程验证':e.detail}</li>)}</ul></section>}
 <details className="profile-method"><summary>画像如何形成</summary><p>技能按对应练习的真实结果汇总；多关共同验证的技能，需要全部相关关卡通过。借助帮助与需要巩固分别标记，待验证表示尚未形成结论。</p><p>{data.summary.independence}。环境故障不会记为能力不足。</p><p>规则 {data.ruleVersion} · 快照 <code className="learner-snapshot">{data.snapshotId}</code></p></details>
 </>}
 <Modal open={selected!==null} onOpenChange={open=>{if(!open&&!busy)setSelected(null)}} title="纠正画像结论" description={selected?.skill.title||''}><form className="learner-form" onSubmit={e=>{e.preventDefault();void save()}}><label>纠正类型<select disabled={busy} value={kind} onChange={e=>{setKind(e.target.value);setKey(crypto.randomUUID())}}><option value="dispute">结论与实际情况不符</option><option value="assisted">这次借助了答案或他人</option><option value="resolved">撤回此前纠正</option></select></label><label>说明<textarea required maxLength={500} rows={4} disabled={busy} value={reason} onChange={e=>{setReason(e.target.value);setKey(crypto.randomUUID())}}/></label>{saveError&&<p role="alert">{saveError}</p>}<div className="button-row"><button className="button primary" disabled={busy||!reason.trim()}>{busy?'正在保存…':'保存纠正'}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setSelected(null)}>取消</button></div></form></Modal></div>;
}

export function LearningAdjustments({plan,onChanged}:{plan:ProfileData['plan'];onChanged:()=>void}){
 const {data:history,error,reload}=useLearnerResource<Adjustment[]>('/adjustments');const [proposal,setProposal]=useState<Adjustment|null>(null);const [course,setCourse]=useState('sql-foundations');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [failure,setFailure]=useState('');
 async function propose(kind:string){setBusy(true);setFailure('');setMessage('');try{setProposal(await learnerRequest<Adjustment>('/adjustments',{kind,courseId:kind==='focus-course'?course:''}))}catch(e){setFailure((e as Error).message)}finally{setBusy(false)}}
 async function decide(id:string,action:string){setBusy(true);setFailure('');try{const result=await learnerRequest<Adjustment>('/adjustments/'+id+'/decision',{action});if(proposal?.id===id)setProposal(result);setMessage(({accept:'调整已生效',reject:'已拒绝，计划保持原样',undo:'已撤销，恢复此前复习安排'} as Record<string,string>)[action]);onChanged()}catch(e){setFailure((e as Error).message)}finally{setBusy(false)}}
 return <section className="profile-panel learner-adjustments"><h2>学习安排</h2><p>每天额外复习 <strong>{plan.review_minutes} 分钟</strong>{plan.focus_course?' · 优先 '+courses[plan.focus_course]:''}。每日学习时长可在设置中调整。</p><div className="button-row"><button className="button secondary" disabled={busy} onClick={()=>void propose('daily-review')}>预览每日一题</button><label className="learner-filter">集中课程<select value={course} onChange={e=>setCourse(e.target.value)}>{Object.entries(courses).map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></label><button className="button secondary" disabled={busy} onClick={()=>void propose('focus-course')}>预览集中巩固</button>{plan.review_minutes>0&&<button className="text-button" disabled={busy} onClick={()=>void propose('pause-review')}>停止额外复习</button>}</div>{proposal&&<div className="adjustment-preview"><h3>调整差异</h3><dl><div><dt>额外复习</dt><dd>{proposal.beforeMinutes} → {proposal.afterMinutes} 分钟/天</dd></div><div><dt>优先课程</dt><dd>{courses[proposal.beforeFocus]||'全部'} → {courses[proposal.afterFocus]||'全部'}</dd></div></dl><p>{proposal.reason}</p><p>{proposal.impact}</p>{proposal.status==='proposed'?<div className="button-row"><button className="button primary" disabled={busy} onClick={()=>void decide(proposal.id,'accept')}>接受调整</button><button className="button secondary" disabled={busy} onClick={()=>void decide(proposal.id,'reject')}>保持原计划</button></div>:<p>{({accepted:'已接受',rejected:'已拒绝',undone:'已撤销'} as Record<string,string>)[proposal.status]}</p>}</div>}{(failure||error)&&<p role="alert">{failure||error} {error&&<button className="text-button" onClick={reload}>重试</button>}</p>}{message&&<p role="status">{message}</p>}{history&&history.length>0&&<details><summary>调整记录（{history.length}项）</summary><ul className="adjustment-history">{history.map(a=><li key={a.id}><span>{a.kind==='pause-review'?'停止额外复习':a.kind==='daily-review'?'每日一题':'集中巩固'} · {a.beforeMinutes} → {a.afterMinutes}分钟 · {({proposed:'待决定',accepted:'已接受',rejected:'已拒绝',undone:'已撤销'} as Record<string,string>)[a.status]}</span>{a.status==='accepted'&&<button className="text-button" disabled={busy} onClick={()=>void decide(a.id,'undo')}>撤销这项调整</button>}{a.status==='proposed'&&<button className="text-button" disabled={busy} onClick={()=>setProposal(a)}>查看差异</button>}</li>)}</ul></details>}</section>;
}
