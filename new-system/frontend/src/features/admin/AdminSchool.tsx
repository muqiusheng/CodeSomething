import {useState} from 'react';
import {Bookmark, ClipboardCheck, FilePenLine, FlaskConical, Gauge, Target} from 'lucide-react';
import {Link} from 'react-router-dom';
import {adminDownload, adminWrite, query, type Page} from '../../api/admin-api';
import {Modal} from '../../components/ui/modal';
import {AdminNotice, ConfirmAction, DataState, Pager, SearchFilter, TableFrame, Status, formatNumber, formatTime, message, useAdminData, useAdminFilters, type Confirmation} from './admin-controls';
import {AdminSummaryMetric} from './AdminSummaryMetric';
import {AdminNudgeDialog, type NudgeTarget} from './AdminNudgeDialog';
import {useAdminPreferences} from './admin-preferences';

export type Lab = {courseId:string; labId:string; title:string; required:number};
type Progress = Lab & {userId:string; username:string; completed:number; optionalCompleted:number; state:string};
type Question = {id:string; title:string; optional:boolean; completed:boolean; sql:string; status:string};
export type Paper = {courseId:string;paperId:string;title:string;attempts:number;average:number|null;passRate:number|null;drafts:number};
export type ExamAttempt = {id:string;user_id:string;username:string;paper_id:string;score:number;max_score:number;
  paperTitle?:string;passed:number;complete_grading:number;submitted_at:number;elapsed_seconds:number};
export type Mistake = {course_id:string;question_id:string;paper_id:string;title:string;learners:number;mistakes:number};
type ExportTask = {id:string; status:string; message:string; courseId:string;labId:string;userId:string;format:string;createdAt:string};

export function percent(value:number|null|undefined) {return value==null?'—':(value*100).toFixed(1)+'%';}
export function average(value:number|null|undefined) {return value==null?'—':value.toFixed(1);}

export function PaperTable({papers,link=false}: {papers:Paper[];link?:boolean}) {
  return <TableFrame name="试卷统计"><table className="csx-table admin-data-table">
    <thead><tr><th scope="col">试卷</th><th scope="col">交卷人次</th><th scope="col">进行中草稿</th><th scope="col">平均分</th><th scope="col">及格率</th></tr></thead>
    <tbody>{papers.map(paper=><tr key={paper.courseId+'/'+paper.paperId}>
      <th scope="row">{link?<Link to={'/admin/school'+query({tab:'exams',paperId:paper.paperId})}>{paper.title}</Link>:paper.title}</th>
      <td>{paper.attempts}</td><td>{paper.drafts ?? 0}</td><td>{average(paper.average)}</td><td>{percent(paper.passRate)}</td>
    </tr>)}</tbody>
  </table></TableFrame>;
}

export function MistakeTable({mistakes}: {mistakes:Mistake[]}) {
  return mistakes.length?<TableFrame name="高频错题"><table className="csx-table admin-data-table">
    <thead><tr><th scope="col">题目</th><th scope="col">错误人数</th><th scope="col">错误次数</th></tr></thead>
    <tbody>{mistakes.map(row=><tr key={row.course_id+'/'+row.question_id}>
      <th scope="row"><span className="admin-long-text" title={row.title}>{row.title||row.question_id}</span></th><td>{row.learners}</td><td>{row.mistakes}</td>
    </tr>)}</tbody>
  </table></TableFrame>:<p className="admin-empty">暂无错题记录。</p>;
}

