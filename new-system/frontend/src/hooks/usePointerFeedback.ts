import {useEffect} from 'react';

/** Shared pointer renderer: writes CSS variables once per animation frame, without React renders. */
export function usePointerFeedback(){useEffect(()=>{
 const fine=matchMedia('(hover: hover) and (pointer: fine)');const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let frame=0;let latest:PointerEvent|null=null;let tracked=new Set<HTMLElement>();
 const enabled=()=>fine.matches&&!reduced.matches&&document.documentElement.dataset.motion!=='reduce';
 const clearElement=(node:HTMLElement)=>{delete node.dataset.pointerActive;for(const key of ['--fx-x','--fx-y','--mag-x','--mag-y','--tilt-x','--tilt-y'])node.style.removeProperty(key)};
 const reset=()=>{if(frame)cancelAnimationFrame(frame);frame=0;latest=null;tracked.forEach(clearElement);tracked.clear()};
 const paint=()=>{frame=0;const event=latest;if(!event||!enabled()){reset();return}const target=event.target instanceof Element?event.target:null;if(!target)return;if(target.closest('.folder-project-workspace,.code-editor-shell,.workspace-task-pane,.browser-workspace,.workspace-divider')){reset();return}
  const surfaces:HTMLElement[]=[];let node=target.closest<HTMLElement>('[data-pointer-surface=tilt]');while(node){surfaces.push(node);node=node.parentElement?.closest<HTMLElement>('[data-pointer-surface=tilt]')||null}
  const button=target.closest<HTMLElement>('.button,.tactile-button,.quick-trigger,.favorite-button,.layout-toggle button');if(button&&!button.matches(':disabled'))surfaces.push(button);
  // Read geometry before writing styles. The clickable boxes stay in place.
  const measurements=surfaces.filter(item=>item.isConnected).map(item=>({item,rect:item.getBoundingClientRect()}));
  const next=new Set(measurements.map(({item})=>item));
  tracked.forEach(item=>{if(!next.has(item))clearElement(item)});
  for(const {item,rect} of measurements){const x=Math.max(0,Math.min(rect.width,event.clientX-rect.left));const y=Math.max(0,Math.min(rect.height,event.clientY-rect.top));const dx=rect.width?x/rect.width*2-1:0;const dy=rect.height?y/rect.height*2-1:0;
   item.style.setProperty('--fx-x',`${x.toFixed(1)}px`);item.style.setProperty('--fx-y',`${y.toFixed(1)}px`);item.style.setProperty('--mag-x',`${(dx*5).toFixed(2)}px`);item.style.setProperty('--mag-y',`${(dy*4).toFixed(2)}px`);item.style.setProperty('--tilt-x',`${(-dy*8).toFixed(2)}deg`);item.style.setProperty('--tilt-y',`${(dx*10).toFixed(2)}deg`);item.dataset.pointerActive='true';
  }
  tracked=next;
 };
 const move=(event:PointerEvent)=>{if(event.pointerType!=='mouse'||!enabled()){reset();return}latest=event;if(!frame)frame=requestAnimationFrame(paint)};
 const leave=(event:PointerEvent)=>{if(event.relatedTarget===null)reset()};
 const mutation=new MutationObserver(()=>{if(!enabled())reset()});mutation.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
 document.addEventListener('pointermove',move,{passive:true});document.addEventListener('pointerout',leave,{passive:true});document.addEventListener('pointercancel',reset);document.addEventListener('keydown',reset);window.addEventListener('blur',reset);window.addEventListener('scroll',reset,true);window.addEventListener('resize',reset);fine.addEventListener('change',reset);reduced.addEventListener('change',reset);
 return()=>{reset();mutation.disconnect();document.removeEventListener('pointermove',move);document.removeEventListener('pointerout',leave);document.removeEventListener('pointercancel',reset);document.removeEventListener('keydown',reset);window.removeEventListener('blur',reset);window.removeEventListener('scroll',reset,true);window.removeEventListener('resize',reset);fine.removeEventListener('change',reset);reduced.removeEventListener('change',reset)};
},[])}
