import {useState, type FormEvent} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {Ticket} from 'lucide-react';
import {adminDelete, adminWrite, query, type Page} from '../../api/admin-api';
import {Modal} from '../../components/ui/modal';
import {useAuth} from '../auth/AuthContext';
import {ConfirmAction, DataState, Pager, RowActions, SearchFilter, Status, TableFrame, formatTime, label, message, useAdminData, useAdminFilters, type Confirmation} from './admin-controls';

type UserRow = {id: string; username: string; email: string | null; role: string; status: string; completed: number; last_seen_at: string | null};
type SchoolProgress = {labId: string; title: string; courseId: string; completed: number; required: number};
type Profile = {profile: {
  summary?: {completed: number; total: number; courses: {courseId: string; completed: number; total: number}[]};
  knowledge?: {skill: {stageId: string; courseId: string; title: string; name?: string}; state: string; reason: string}[];
}; school: SchoolProgress[]};
type Invitation = {id: string; used_count: number; max_uses: number; status: string; expires_at: number};
const courses: Record<string,string> = {'http-json-basics':'HTTP / JSON','sql-foundations':'SQL','boot-foundations':'Spring Boot','task-manager':'项目 A','collaboration':'项目 B'};

export function AdminUsers() {
  const {user} = useAuth();
  const initialAdmin = user?.userId === 'admin';
  const {filters, applied, page, setPage, setFilter, apply} = useAdminFilters({keyword:'', role:'', status:''});
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [parameters, setParameters] = useSearchParams();
  const inviting = parameters.get('invite') === '1';
  const [secret, setSecret] = useState<{title: string; value: string} | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [notice, setNotice] = useState('');
  const users = useAdminData<Page<UserRow>>('/users' + query({page,...applied}), 15_000);
  const profile = useAdminData<Profile>(selected ? '/users/' + selected.id : null);
  const current = selected && users.data?.items.find(row => row.id===selected.id) || selected;

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
    <section className="admin-card admin-list">
      <form className="admin-form admin-filter-bar" aria-label="筛选用户" onSubmit={event => {event.preventDefault();apply();}}>
        <SearchFilter label="用户名或邮箱" placeholder="按名称或邮箱搜索…" name="keyword" maxLength={254} value={filters.keyword} onChange={event => setFilter('keyword',event.target.value)}/>
        <label>角色<select className="csx-select" name="role" value={filters.role} onChange={event => setFilter('role',event.target.value)}><option value="">全部角色</option><option value="ROLE_STUDENT">学员</option><option value="ROLE_ADMIN">管理员</option></select></label>
        <label>状态<select className="csx-select" name="status" value={filters.status} onChange={event => setFilter('status',event.target.value)}><option value="">全部状态</option><option value="active">正常</option><option value="disabled">已冻结</option></select></label>
        <button className="csx-btn csx-btn-outline" type="submit">检索</button>
      </form>
      {notice && <p role="status">{notice}</p>}
      <DataState loading={!users.data} error={users.error} retry={users.refresh}/>
      {users.data && (users.data.items.length ? <TableFrame name="用户列表"><table className="csx-table admin-data-table">
        <thead><tr><th scope="col">账户</th><th scope="col">角色</th><th scope="col">状态</th><th scope="col">通关数</th><th scope="col">最近活跃</th><th scope="col">操作</th></tr></thead>
        <tbody>{users.data.items.map(row => {
          const canManage = row.id !== user?.userId && row.id !== 'admin' && (row.role === 'ROLE_STUDENT' || initialAdmin);
          const freezing = row.status === 'active';
          return <tr key={row.id}>
            <th scope="row">{row.username}<small>{row.email || '—'}</small></th>
            <td>{label(row.role)}</td><td><Status value={row.status}/></td>
            <td className="admin-table-number">{row.completed}</td><td className="admin-table-number">{formatTime(row.last_seen_at)}</td>
            <td><RowActions subject={row.username} actions={canManage ? [
              {label: '重置密码', run: () => reset(row)},
              ...(initialAdmin ? [{label: row.role === 'ROLE_ADMIN' ? '降为学员' : '设为管理员', run: () => accountAction(row, 'role')}] : []),
              {label: freezing ? '冻结账号' : '解冻账号', run: () => accountAction(row, 'status'), destructive: freezing},
              {label: '删除账号', run: () => deleteAccount(row), destructive: true},
            ] : []}>
              <button className="csx-btn csx-btn-outline" type="button" onClick={() => setSelected(row)} aria-label={'查看档案 · ' + row.username}>查看档案</button>
            </RowActions></td>
          </tr>;
        })}</tbody>
      </table></TableFrame> : <p className="admin-empty">没有符合筛选条件的账号。</p>)}
      {users.data && <Pager data={users.data} setPage={setPage}/>}
    </section>
    {current && !confirmation && <Modal open title={current.username + '的学习档案'} description="查看课程进度与实验记录。" className="admin-dialog admin-profile-modal" onOpenChange={open => {if (!open) setSelected(null);}}>
      <div className="admin-tools"><Status value={current.status}/><span>{label(current.role)}</span>
        <Link to={'/admin/submissions' + query({userId: current.id})} onClick={() => setSelected(null)}>查看评测作业</Link>
      </div>
      <DataState loading={!profile.data} error={profile.error} retry={profile.refresh}/>
      {profile.data && <>
        <h3>课程进度</h3>
        {profile.data.profile.summary?.courses ? <CourseCoverage progress={profile.data.profile.summary.courses}/>
          : <p>该账号还没有学习记录。</p>}
        <h3>课内实战</h3>
        {profile.data.school.length ? <ul>{profile.data.school.map(lab => <li key={lab.courseId + lab.labId}>{lab.title} · {lab.completed}/{lab.required}</li>)}</ul> : <p>暂无实验记录。</p>}
        {!!profile.data.profile.knowledge?.length && <details><summary>学习画像证据</summary><ul>
          {profile.data.profile.knowledge.map(item => <li key={item.skill.courseId+item.skill.stageId}><strong>{item.skill.title||item.skill.name||item.skill.stageId}</strong> · {item.reason}</li>)}
        </ul></details>}
      </>}
    </Modal>}
    {inviting && <InvitationDialog onClose={() => setInviting(false)}/>}
    {confirmation && <ConfirmAction confirmation={confirmation} onClose={() => setConfirmation(null)}/>}
    {secret && <Modal open title={secret.title} description="请复制并通过私密渠道交给学员。关闭后无法再次查看。" className="admin-dialog" onOpenChange={open => {if (!open) setSecret(null);}}>
      <output className="admin-token">{secret.value}</output>
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
  const entries = useAdminData<Invitation[]>('/invitations');
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
      const result = await adminWrite<{code:string}>('/invitations','POST',{maxUses: Number(data.get('maxUses')), hours: Number(data.get('hours'))});
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

  return <Modal open title="邀请码管理" description={privateSite ? '此处生成上海个人入口的邀请。给同学发邀请请前往公开试用站。' : '设置邀请码的使用次数和有效期限。'} className="admin-dialog" onOpenChange={open => {if (!open) onClose();}}>
    {privateSite && <p><a className="csx-btn csx-btn-primary" href="https://try.maqibu.online/admin/users?invite=1">去公开试用站创建邀请</a></p>}
    <form className="admin-form" onSubmit={generate}>
      <label>可使用次数<input className="csx-input" name="maxUses" type="number" min={1} max={100} defaultValue={1} required/></label>
      <label>有效时长（小时）<input className="csx-input" name="hours" type="number" min={1} max={720} defaultValue={72} required/></label>
      <button className={privateSite ? 'csx-btn csx-btn-outline' : 'csx-btn csx-btn-primary'} disabled={busy} type="submit">{busy ? '正在生成…' : privateSite ? '创建个人入口邀请' : '创建邀请码'}</button>
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
    <DataState loading={!entries.data} error={entries.error} retry={entries.refresh}/>
    {entries.data && (entries.data.length ? <TableFrame name="邀请码记录"><table className="csx-table">
      <thead><tr><th scope="col">编号</th><th scope="col">已用 / 上限</th><th scope="col">到期时间</th></tr></thead>
      <tbody>{entries.data.map(entry => <tr key={entry.id}><td>{entry.id}</td><td>{entry.used_count} / {entry.max_uses}</td><td>{formatTime(new Date(entry.expires_at * 1000).toISOString())}</td></tr>)}</tbody>
    </table></TableFrame> : <p>暂无邀请码记录。</p>)}
  </Modal>;
}