export function AdminSchool() {
  const {params} = useAdminFilters({tab:''});
  const userId = params.get('userId') || '';
  const exam = params.get('tab') === 'exams';
  const [nudge, setNudge] = useState<NudgeTarget | null>(null);
  const [nudgeNotice, setNudgeNotice] = useState('');
  const summary = useAdminData<{schoolCompleted:number;examCount:number;examAverage:number|null;examPassRate:number|null;examDraftCount:number;bookmarkCount:number}>('/analytics/overview',30000);
  return <>
    <div className="admin-heading"><h1>课内实验与备考</h1></div>
    {summary.data && <dl className="admin-inline-summary" aria-label="课内学习统计">
      <AdminSummaryMetric label="实验通关题次" value={formatNumber(summary.data.schoolCompleted ?? 0)} icon={FlaskConical} tone="success"/>
      <AdminSummaryMetric label="模考交卷" value={formatNumber(summary.data.examCount ?? 0)} icon={ClipboardCheck}/>
      <AdminSummaryMetric label="模考均分" value={average(summary.data.examAverage)} icon={Gauge} tone="info"
        ratio={summary.data.examAverage == null ? null : summary.data.examAverage / 100} chart="bar"/>
      <AdminSummaryMetric label="模考及格率" value={percent(summary.data.examPassRate)} icon={Target} tone="success"
        ratio={summary.data.examPassRate} chart="ring"/>
      <AdminSummaryMetric label="进行中草稿" value={formatNumber(summary.data.examDraftCount ?? 0)} icon={FilePenLine} tone="warning"/>
      <AdminSummaryMetric label="收藏总数" value={formatNumber(summary.data.bookmarkCount ?? 0)} icon={Bookmark} tone="info"/>
    </dl>}
    <nav className="admin-tools admin-school-tabs" aria-label="课内管理分类">
      <Link className={'csx-btn '+(exam?'csx-btn-outline':'csx-btn-primary')} aria-current={!exam?'page':undefined} to={'/admin/school'+query({userId})}>实验进度</Link>
      <Link className={'csx-btn '+(exam?'csx-btn-primary':'csx-btn-outline')} aria-current={exam?'page':undefined} to={'/admin/school'+query({tab:'exams',userId})}>考试备考</Link>
    </nav>
    <AdminNotice text={nudgeNotice} onClose={()=>setNudgeNotice('')}/>
    {exam ? <ExamProgress onNudge={setNudge}/> : <LabProgress onNudge={setNudge}/>}
    {nudge && <AdminNudgeDialog target={nudge} onClose={()=>setNudge(null)} onSent={()=>{
      setNudgeNotice('已向「' + nudge.username + '」发送提醒。');
      setNudge(null);
    }}/>}
  </>;
}

function LabProgress({onNudge}: {onNudge: (target: NudgeTarget) => void}) {
  const {applied, filters, page, pageSize, setPage, setFilter, apply, reset} = useAdminFilters({userId:'',keyword:'',labId:'',status:''});
  const school=useAdminData<{labs:Lab[];progress:Page<Progress>}>('/school/labs'+query({...applied,page,size:pageSize}),15000);
  const [selected,setSelected] = useState<Progress|null>(null);
  const [confirmation,setConfirmation] = useState<Confirmation|null>(null);
  const [notice,setNotice] = useState('');
  const labs=school.data?.labs ?? [];
  const rows=school.data?.progress;
  const detailPath = selected ? '/school/labs/'+selected.courseId+'/'+selected.labId+'/learners/'+selected.userId : null;
  const detail=useAdminData<Question[]>(detailPath);
  return <>
    <section className="admin-card admin-list">
      <div className="admin-section-heading admin-list-heading"><h2>学员实验进度</h2><button type="button" className="csx-btn" onClick={school.refresh}>刷新进度</button></div>
      <form className="admin-form admin-filter-bar" onSubmit={event=>{event.preventDefault();apply();}}>
        <SearchFilter label="学员" placeholder="按用户名搜索…" value={filters.keyword} onChange={event=>setFilter('keyword',event.target.value)}/>
        <label>实验<select className="csx-select" value={filters.labId} onChange={event=>apply({labId:event.target.value})}>
          <option value="">全部实验</option>{labs.map(lab=><option key={lab.courseId+'/'+lab.labId} value={lab.labId}>{lab.title}</option>)}
        </select></label>
        <label>进度<select className="csx-select" value={filters.status} onChange={event=>apply({status:event.target.value})}>
          <option value="">全部状态</option><option value="unstarted">未开始</option><option value="in_progress">进行中</option><option value="completed">已通关</option>
        </select></label>
        <button type="submit" className="csx-btn csx-btn-outline">检索</button><button type="button" className="csx-btn csx-btn-ghost" onClick={reset}>重置筛选</button>
      </form>
      <AdminNotice text={notice} onClose={()=>setNotice('')}/>
      <DataState loading={!rows} error={school.error} retry={school.refresh}/>
      {rows && (rows.items.length ? <TableFrame name="学员实验进度"><table className="csx-table admin-data-table">
        <thead><tr><th scope="col">学员</th><th scope="col">实验</th><th scope="col">必做</th><th scope="col">选做</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
        <tbody>{rows.items.map(row=><tr key={[row.userId,row.courseId,row.labId].join('/')}>
          <th scope="row"><Link to={'/admin/users'+query({profile:row.userId,keyword:row.username})}>{row.username}</Link></th>
          <td>{row.title}</td><td>{row.completed} / {row.required}</td><td>{row.optionalCompleted}</td><td><Status value={row.state}/></td>
          <td><div className="admin-tools"><button type="button" className="csx-btn csx-btn-sm" onClick={()=>setSelected(row)}>查看逐题</button>
          <button type="button" className="csx-btn csx-btn-sm csx-btn-outline"
            onClick={()=>onNudge({id:row.userId, username:row.username})}>督促一下</button>
          <button type="button" className="csx-btn csx-btn-sm csx-btn-ghost" onClick={()=>setConfirmation({
            title:'重置隔离练习库',description:row.username+' 在本课程中对预置数据库所做的更改将被清除，已保存的实验草稿与运行记录保留。',
            action:async()=>{await adminWrite('/school/'+row.courseId+'/learners/'+row.userId+'/reset','POST');setNotice('练习库已恢复预置数据。');},
          })}>重置练习库</button></div></td>
        </tr>)}</tbody>
      </table></TableFrame>:<p className="admin-empty">暂无符合筛选条件的实验记录。</p>)}
      {rows && <Pager data={rows} setPage={setPage}/>}
    </section>
    <ReportExports labs={labs} initialLab={applied.labId} initialUser={applied.userId} key={applied.labId+'/'+applied.userId}/>
    {selected && <Modal open title={selected.username+' · '+selected.title} description="逐题完成状态与已保存的 SQL" className="admin-dialog admin-profile-modal" onOpenChange={open=>{if(!open)setSelected(null);}}>
      <DataState loading={!detail.data} error={detail.error} retry={detail.refresh}/>
      {detail.data?.map(q=><details key={q.id} className="admin-question-detail">
        <summary>{q.title} · {q.optional?'选做':'必做'} · <Status value={q.completed?'passed':q.status}/></summary>
        {q.sql?<pre>{q.sql}</pre>:<p>暂无已保存的 SQL。</p>}
      </details>)}
    </Modal>}
    {confirmation && <ConfirmAction confirmation={confirmation} onClose={()=>setConfirmation(null)}/>}
  </>;
}

