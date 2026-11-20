import {FolderTree} from 'lucide-react';
import {useCallback, useEffect, useId, useRef, useState, type ReactNode} from 'react';

export function ProjectFileDrawer({children, directory, trigger, editor}: {
 children: ReactNode;
 editor: (toggle: ReactNode) => ReactNode;
 directory: React.RefObject<HTMLElement | null>;
 trigger: React.RefObject<HTMLButtonElement | null>;
}) {
 const id = useId();
 const host = useRef<HTMLElement>(null);
 const [wide, setWide] = useState(false);
 const [preference, setPreference] = useState<boolean>();
 const open = preference ?? wide;

 useEffect(() => {
  const container = host.current?.parentElement;
  if (!container) return;
  const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 920));
  observer.observe(container);
  const media = matchMedia('(width <= 640px)');
  const sync = () => {if(media.matches)setPreference(false)};
  media.addEventListener('change', sync);
  return () => {
   observer.disconnect();
   media.removeEventListener('change', sync);
  };
 }, []);

 const close = useCallback((restoreFocus = false) => {
  setPreference(false);
  if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus({preventScroll:true}));
 }, [trigger]);

 useEffect(() => {
  if (!open) return;
  const onEscape = (event: KeyboardEvent) => {
   if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('.modal-content, dialog:modal')) return;
   close(!!host.current?.contains(document.activeElement));
  };
  const outside = (event: PointerEvent) => {
   if (event.target instanceof Node && !host.current?.contains(event.target) && !trigger.current?.contains(event.target)) close();
  };
  window.addEventListener('keydown', onEscape);
  if (!wide) document.addEventListener('pointerdown', outside, true);
  return () => {
   window.removeEventListener('keydown', onEscape);
   document.removeEventListener('pointerdown', outside, true);
  };
 }, [close, open, trigger, wide]);

 const toggle = <button ref={trigger} className="btn button secondary project-tree-trigger" type="button"
  aria-controls={id} aria-expanded={open} onClick={event => {
   setPreference(!open);
   if (!open && event.detail === 0) requestAnimationFrame(() => directory.current?.focus({preventScroll:true}));
  }} title="项目文件" aria-label="项目文件"><FolderTree size={17} aria-hidden="true"/></button>;

 return <>
  <section ref={host} id={id} className="project-file-drawer" data-open={open} data-wide={wide}
   inert={!open} aria-label="项目文件">
   <header className="project-tree-heading"><strong>项目文件</strong></header>
   <nav ref={directory} className="folder-file-directory" aria-label="项目文件目录" tabIndex={-1}
    onClick={event => {if (!wide && (event.target as Element).closest('.project-file-row button')) close(event.detail===0)}}>{children}</nav>
  </section>
  {editor(toggle)}
 </>;
}
