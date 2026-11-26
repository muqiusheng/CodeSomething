import {useState} from 'react';
import {Link} from 'react-router-dom';
import {adminWrite, query} from '../../api/admin-api';
import {AdminNotice, ConfirmAction, DataState, Status, TableFrame, formatTime, label, message, useAdminData, useAdminFilters, type Confirmation} from './admin-controls';
import {size, type Health} from './AdminOverview';

type Container = {id: string; name: string; kind: 'check'|'mysql'; state: string; status: string; jobId: string;
  userId?:string;username?:string;runningFor?:string;purpose:string;releasable:boolean;busy:boolean;
  idleSeconds:number|null;lastActiveAt:string|null;jobIndexed:boolean};

function activity(container: Container) {
  if (container.busy) return '活跃中';
  if (container.idleSeconds === null) return container.state === 'running' ? '运行中' : '—';
  if (container.idleSeconds < 60) return '空闲不到 1 分钟';
  const minutes = Math.floor(container.idleSeconds / 60);
  return minutes < 60 ? `已空闲 ${minutes} 分钟` : `已空闲 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}

export function AdminRunners() {
  const health = useAdminData<Health>('/system/health', 15000);
  const containers = useAdminData<Container[]>('/system/containers', 10000);
  const {applied,apply,reset}=useAdminFilters({kind:'',state:''});
  const [confirmation,setConfirmation] = useState<Confirmation|null>(null);
  const [result,setResult] = useState('');
  const [probing,setProbing] = useState(false);
  const [probeError,setProbeError] = useState('');
  async function probe() {
    setProbing(true);setProbeError('');
    try { await adminWrite('/system/tutor-probe','POST');health.refresh(); }
    catch(error) {setProbeError(message(error));}
    finally {setProbing(false);}
  }
  const runningSql = containers.data?.filter(container => container.kind==='mysql' && container.state==='running').length;
  const pool=health.data?.mysqlPool;
  const visible=containers.data?.filter(row=>(!applied.kind||row.kind===applied.kind)&&(!applied.state||row.state===applied.state));
  return <>
    <div className="admin-heading"><h1>运行环境</h1><button className="csx-btn" type="button" onClick={() => {health.refresh();containers.refresh();}}>刷新状态</button></div>
    <section className="admin-card"><div className="admin-section-heading"><h2>服务连通性</h2><button type="button" className="csx-btn" disabled={probing} onClick={()=>void probe()}>{probing?'正在探测…':'探测 AI 连接'}</button></div>
      {probeError&&<p role="alert">{probeError}</p>}
      <DataState loading={!health.data} error={health.error} retry={health.refresh}/>
      {health.data && <dl className="admin-facts admin-health">
        <div><dt>Docker</dt><dd><Status value={health.data.docker.status}/>{health.data.docker.version && <small>{health.data.docker.version} · {health.data.docker.latencyMs} ms</small>}</dd></div>
        <div><dt>MySQL 练习池</dt><dd>{health.data.mysqlPoolLimit===0?'未启用':runningSql===undefined?'—':runningSql + ' / ' + health.data.mysqlPoolLimit + ' 个运行中'}
          {pool && pool.peak>0 && <small>常驻阈值 {pool.normal} · 高峰上限 {pool.peak} · 空闲 {pool.idleMinutes} 分钟后回收</small>}</dd></div>
        <div><dt>AI 辅导</dt><dd><Status value={health.data.tutor.status}/>{health.data.tutor.message && <small>{health.data.tutor.message}</small>}
          {health.data.tutor.latencyMs && <small>连接耗时 {health.data.tutor.latencyMs} ms</small>}
          {health.data.tutor.recentErrors!==undefined && <small>24 小时错误 {health.data.tutor.recentErrors} 次</small>}</dd></div>
        <div><dt>SQLite WAL</dt><dd>{size(health.data.database.walBytes)}</dd></div>
      </dl>}
    </section>
    <section className="admin-card admin-list">
      <div className="admin-section-heading admin-list-heading"><h2>隔离容器</h2><button type="button" className="csx-btn" disabled={!containers.data?.length} onClick={() => setConfirmation({
        title:'回收孤儿容器', description:'回收没有运行中作业的评测容器，以及已停止的无主 MySQL 容器。', action:async () => {
          const response = await adminWrite<{removed:number}>('/system/prune-containers','POST');
          setResult('已回收 ' + response.removed + ' 个容器。');
          containers.refresh();
        },
      })}>回收孤儿容器</button></div>
      <div className="admin-form admin-filter-bar">
        <label>用途<select className="csx-select" value={applied.kind} onChange={event=>apply({kind:event.target.value})}>
          <option value="">全部用途</option><option value="mysql">MySQL 练习</option><option value="check">评测</option>
        </select></label>
        <label>状态<select className="csx-select" value={applied.state} onChange={event=>apply({state:event.target.value})}>
          <option value="">全部状态</option>{['running','exited','dead','created','restarting'].map(value=><option key={value} value={value}>{label(value)}</option>)}
        </select></label>
        <button type="button" className="csx-btn csx-btn-ghost" onClick={reset}>重置筛选</button>
      </div>
      <AdminNotice text={result} onClose={()=>setResult('')}/>
      <DataState loading={!containers.data} error={containers.error} retry={containers.refresh}/>
      {visible && (visible.length ? <TableFrame name="隔离容器列表"><table className="csx-table admin-data-table">
        <thead><tr><th scope="col">容器</th><th scope="col">用途</th><th scope="col">使用者</th><th scope="col">活跃 / 空闲</th><th scope="col">关联作业</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
        <tbody>{visible.map(container => {
          const snapshot = container.kind === 'mysql' && container.state === 'running';
          const button = snapshot ? '保存快照并释放' : '停止并释放';
          return <tr key={container.id}>
            <th scope="row"><code>{container.name}</code></th><td>{container.purpose}</td>
            <td>{container.username && container.userId && container.username !== '已删除账号'
              ? <Link to={'/admin/users'+query({profile:container.userId})}>{container.username}</Link>
              : container.username || '—'}</td>
            <td>{activity(container)}{container.lastActiveAt && <small>{formatTime(container.lastActiveAt)}</small>}</td>
            <td>{container.jobId && container.jobIndexed
              ? <Link to={'/admin/submissions'+query({snapshot:container.jobId,snapshotOwner:container.userId||''})}>{container.jobId}</Link>
              : container.jobId || '—'}</td>
            <td><Status value={container.state}/></td>
            <td>{container.releasable ? <button className="csx-btn csx-btn-sm" type="button" onClick={()=>setConfirmation({
              title:button, confirmLabel:button,
              description:snapshot ? '将先保存该学员的练习库快照，再释放容器名额。学员下次进入实验时会自动恢复数据。'
                : container.kind==='check' && container.state==='running' ? '将取消关联评测作业，然后停止并移除容器。' : '将移除容器并释放资源。',
              action:async()=>{
                await adminWrite('/system/containers/'+container.id+'/reclaim','POST',{},90_000);
                containers.refresh();
                health.refresh();
                setResult(snapshot ? '练习库快照已保存，容器名额已释放。' : '容器已释放。');
              },
            })}>{button}</button> : container.busy ? <small>操作保护中</small> : '—'}</td>
          </tr>;
        })}</tbody>
      </table></TableFrame> : <p className="admin-empty">当前没有隔离容器。</p>)}
    </section>
    {confirmation && <ConfirmAction confirmation={confirmation} onClose={() => setConfirmation(null)}/>}
  </>;
}