function ExamProgress({onNudge}: {onNudge: (target: NudgeTarget) => void}) {
  const {applied,filters,page,pageSize,setPage,setFilter,apply,reset}=useAdminFilters({userId:'',keyword:'',paperId:''});
  const exams=useAdminData<{attempts:Page<ExamAttempt>;papers:Paper[];mistakes:Mistake[]}>('/school/exams'+query({...applied,page,size:pageSize}),15000);
  const data=exams.data;
  return <>
    <section className="admin-card admin-list">
      <div className="admin-section-heading admin-list-heading"><h2>模考交卷记录</h2><button type="button" className="csx-btn" onClick={exams.refresh}>刷新备考</button></div>
      <form className="admin-form admin-filter-bar" onSubmit={event=>{event.preventDefault();apply();}}>
        <SearchFilter label="学员" placeholder="按用户名搜索…" value={filters.keyword} onChange={event=>setFilter('keyword',event.target.value)}/>
        <label>试卷<select className="csx-select" value={filters.paperId} onChange={event=>apply({paperId:event.target.value})}>
          <option value="">全部试卷</option>{data?.papers.map(paper=><option key={paper.courseId+'/'+paper.paperId} value={paper.paperId}>{paper.title}</option>)}
        </select></label>
        <button type="submit" className="csx-btn csx-btn-outline">检索</button><button type="button" className="csx-btn csx-btn-ghost" onClick={reset}>重置筛选</button>
      </form>
      <DataState loading={!data} error={exams.error} retry={exams.refresh}/>
      {data && (data.attempts.items.length?<TableFrame name="模考交卷记录"><table className="csx-table admin-data-table">
        <thead><tr><th scope="col">学员</th><th scope="col">试卷</th><th scope="col">得分</th><th scope="col">结果</th><th scope="col">交卷时间</th><th scope="col">用时</th><th scope="col">操作</th></tr></thead>
        <tbody>{data.attempts.items.map(row=><tr key={row.user_id+'/'+row.id}>
          <th scope="row"><Link to={'/admin/users'+query({profile:row.user_id,keyword:row.username})}>{row.username}</Link></th>
          <td>{row.paperTitle||data.papers.find(p=>p.paperId===row.paper_id)?.title||row.paper_id}</td><td>{row.score} / {row.max_score}</td>
          <td>{!row.complete_grading?'待补判':row.passed?'及格':'未及格'}</td><td>{formatTime(new Date(row.submitted_at).toISOString())}</td>
          <td className="admin-duration">{Math.floor(row.elapsed_seconds/60)} 分 {row.elapsed_seconds%60} 秒</td>
          <td><button type="button" className="csx-btn csx-btn-sm csx-btn-outline"
            onClick={()=>onNudge({id:row.user_id, username:row.username})}>督促一下</button></td>
        </tr>)}</tbody>
      </table></TableFrame>:<p className="admin-empty">暂无匹配的模考交卷记录。</p>)}
      {data && <Pager data={data.attempts} setPage={setPage}/>}
    </section>
    {data && <><section className="admin-card"><h2>试卷统计</h2><PaperTable papers={data.papers} link/></section>
    <section className="admin-card"><h2>高频错题 Top 10</h2><MistakeTable mistakes={data.mistakes}/></section></>}
  </>;
}

