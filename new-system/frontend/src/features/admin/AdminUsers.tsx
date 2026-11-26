import {InlineSpinner} from '../../components/shared/LoadingState';
import {useState, type FormEvent} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {Activity, CalendarDays, CalendarRange, Ticket, UserPlus, Users} from 'lucide-react';
import {adminDelete, adminWrite, query, type Page} from '../../api/admin-api';
import {Modal} from '../../components/ui/modal';
import {useAuth} from '../auth/AuthContext';
import {AdminNotice, ConfirmAction, DataState, Pager, RowActions, SearchFilter, Status, TableFrame, formatNumber, formatTime, label, message, useAdminData, useAdminFilters, type Confirmation} from './admin-controls';
import {MistakeTable, type ExamAttempt, type Mistake} from './AdminSchool';
import {AdminSummaryMetric} from './AdminSummaryMetric';
import {AdminNudgeDialog, type NudgeRecord, type NudgeTarget} from './AdminNudgeDialog';
import {type Overview} from './AdminOverview';

type UserRow = {id: string; username: string; email: string | null; role: string; status: string; completed: number;
  last_seen_at: string | null; created_at:string; password_change_required:number;schoolCompleted:number;schoolRequired:number;
  examCount:number;examBestScore:number|null;examRecentScore:number|null;bookmarkCount:number};
type SchoolProgress = {labId: string; title: string; courseId: string; completed: number; required: number;
  optionalCompleted:number;lastPracticeAt?:string;lastPassedAt?:string};
type Profile = {profile: {
  summary?: {completed: number; total: number; courses: {courseId: string; completed: number; total: number}[]};
  knowledge?: {skill: {stageId: string; courseId: string; title: string; name?: string}; state: string; reason: string}[];
}; account:UserRow; school: SchoolProgress[];exams:ExamAttempt[];mistakes:Mistake[];bookmarks:{category:string;count:number}[]};
type Invitation = {id: string; used_count: number; max_uses: number; status: string; expires_at: number;note:string;registered:string[]};
const inviteStates:Record<string,string>={active:'有效',used:'已用完',expired:'已过期',revoked:'已撤销'};
const courses: Record<string,string> = {'http-json-basics':'HTTP / JSON','sql-foundations':'SQL','boot-foundations':'Spring Boot','task-manager':'项目 A','collaboration':'项目 B'};

