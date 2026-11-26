import type {LucideIcon} from 'lucide-react';
import type {ReactNode} from 'react';

type Metric = {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: 'primary' | 'success' | 'info' | 'warning';
  ratio?: number | null;
  chart?: 'bar' | 'ring';
};

export function AdminSummaryMetric({label, value, icon: Icon, tone = 'primary', ratio, chart}: Metric) {
  const percent = ratio != null && Number.isFinite(ratio) ? Math.min(100, Math.max(0, ratio * 100)) : null;
  return <div className="admin-metric" data-tone={tone}>
    <dt><span className="admin-metric-icon"><Icon size={16} aria-hidden="true"/></span>{label}</dt>
    <dd>
      <span>{value}</span>
      {chart === 'bar' && percent !== null && <progress className="csx-progress admin-metric-bar"
        value={percent} max={100} aria-label={label + '占比'}/>}
      {chart === 'ring' && percent !== null && <svg className="admin-metric-ring" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" className="admin-metric-track"/>
        {percent > 0 && <circle cx="12" cy="12" r="9" fill="none" pathLength="100"
          strokeDasharray={percent + ' 100'} strokeLinecap="round" transform="rotate(-90 12 12)"/>}
      </svg>}
    </dd>
  </div>;
}
