import {useCallback, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode} from 'react';
import {CalendarDays, ChevronLeft, ChevronRight, Ellipsis, Search} from 'lucide-react';
import {useSearchParams} from 'react-router-dom';
import {adminRead, type Page} from '../../api/admin-api';
import {Modal} from '../../components/ui/modal';
import {InlineSpinner,PageSkeleton} from '../../components/shared/LoadingState';
import {useScopedRead} from '../../hooks/useScopedRead';

const number = new Intl.NumberFormat('zh-CN');
const time = new Intl.DateTimeFormat('zh-CN', {dateStyle: 'short', timeStyle: 'short'});
export const formatNumber = (value: number) => number.format(value);
export const formatTime = (value?: string | null) => value ? time.format(new Date(value)) : '—';
export const message = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请重试。';
const stateLabels: Record<string,string> = {
  active: '正常', disabled: '已冻结', ready: '已连接', unavailable: '不可用', not_checked: '待检查',
  queued: '排队中', running: '运行中', cancelling: '正在停止', cancelled: '已取消', awaiting_runner: '等待运行器',
  passed: '通过', compile_error: '编译错误', business_error: '结果不匹配', timed_out: '超时', environment_error: '环境错误',
  timeout: 'SQL超时', sql_error: 'SQL错误', output_limit: '输出超限',
  interrupted: '服务中断', cleanup_failed: '清理失败', executed: '已试运行',
  exited: '已退出', created: '已创建', ROLE_ADMIN: '管理员', ROLE_STUDENT: '学员',
};
export const label = (value: string) => stateLabels[value] || value;

export function Status({value}: {value: string}) {
  const tone = ['passed','active','ready','executed'].includes(value) ? 'success'
    : ['disabled','unavailable','environment_error','compile_error','business_error','sql_error','cleanup_failed'].includes(value) ? 'error'
    : ['queued','awaiting_runner','cancelling','timed_out','timeout','output_limit','interrupted'].includes(value) ? 'warning'
    : value === 'running' ? 'info' : 'neutral';
  return <span className={`csx-badge admin-status admin-status-${tone}`} data-status={value}>
    <span className="admin-status-dot" aria-hidden="true"/>{label(value)}
  </span>;
}

type FilterInputProps = Pick<ComponentProps<'input'>, 'name' | 'value' | 'onChange' | 'maxLength'> & {label: string};

export function SearchFilter({label, placeholder, ...input}: FilterInputProps & {placeholder: string}) {
  return <label className="admin-filter-search">{label}
    <span className="admin-filter-field">
      <Search size={16} aria-hidden="true"/>
      <input {...input} className="csx-input" type="search" placeholder={placeholder} autoComplete="off" spellCheck={false}/>
    </span>
  </label>;
}

export function DateFilter({label, ...input}: FilterInputProps) {
  return <label className="admin-filter-date">{label}
    <span className="admin-filter-field" data-empty={!input.value}>
      <input {...input} className="csx-input" type="date"/>
      <span className="admin-date-placeholder" aria-hidden="true">选择日期</span>
      <CalendarDays size={16} aria-hidden="true"/>
    </span>
  </label>;
}

type RowAction = {label: string; run: () => void; destructive?: boolean};

export function RowActions({subject, children, actions}: {subject: string; children: ReactNode; actions: RowAction[]}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const title = `${subject}的更多操作`;
  return <div className="admin-row-actions">
    {children}
    {actions.length > 0 && <>
      <button ref={trigger} className="csx-btn csx-btn-ghost admin-more" type="button" popoverTarget={id} aria-label={title}>
        <Ellipsis size={18} aria-hidden="true"/>
      </button>
      <div ref={popover} id={id} popover="auto" className="admin-actions-popover" role="group" aria-label={title}>
        {actions.map(action => <button key={action.label} className="csx-btn csx-btn-ghost" type="button" data-destructive={action.destructive || undefined} onClick={() => {
          popover.current?.hidePopover();
          trigger.current?.focus();
          action.run();
        }}>{action.label}</button>)}
      </div>
    </>}
  </div>;
}

