import {useId,useLayoutEffect,useRef,useState,type KeyboardEvent,type PointerEvent,type ReactNode,type RefObject} from 'react';
import {ArrowUpRight,GripHorizontal,Minimize2} from 'lucide-react';

type Props={
 open:boolean;
 onOpenChange:(open:boolean)=>void;
 status:string;
 output:RefObject<HTMLDivElement|null>;
 dock?:boolean;
 reportVisible?:boolean;
 onFloatChange?:(floating:boolean)=>void;
 divider?:ReactNode;
 children:ReactNode;
};

const keyboardOffsets=new Map([['ArrowLeft',[-24,0]],['ArrowRight',[24,0]],['ArrowUp',[0,-24]],['ArrowDown',[0,24]]]);

export function WorkspaceResults({open,onOpenChange,status,output,dock,reportVisible,onFloatChange,divider,children}:Props){
 const id=useId();
 const [floating,setFloating]=useState(false);
 const panel=useRef<HTMLElement>(null);
 const modeButton=useRef<HTMLButtonElement>(null);
 const moveFocus=useRef(false);
 const drag=useRef<{id:number;x:number;y:number;resize:boolean}|null>(null);

 function position(left:number,top:number){
  const element=panel.current!;
  const {width,height}=element.getBoundingClientRect();
  const viewport=document.documentElement;
  element.style.left=Math.max(8,Math.min(left,viewport.clientWidth-width-8))+'px';
  element.style.top=Math.max(8,Math.min(top,viewport.clientHeight-height-8))+'px';
 }
 function resize(width:number,height:number){
  const element=panel.current!;
  const {left,top}=element.getBoundingClientRect();
  const viewport=document.documentElement;
  const maxWidth=viewport.clientWidth-left-8;
  const maxHeight=viewport.clientHeight-top-8;
  element.style.width=Math.min(maxWidth,Math.max(Math.min(280,maxWidth),width))+'px';
  element.style.height=Math.min(maxHeight,Math.max(Math.min(220,maxHeight),height))+'px';
 }

 function useArrow(event:KeyboardEvent<HTMLButtonElement>,resizeWindow:boolean){
  const offset=keyboardOffsets.get(event.key);
  if(!offset)return;
  event.preventDefault();
  const {left,top,width,height}=panel.current!.getBoundingClientRect();
  if(resizeWindow)resize(width+offset[0],height+offset[1]);
  else position(left+offset[0],top+offset[1]);
 }

 useLayoutEffect(()=>{
  const element=panel.current!;
  if(floating){
   const clamp=()=>{const {left,top}=element.getBoundingClientRect();position(left,top)};
   clamp();
   window.addEventListener('resize',clamp);
   if(moveFocus.current)modeButton.current?.focus({preventScroll:true});
   moveFocus.current=false;
   return ()=>window.removeEventListener('resize',clamp);
  }
  element.style.removeProperty('left');
  element.style.removeProperty('top');
  element.style.removeProperty('width');
  element.style.removeProperty('height');
  if(moveFocus.current)modeButton.current?.focus({preventScroll:true});
  moveFocus.current=false;
 },[floating]);

 function toggleMode(){
  moveFocus.current=true;
  onOpenChange(true);
  onFloatChange?.(!floating);
  setFloating(!floating);
 }
 function startDrag(event:PointerEvent<HTMLButtonElement>,resizeWindow=false){
  if(event.button!==0||!event.isPrimary)return;
  const {left,top,width,height}=panel.current!.getBoundingClientRect();
  drag.current={id:event.pointerId,x:event.clientX-(resizeWindow?width:left),y:event.clientY-(resizeWindow?height:top),resize:resizeWindow};
  event.currentTarget.setPointerCapture(event.pointerId);
 }
 function moveDrag(event:PointerEvent<HTMLButtonElement>){
  const active=drag.current;
  if(active?.id!==event.pointerId)return;
  const update=active.resize?resize:position;
  update(event.clientX-active.x,event.clientY-active.y);
 }
 const endDrag=()=>{drag.current=null};
 return <>
  {open&&!floating&&divider}
  <section ref={panel} className={'workspace-results'+(dock?' workspace-dock-results':'')}
   data-floating={floating||undefined} data-expanded={open||floating}
   role={floating?'dialog':undefined} aria-label={floating?'运行结果浮窗':undefined}
   onKeyDown={event=>{
    if(floating&&event.key==='Escape'&&!event.defaultPrevented){event.stopPropagation();toggleMode()}
   }}>
   <header className="workspace-results-bar">
    {floating?<button type="button" className="workspace-results-move" aria-label="移动运行结果浮窗，可用方向键"
     onPointerDown={event=>startDrag(event)}
     onPointerMove={moveDrag}
     onLostPointerCapture={endDrag}
     onKeyDown={event=>useArrow(event,false)}><GripHorizontal size={17} aria-hidden="true"/><span>运行结果</span><span role="status">{status}</span></button>:
     <><button type="button" className="workspace-results-toggle" aria-expanded={open} aria-controls={id}
      onClick={()=>onOpenChange(!open)}><span>运行结果</span><span>{status} · {open?'收起':'展开'}</span></button>
      {reportVisible&&<span className="workspace-results-mobile-title">运行结果</span>}</>}
    <button ref={modeButton} type="button" className="btn btn-ghost workspace-results-mode"
     aria-label={floating?'还原运行结果':'放大运行结果'} title={floating?'还原运行结果':'放大运行结果'} onClick={toggleMode}>
     {floating?<Minimize2 size={15} aria-hidden="true"/>:<ArrowUpRight size={15} aria-hidden="true"/>}{floating?'还原':'放大'}
    </button>
   </header>
   <div ref={output} id={id} className="workspace-output" role="region" aria-label="本次运行结果"
    tabIndex={0} hidden={!open&&!floating&&!reportVisible}>{children}</div>
   {floating&&<button type="button" className="btn btn-ghost workspace-results-resize" aria-label="调整浮窗大小，可用方向键"
     title="拖动调整大小" onPointerDown={event=>startDrag(event,true)} onPointerMove={moveDrag}
     onLostPointerCapture={endDrag} onKeyDown={event=>useArrow(event,true)}/>}
  </section>
 </>;
}