function ReportExports({labs,initialLab,initialUser}: {labs:Lab[];initialLab:string;initialUser:string}) {
  const {exportFormat} = useAdminPreferences();
  const [format,setFormat] = useState('');
  const [labId,setLabId] = useState(initialLab);
  const [userId,setUserId] = useState(initialUser);
  const [learnerSearch,setLearnerSearch] = useState('');
  const [learnerKeyword,setLearnerKeyword] = useState('');
  const [failure,setFailure] = useState('');
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState('');
  const exports = useAdminData<ExportTask[]>('/school/reports',3000);
  const users=useAdminData<Page<{id:string;username:string}>>('/users'+query({role:'ROLE_STUDENT',size:100,keyword:learnerKeyword}));
  const selectedUser=useAdminData<{username:string}>(userId?'/users/'+encodeURIComponent(userId)+'/summary':null);
  const courseId = labs.find(lab=>lab.labId===labId)?.courseId || labs[0]?.courseId || '';
  async function perform(id?:string) {
    setBusy(id || 'new');setFailure('');setNotice('');
    try {
      if (id) {
        await adminDownload('/school/reports/'+id+'/download',courseId+'-reports.zip');
        setNotice('报告归档已下载。');
      } else {
        await adminWrite('/school/reports','POST',{courseId,labId,userId,format:format||exportFormat});
        setNotice('已提交导出任务。');
      }
      exports.refresh();
    } catch(error) {setFailure(message(error));}
    finally {setBusy('');}
  }
  return <section className="admin-card">
    <div className="admin-section-heading"><h2>实验报告导出</h2><button type="button" className="csx-btn" onClick={exports.refresh}>刷新任务</button></div>
    <form className="admin-form" onSubmit={event=>{event.preventDefault();setLearnerKeyword(learnerSearch.trim());}}>
      <SearchFilter label="查找导出学员" placeholder="输入用户名…" value={learnerSearch} onChange={event=>setLearnerSearch(event.target.value)}/>
      <button type="submit" className="csx-btn csx-btn-outline">查找学员</button>
    </form>
    <form className="admin-form" onSubmit={event=>{event.preventDefault();void perform();}}>
      <label>实验<select className="csx-select" value={labId} onChange={event=>setLabId(event.target.value)}>
        <option value="">全部实验</option>{labs.map(lab=><option key={lab.labId} value={lab.labId}>{lab.title}</option>)}
      </select></label>
      <label>学员<select className="csx-select" value={userId} onChange={event=>setUserId(event.target.value)}>
        <option value="">全部学员</option>{userId && !users.data?.items.some(row=>row.id===userId) && <option value={userId}>{selectedUser.data?.username||'当前学员'}</option>}
        {users.data?.items.map(row=><option key={row.id} value={row.id}>{row.username}</option>)}
      </select></label>
      <label>格式<select className="csx-select" value={format||exportFormat} onChange={event=>setFormat(event.target.value)}>
        <option value="word">Word (.doc)</option><option value="markdown">Markdown (.md)</option>
      </select></label>
      <button className="csx-btn csx-btn-primary" type="submit" disabled={!courseId||!!busy}>生成已通关报告</button>
    </form>
    <AdminNotice text={notice} onClose={()=>setNotice('')}/>
    {failure && <p role="alert">{failure}</p>}
    <DataState loading={!exports.data} error={exports.error} retry={exports.refresh}/>
    {exports.data && (exports.data.length?<TableFrame name="近期导出任务"><table className="csx-table admin-data-table">
      <thead><tr><th scope="col">生成时间</th><th scope="col">范围</th><th scope="col">格式</th><th scope="col">状态</th><th scope="col">下载</th></tr></thead>
      <tbody>{exports.data.map(task=><tr key={task.id}>
        <td>{formatTime(task.createdAt)}</td><td>{labs.find(l=>l.labId===task.labId)?.title||'全部实验'} · {users.data?.items.find(u=>u.id===task.userId)?.username||(task.userId?'指定学员':'全部学员')}</td>
        <td>{task.format==='word'?'Word':'Markdown'}</td><td><Status value={task.status}/>{task.message && <small>{task.message}</small>}</td>
        <td>{task.status==='ready' && <button type="button" className="csx-btn csx-btn-sm" disabled={!!busy} onClick={()=>void perform(task.id)}>下载</button>}</td>
      </tr>)}</tbody>
    </table></TableFrame>:<p className="admin-empty">暂无导出任务。</p>)}
  </section>;
}
