import {journeyPositionKey,lessonById,lessonHref,workspaceHref,type JourneyLesson} from './catalog';

const activeKey='cs-journey-active-v1';

export function saveStudyPosition(lesson:JourneyLesson,working=false,tab?:string) {
 if(lesson.elective)return;
 try {
  localStorage.setItem(activeKey,JSON.stringify({id:lesson.id,working,tab,updatedAt:Date.now()}));
  localStorage.setItem(journeyPositionKey,lesson.id);
 } catch {
  // The course remains usable when browser storage is unavailable.
 }
}

export function readStudyPosition(){
 try {
  const raw=localStorage.getItem(activeKey);
  const active=raw?JSON.parse(raw):null;
  const lesson=lessonById.get(active?.id)||lessonById.get(localStorage.getItem(journeyPositionKey)||'');
  if(!lesson||lesson.elective)return;
  const current=active?.id===lesson.id&&Number.isFinite(active.updatedAt);
  const working=current&&active.working===true;
  const tab=working&&['教学','任务','检查报告','理解验证'].includes(active.tab)?active.tab as string:undefined;
  const href=working?workspaceHref(lesson):lessonHref(lesson.id);
  const [path,query]=href.split('?');
  const search=new URLSearchParams(query);
  if(tab&&search.has('tab'))search.set('tab',tab);
  return {lesson,working,tab,courseId:lesson.courseId,title:lesson.title,number:lesson.number,
   outcome:lesson.result,updatedAt:current?Number(active.updatedAt):0,
   href:query?path+'?'+search:href};
 } catch {
  return undefined;
 }
}

export function preferFormalPosition(){
 try {
  localStorage.removeItem(activeKey);
 } catch {
  // The formal position is already stored by the service.
 }
}

export function isJourneyWorkspace(search:URLSearchParams,courseId:string,stageId:string){
 const lesson=lessonById.get(search.get('journey')||'');
 return lesson?.courseId===courseId&&lesson.stage===stageId;
}

export function saveStudyTab(search:URLSearchParams,tab:string){
 const position=readStudyPosition();
 if(position?.working&&position.lesson.id===search.get('journey'))saveStudyPosition(position.lesson,true,tab);
}
