import {useLayoutEffect, useRef} from 'react';

export function WorkspaceDivider({dock = false}: {dock?: boolean}) {
 const handle = useRef<HTMLDivElement>(null);
 const frame = useRef(0);
 const drag = useRef<{id: number; coordinate: number; value: number; min: number; max: number}|undefined>(undefined);

 const property = dock ? '--results-dock-height' : '--brief-width';
 function limits(parent: HTMLElement) {
  const size = dock ? parent.clientHeight : parent.clientWidth;
  const style = getComputedStyle(parent);
  const min = parseFloat(style.getPropertyValue(dock ? '--dock-min-size' : '--task-min-size'));
  return {min, max: Math.max(min, dock ? size * .6 : Math.max(size * .32, size - 688))};
 }
 function current(element: HTMLDivElement) {
  const pane = dock ? element.nextElementSibling : element.previousElementSibling;
  const bounds = pane?.getBoundingClientRect();
  return dock ? bounds?.height ?? 0 : bounds?.width ?? 0;
 }
 function describe(element: HTMLDivElement, value: number, min: number, max: number) {
  element.setAttribute('aria-valuemin', String(Math.round(min)));
  element.setAttribute('aria-valuemax', String(Math.round(max)));
  element.setAttribute('aria-valuenow', String(Math.round(value)));
  element.setAttribute('aria-valuetext', `${Math.round(value)} 像素`);
 }
 function sizes(element: HTMLDivElement) {
  const parent = element.parentElement;
  if (!parent || element.offsetWidth === 0) return;
  const {min, max} = limits(parent);
  const value = Math.max(min, Math.min(max, current(element)));
  describe(element, value, min, max);
  return {value, min, max};
 }
 function write(element: HTMLDivElement, value: number, min: number, max: number) {
  const next = Math.max(min, Math.min(max, value));
  element.parentElement?.style.setProperty(property, `${next}px`);
  describe(element, next, min, max);
 }
 function stop(element: HTMLDivElement, commit = true) {
  if (frame.current) cancelAnimationFrame(frame.current);
  frame.current = 0;
  const state = drag.current;
  if (state && commit) write(element, state.value, state.min, state.max);
  drag.current = undefined;
  delete element.dataset.dragging;
  if (state) delete document.body.dataset.workspaceResize;
 }
 useLayoutEffect(() => {
  const element = handle.current;
  const parent = element?.parentElement;
  if (!element || !parent) return;
  const update = () => {if (!drag.current) sizes(element)};
  const observer = new ResizeObserver(update);
  observer.observe(parent);
  const pane = dock ? element.nextElementSibling : element.previousElementSibling;
  if (pane) observer.observe(pane);
  update();
  return () => {observer.disconnect(); stop(element, false)};
 }, [dock]);

 return <div ref={handle} className={dock ? 'workspace-divider dock-divider' : 'workspace-divider'}
  role="separator" tabIndex={0} aria-label={dock ? '调整结果区高度' : '调整任务与代码区域宽度'}
  aria-orientation={dock ? 'horizontal' : 'vertical'}
  onPointerDown={event => {
   if (event.button !== 0 || drag.current) return;
   const geometry = sizes(event.currentTarget);
   if (!geometry) return;
   event.currentTarget.focus({preventScroll: true});
   event.currentTarget.setPointerCapture(event.pointerId);
   event.currentTarget.dataset.dragging = 'true';
   document.body.dataset.workspaceResize = dock ? 'row' : 'column';
   drag.current = {id: event.pointerId, coordinate: dock ? event.clientY : event.clientX, ...geometry};
   event.preventDefault();
  }}
  onPointerMove={event => {
   const state = drag.current;
   if (!state || state.id !== event.pointerId) return;
   const element = event.currentTarget;
   const next = dock ? event.clientY : event.clientX;
   const delta = (next - state.coordinate) * (dock ? -1 : 1);
   state.coordinate = next;
   // Clamp each delta so reversing immediately responds even after overshooting a limit.
   state.value = Math.max(state.min, Math.min(state.max, state.value + delta));
   if (!frame.current) frame.current = requestAnimationFrame(() => {
    frame.current = 0;
    write(element, state.value, state.min, state.max);
   });
  }}
  onLostPointerCapture={event => {if (drag.current?.id === event.pointerId) stop(event.currentTarget)}}
  onDoubleClick={event => {
   event.currentTarget.parentElement?.style.removeProperty(property);
   sizes(event.currentTarget);
  }}
  onKeyDown={event => {
   const decrease = dock ? 'ArrowDown' : 'ArrowLeft';
   const increase = dock ? 'ArrowUp' : 'ArrowRight';
   if (![decrease, increase, 'Home', 'End'].includes(event.key)) return;
   event.preventDefault();
   const state = sizes(event.currentTarget);
   if (!state) return;
   const {value, min, max} = state;
   write(event.currentTarget, event.key === 'Home' ? min : event.key === 'End' ? max : value + (event.key === decrease ? -16 : 16), min, max);
  }}><span/></div>;
}
