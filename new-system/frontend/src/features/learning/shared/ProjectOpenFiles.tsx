import {useEffect, useRef, type ReactNode} from 'react';

export function ProjectOpenFiles({children, activePath, trigger}: {trigger: ReactNode; children: ReactNode; activePath: string}) {
 const ref = useRef<HTMLDivElement>(null);
 const track = useRef<HTMLDivElement>(null);
 const edge = useRef<HTMLDivElement>(null);
 const wheelTarget = useRef<number|undefined>(undefined);
 const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';

 useEffect(() => {
  const node = ref.current;
  if (!node || !track.current) return;
  const update = () => {
   if(edge.current)edge.current.dataset.more = String(node.scrollLeft + node.clientWidth < node.scrollWidth - 2);
  };
  const resetWheel = () => {wheelTarget.current = undefined};
  const wheel = (event: WheelEvent) => {
   if (event.ctrlKey || event.shiftKey || !event.deltaY || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
   const max = node.scrollWidth - node.clientWidth;
   if(max <= 1 || (event.deltaY < 0 ? node.scrollLeft <= 0 : node.scrollLeft >= max - 1)) return;
   event.preventDefault();
   const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 24 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? node.clientWidth : 1;
   wheelTarget.current = Math.max(0, Math.min(max, (wheelTarget.current ?? node.scrollLeft) + event.deltaY * multiplier));
   node.scrollTo({left:wheelTarget.current, behavior:reduceMotion()?'instant':'smooth'});
  };
  const observer = new ResizeObserver(update);
  observer.observe(node);
  observer.observe(track.current);
  node.addEventListener('scroll', update, {passive: true});
  node.addEventListener('scrollend', resetWheel);
  node.addEventListener('wheel', wheel, {passive:false});
  return () => {
   observer.disconnect();
   node.removeEventListener('scroll', update);
   node.removeEventListener('scrollend', resetWheel);
   node.removeEventListener('wheel', wheel);
  };
 }, []);
 useEffect(() => {
  const node = ref.current;
  const selected = track.current?.querySelector('.project-open-tab[data-active="true"]');
  if (!activePath || !node || !selected) return;
  const bounds = node.getBoundingClientRect();
  const tab = selected.getBoundingClientRect();
  if(tab.left>=bounds.left&&tab.right<=bounds.right-24)return;
  wheelTarget.current=undefined;
  node.scrollTo({left:node.scrollLeft + tab.left-bounds.left-(bounds.width-tab.width)/2, behavior:reduceMotion()?'instant':'smooth'});
 }, [activePath]);
 return <>{trigger}<div className="project-tab-strip" ref={edge}>
  <div ref={ref} className="project-open-files" role="group" aria-label="已打开文件">
   <div className="project-tab-track" ref={track}>{children}</div>
  </div>
 </div></>;
}
