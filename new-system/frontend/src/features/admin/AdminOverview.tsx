import {useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  GraduationCap,
  Megaphone,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import {query} from '../../api/admin-api';
import {PageSkeleton} from '../../components/shared/LoadingState';
import {DataState, Pager, Status, formatNumber, formatTime, useAdminData} from './admin-controls';
import {percent, type Mistake, type Paper} from './AdminSchool';

export type Overview = {
  registered: number;
  activeToday: number;
  active7Days: number;
  active30Days: number;
  newToday: number;
  schoolCompleted: number;
  examCount: number;
  examDraftCount: number;
  examAverage: number | null;
  examPassRate: number | null;
  bookmarkCount: number;
  submissions: number;
  passRate: number | null;
  pending: number;
  pendingFeedback?: number;
  publishedAnnouncements?: number;
  errors: Record<string, number>;
  labFunnel: {courseId: string; labId: string; title: string; started: number; completed: number}[];
  papers: Paper[];
  mistakes: Mistake[];
  bookmarks: {category: string; id: string; title: string; href: string; bookmarks: number}[];
  tutor: {total: number; succeeded: number; failed: number; learners: number};
};

const series = [
  ['submissions', '课外提交'],
  ['school', '课内判分与交卷'],
  ['active', '活跃学员'],
  ['registrations', '新增注册'],
] as const;

type Point = {time: string} & Record<(typeof series)[number][0], number>;

export type Health = {
  docker: {status: string; version?: string; latencyMs?: number};
  database: {bytes: number; walBytes: number; journalMode: string};
  diskFreeBytes: number;
  mysqlPoolLimit: number;
  mysqlPool?: {active: number; normal: number; peak: number; idleMinutes: number};
  tutor: {status: string; message?: string; latencyMs?: string; recentErrors?: number};
};

export const size = (bytes: number) => bytes >= 1024 ** 3
  ? (bytes / 1024 ** 3).toFixed(2) + ' GiB'
  : (bytes / 1024 ** 2).toFixed(2) + ' MiB';

export function AdminOverview() {
  const [hours, setHours] = useState(24);
  const overview = useAdminData<Overview>('/analytics/overview', 20000);
  const health = useAdminData<Health>('/system/health', 30000);
  const timeline = useAdminData<Point[]>('/analytics/activity-timeline' + query({hours}), 30000);
  const data = overview.data;
  const pool = health.data?.mysqlPool;
  const pendingFeedback = data?.pendingFeedback ?? 0;
  const publishedAnnouncements = data?.publishedAnnouncements ?? 0;

  return <>
    <section className="admin-hero-panel" aria-label="控制台总览">
      <div className="admin-hero-top">
        <div className="admin-hero-copy">
          <div className="admin-hero-badges">
            <span className="admin-hero-eyebrow"><Sparkles size={13} aria-hidden="true"/>运营总览</span>
            {health.data && <Status value={health.data.docker.status}/>}
          </div>
          <h1>管理控制台</h1>
          <p>聚焦核心活跃、课内推进与待办事项；各模块明细统计已归位至对应板块。</p>
        </div>
        <div className="admin-tools admin-hero-actions">
          <Link className="csx-btn csx-btn-primary" to="/admin/community?tab=announcements">
            <Megaphone size={15} aria-hidden="true"/>发布全站公告
          </Link>
          <Link className="csx-btn" to="/admin/community?tab=feedback">
            <MessageSquareText size={15} aria-hidden="true"/>用户留言板
            {pendingFeedback > 0 && <span className="admin-tab-pill">{pendingFeedback}</span>}
          </Link>
          <button className="csx-btn csx-btn-ghost" type="button" onClick={() => {overview.refresh(); health.refresh(); timeline.refresh();}}>
            <RefreshCw size={15} aria-hidden="true"/>刷新
          </button>
        </div>
      </div>

      <DataState loading={!data} error={overview.error} retry={overview.refresh} variant="inline"/>

      {data && (
        <dl className="admin-stat-strip" aria-label="全站核心指标">
          <div className="admin-stat-item">
            <dt><UsersRound size={15} className="tone-primary" aria-hidden="true"/>注册学员</dt>
            <dd>{formatNumber(data.registered)}</dd>
            <span className="admin-stat-sub">今日新增 {formatNumber(data.newToday ?? 0)} · 今日活跃 {formatNumber(data.activeToday)}</span>
          </div>
          <div className="admin-stat-item">
            <dt><GraduationCap size={15} className="tone-success" aria-hidden="true"/>课内实验通关</dt>
            <dd>{formatNumber(data.schoolCompleted ?? 0)}</dd>
            <span className="admin-stat-sub">模考 {formatNumber(data.examCount ?? 0)} 次 · 及格率 {percent(data.examPassRate)}</span>
          </div>
          <div className="admin-stat-item">
            <dt><MessageSquareText size={15} className="tone-warning" aria-hidden="true"/>待处理留言</dt>
            <dd>{formatNumber(pendingFeedback)}</dd>
            <span className="admin-stat-sub">在线公告 {formatNumber(publishedAnnouncements)} 条</span>
          </div>
          <div className="admin-stat-item">
            <dt><Activity size={15} className="tone-info" aria-hidden="true"/>待完成作业</dt>
            <dd>{formatNumber(data.pending)}</dd>
            <span className="admin-stat-sub">课外提交 {formatNumber(data.submissions)} · 通过率 {percent(data.passRate)}</span>
          </div>
        </dl>
      )}
    </section>

    <div className="admin-overview-grid">
      <section className="admin-card">
        <div className="admin-section-heading">
          <h2>学习活动趋势</h2>
          <label>时间范围 <select className="csx-select csx-select-sm" value={hours} onChange={event => setHours(Number(event.target.value))}>
            <option value={24}>近24小时</option><option value={168}>近7天</option><option value={720}>近30天</option>
          </select></label>
        </div>
        <ul className="admin-chart-legend">{series.map(([key, name]) => <li key={key}><i data-series={key} aria-hidden="true"/>{name}</li>)}</ul>
        <DataState loading={!timeline.data} error={timeline.error} retry={timeline.refresh} variant="inline"/>
        {timeline.data && <SubmissionChart key={hours} points={timeline.data}/>}
      </section>

      <section className="admin-card admin-side-summary">
        <div className="admin-section-heading">
          <h2>系统健康</h2>
          <Link className="admin-section-link" to="/admin/runners">运行环境<ArrowRight size={14} aria-hidden="true"/></Link>
        </div>
        <DataState loading={!health.data} error={health.error} retry={health.refresh} variant="inline"/>
        {health.data && <dl className="admin-facts">
          <div><dt>Docker 引擎</dt><dd><Status value={health.data.docker.status}/></dd></div>
          <div><dt>MySQL 练习池</dt><dd>{pool?.peak === 0 ? '未启用' : !pool || pool.active < 0 ? '待检测' : `${pool.active} / ${pool.peak}`}</dd></div>
          <div><dt>AI 辅导</dt><dd><Status value={health.data.tutor.status}/></dd></div>
          <div><dt>SQLite / WAL</dt><dd>{size(health.data.database.bytes)} · {size(health.data.database.walBytes)}</dd></div>
          <div><dt>可用磁盘</dt><dd>{size(health.data.diskFreeBytes)}</dd></div>
        </dl>}

        {data && <>
          <div className="admin-divider"/>
          <div className="admin-section-heading">
            <h2>快捷前往</h2>
          </div>
          <div className="admin-quick-links">
            <Link to="/admin/users?role=ROLE_STUDENT"><span>用户管理</span><small>7日活跃 {formatNumber(data.active7Days ?? 0)} · 30日 {formatNumber(data.active30Days ?? 0)}</small><ArrowRight size={14} aria-hidden="true"/></Link>
            <Link to="/admin/school"><span>课内实验与备考</span><small>草稿 {formatNumber(data.examDraftCount ?? 0)} · 收藏 {formatNumber(data.bookmarkCount ?? 0)}</small><ArrowRight size={14} aria-hidden="true"/></Link>
            <Link to="/admin/submissions"><span>评测作业队列</span><small>总提交 {formatNumber(data.submissions)} · 待完成 {formatNumber(data.pending)}</small><ArrowRight size={14} aria-hidden="true"/></Link>
          </div>
        </>}
      </section>
    </div>

    {data && <div className="admin-overview-grid">
      <section className="admin-card">
        <div className="admin-section-heading">
          <h2>课内实验推进</h2>
          <Link className="admin-section-link" to="/admin/school">进入课内实验<ArrowRight size={14} aria-hidden="true"/></Link>
        </div>
        {data.labFunnel?.length ? (
          <ul className="admin-funnel-list">
            {data.labFunnel.map(lab => {
              const ratio = lab.started > 0 ? Math.round((lab.completed / lab.started) * 100) : 0;
              return <li key={lab.courseId + '/' + lab.labId}>
                <div className="admin-funnel-head">
                  <strong>{lab.title}</strong>
                  <span>通关 {lab.completed} / 开做 {lab.started}（{ratio}%）</span>
                </div>
                <div className="admin-bar-track" aria-hidden="true"><span style={{width: `${ratio}%`}}/></div>
              </li>;
            })}
          </ul>
        ) : <p className="admin-empty">暂无实验记录。</p>}
      </section>

      <section className="admin-card" id="popular-bookmarks">
        <div className="admin-section-heading">
          <h2>热门收藏 Top 5</h2>
          <Link className="admin-section-link" to="/admin/school?tab=exams">备考与错题<ArrowRight size={14} aria-hidden="true"/></Link>
        </div>
        {data.bookmarks?.length ? <ol className="admin-rank-list">{data.bookmarks.slice(0, 5).map((row, index) => <li key={row.category + '/' + row.id}>
          <span className="admin-rank-num" data-top={index < 3 ? index + 1 : undefined}>{index + 1}</span>
          <div className="admin-rank-copy"><strong>{row.title}</strong><small>{row.category === 'school' ? '课内必学' : '课外拓展'}</small></div>
          <span className="admin-count-chip">{row.bookmarks}</span>
        </li>)}</ol> : <p className="admin-empty">暂无收藏记录。</p>}
      </section>
    </div>}
  </>;
}

function SubmissionChart({points}: {points: Point[]}) {
  const bars = useRef<Array<HTMLButtonElement | null>>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const max = Math.max(0, ...points.flatMap(point => series.map(([key]) => point[key] ?? 0)));
  const ceiling = Math.max(2, Math.ceil(max / 2) * 2);
  const active = hover ?? focused ?? selected;
  const point = active == null ? undefined : points[active];
  const pageSize = 12;
  const visible = points.slice((page - 1) * pageSize, page * pageSize);
  return <>
    <div className="admin-chart">
      <div className="admin-chart-readout">
        {point ? <div className="admin-chart-tooltip" role="tooltip" id="submission-tooltip">
          <strong>{formatTime(point.time)}</strong><span>{series.map(([key, name]) => name + ' ' + formatNumber(point[key] ?? 0)).join(' · ')}</span>
        </div> : <span>{max === 0 ? '此时段暂无活动' : '选择柱组查看明细'}</span>}
      </div>
      <div className="admin-chart-ticks" aria-hidden="true"><span>{formatNumber(ceiling)}</span><span>{formatNumber(ceiling / 2)}</span><span>0</span></div>
      <div className="admin-chart-grid" aria-hidden="true"><i/><i/><i/></div>
      <div className="admin-chart-scroller" role="group" aria-label="活动趋势，使用左右方向键查看">
        <div className="admin-chart-bars" style={{gridTemplateColumns: `repeat(${points.length},minmax(22px,1fr))`}}>
          {points.map((item, index) => <button key={item.time} type="button" className="admin-chart-bar"
            aria-label={`${formatTime(item.time)}，${series.map(([key, name]) => name + ' ' + (item[key] ?? 0)).join('，')}`}
            aria-pressed={selected === index} data-active={active === index}
            tabIndex={index === (focused ?? selected ?? 0) ? 0 : -1}
            ref={element => {bars.current[index] = element;}}
            onPointerEnter={event => {if (event.pointerType !== 'touch') setHover(index);}}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setFocused(index)}
            onBlur={() => setFocused(null)}
            onClick={() => setSelected(current => current === index ? null : index)}
            onKeyDown={event => {
              if (event.key === 'Escape') {setSelected(null); setHover(null); setFocused(null); return;}
              const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
              if (delta) {event.preventDefault(); bars.current[index + delta]?.focus();}
            }}>
            {series.map(([key]) => <span key={key} data-series={key} style={{height: `${(item[key] ?? 0) * 100 / ceiling}%`}}/>)}
          </button>)}
        </div>
      </div>
    </div>
    <div className="admin-axis"><span>{formatTime(points[0]?.time)}</span><span>{formatTime(points.at(-1)?.time)}</span></div>
    <details className="admin-chart-data"><summary>查看趋势数据</summary>
      <div className="admin-timeline-table">
        <table className="csx-table"><thead><tr><th scope="col">时间</th>{series.map(([key, name]) => <th scope="col" key={key}>{name}</th>)}</tr></thead><tbody>
          {visible.map(item => <tr key={item.time}><td>{formatTime(item.time)}</td>{series.map(([key]) => <td key={key}>{item[key] ?? 0}</td>)}</tr>)}
        </tbody></table>
      </div>
      <Pager data={{items: visible, page, size: pageSize, total: points.length}} setPage={setPage}/>
    </details>
  </>;
}
