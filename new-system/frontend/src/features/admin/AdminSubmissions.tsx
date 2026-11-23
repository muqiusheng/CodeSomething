import {useMemo, useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {adminWrite, query, type Page} from '../../api/admin-api';
import {CodeEditor} from '../../components/code/CodeEditor';
import {Modal} from '../../components/ui/modal';
import {chapterTitles} from '../../api/learning-api';
import {ConfirmAction, DataState, DateFilter, Pager, RowActions, SearchFilter, Status, TableFrame, formatTime, label, useAdminData, useAdminFilters, type Confirmation} from './admin-controls';

type Job = {id: string; submission_id: string; status: string; created_at: string; course_id: string; stage_id: string; user_id: string; username: string; user_status: string};
type Report = {assertions?: {passed: boolean; name: string; expected: unknown; actual: unknown}[]; log?: string; message?: string};
type Detail = Job & {digest: string; source: string; report?: Report};
type SnapshotFile = {path: string; content: string};
const statuses = ['queued','running','cancelling','awaiting_runner','passed','executed','compile_error','business_error','timed_out','timeout','sql_error','output_limit','environment_error','cancelled','interrupted','cleanup_failed'];
const cancellable = new Set(['queued','awaiting_runner','running']);
const retryable = new Set(['compile_error','business_error','timed_out','timeout','sql_error','output_limit','environment_error','cancelled','interrupted']);
const courses: Record<string,string> = {
  'http-json-basics':'HTTP / JSON','sql-foundations':'SQL','boot-foundations':'Spring Boot',
  'task-manager':'项目 A','collaboration':'项目 B',portfolio:'作品',
};

export function AdminSubmissions() {
  const {params, applied, filters, page, setPage, setFilter, apply} = useAdminFilters({
    status:'',courseId:'',keyword:'',from:'',to:'',
  });
  const userId = params.get('userId') || '';
  const [selected, setSelected] = useState<Job | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [notice, setNotice] = useState('');
  const jobs = useAdminData<Page<Job>>('/jobs' + query({page,userId,...applied}), 4000);

  function act(job: Job, action: 'retry' | 'kill') {
    setNotice('');
    const retry = action === 'retry';
    setConfirmation({
      title: retry ? '重跑作业' : '终止评测作业',
      description: retry ? '使用这份提交快照创建新作业。原作业与报告会保留。' : '作业将停止，已保存的代码快照仍可查看。',
      action: async () => {
        const result = await adminWrite<{id?: string; created?: boolean}>('/jobs/' + job.id + '/' + action + query({userId:job.user_id}),'POST');
        setNotice(retry ? (result.created ? '已提交重跑作业 ' : '该快照已有重跑作业 ') + result.id : '已发送终止请求。');
        jobs.refresh();
      },
    });
  }

  return <>
    <div className="admin-heading"><h1>评测作业</h1><button className="csx-btn csx-btn-outline" type="button" onClick={jobs.refresh}><RefreshCw size={16} aria-hidden="true"/>刷新队列</button></div>
    <section className="admin-card admin-list">
      <form className="admin-form admin-filter-bar" aria-label="筛选评测作业" onSubmit={event => {event.preventDefault();apply();}}>
        <SearchFilter label="作业或提交编号" placeholder="输入编号或前缀…" name="keyword" maxLength={36} value={filters.keyword} onChange={event => setFilter('keyword',event.target.value)}/>
        <label>课程<select className="csx-select" name="courseId" value={filters.courseId} onChange={event => setFilter('courseId',event.target.value)}>
          <option value="">全部课程</option>{Object.entries(courses).map(([id,title]) => <option key={id} value={id}>{title}</option>)}
        </select></label>
        <label>作业状态<select className="csx-select" name="status" value={filters.status} onChange={event => setFilter('status',event.target.value)}>
          <option value="">全部状态</option>{statuses.map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select></label>
        <DateFilter label="开始日期" name="from" value={filters.from} onChange={event => setFilter('from',event.target.value)}/>
        <DateFilter label="结束日期（不含当日）" name="to" value={filters.to} onChange={event => setFilter('to',event.target.value)}/>
        <button className="csx-btn csx-btn-outline" type="submit">检索</button>
        {userId && <button className="csx-btn csx-btn-ghost" type="button" onClick={() => apply({userId:''})}>显示全部账号</button>}
      </form>
      {notice && <p role="status" className="admin-job-notice">{notice}</p>}
      <DataState loading={!jobs.data} error={jobs.error} retry={jobs.refresh}/>
      {jobs.data && (jobs.data.items.length ? <TableFrame name="评测作业列表"><table className="csx-table admin-data-table">
        <thead><tr><th scope="col">账号与作业</th><th scope="col">课程关卡</th><th scope="col">状态</th><th scope="col">排队时间</th><th scope="col">操作</th></tr></thead>
        <tbody>{jobs.data.items.map(job => <tr key={job.user_id+job.id}>
          <th scope="row">{job.username}<small><code>{job.id}</code></small></th><td>{chapterTitles[job.stage_id] || job.stage_id}<small>{courses[job.course_id] || job.course_id}</small></td>
          <td><Status value={job.status}/></td><td className="admin-table-number">{formatTime(job.created_at)}</td>
          <td><RowActions subject={`${job.username}的作业 ${job.id}`} actions={[
            ...(cancellable.has(job.status) ? [{label: '终止作业', run: () => act(job, 'kill'), destructive: true}] : []),
            ...(job.user_status === 'active' && retryable.has(job.status) ? [{label: '重跑作业', run: () => act(job, 'retry')}] : []),
          ]}>
            <button className="csx-btn csx-btn-outline" type="button" onClick={() => setSelected(job)} aria-label={`查看快照 · ${job.id}`}>查看快照</button>
          </RowActions></td>
        </tr>)}</tbody>
      </table></TableFrame> : <p className="admin-empty">没有符合条件的评测作业。</p>)}
      {jobs.data && <Pager data={jobs.data} setPage={setPage}/>}
    </section>
    {selected && <Snapshot key={selected.id} job={selected} onClose={() => setSelected(null)}/>}
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

function Snapshot({job,onClose}: {job: Job; onClose: () => void}) {
  const detail = useAdminData<Detail>('/jobs/' + job.id + query({userId:job.user_id}));
  const [file, setFile] = useState('');
  const [panel, setPanel] = useState<'source'|'report'>('source');
  const files = useMemo(() => detail.data ? snapshotFiles(detail.data) : [], [detail.data]);
  const diagnostics = useMemo(() => diagnosticLocations(files,detail.data?.report), [files,detail.data?.report]);
  const current = files.find(item => item.path===(file || diagnostics.keys().next().value)) || files[0];
  const errorLine = current && diagnostics.get(current.path);
  const report = detail.data?.report;
  return <Modal open title="提交快照" description={job.username + ' · ' + (chapterTitles[job.stage_id] || job.stage_id)} className="admin-dialog admin-snapshot-modal"
    onOpenChange={open => {if (!open) onClose();}}>
    <DataState loading={!detail.data} error={detail.error} retry={detail.refresh}/>
    {detail.data && <>
      <div className="admin-tools"><Status value={detail.data.status}/><code className="admin-digest" title={detail.data.digest}>{detail.data.digest}</code></div>
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