export function AdminUsers() {
  const {user} = useAuth();
  const initialAdmin = user?.userId === 'admin';
  const {filters, applied, page, pageSize, setPage, setFilter, apply, reset:resetFilters} = useAdminFilters({keyword:'', role:'', status:'',sort:'',window:''});
  const [parameters, setParameters] = useSearchParams();
  const inviting = parameters.get('invite') === '1';
  const [secret, setSecret] = useState<{title: string; value: string} | null>(null);
  const [copyStatus,setCopyStatus] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [notice, setNotice] = useState('');
  const selectedId = parameters.get('profile');
  const [nudge, setNudge] = useState<NudgeTarget | null>(null);
  const nudges = useAdminData<NudgeRecord[]>(selectedId ? '/nudges' + query({userId: selectedId}) : null, 15000);
  const users = useAdminData<Page<UserRow>>('/users' + query({page,size:pageSize,...applied}),15_000);
  const summary = useAdminData<Overview>('/analytics/overview', 30_000);
  const profile = useAdminData<Profile>(selectedId ? '/users/' + encodeURIComponent(selectedId) : null);
  const current = users.data?.items.find(row => row.id===selectedId) || profile.data?.account;
  const canManage = (row:UserRow) => row.id!==user?.userId && row.id!=='admin' && (row.role==='ROLE_STUDENT'||initialAdmin);

  const canNudge = (row: UserRow) => row.role === 'ROLE_STUDENT' && row.status === 'active';
  const activeShare = (count: number) => summary.data?.registered ? count / summary.data.registered : 0;

  function setSelected(row: UserRow|null) {
    setParameters(previous => {
      const next=new URLSearchParams(previous);
      if (row) next.set('profile',row.id);
      else next.delete('profile');
      return next;
    },{replace:true});
  }

  function setInviting(open: boolean) {
    setParameters(previous => {
      const next = new URLSearchParams(previous);
      if (open) next.set('invite', '1');
      else next.delete('invite');
      return next;
    }, {replace: true});
  }

  function accountAction(row: UserRow, field: 'status' | 'role') {
    const value = field==='status' ? row.status==='active'?'disabled':'active' : row.role==='ROLE_ADMIN'?'ROLE_STUDENT':'ROLE_ADMIN';
    const title = field==='status' ? value==='disabled'?'冻结账号':'解冻账号' : '变更角色';
    setConfirmation({title, description: row.username + (field==='role' ? '将成为' + label(value) + '，现有登录会话会失效。'
      : value==='disabled' ? '的会话将立即撤销，正在进行的作业会停止。' : '将可以重新登录。'), action: async () => {
      await adminWrite('/users/' + row.id + '/' + field, 'PATCH', {[field]: value});
      setSelected(null);
      users.refresh();
    }});
  }

  function reset(row: UserRow) {
    setConfirmation({title:'重置密码',description:row.username + '的现有会话将失效，首次用临时密码登录时需要改密。',action:async () => {
      const result = await adminWrite<{temporaryPassword:string}>('/users/' + row.id + '/reset-password', 'POST');
      setSelected(null);
      setCopyStatus('');
      setSecret({title:'临时密码',value:result.temporaryPassword});
      users.refresh();
    }});
  }

  function deleteAccount(row: UserRow) {
    setConfirmation({
      title: '删除账号',
      description: `删除「${row.username}」后，该账号将退出登录并从用户列表移除。用户名和邮箱可重新注册。历史学习和评测记录留存备查。此操作无法在后台撤销。`,
      confirmLabel: '确认删除',
      action: async () => {
        await adminDelete('/users/' + row.id);
        setSelected(null);
        setNotice(`已删除账号「${row.username}」。`);
        if (page > 1 && users.data?.items.length === 1) setPage(page - 1);
        else users.refresh();
      },
    });
  }

  return <>
    <div className="admin-heading"><h1>用户管理</h1><button className="csx-btn csx-btn-primary" type="button" onClick={() => setInviting(true)}><Ticket size={16} aria-hidden="true"/>邀请码管理</button></div>
    {summary.data && <dl className="admin-inline-summary" aria-label="用户活跃统计">
      <AdminSummaryMetric label="注册学员" value={formatNumber(summary.data.registered)} icon={Users}/>
      <AdminSummaryMetric label="今日新增" value={formatNumber(summary.data.newToday ?? 0)} icon={UserPlus} tone="success"/>
      <AdminSummaryMetric label="今日活跃" value={formatNumber(summary.data.activeToday)} icon={Activity} tone="success"
        ratio={activeShare(summary.data.activeToday)} chart="bar"/>
      <AdminSummaryMetric label="近 7 天活跃" value={formatNumber(summary.data.active7Days ?? 0)} icon={CalendarDays} tone="info"
        ratio={activeShare(summary.data.active7Days ?? 0)} chart="bar"/>
      <AdminSummaryMetric label="近 30 天活跃" value={formatNumber(summary.data.active30Days ?? 0)} icon={CalendarRange} tone="warning"
        ratio={activeShare(summary.data.active30Days ?? 0)} chart="bar"/>
    </dl>}
    <section className="admin-card admin-list">
      <form className="admin-form admin-filter-bar" aria-label="筛选用户" onSubmit={event => {event.preventDefault();apply();}}>
        <SearchFilter label="用户名或邮箱" placeholder="按名称或邮箱搜索…" name="keyword" maxLength={254} value={filters.keyword} onChange={event => setFilter('keyword',event.target.value)}/>
        <label>角色<select className="csx-select" name="role" value={filters.role} onChange={event => apply({role:event.target.value})}><option value="">全部角色</option><option value="ROLE_STUDENT">学员</option><option value="ROLE_ADMIN">管理员</option></select></label>
        <label>状态<select className="csx-select" name="status" value={filters.status} onChange={event => apply({status:event.target.value})}><option value="">全部状态</option><option value="active">正常</option><option value="disabled">已冻结</option></select></label>
        <label>排序<select className="csx-select" value={filters.sort} onChange={event=>apply({sort:event.target.value})}>
          <option value="">最近注册</option><option value="active">最近活跃</option><option value="school">课内进度</option><option value="outside">课外通关数</option>
        </select></label>
        <label>时段<select className="csx-select" value={filters.window} onChange={event=>apply({window:event.target.value})}>
          <option value="">全部时段</option><option value="new-today">今日注册</option><option value="active-today">今日活跃</option>
          <option value="active-7">近 7 天活跃</option><option value="active-30">近 30 天活跃</option>
        </select></label>
        <button className="csx-btn csx-btn-outline" type="submit">检索</button>
        <button className="csx-btn csx-btn-ghost" type="button" onClick={resetFilters}>重置筛选</button>
      </form>
      <AdminNotice text={notice} onClose={()=>setNotice('')}/>
      <DataState loading={!users.data} error={users.error} retry={users.refresh}/>
      {users.data && (users.data.items.length ? <TableFrame name="用户列表"><table className="csx-table admin-data-table">
        <thead><tr><th scope="col">账户</th><th scope="col">角色</th><th scope="col">状态</th><th scope="col">课内必做</th><th scope="col">课外通关</th><th scope="col">模考</th><th scope="col">收藏</th><th scope="col">注册 / 活跃</th><th scope="col">操作</th></tr></thead>
        <tbody>{users.data.items.map(row => {
          const freezing = row.status === 'active';
          return <tr key={row.id}>
            <th scope="row">{row.username}{row.password_change_required ? <span className="admin-inline-pill">待改密</span> : null}<small>{row.email || '—'}</small></th>
            <td>{label(row.role)}</td><td><Status value={row.status}/></td>
            <td>{row.schoolRequired ? row.schoolCompleted+' / '+row.schoolRequired : '—'}</td>
            <td>{row.completed}</td><td>{row.examCount ?? 0} 次<small>最高 {row.examBestScore ?? '—'} · 最近 {row.examRecentScore ?? '—'}</small></td>
            <td>{row.bookmarkCount ?? 0}</td><td className="admin-table-number">{formatTime(row.last_seen_at)}<small>注册 {formatTime(row.created_at)}</small></td>
            <td><RowActions subject={row.username} actions={[
              ...(canNudge(row) ? [{label:"督促一下", run:()=>setNudge(row)}] : []),
              ...(canManage(row) ? [
              {label:'重置密码',run:()=>reset(row)},
              ...(initialAdmin ? [{label: row.role === 'ROLE_ADMIN' ? '降为学员' : '设为管理员', run: () => accountAction(row, 'role')}] : []),
              {label: freezing ? '冻结账号' : '解冻账号', run: () => accountAction(row, 'status'), destructive: freezing},
              {label: '删除账号', run: () => deleteAccount(row), destructive: true},
            ] : []),
            ]}>
              <button className="csx-btn csx-btn-outline" type="button" onClick={() => setSelected(row)} aria-label={'查看档案 · ' + row.username}>查看档案</button>
            </RowActions></td>
          </tr>;
        })}</tbody>
      </table></TableFrame> : <p className="admin-empty">没有符合筛选条件的账号。</p>)}
      {users.data && <Pager data={users.data} setPage={setPage}/>}
    </section>
    {selectedId && !confirmation && !nudge && <Modal open title={current?current.username+'的学习档案':'学员档案'} description="账号信息、课内进度与课外学习记录" className="admin-dialog admin-profile-modal" onOpenChange={open => {if (!open) setSelected(null);}}>
      {current && <div className="admin-tools"><Status value={current.status}/><span>{label(current.role)}</span>
        <Link className="csx-btn csx-btn-sm" to={'/admin/submissions' + query({userId: current.id})}>查看评测作业</Link>
        <Link className="csx-btn csx-btn-sm" to={'/admin/school' + query({userId: current.id})}>查看课内实验</Link>
        {canNudge(current) && <button className="csx-btn csx-btn-sm" type="button" onClick={()=>setNudge(current)}>督促一下</button>}
        {canManage(current) && <button type="button" className="csx-btn csx-btn-sm" onClick={()=>reset(current)}>重置密码</button>}
        {canManage(current) && <button type="button" className="csx-btn csx-btn-sm" onClick={()=>accountAction(current,'status')}>{current.status==='active'?'冻结账号':'解冻账号'}</button>}
      </div>}
      <AdminNotice text={notice} onClose={()=>setNotice('')}/>
      {current?.role==='ROLE_STUDENT' && <section className="admin-nudge-history" aria-label="近期督促">
        <h3>近期督促</h3>
        <DataState loading={!nudges.data} error={nudges.error} retry={nudges.refresh}/>
        {nudges.data && (nudges.data.length ? <ul>{nudges.data.slice(0, 8).map(item => <li key={item.id}>
          <strong>{item.title}</strong>
          <span className="admin-inline-pill">{item.status === 'acknowledged' ? '已读' : item.status === 'expired' ? '已过期' : '未读'}</span>
          <small>{formatTime(item.created_at)}{item.acknowledged_at && ' · 确认于 ' + formatTime(item.acknowledged_at)}</small>
        </li>)}</ul> : <p className="admin-empty">暂无督促记录。</p>)}
      </section>}
      <DataState loading={!profile.data} error={profile.error} retry={profile.refresh}/>
      {profile.data && <>
        {current && <dl className="admin-facts">
          <div><dt>邮箱</dt><dd>{current.email||'—'}</dd></div>
          <div><dt>注册时间</dt><dd>{formatTime(current.created_at)}</dd></div>
          <div><dt>最近活跃</dt><dd>{formatTime(current.last_seen_at)}</dd></div>
          <div><dt>待改密</dt><dd>{current.password_change_required?'是':'否'}</dd></div>
        </dl>}
        <h3>课外课程</h3>
        {profile.data.profile.summary?.courses ? <CourseCoverage progress={profile.data.profile.summary.courses}/>
          : <p>该账号还没有学习记录。</p>}
        <h3>课内实验</h3>
        {profile.data.school.length ? <ul>{profile.data.school.map(lab => <li key={lab.courseId + lab.labId}>
          {lab.title} · 必做 {lab.completed}/{lab.required} · 选做 {lab.optionalCompleted ?? 0}
          {lab.lastPracticeAt && <> · 最近练习 {formatTime(lab.lastPracticeAt)}</>}
          {lab.lastPassedAt && <> · 最近通过 {formatTime(lab.lastPassedAt)}</>}
        </li>)}</ul> : <p>暂无实验记录。</p>}
        <h3>备考成绩</h3>
        {profile.data.exams?.length ? <><ul>{profile.data.exams.map(exam=><li key={exam.id}>
          {exam.paperTitle||exam.paper_id} · {exam.score}/{exam.max_score} · {formatTime(new Date(exam.submitted_at).toISOString())}
        </li>)}</ul>{current && <Link to={'/admin/school'+query({tab:'exams',userId:current.id})}>查看全部交卷</Link>}</>:<p>暂无交卷记录。</p>}
        <h3>错题摘要</h3><MistakeTable mistakes={profile.data.mistakes ?? []}/>
        <h3>收藏摘要</h3>
        {profile.data.bookmarks?.length ? <ul>{profile.data.bookmarks.map(row=><li key={row.category}>{row.category==='school'?'课内':'课外'} · {row.count} 项</li>)}</ul>:<p>暂无收藏。</p>}
        {!!profile.data.profile.knowledge?.length && <details><summary>学习画像证据</summary><ul>
          {profile.data.profile.knowledge.map(item => <li key={item.skill.courseId+item.skill.stageId}><strong>{item.skill.title||item.skill.name||item.skill.stageId}</strong> · {item.reason}</li>)}
        </ul></details>}
      </>}
    </Modal>}
    {nudge && <AdminNudgeDialog target={nudge} onClose={()=>setNudge(null)} onSent={()=>{
      setNotice('已向「' + nudge.username + '」发送提醒。');
      setNudge(null);
      nudges.refresh();
    }}/>}
    {inviting && <InvitationDialog onClose={() => setInviting(false)}/>}
    {confirmation && <ConfirmAction confirmation={confirmation} onClose={() => setConfirmation(null)}/>}
    {secret && <Modal open title={secret.title} description="请复制并通过私密渠道交给学员。关闭后无法再次查看。" className="admin-dialog" onOpenChange={open => {if (!open) setSecret(null);}}>
      <output className="admin-token">{secret.value}</output>
      <button type="button" className="csx-btn" onClick={async()=>{
        try {await navigator.clipboard.writeText(secret.value);setCopyStatus('已复制临时密码。');}
        catch {setCopyStatus('请选中临时密码并手动复制。');}
      }}>复制临时密码</button><p role="status">{copyStatus}</p>
    </Modal>}
  </>;
}

