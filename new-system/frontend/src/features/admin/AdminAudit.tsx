import {useState} from 'react';
import {Link} from 'react-router-dom';
import {adminDownload, query, type Page} from '../../api/admin-api';
import {DataState, DateFilter, Pager, SearchFilter, TableFrame, formatTime, message, useAdminData, useAdminFilters} from './admin-controls';

type AuditRow = {id:string;username:string|null;action:string;target_type:string;target_id:string;details:string;ip:string;created_at:string};
const actions: Record<string,string> = {
  user_status:'账号启闭',user_role:'角色变更',user_deleted:'删除账号',password_reset:'密码重置',password_changed:'管理员改密',
  profile_viewed:'查看学习档案',snapshot_viewed:'查看提交快照',invite_created:'创建邀请码',invite_revoked:'撤销邀请码',
  job_cancelled:'终止作业',job_retried:'重跑作业',report_export_requested:'申请报告归档',reports_exported:'导出实验报告',
  school_database_reset:'重置练习库',school_progress_viewed:'查看逐题实验进度',container_pruned:'清理容器',container_released:'释放隔离容器',snapshots_pruned:'清理作业快照',learner_nudged:'发送学习提醒',
  local_execution_blocked:'拦截本机执行',account_locked:'账号登录锁定',tutor_probed:'探测 AI 连接',
  question_created:'创建题目',question_updated:'更新题目',question_deleted:'删除题目',audit_exported:'导出审计日志',
  announcement_created:'发布公告',announcement_updated:'更新公告',announcement_deleted:'删除公告',
  feedback_replied:'回复留言',feedback_deleted:'删除留言',
};
const targets:Record<string,string>={user:'账号',job:'评测作业',course:'课程',invitation:'邀请码',
  container:'容器',tutor:'AI 辅导',question:'题目',audit:'审计日志',request:'请求',announcement:'全站公告',feedback:'用户留言'};

function AuditTarget({row}: {row:AuditRow}) {
  const title=targets[row.target_type]||row.target_type;
  if (!row.target_id) return <>{title}</>;
  const to=row.target_type==='user'?'/admin/users'+query({profile:row.target_id}):
    row.target_type==='job'?'/admin/submissions'+query({snapshot:row.target_id}):null;
  return <>{title}<small>{to?<Link to={to}>{row.target_id}</Link>:row.target_id}</small></>;
}

export function AdminAudit() {
  const {applied,filters,page,pageSize,setFilter,setPage,apply,reset}=useAdminFilters({action:'',operator:'',keyword:'',from:'',to:''});
  const log=useAdminData<Page<AuditRow>>('/audit'+query({...applied,page,size:pageSize}));
  const [error,setError]=useState('');
  const [exporting,setExporting]=useState(false);
  async function download() {
    setError('');setExporting(true);
    try {await adminDownload('/audit/export'+query(applied),'audit.csv');}
    catch(failure) {setError(message(failure));}
    finally {setExporting(false);}
  }
  return <>
    <div className="admin-heading"><h1>审计日志</h1><div className="admin-tools">
      <button className="csx-btn" type="button" onClick={log.refresh}>刷新日志</button>
      <button className="csx-btn csx-btn-primary" type="button" disabled={exporting} onClick={()=>void download()}>{exporting?'正在导出…':'导出 CSV'}</button>
    </div></div>
    <section className="admin-card admin-list">
      <form className="admin-form admin-filter-bar" onSubmit={event=>{event.preventDefault();apply();}}>
        <label>操作类型<select className="csx-select" value={filters.action} onChange={event=>apply({action:event.target.value})}>
          <option value="">全部类型</option>{Object.entries(actions).map(([value,title])=><option value={value} key={value}>{title}</option>)}
        </select></label>
        <SearchFilter label="操作者" placeholder="按用户名搜索…" value={filters.operator} onChange={event=>setFilter('operator',event.target.value)}/>
        <SearchFilter label="关键词" placeholder="按目标或详情搜索…" value={filters.keyword} onChange={event=>setFilter('keyword',event.target.value)}/>
        <DateFilter label="开始日期" value={filters.from} onChange={event=>setFilter('from',event.target.value)}/>
        <DateFilter label="结束日期（含当日）" value={filters.to} onChange={event=>setFilter('to',event.target.value)}/>
        <button className="csx-btn csx-btn-outline" type="submit">检索</button>
        <button className="csx-btn csx-btn-ghost" type="button" onClick={reset}>重置筛选</button>
      </form>
      {error&&<p role="alert">{error}</p>}
      <DataState loading={!log.data} error={log.error} retry={log.refresh}/>
      {log.data && (log.data.items.length?<TableFrame name="审计记录"><table className="csx-table admin-data-table admin-audit-table">
        <thead><tr><th scope="col">时间</th><th scope="col">操作</th><th scope="col">操作者</th><th scope="col">对象</th><th scope="col">详情</th><th scope="col">IP</th></tr></thead>
        <tbody>{log.data.items.map(row=><tr key={row.id}><td>{formatTime(row.created_at)}</td><th scope="row">{actions[row.action]||row.action}</th>
          <td>{row.username||'系统'}</td><td><AuditTarget row={row}/></td><td>{row.details||'—'}</td><td>{row.ip}</td>
        </tr>)}</tbody>
      </table></TableFrame>:<p className="admin-empty">暂无匹配的审计记录。</p>)}
      {log.data && <Pager data={log.data} setPage={setPage}/>}
    </section>
  </>;
}
