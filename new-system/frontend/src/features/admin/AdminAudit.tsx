import {useState} from 'react';
import {query, type Page} from '../../api/admin-api';
import {DataState, Pager, TableFrame, formatTime, useAdminData} from './admin-controls';

type AuditRow = {id: string; username: string | null; action: string; target_type: string; target_id: string; details: string; ip: string; created_at: string};
const actions: Record<string,string> = {
  user_status:'账号启闭',user_role:'角色变更',user_deleted:'删除账号',password_reset:'密码重置',password_changed:'管理员改密',
  profile_viewed:'查看学习档案',snapshot_viewed:'查看提交快照',invite_created:'创建邀请码',job_cancelled:'终止作业',
  job_retried:'重跑作业',report_export_requested:'申请报告归档',reports_exported:'导出实验报告',school_database_reset:'重置练习库',container_pruned:'清理容器',
  local_execution_blocked:'拦截本机执行',account_locked:'账号登录锁定',
  tutor_probed:'探测 AI 连接',
  question_created:'创建题目',question_updated:'更新题目',
};

export function AdminAudit() {
  const [action,setAction] = useState('');
  const [page,setPage] = useState(1);
  const log = useAdminData<Page<AuditRow>>('/audit' + query({page,action}));
  return <>
    <div className="admin-heading"><h1>审计日志</h1><button className="csx-btn" type="button" onClick={log.refresh}>刷新日志</button></div>
    <section className="admin-card">
      <div className="admin-form"><label>操作类型<select className="csx-select" value={action} onChange={event=>{setAction(event.target.value);setPage(1);}}>
        <option value="">全部类型</option>{Object.entries(actions).map(([value,title])=><option value={value} key={value}>{title}</option>)}
      </select></label></div>
      <DataState loading={!log.data} error={log.error} retry={log.refresh}/>
      {log.data && (log.data.items.length ? <TableFrame name="审计记录"><table className="csx-table admin-audit-table">
        <thead><tr><th scope="col">时间</th><th scope="col">操作</th><th scope="col">操作者</th><th scope="col">对象</th><th scope="col">详情</th><th scope="col">IP</th></tr></thead>
        <tbody>{log.data.items.map(record => <tr key={record.id}><td>{formatTime(record.created_at)}</td><th scope="row">{actions[record.action] || record.action}</th><td>{record.username || '系统'}</td><td>{record.target_type}<small>{record.target_id || '—'}</small></td><td>{record.details||'—'}</td><td>{record.ip}</td></tr>)}</tbody>
      </table></TableFrame> : <p className="admin-empty">暂无匹配的审计记录。</p>)}
      {log.data && <Pager data={log.data} setPage={setPage}/>}
    </section>
  </>;
}
