import {useRef, useState} from 'react';
import {Activity, CheckCircle2, ClipboardList, Layers3, ShieldCheck, UsersRound} from 'lucide-react';
import {query} from '../../api/admin-api';
import {DataState, Pager, Status, formatNumber, formatTime, label, useAdminData} from './admin-controls';

type Overview = {registered: number; administrators: number; activeToday: number; submissions: number; passRate: number | null; pending: number; errors: Record<string,number>};
type Point = {time: string; submissions: number; active: number};
export type Health = {docker: {status: string; version?: string; latencyMs?: number}; database: {bytes: number; walBytes: number; journalMode: string}; diskFreeBytes: number; mysqlPoolLimit: number; tutor: {status: string; message?: string; latencyMs?: string; recentErrors?: number}};
export const size = (bytes: number) => bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(2) + ' GiB' : (bytes / 1024 ** 2).toFixed(2) + ' MiB';

export function AdminOverview() {
  const [hours, setHours] = useState(24);
  const overview = useAdminData<Overview>('/analytics/overview', 20000);
  const health = useAdminData<Health>('/system/health', 30000);
  const timeline = useAdminData<Point[]>('/analytics/activity-timeline' + query({hours}), 30000);
  const data = overview.data;
  const metrics = data ? [
    {label: '注册学员', value: formatNumber(data.registered), icon: UsersRound},
    {label: '管理员', value: formatNumber(data.administrators), icon: ShieldCheck},
    {label: '今日活跃学员', value: formatNumber(data.activeToday), icon: Activity},
    {label: '全站提交', value: formatNumber(data.submissions), icon: ClipboardList},
    {label: '判题通过率', value: data.passRate == null ? '—' : (data.passRate * 100).toFixed(1) + '%', icon: CheckCircle2},
    {label: '待完成作业', value: formatNumber(data.pending), icon: Layers3},
  ] : [];
  return <>
    <div className="admin-heading"><h1>概览</h1><button className="csx-btn" type="button" onClick={() => {overview.refresh();health.refresh();timeline.refresh();}}>刷新数据</button></div>
    <DataState loading={!data} error={overview.error} retry={overview.refresh}/>
    {data && <dl className="admin-metrics">
      {metrics.map(({label: title, value, icon: Icon}) => <div key={title}><dt><Icon size={17} aria-hidden="true"/>{title}</dt><dd>{value}</dd></div>)}
    </dl>}
    <div className="admin-overview-grid">
      <section className="admin-card">
        <div className="admin-section-heading"><h2>提交趋势</h2><label>时间范围 <select className="csx-select csx-select-sm" value={hours} onChange={event => setHours(Number(event.target.value))}><option value={24}>近24小时</option><option value={168}>近7天</option></select></label></div>
        <DataState loading={!timeline.data} error={timeline.error} retry={timeline.refresh}/>
        {timeline.data && <SubmissionChart key={hours} points={timeline.data}/>}
      </section>
      <section className="admin-card"><h2>判题失败分布</h2>
        {data && Object.keys(data.errors).length > 0 ? <dl className="admin-facts">
          {Object.entries(data.errors).sort((a,b)=>b[1]-a[1]).map(([reason,count]) => <div key={reason}><dt>{label(reason)}</dt><dd>{formatNumber(count)}</dd></div>)}
        </dl> : <p className="admin-empty">{data ? '暂无判题失败记录。' : '等待读取统计。'}</p>}
      </section>
    </div>
    <section className="admin-card"><h2>系统健康</h2><DataState loading={!health.data} error={health.error} retry={health.refresh}/>
      {health.data && <dl className="admin-facts admin-health"><div><dt>Docker</dt><dd><Status value={health.data.docker.status}/></dd></div><div><dt>SQLite 数据</dt><dd>{size(health.data.database.bytes)}</dd></div><div><dt>SQLite WAL</dt><dd>{health.data.database.journalMode.toUpperCase()} · {size(health.data.database.walBytes)}</dd></div><div><dt>可用磁盘</dt><dd>{size(health.data.diskFreeBytes)}</dd></div></dl>}
    </section>
  </>;
}


function SubmissionChart({points}: {points: Point[]}) {
  const bars = useRef<Array<HTMLButtonElement | null>>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const max = Math.max(0, ...points.map(point => point.submissions));
  const ceiling = Math.max(2, Math.ceil(max / 2) * 2);
  const active = hover ?? focused ?? selected;
  const point = active == null ? undefined : points[active];
  const pageSize = 12;
  const visible = points.slice((page-1)*pageSize,page*pageSize);
  return <>
    <div className="admin-chart">
      <div className="admin-chart-readout">
        {point ? <div className="admin-chart-tooltip" role="tooltip" id="submission-tooltip">
          <strong>{formatTime(point.time)}</strong><span>提交 {formatNumber(point.submissions)} · 活跃学员 {formatNumber(point.active)}</span>
        </div> : <span>{max===0 ? '此时段没有提交' : '提交次数 / 小时'}</span>}
      </div>
      <div className="admin-chart-ticks" aria-hidden="true"><span>{formatNumber(ceiling)}</span><span>{formatNumber(ceiling/2)}</span><span>0</span></div>
      <div className="admin-chart-grid" aria-hidden="true"><i/><i/><i/></div>
      <div className="admin-chart-scroller" role="group" aria-label="各小时提交量，使用左右方向键查看">
        <div className="admin-chart-bars" style={{gridTemplateColumns:`repeat(${points.length},minmax(8px,1fr))`}}>
          {points.map((item,index) => <button key={item.time} type="button" className="admin-chart-bar"
            aria-label={`${formatTime(item.time)}，提交 ${item.submissions}，活跃学员 ${item.active}`}
            aria-pressed={selected===index} data-active={active===index}
            tabIndex={index===(focused ?? selected ?? 0) ? 0 : -1}
            ref={element=>{bars.current[index]=element;}}
            onPointerEnter={event=>{if(event.pointerType!=='touch')setHover(index);}}
            onPointerLeave={()=>setHover(null)}
            onFocus={()=>setFocused(index)}
            onBlur={()=>setFocused(null)}
            onClick={()=>setSelected(current=>current===index ? null : index)}
            onKeyDown={event=>{
              if(event.key==='Escape') {setSelected(null);setHover(null);setFocused(null);return;}
              const delta = event.key==='ArrowLeft' ? -1 : event.key==='ArrowRight' ? 1 : 0;
              if(delta) {event.preventDefault();bars.current[index+delta]?.focus();}
            }}>
            <span hidden={!item.submissions} style={{height:`${item.submissions * 100 / ceiling}%`}}/>
          </button>)}
        </div>
      </div>
    </div>
    <div className="admin-axis"><span>{formatTime(points[0]?.time)}</span><span>{formatTime(points.at(-1)?.time)}</span></div>
    <details className="admin-chart-data"><summary>查看每小时数据</summary>
      <div className="admin-timeline-table">
        <table className="csx-table"><thead><tr><th scope="col">时间</th><th scope="col">提交数</th><th scope="col">活跃学员</th></tr></thead><tbody>
          {visible.map(item => <tr key={item.time}><td>{formatTime(item.time)}</td><td>{item.submissions}</td><td>{item.active}</td></tr>)}
        </tbody></table>
      </div>
      <Pager data={{items:visible,page,size:pageSize,total:points.length}} setPage={setPage}/>
    </details>
  </>;
}
