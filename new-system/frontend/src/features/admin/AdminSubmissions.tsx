import {useMemo, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {CircleCheck, ClipboardList, Hourglass, RefreshCw, Trash2} from 'lucide-react';
import {adminWrite, query, type Page} from '../../api/admin-api';
import {CodeEditor} from '../../components/code/CodeEditor';
import {Modal} from '../../components/ui/modal';
import {chapterTitles} from '../../api/learning-api';
import {AdminSummaryMetric} from './AdminSummaryMetric';
import {AdminNotice, ConfirmAction, DataState, DateFilter, Pager, RowActions, SearchFilter, Status, TableFrame, formatNumber, formatTime, label, message, useAdminData, useAdminFilters, type Confirmation} from './admin-controls';

type Job = {id: string; submission_id: string; status: string; created_at: string; course_id: string; stage_id: string; user_id: string; username: string; user_status: string; pruned: boolean};
type Report = {assertions?: {passed: boolean; name: string; expected: unknown; actual: unknown}[]; log?: string; message?: string};
type Detail = Job & {digest: string; source: string; report?: Report};
type SnapshotFile = {path: string; content: string};
const statuses = ['pending','queued','running','cancelling','awaiting_runner','passed','executed','compile_error','business_error','timed_out','timeout','sql_error','output_limit','environment_error','cancelled','interrupted','cleanup_failed'];
const cancellable = new Set(['queued','awaiting_runner','running']);
const retryable = new Set(['compile_error','business_error','timed_out','timeout','sql_error','output_limit','environment_error','cancelled','interrupted']);
const courses: Record<string,string> = {
  'http-json-basics':'HTTP / JSON','sql-foundations':'SQL','boot-foundations':'Spring Boot',
  'task-manager':'项目 A','collaboration':'项目 B',portfolio:'作品',
};

export function AdminSubmissions() {
  const {params, applied, filters, page, pageSize, setPage, setFilter, apply, reset} = useAdminFilters({
    status:'',courseId:'',keyword:'',from:'',to:'',userId:'',
  });
  const userId=applied.userId;
  const [,setParams]=useSearchParams();
  const snapshot=params.get('snapshot');
  const owner=params.get('snapshotOwner') || userId;
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [notice, setNotice] = useState('');
  const [pruning, setPruning] = useState(false);
  const settings = useAdminData<{retentionHours:number}>('/jobs/snapshot-retention');
  const retention = settings.data?.retentionHours ?? 24;
  const jobs = useAdminData<Page<Job>>('/jobs' + query({page,size:pageSize,...applied}),4000);
  const summary = useAdminData<{submissions:number;passRate:number|null;pending:number;errors:Record<string,number>}>('/analytics/overview',30000);
  const user=useAdminData<{username:string}>(userId?'/users/'+encodeURIComponent(userId)+'/summary':null);

  function select(job?:Job) {
    setParams(previous=>{
      const next=new URLSearchParams(previous);
      if (job) {next.set('snapshot',job.id);next.set('snapshotOwner',job.user_id);}
      else {next.delete('snapshot');next.delete('snapshotOwner');}
      return next;
    },{replace:true});
  }

  function act(job: Job, action: 'retry' | 'kill') {
    setNotice('');
    const retry = action === 'retry';
    if (retry && job.pruned) return;
    setConfirmation({
      title: retry ? '重跑作业' : '终止评测作业',
      description: retry ? '使用这份提交快照创建新作业。原作业与报告会保留。' : '作业将停止，已保存的代码快照仍可查看。',
      action: async () => {
        const result = await adminWrite<{id?: string; created?: boolean}>('/jobs/' + job.id + '/' + action + query({userId:job.user_id}),'POST');
        setNotice(retry ? (result.created ? '已提交重跑作业 ' : '该快照已有重跑作业 ') + result.id : '已发送终止请求。');
        jobs.refresh();
        if (snapshot) select();
      },
    });
  }

  const errorEntries = summary.data ? Object.entries(summary.data.errors).sort((a,b)=>b[1]-a[1]) : [];

  return <>
    <div className="admin-heading"><h1>评测作业</h1><div className="admin-tools"><button className="csx-btn csx-btn-outline" type="button" onClick={jobs.refresh}><RefreshCw size={16} aria-hidden="true"/>刷新队列</button>
      <button className="csx-btn csx-btn-outline" type="button" onClick={()=>setPruning(true)}><Trash2 size={16} aria-hidden="true"/>清理快照</button>
    </div></div>
    {summary.data && <div className="admin-summary-row">
      <dl className="admin-inline-summary" aria-label="课外评测统计">
        <AdminSummaryMetric label="课外提交" value={formatNumber(summary.data.submissions)} icon={ClipboardList}/>
        <AdminSummaryMetric label="判题通过率" value={summary.data.passRate == null ? '—' : (summary.data.passRate * 100).toFixed(1) + '%'}
          icon={CircleCheck} tone="success" ratio={summary.data.passRate} chart="ring"/>
        <AdminSummaryMetric label="待完成作业" value={formatNumber(summary.data.pending)} icon={Hourglass} tone="warning"/>
      </dl>
      {errorEntries.length > 0 && <div className="admin-error-chips" aria-label="失败原因筛选">
        <span>失败分布</span>
        {errorEntries.map(([reason,count], index) => <button key={reason} type="button" className="admin-filter-chip"
          aria-pressed={applied.status===reason} onClick={()=>apply({status:applied.status===reason?'':reason})}>
          <span className="admin-error-dot" data-tone={index % 3} aria-hidden="true"/>{label(reason)} <strong>{count}</strong>
        </button>)}
      </div>}
    </div>}
    <p className="admin-snapshot-retention">{retention === 24 ? "快照默认保留 24 小时，超期自动清理" : `快照保留 ${retention} 小时，超期自动清理`}</p>
    <section className="admin-card admin-list">
      <form className="admin-form admin-filter-bar" aria-label="筛选评测作业" onSubmit={event => {event.preventDefault();apply();}}>
        <SearchFilter label="用户名或作业编号" placeholder="用户名、作业或提交编号…" name="keyword" maxLength={254} value={filters.keyword} onChange={event => setFilter('keyword',event.target.value)}/>
        <label>课程<select className="csx-select" name="courseId" value={filters.courseId} onChange={event => apply({courseId:event.target.value})}>
          <option value="">全部课程</option>{Object.entries(courses).map(([id,title]) => <option key={id} value={id}>{title}</option>)}
        </select></label>
        <label>作业状态<select className="csx-select" name="status" value={filters.status} onChange={event => apply({status:event.target.value})}>
          <option value="">全部状态</option>{statuses.map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select></label>
        <DateFilter label="开始日期" name="from" value={filters.from} onChange={event => setFilter('from',event.target.value)}/>
        <DateFilter label="结束日期（含当日）" name="to" value={filters.to} onChange={event => setFilter('to',event.target.value)}/>
        <button className="csx-btn csx-btn-outline" type="submit">检索</button>
        <button className="csx-btn csx-btn-ghost" type="button" onClick={reset}>重置筛选</button>
        {userId && <button className="csx-btn csx-btn-outline" type="button" onClick={() => apply({userId:''})}>学员：{user.data?.username ?? jobs.data?.items[0]?.username ?? '指定账号'} ×</button>}
      </form>
      <AdminNotice text={notice} onClose={()=>setNotice('')}/>
      <DataState loading={!jobs.data} error={jobs.error} retry={jobs.refresh}/>
      {jobs.data && (jobs.data.items.length ? <TableFrame name="评测作业列表"><table className="csx-table admin-data-table">
        <thead><tr><th scope="col">账号与作业</th><th scope="col">课程关卡</th><th scope="col">状态</th><th scope="col">排队时间</th><th scope="col">操作</th></tr></thead>
        <tbody>{jobs.data.items.map(job => <tr key={job.user_id+job.id}>
          <th scope="row">{job.username}<small><code>{job.id}</code></small></th><td>{chapterTitles[job.stage_id] || job.stage_id}<small>{courses[job.course_id] || job.course_id}</small></td>
          <td><Status value={job.status}/>{job.pruned && <small className="admin-pruned-label">快照已清理</small>}</td><td className="admin-table-number">{formatTime(job.created_at)}</td>
          <td><RowActions subject={`${job.username}的作业 ${job.id}`} actions={[
            ...(cancellable.has(job.status) ? [{label: '终止作业', run: () => act(job, 'kill'), destructive: true}] : []),
            ...(!job.pruned && job.user_status === 'active' && retryable.has(job.status) ? [{label: '重跑作业', run: () => act(job, 'retry')}] : []),
          ]}>
            {!job.pruned && <button className="csx-btn csx-btn-outline" type="button" onClick={() => select(job)} aria-label={`查看快照 · ${job.id}`}>查看快照</button>}
          </RowActions></td>
        </tr>)}</tbody>
      </table></TableFrame> : <p className="admin-empty">没有符合条件的评测作业。</p>)}
      {jobs.data && <Pager data={jobs.data} setPage={setPage}/>}
    </section>
    {pruning && <PruneSnapshots retention={retention} onClose={()=>setPruning(false)} onPruned={result=>{
      setPruning(false);
      if (snapshot) select();
      jobs.refresh();
      setNotice(`已清理 ${formatNumber(result.prunedJobs)} 条作业快照，预计腾出 ${payloadSize(result.freedBytes)} 的载荷空间。`);
    }}/>}
    {snapshot && !confirmation && !pruning && <Snapshot key={snapshot} id={snapshot} owner={owner} onClose={()=>select()} act={act}/>}
    {confirmation && <ConfirmAction confirmation={confirmation} onClose={() => setConfirmation(null)}/>}
  </>;
}

function snapshotFiles(detail: Detail): SnapshotFile[] {
  if (detail.course_id==='sql-foundations') return [{path:'submission.sql',content:detail.source}];
  try {
    const parsed: unknown = JSON.parse(detail.source);
    if (Array.isArray(parsed) && parsed.length && parsed.every(entry => typeof entry?.path==='string' && typeof entry.content==='string'))
      return parsed;
  } catch { /* HTTP snapshots contain a single Java source. */ }
  return [{path:'TaskServer.java',content:detail.source}];
}

function diagnosticLocations(files: SnapshotFile[], report?: Report) {
  const diagnostics = new Map<string,number>();
  const output = [report?.log,report?.message,...(report?.assertions || []).filter(item=>!item.passed).map(item=>item.actual)]
    .filter(value=>typeof value==='string').join('\n').replaceAll('\\','/');
  for (const [,path,rawLine] of output.matchAll(/([\w./$-]+\.java):\[?(\d+)(?=[:,\]])/g)) {
    const matches = files.filter(file => file.path===path || path.endsWith('/'+file.path)
      || file.path.endsWith('/'+path));
    const line = Number(rawLine);
    if (matches.length===1 && line>0 && line<=matches[0].content.split('\n').length && !diagnostics.has(matches[0].path))
      diagnostics.set(matches[0].path,line);
  }
  return diagnostics;
}

function text(value: unknown) {
  if (typeof value==='string') return value;
  return value == null ? '—' : JSON.stringify(value,null,2);
}

function Snapshot({id,owner,onClose,act}: {id:string;owner:string;onClose:()=>void;act:(job:Job,action:'kill'|'retry')=>void}) {
  const detail = useAdminData<Detail>('/jobs/' + encodeURIComponent(id) + query({userId:owner}));
  const [copied,setCopied] = useState('');
  const [file, setFile] = useState('');
  const [panel, setPanel] = useState<'source'|'report'>('source');
  const files = useMemo(() => detail.data && !detail.data.pruned ? snapshotFiles(detail.data) : [], [detail.data]);
  const diagnostics = useMemo(() => diagnosticLocations(files,detail.data?.report), [files,detail.data?.report]);
  const current = files.find(item => item.path===(file || diagnostics.keys().next().value)) || files[0];
  const errorLine = current && diagnostics.get(current.path);
  const report = detail.data?.report;
  const job=detail.data;
  async function copy(value:string,label:string) {
    try {await navigator.clipboard.writeText(value);setCopied('已复制'+label+'。');}
    catch {setCopied('复制失败，请手动选中'+label+'复制。');}
  }
  return <Modal open title="提交快照" description={job ? job.username+' · '+(chapterTitles[job.stage_id]||job.stage_id) : id} className="admin-dialog admin-snapshot-modal"
    onOpenChange={open => {if (!open) onClose();}}>
    <DataState loading={!detail.data} error={detail.error} retry={detail.refresh}/>
    {job?.pruned && <p className="admin-pruned-label">快照已清理</p>}
    {job && !job.pruned && <>
      <div className="admin-tools"><Status value={job.status}/><code className="admin-digest" title={job.digest}>{job.digest}</code>
        {current && <button type="button" className="csx-btn csx-btn-sm" onClick={()=>void copy(current.content,'代码')}>复制代码</button>}
        {report?.log && <button type="button" className="csx-btn csx-btn-sm" onClick={()=>void copy(report.log!,'日志')}>复制日志</button>}
        {cancellable.has(job.status) && <button type="button" className="csx-btn csx-btn-sm" onClick={()=>act(job,'kill')}>终止作业</button>}
        {job.user_status==='active'&&retryable.has(job.status) && <button type="button" className="csx-btn csx-btn-sm" onClick={()=>act(job,'retry')}>重跑作业</button>}
      </div>
      {copied && <p role="status">{copied}</p>}
      <div className="admin-tools admin-snapshot-switch" role="group" aria-label="快照视图">
        <button className="csx-btn csx-btn-sm" type="button" aria-pressed={panel==='source'} onClick={()=>setPanel('source')}>代码</button>
        <button className="csx-btn csx-btn-sm" type="button" aria-pressed={panel==='report'} onClick={()=>setPanel('report')}>运行报告</button>
      </div>
      {panel==='source' && current && <>
        <label className="admin-file-field">快照文件<select className="csx-select" value={current.path} onChange={event => setFile(event.target.value)}>{files.map(item => <option key={item.path} value={item.path}>{item.path}{diagnostics.has(item.path) ? ' · 有诊断' : ''}</option>)}</select></label>
        {errorLine && <p className="admin-diagnostic">编译诊断定位到第 {errorLine} 行</p>}
        <div className="admin-code"><CodeEditor path={current.path} value={current.content} errorLine={errorLine} readOnly onChange={() => {}}/></div>
      </>}
      {panel==='report' && (report ? <section className="admin-report" aria-label="运行报告">
        {report.message && <p>{report.message}</p>}
        {report.assertions?.map((assertion,index) => <details key={assertion.name+index}><summary>{assertion.passed?'通过':'失败'} · {assertion.name}</summary>
          <dl><dt>预期</dt><dd><pre>{text(assertion.expected)}</pre></dd><dt>实际</dt><dd><pre>{text(assertion.actual)}</pre></dd></dl>
        </details>)}
        {report.log && <details><summary>运行日志</summary><pre tabIndex={0} aria-label="运行日志">{report.log}</pre></details>}
      </section> : <p>此作业暂无判题报告。</p>)}
    </>}
  </Modal>;
}

function payloadSize(bytes: number) {
  if (bytes < 1024) return formatNumber(bytes) + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KiB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MiB';
  return (bytes / 1024 ** 3).toFixed(1) + ' GiB';
}

type PruneResult = {prunedJobs: number; freedBytes: number};

function PruneSnapshots({retention, onClose, onPruned}: {retention: number; onClose: () => void; onPruned: (value: PruneResult) => void}) {
  const [scope, setScope] = useState<'expired' | 'all'>('expired');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function prune() {
    setBusy(true);
    setError('');
    try {
      onPruned(await adminWrite<PruneResult>('/jobs/prune-snapshots', 'POST', {scope}, 90_000));
    } catch (failure) {
      setError(message(failure));
      setBusy(false);
    }
  }

  return <Modal open title="清理评测快照" description="仅清理代码快照与运行日志以释放磁盘空间，保留通过记录与统计数据。"
    className="admin-dialog" dismissible={!busy} onOpenChange={open=>{if (!open) onClose();}}>
    <fieldset className="admin-prune-options" disabled={busy}>
      <legend>清理范围</legend>
      <label><input type="radio" name="prune-scope" checked={scope==='expired'} onChange={()=>setScope('expired')}/>
        清理 {retention} 小时前的历史快照（默认）</label>
      <label><input type="radio" name="prune-scope" checked={scope==='all'} onChange={()=>setScope('all')}/>
        清理全部已结束快照</label>
    </fieldset>
    <p className="admin-snapshot-retention">已清理的作业无法使用原快照重跑。</p>
    {error && <p className="csx-alert csx-alert-error" role="alert">{error}</p>}
    <div className="admin-tools">
      <button type="button" className="csx-btn csx-btn-primary" disabled={busy} onClick={()=>void prune()}>
        {busy ? '正在清理…' : '确认清理'}
      </button>
      <button type="button" className="csx-btn csx-btn-ghost" disabled={busy} onClick={onClose}>取消</button>
    </div>
  </Modal>;
}
