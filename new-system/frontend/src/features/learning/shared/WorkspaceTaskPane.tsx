import {useEffect, useId, useRef, useState, type ReactNode} from 'react';

export function WorkspaceTaskPane({className = '', children}: {className?: string; children: ReactNode}) {
 const id = useId();
 const [folded, setFolded] = useState(false);
 const pane = useRef<HTMLElement>(null);
 const timer = useRef<number|undefined>(undefined);

 useEffect(() => () => window.clearTimeout(timer.current), []);

 function toggle() {
  const layout=pane.current?.parentElement;
  if(layout){
   layout.dataset.taskTransition='true';
   window.clearTimeout(timer.current);
   timer.current=window.setTimeout(()=>{delete layout.dataset.taskTransition},230);
  }
  setFolded(value=>!value);
 }

 return <section ref={pane} className={`workspace-task-pane ${className}`} data-folded={folded} aria-label="任务与教学">
  <button type="button" className="btn button secondary workspace-task-fold" aria-expanded={!folded}
   aria-controls={id} onClick={toggle}>{folded ? '展开任务与教学' : '收起任务与教学'}</button>
  <div className="workspace-task-content" id={id}>{children}</div>
 </section>;
}
