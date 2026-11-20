import {useEffect,useRef} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {ArrowRight,Rocket} from 'lucide-react';
import {lessonById} from '../journey/catalog';
import {saveStudyPosition} from '../journey/study-position';

export function NextLessonAction({href,label,beforeNavigate,disabled=false,success=false}:{href:string;label?:string;beforeNavigate?:()=>Promise<boolean>;disabled?:boolean;success?:boolean}){
 const button=useRef<HTMLButtonElement|HTMLAnchorElement>(null);
 const navigate=useNavigate();
 const lesson=href.startsWith('/learn/journey/')?lessonById.get(href.split('/')[3]?.split('?')[0]):undefined;
 const title=lesson?`第 ${lesson.number} 节 ${lesson.title}`:label;
 useEffect(()=>{
  const enter=(event:KeyboardEvent)=>{
   if(event.key!=='Enter'||event.defaultPrevented||event.repeat||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
   const target=event.target;
   if(!(target instanceof HTMLElement)||target.closest('input,textarea,select,button,a,summary,[contenteditable],.monaco-editor,[role=dialog],dialog[open]'))return;
   const node=button.current;
   if(node&&!node.matches(':disabled')&&node.getClientRects().length&&!document.querySelector('[aria-modal=true],dialog:modal')){
    event.preventDefault();node.click();
   }
  };
  window.addEventListener('keydown',enter);
  return ()=>window.removeEventListener('keydown',enter);
 },[]);
 async function next(){
  if(beforeNavigate&&!await beforeNavigate())return;
  if(lesson)saveStudyPosition(lesson);
  navigate(href);
 }
 const destination=title?'继续下一节：'+title:href.startsWith('/projects/')?'查看项目总结':'继续下一节';
 const successLabel=href.startsWith('/projects/')?'查看项目总结':href.startsWith('/learn/journey/')?'继续下一节':'继续下一关';
 const content=success?<><Rocket size={16} aria-hidden="true"/><span>{successLabel}{title&&`：${title}`}</span><kbd>Enter</kbd></>:<>{destination} <ArrowRight size={15} aria-hidden="true"/></>;
 if(!beforeNavigate&&!disabled)return <Link ref={node=>{button.current=node}} className={success?"btn button primary completion-next":"btn button primary"} aria-keyshortcuts="Enter" to={href} onClick={()=>{if(lesson)saveStudyPosition(lesson)}}>{content}</Link>;
 return <button ref={node=>{button.current=node}} type="button" className={success?"btn button primary completion-next":"btn button primary"} aria-keyshortcuts="Enter" disabled={disabled} onClick={()=>void next()}>{content}</button>;
}