export function useAdminData<T>(path: string | null, interval = 0) {
  const request = useCallback(() => adminRead<T>(path!), [path]);
  const {data,error,reload} = useScopedRead(path === null ? null : '/admin' + path, request, {interval});
  return {data: data ?? undefined, error: error || undefined, refresh: reload};
}

export function useAdminFilters<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();
  const applied = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, params.get(key) ?? value])) as T;
  const filterKey = JSON.stringify(applied);
  const [draft, setDraft] = useState({key: filterKey, values: applied});
  if (draft.key !== filterKey) setDraft({key: filterKey, values: applied});
  const filters = draft.key === filterKey ? draft.values : applied;
  const requestedPage = Number(params.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 1000) : 1;

  function update(values: Record<string,string>) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      for (const [key,value] of Object.entries(values)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
  }

  function apply(extra: Record<string,string> = {}) {
    const values = Object.fromEntries(Object.entries(filters).map(([key,value]) => [key,value.trim()]));
    update({...values, ...extra, page: ''});
  }

  return {params, applied, filters, page, apply,
    setFilter: (key: keyof T, value: string) => setDraft({key: filterKey, values: {...filters, [key]: value}}),
    setPage: (value: number) => update({page: value > 1 ? String(value) : ''}),
  };
}

export function DataState({loading, error, retry, variant = 'table'}: {loading: boolean; error?: string; retry?: () => void; variant?: ComponentProps<typeof PageSkeleton>['variant']}) {
  if (error) return <div className="csx-alert csx-alert-error" role="alert"><span>{error}</span>{retry && <button className="csx-btn" type="button" onClick={retry}>重试</button>}</div>;
  return loading ? <PageSkeleton className="admin-empty" variant={variant} label="正在读取…"/> : null;
}

export function TableFrame({name, children}: {name: string; children: ReactNode}) {
  return <div className="admin-table-frame" role="region" aria-label={name} tabIndex={0}>{children}</div>;
}

export function Pager<T>({data, setPage}: {data: Page<T>; setPage: (page: number) => void}) {
  const last = Math.max(1, Math.ceil(data.total / data.size));
  return <nav className="admin-pager" aria-label="分页">
    <span className="admin-pager-count">共 {formatNumber(data.total)} 条记录 · 第 {data.page}/{last} 页</span>
    <div className="admin-pager-buttons">
      <button className="csx-btn csx-btn-outline" type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeft size={14} aria-hidden="true"/>上一页</button>
      <button className="csx-btn csx-btn-outline" type="button" disabled={data.page >= last} onClick={() => setPage(data.page + 1)}>下一页<ChevronRight size={14} aria-hidden="true"/></button>
    </div>
  </nav>;
}

export type Confirmation = {title: string; description: string; confirmLabel?: string; action: () => Promise<void>};
export function ConfirmAction({confirmation, onClose}: {confirmation: Confirmation | null; onClose: () => void}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!confirmation) return null;
  async function confirm() {
    setBusy(true);
    setError('');
    try { await confirmation!.action(); onClose(); }
    catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }
  return <Modal open title={confirmation.title} description={confirmation.description} className="admin-dialog" onOpenChange={open => {if (!open && !busy) onClose();}}>
    {error && <p role="alert" className="csx-alert csx-alert-error">{error}</p>}
    <div className="admin-tools">
      <button className="csx-btn" type="button" disabled={busy} onClick={onClose}>取消</button>
      <button className="csx-btn csx-btn-error" type="button" disabled={busy} onClick={() => void confirm()}><InlineSpinner active={busy}/>{busy ? '正在处理…' : confirmation.confirmLabel ?? '确认执行'}</button>
    </div>
  </Modal>;
}