function CourseCoverage({progress}: {progress: {courseId:string;completed:number;total:number}[]}) {
  const axes = Object.entries(courses).map(([id,title]) => ({
    title, ...progress.find(course => course.courseId===id),
  }));
  function point(index: number, ratio: number) {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / axes.length;
    return [160 + Math.cos(angle) * 76 * ratio, 108 + Math.sin(angle) * 76 * ratio];
  }
  const outline = (ratio: number) => axes.map((_,index) => point(index,ratio).join(',')).join(' ');
  const coverage = axes.map((axis,index) => point(index,axis.total ? (axis.completed||0)/axis.total : 0).join(',')).join(' ');
  return <div className="admin-coverage">
    <svg viewBox="0 0 320 210" role="img" aria-label="各课程关卡通过覆盖率雷达图">
      {[0.25,0.5,0.75,1].map(ratio => <polygon key={ratio} points={outline(ratio)} fill="none" stroke="var(--border-strong)"/>)}
      {axes.map((axis,index) => {
        const [x,y] = point(index,1);
        const [labelX,labelY] = point(index,1.3);
        return <g key={axis.title}><line x1="160" y1="108" x2={x} y2={y} stroke="var(--border-strong)"/>
          <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="central">{axis.title}</text></g>;
      })}
      {axes.some(axis => (axis.completed||0)>0) ? <polygon points={coverage} className="admin-radar-area"/>
        : <circle cx="160" cy="108" r="3" fill="var(--primary-ink)"/>}
    </svg>
    <dl className="admin-progress">{axes.map(axis => <div key={axis.title}>
      <dt>{axis.title}</dt><dd><progress aria-label={axis.title} max={Math.max(axis.total||0,1)} value={axis.completed||0}/><span>{axis.completed||0} / {axis.total||0}</span></dd>
    </div>)}</dl>
  </div>;
}

