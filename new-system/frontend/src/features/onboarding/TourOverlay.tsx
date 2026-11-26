import {useId,useLayoutEffect,useRef,useState,type CSSProperties,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,ArrowRight} from 'lucide-react';
import {advanceTour} from './onboarding-state.mjs';
import {tours,type TourKind} from './tours';

type Bounds={top:number;left:number;width:number;height:number};
const padding=12;
function measure(nodes:Element[]):Bounds|null {
  const visible=nodes.map(node=>node.getBoundingClientRect()).filter(rect=>
    rect.width>0&&rect.height>0&&rect.bottom>0&&rect.right>0&&rect.top<innerHeight&&rect.left<innerWidth);
  if (!visible.length) return null;
  const top=Math.max(4,Math.min(...visible.map(r=>r.top))-6);
  const left=Math.max(4,Math.min(...visible.map(r=>r.left))-6);
  const bottom=Math.min(innerHeight-4,Math.max(...visible.map(r=>r.bottom))+6);
  const right=Math.min(innerWidth-4,Math.max(...visible.map(r=>r.right))+6);
  return {top,left,width:right-left,height:bottom-top};
}

function place(target:Bounds,width:number,height:number):CSSProperties|null {
  const right=target.left+target.width,bottom=target.top+target.height;
  const clipTop=Math.min(Math.max(padding,target.top),innerHeight-height-padding);
  const clipLeft=Math.min(Math.max(padding,target.left),innerWidth-width-padding);
  if (right+padding*2+width<=innerWidth) return {left:right+padding,top:clipTop};
  if (target.left>=padding*2+width) return {left:target.left-width-padding,top:clipTop};
  if (bottom+padding*2+height<=innerHeight) return {left:clipLeft,top:bottom+padding};
  if (target.top>=padding*2+height) return {left:clipLeft,top:target.top-height-padding};
  return null;
}

export function TourOverlay({kind,onFinish}:{kind:TourKind;onFinish:()=>void}) {
  const id=useId();
  const dialog=useRef<HTMLDialogElement>(null);
  const card=useRef<HTMLDivElement>(null);
  const nextButton=useRef<HTMLButtonElement>(null);
  const [step,setStep]=useState(kind==='home'?-1:0);
  const [layout,setLayout]=useState<{target:Bounds;card:CSSProperties|null;key:string}|null>(null);
  const {steps}=tours[kind];
  const current=steps[step];
  const key=current?.target ?? '';
  const placement=layout?.key===key ? layout : null;

  useLayoutEffect(()=>{
    const modal=dialog.current;
    if (!modal) return;
    const previous=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.showModal();
    nextButton.current?.focus({preventScroll:true});
    return ()=>{
      modal.close();
      const restore=previous?.isConnected && previous!==document.body ? previous :
        document.getElementById('onboarding-trigger') ?? document.getElementById('main');
      restore?.focus({preventScroll:true});
    };
  },[]);

  useLayoutEffect(()=>{
    if (!key || !card.current) return;
    const panel=card.current;
    const selector='[data-tour="'+key+'"]';
    const showEditorOnMobile=key==='workbench-editor';
    let frame=0;
    let scrollBeforeEditor:number|undefined;
    const initial=document.querySelector(selector);
    if (initial && innerWidth>640) {
      const rect=initial.getBoundingClientRect();
      if (rect.top<0 || rect.top+Math.min(rect.height,innerHeight-100)>innerHeight)
        initial.scrollIntoView({block:'center',behavior:'instant'});
    }
    function reposition() {
      frame=0;
      const narrow=innerWidth<=640;
      if (!narrow) scrollBeforeEditor=undefined;
      if (narrow && showEditorOnMobile && initial && scrollBeforeEditor===undefined) {
        scrollBeforeEditor=window.scrollY;
        initial.scrollIntoView({block:'end',behavior:'instant'});
      }
      const target=!narrow || showEditorOnMobile ? measure([...document.querySelectorAll(selector)]) : null;
      const position=target && place(target,panel.offsetWidth,panel.offsetHeight);
      setLayout(target && (!narrow || position) ? {target,key,card:position} : null);
    }
    function schedule() {if(!frame) frame=requestAnimationFrame(reposition);}
    const observer=new ResizeObserver(schedule);
    observer.observe(panel);
    document.querySelectorAll(selector).forEach(node=>observer.observe(node));
    window.addEventListener('resize',schedule);
    window.addEventListener('scroll',schedule,true);
    reposition();
    return ()=>{
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize',schedule);
      window.removeEventListener('scroll',schedule,true);
      if (scrollBeforeEditor!==undefined) window.scrollTo({top:scrollBeforeEditor,behavior:'instant'});
    };
  },[key]);

  function move(action:'back'|'next'|'skip') {
    const next=advanceTour(step,action,steps.length);
    if (next===null) onFinish();
    else {
      setStep(next);
      nextButton.current?.focus({preventScroll:true});
    }
  }

  function shortcuts(event:KeyboardEvent<HTMLDialogElement>) {
    if (event.key==='ArrowLeft'||event.key==='ArrowRight') {
      event.preventDefault();
      move(event.key==='ArrowLeft'?'back':'next');
    }
    if (event.key==='Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      move('next');
    }
  }

  return createPortal(<dialog ref={dialog} data-onboarding-tour={kind} data-tour-target={key} className="onboarding-tour" role="dialog" aria-modal="true"
    aria-labelledby={id+'-title'} aria-describedby={id+'-description'} onKeyDown={shortcuts}
    onCancel={event=>{event.preventDefault();move('skip');}}>
    {placement ? <span aria-hidden="true" className="onboarding-spotlight" style={placement.target}/>
      : <span aria-hidden="true" className="onboarding-scrim"/>}
    <div ref={card} className="onboarding-tour-card" data-placement={!current?'welcome':placement?.card?'anchored':'sheet'}
      style={placement?.card ?? undefined}>
      {current && <p className="onboarding-step" role="status">第 {step+1} / {steps.length} 步</p>}
      <h2 id={id+'-title'}>{current?.title ?? '欢迎来到码起步'}</h2>
      <p id={id+'-description'}>{current?.description ?? '从课内实验通关和考前复习开始，也可按兴趣动手做课外项目。'}</p>
      <div className="onboarding-actions">
        {current && <button type="button" className="btn button secondary" onClick={()=>move('back')} disabled={step===0}>
          <ArrowLeft size={15} aria-hidden="true"/>上一步
        </button>}
        <button ref={nextButton} type="button" className="btn button primary" onClick={()=>move('next')}>
          {step<0?'开始导览（约 30 秒）':step===steps.length-1?'完成导览':'下一步'}
          {step>=0 && step<steps.length-1 && <ArrowRight size={15} aria-hidden="true"/>}
        </button>
        <button type="button" className="btn button secondary onboarding-skip" onClick={()=>move('skip')}>{current?'跳过导览':'直接开始学习'}</button>
      </div>
    </div>
  </dialog>,document.body);
}
