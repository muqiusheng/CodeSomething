import {ChevronDown, Maximize2, Minimize2} from 'lucide-react';
import {createContext, useId, useRef, useState, type CSSProperties, type ReactNode, type Ref} from 'react';
import {localState} from '../../api/browser-state.mjs';

export const ExpandedResults = createContext(false);

export function useWorkbenchSplit(name: string, initial: number, min: number, max: number) {
  const key = 'cs-sql-split-' + name;
  const clamp = (value: number) => Math.round(Math.max(min, Math.min(max, value)) * 10) / 10;
  const [value, setValue] = useState(() => {
    try {
      const saved = Number(localState.getItem(key) ?? initial);
      return Number.isFinite(saved) ? clamp(saved) : initial;
    } catch { return initial; }
  });
  function save(next: number) {
    try { localState.setItem(key, String(next)); } catch { /* Resize still works in this tab. */ }
  }
  return {value, setValue, save, clamp, min, max};
}

type Split = ReturnType<typeof useWorkbenchSplit>;

export function splitStyle(values: Record<string, number>): CSSProperties {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => ['--' + name, `${value}fr`])) as CSSProperties;
}

export function WorkbenchResizer({split, axis, label}: {split: Split; axis: 'x' | 'y'; label: string}) {
  const drag = useRef<{id: number; from: number; value: number; next: number; size: number}>(null);
  const horizontal = axis === 'x';
  function finish(id: number) {
    if (drag.current?.id !== id) return;
    split.save(drag.current.next);
    drag.current = null;
  }
  return <div className="workbench-resizer" data-axis={axis} role="separator" tabIndex={0}
    aria-label={label} aria-orientation={horizontal ? 'vertical' : 'horizontal'}
    aria-valuemin={split.min} aria-valuemax={split.max} aria-valuenow={split.value} aria-valuetext={split.value + '%'}
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary) return;
      const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
      const size = horizontal ? bounds?.width : bounds?.height;
      if (!size) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {id: event.pointerId, from: horizontal ? event.clientX : event.clientY,
        value: split.value, next: split.value, size};
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      const position = horizontal ? event.clientX : event.clientY;
      current.next = split.clamp(current.value + (position - current.from) / current.size * 100);
      split.setValue(current.next);
    }}
    onPointerUp={event => finish(event.pointerId)}
    onLostPointerCapture={event => finish(event.pointerId)}
    onKeyDown={event => {
      const decrease = horizontal ? 'ArrowLeft' : 'ArrowUp';
      const increase = horizontal ? 'ArrowRight' : 'ArrowDown';
      if (![decrease, increase, 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? split.min : event.key === 'End' ? split.max
        : split.clamp(split.value + (event.key === decrease ? -2 : 2));
      split.setValue(next);
      split.save(next);
    }}/>;
}

export function WorkbenchMenu({children}: {children: ReactNode}) {
  function close(menu: HTMLDetailsElement) {
    menu.open = false;
    menu.querySelector('summary')?.focus();
  }
  return <details className="exam-debug-more dropdown dropdown-end"
    onToggle={event => {
      const menu = event.currentTarget;
      if (!menu.open) return;
      const content = menu.querySelector<HTMLElement>('.exam-debug-menu');
      if (content && menu.getBoundingClientRect().bottom + content.offsetHeight + 8 > window.innerHeight)
        menu.dataset.placement = 'above';
      else delete menu.dataset.placement;
    }}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }}
    onKeyDown={event => {
      if (event.key !== 'Escape' || !event.currentTarget.open) return;
      event.stopPropagation();
      close(event.currentTarget);
    }}>
    <summary className="btn btn-ghost sql-practice-quiet">更多 <ChevronDown size={14} aria-hidden="true"/></summary>
    <div className="exam-debug-menu dropdown-content" onClick={event => {
      const button = (event.target as Element).closest('button');
      const menu = event.currentTarget.closest('details');
      if (button && !button.disabled && menu) close(menu);
    }}>{children}</div>
  </details>;
}

export function WorkbenchResults({title, children, scrollRef, className = ''}: {
  title: string; children: ReactNode; scrollRef: Ref<HTMLElement>; className?: string;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  function restore() {
    dialog.current?.close();
    setExpanded(false);
    toggle.current?.focus();
  }
  return <div className={`sql-practice-results ${className}`}>
    <dialog ref={dialog} className="workbench-results-dialog" role={expanded ? 'dialog' : 'region'}
      aria-labelledby={titleId} aria-modal={expanded || undefined} onCancel={event => {event.preventDefault(); restore();}} onClose={() => setExpanded(false)}>
      <header className="workbench-results-header">
        <h2 id={titleId}>{title}</h2>
        <button ref={toggle} type="button" className="btn btn-ghost btn-sm" aria-expanded={expanded}
          onClick={() => {
            if (expanded) restore();
            else { dialog.current?.showModal(); setExpanded(true); }
          }}>
          {expanded ? <Minimize2 size={15} aria-hidden="true"/> : <Maximize2 size={15} aria-hidden="true"/>}
          {expanded ? '还原结果区' : '放大查看'}
        </button>
      </header>
      <section ref={scrollRef} className="workbench-results-body" aria-label="SQL 结果内容" tabIndex={0}>
        <ExpandedResults.Provider value={expanded}>{children}</ExpandedResults.Provider>
      </section>
    </dialog>
  </div>;
}