function InvitationDialog({onClose}: {onClose: () => void}) {
  const [status,setStatus] = useState('');
  const entries = useAdminData<Invitation[]>('/invitations'+query({status}));
  const [confirmation,setConfirmation] = useState<Confirmation|null>(null);
  const [notice,setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invitation, setInvitation] = useState<{code: string; link: string} | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const privateSite = window.location.hostname === 'learn.maqibu.online';

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);setError('');setInvitation(null);setCopyStatus('');
    try {
      const result = await adminWrite<{code:string}>('/invitations','POST',{maxUses: Number(data.get('maxUses')), hours: Number(data.get('hours')),note:data.get('note')});
      const link = new URL('/register', window.location.origin);
      link.hash = new URLSearchParams({invite: result.code}).toString();
      setInvitation({code: result.code, link: link.href});
      entries.refresh();
    } catch (failure) {setError(message(failure));}
    finally {setBusy(false);}
  }

  async function copyInvitation(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`已复制${label}。`);
    } catch {
      setCopyStatus(`请选中上方的${label}手动复制。`);
    }
  }

  return <><Modal open={!confirmation} title="邀请码管理" description={privateSite ? '此处生成上海个人入口的邀请。给同学发邀请请前往公开试用站。' : '设置邀请码的使用次数和有效期限。'} className="admin-dialog admin-profile-modal" onOpenChange={open => {if (!open) onClose();}}>
    {privateSite && <p><a className="csx-btn csx-btn-primary" href="https://try.maqibu.online/admin/users?invite=1">去公开试用站创建邀请</a></p>}
    <form className="admin-form" onSubmit={generate}>
      <label>可使用次数<input className="csx-input" name="maxUses" type="number" min={1} max={100} defaultValue={1} required/></label>
      <label>有效时长（小时）<input className="csx-input" name="hours" type="number" min={1} max={720} defaultValue={72} required/></label>
      <label>备注<input className="csx-input" name="note" maxLength={200}/></label>
      <button className={privateSite ? 'csx-btn csx-btn-outline' : 'csx-btn csx-btn-primary'} disabled={busy} type="submit"><InlineSpinner active={busy}/>{busy ? '正在生成…' : privateSite ? '创建个人入口邀请' : '创建邀请码'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {invitation && <div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
        <label>邀请码<input className="csx-input w-full" value={invitation.code} readOnly onFocus={event => event.currentTarget.select()}/></label>
        <label>邀请链接<input className="csx-input w-full" type="url" value={invitation.link} readOnly onFocus={event => event.currentTarget.select()}/></label>
      </div>
      <div className="admin-tools mt-2">
        <button className="csx-btn csx-btn-outline" type="button" onClick={() => copyInvitation(invitation.code, '邀请码')}>复制邀请码</button>
        <button className="csx-btn csx-btn-outline" type="button" onClick={() => copyInvitation(invitation.link, '邀请链接')}>复制邀请链接</button>
      </div>
      <p role="status">{copyStatus || '请在关闭前保存邀请码或链接。'}</p>
    </div>}
    <div className="admin-form"><label>邀请码状态<select className="csx-select" value={status} onChange={event=>setStatus(event.target.value)}>
      <option value="">全部状态</option>{Object.entries(inviteStates).map(([key,title])=><option key={key} value={key}>{title}</option>)}
    </select></label>{status&&<button type="button" className="csx-btn csx-btn-ghost" onClick={()=>setStatus('')}>重置筛选</button>}</div>
    <AdminNotice text={notice} onClose={()=>setNotice('')}/>
    <DataState loading={!entries.data} error={entries.error} retry={entries.refresh}/>
    {entries.data && (entries.data.length ? <TableFrame name="邀请码记录"><table className="csx-table admin-data-table">
      <thead><tr><th scope="col">编号与备注</th><th scope="col">状态</th><th scope="col">已用 / 上限</th><th scope="col">到期时间</th><th scope="col">注册学员</th><th scope="col">操作</th></tr></thead>
      <tbody>{entries.data.map(entry => <tr key={entry.id}>
        <td>{entry.id}<small>{entry.note||'—'}</small></td><td><Status value={'invite_'+entry.status}/></td>
        <td>{entry.used_count} / {entry.max_uses}</td><td>{formatTime(new Date(entry.expires_at * 1000).toISOString())}</td>
        <td>{entry.registered?.join('、')||'—'}</td><td>{entry.status==='active' && <button className="csx-btn csx-btn-sm" type="button" onClick={()=>setConfirmation({
          title:'撤销邀请码',description:'撤销后，尚未使用的名额将失效，已注册账号仍可使用。',confirmLabel:'确认撤销',
          action:async()=>{await adminDelete('/invitations/'+entry.id);entries.refresh();setNotice('邀请码已撤销。');},
        })}>撤销</button>}</td>
      </tr>)}</tbody>
    </table></TableFrame> : <p>暂无邀请码记录。</p>)}
  </Modal>{confirmation && <ConfirmAction confirmation={confirmation} onClose={()=>setConfirmation(null)}/>}</>;
}
