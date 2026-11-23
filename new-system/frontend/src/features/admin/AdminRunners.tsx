import {useState} from 'react';
import {adminWrite} from '../../api/admin-api';
import {ConfirmAction, DataState, Status, TableFrame, message, useAdminData, type Confirmation} from './admin-controls';
import {size, type Health} from './AdminOverview';

type Container = {id: string; name: string; kind: 'check'|'mysql'; state: string; status: string; jobId: string};

export function AdminRunners() {
  const health = useAdminData<Health>('/system/health', 15000);
  const containers = useAdminData<Container[]>('/system/containers', 10000);
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
  return <>
    <div className="admin-heading"><h1>运行环境</h1><button className="csx-btn" type="button" onClick={() => {health.refresh();containers.refresh();}}>刷新状态</button></div>
    <section className="admin-card"><div className="admin-section-heading"><h2>服务连通性</h2><button type="button" className="csx-btn" disabled={probing} onClick={()=>void probe()}>{probing?'正在探测…':'探测 AI 连接'}</button></div>
      {probeError&&<p role="alert">{probeError}</p>}
      <DataState loading={!health.data} error={health.error} retry={health.refresh}/>
      {health.data && <dl className="admin-facts admin-health">
        <div><dt>Docker</dt><dd><Status value={health.data.docker.status}/>{health.data.docker.version && <small>{health.data.docker.version} · {health.data.docker.latencyMs} ms</small>}</dd></div>
        <div><dt>MySQL 练习池</dt><dd>{health.data.mysqlPoolLimit===0?'未启用':runningSql===undefined?'—':runningSql + ' / ' + health.data.mysqlPoolLimit + ' 个运行中'}</dd></div>
        <div><dt>AI 辅导</dt><dd><Status value={health.data.tutor.status}/>{health.data.tutor.message && <small>{health.data.tutor.message}</small>}
          {health.data.tutor.latencyMs && <small>连接耗时 {health.data.tutor.latencyMs} ms</small>}
          {health.data.tutor.recentErrors!==undefined && <small>24 小时错误 {health.data.tutor.recentErrors} 次</small>}</dd></div>
        <div><dt>SQLite WAL</dt><dd>{size(health.data.database.walBytes)}</dd></div>
      </dl>}
    </section>
    <section className="admin-card">
      <div className="admin-section-heading"><h2>隔离容器</h2><button type="button" className="csx-btn" disabled={!containers.data?.length} onClick={() => setConfirmation({
        title:'回收孤儿容器', description:'回收没有运行中作业的评测容器，以及无主或已停止的 MySQL 容器。', action:async () => {
          const response = await adminWrite<{removed:number}>('/system/prune-containers','POST');
          setResult('已回收 ' + response.removed + ' 个容器。');
          containers.refresh();
        },
      })}>回收孤儿容器</button></div>
      {result && <p role="status">{result}</p>}
      <DataState loading={!containers.data} error={containers.error} retry={containers.refresh}/>
      {containers.data && (containers.data.length ? <TableFrame name="隔离容器列表"><table className="csx-table">
        <thead><tr><th scope="col">容器</th><th scope="col">用途</th><th scope="col">状态</th><th scope="col">运行时间</th></tr></thead>
        <tbody>{containers.data.map(container => <tr key={container.id}><th scope="row"><code>{container.name}</code></th><td>{container.kind==='mysql'?'MySQL 练习':'评测'}</td><td><Status value={container.state}/></td><td>{container.status}</td></tr>)}</tbody>
      </table></TableFrame> : <p className="admin-empty">当前没有隔离容器。</p>)}
    </section>
    {confirmation && <ConfirmAction confirmation={confirmation} onClose={() => setConfirmation(null)}/>}
  </>;
}
