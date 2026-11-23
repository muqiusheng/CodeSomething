import {apiFetch} from '../../api/auth-api';
import {localState, sessionState} from '../../api/browser-state.mjs';
import {useSearchParams} from 'react-router-dom';
import {curriculumFor,resolveLesson} from '../learning/shared/curriculum';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {learningRequest,type CheckJob} from '../../api/learning-api';

export type TutorAnswer={id:string;courseId:string;courseVersion:string;stageId:string;level:string;question:string;contextManifest:string;submissionId:string|null;jobId:string|null;status:string;answer:string;revision:number;errorCode:string|null;message:string;createdAt:string};
type Scope={courseId:string;courseVersion:string;stageId:string};
type Receipt={id?:string;token?:string;pending?:Record<string,unknown>};
export const tutorActive=(status?:string)=>['queued','running','cancelling'].includes(status||'');
function useTutorSession(scope:Scope,submissionId?:string,job?:CheckJob|null,token?:string,sqlReportId?:string){
 const [params]=useSearchParams();
 const legacyKey='cs-tutor-'+scope.courseVersion+'-'+scope.stageId;
 const storageKey=scope.courseId==='http-json-basics'?legacyKey:legacyKey+'-'+scope.courseId;
 const [receipt,setReceipt]=useState<Receipt>(()=>{try{return JSON.parse(sessionState.getItem(storageKey)||'{}')}catch{return {}}});
 const [open,setOpen]=useState(false);
 const [question,setQuestion]=useState('');const [level,setLevel]=useState('concept');const [includeLesson,setIncludeLesson]=useState(true);const [includeCode,setIncludeCode]=useState(false);const [includeReport,setIncludeReport]=useState(false);
 const [answer,setAnswer]=useState<TutorAnswer|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [resume,setResume]=useState(0);
 const pending=useRef<Receipt>(receipt);
 const save=(next:Receipt)=>{pending.current=next;setReceipt(next);try{sessionState.setItem(storageKey,JSON.stringify(next))}catch{}};
 useEffect(()=>{setIncludeCode(false);setIncludeReport(false)},[submissionId,job?.id,token,sqlReportId]);
 useEffect(()=>{
  if(!receipt.id)return;const controller=new AbortController();let live=true;
  async function follow(){try{
   setError('');const saved=await learningRequest<TutorAnswer>('/tutor/requests/'+receipt.id,undefined,receipt.token);
   if(!live)return;setAnswer(saved);if(!tutorActive(saved.status))return;
   const response=await apiFetch('/api/v1/tutor/requests/'+receipt.id+'/events?after='+saved.revision,{headers:receipt.token?{Authorization:'Bearer '+receipt.token}:{},signal:controller.signal,cache:'no-store'});
   if(!response.ok||!response.body)throw new Error('回答连接中断，请恢复回答。');
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',terminal=false;
   while(live){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true}).replaceAll('\r','');let boundary;
    while((boundary=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(data){const state=JSON.parse(data) as TutorAnswer;if(live){setAnswer(state);terminal=!tutorActive(state.status)}}}
   }
   if(live&&!terminal){const final=await learningRequest<TutorAnswer>('/tutor/requests/'+receipt.id,undefined,receipt.token);if(live){setAnswer(final);if(tutorActive(final.status))setError('显示连接已断开，服务端仍可能生成。点击恢复回答，不会重复发送。')}}
  }catch(e){if(live&&!controller.signal.aborted)setError(e instanceof Error?e.message:'暂时无法读取回答，请恢复回答。')}}
  void follow();return()=>{live=false;controller.abort()};
 },[receipt.id,receipt.token,resume]);
 async function send(recover=false){
  setBusy(true);setError('');
  try{
   let request=receipt;
   if(!recover||!request.pending){
    const plan=curriculumFor(scope.courseId,scope.stageId);
    let saved=params.get('lesson');
    if(!saved){
     const localScope=scope.courseId==='sql-foundations'?'sql-'+scope.stageId
      :scope.courseId==='http-json-basics'?(scope.stageId==='workspace'?'http-project-':scope.courseVersion)+scope.stageId:scope.courseId+scope.stageId;
     try{saved=localState.getItem('cs-practice-lessons-v2-'+localScope)}catch{}
    }
    const lessonId=plan.lessons[resolveLesson(plan.lessons,saved)]?.id;
    const body={...scope,lessonId,learningStep:({教学:'teaching',任务:'task',检查报告:'report',理解验证:'understanding'} as Record<string,string>)[params.get('tab')||'任务']||'task',question:question.trim(),level,includeLesson,submissionId:includeCode?submissionId:null,jobId:includeReport?job?.id:null,sqlAttemptId:includeReport?sqlReportId:null,idempotencyKey:'tutor-'+crypto.randomUUID()};
    request={pending:body,token:includeCode||includeReport?token:undefined};save(request);
   }
   const result=await learningRequest<TutorAnswer>('/tutor/requests',request.pending,request.token);
   setAnswer(result);save({id:result.id,token:request.token});
  }catch(e){setError(e instanceof Error?e.message:'发送状态未确认，请重试发送。')}finally{setBusy(false)}
 }
 async function stop(){if(!receipt.id)return;setBusy(true);setError('');try{const result=await learningRequest<TutorAnswer>('/tutor/requests/'+receipt.id+'/stop',{},receipt.token);setAnswer(result);setResume(value=>value+1)}catch(e){setError(e instanceof Error?e.message:'停止尚未确认，请恢复回答后重试。')}finally{setBusy(false)}}
 function askAgain(){if(answer){setQuestion(answer.question);setLevel(answer.level)}}
 function askReport(){
  setLevel('locate');setIncludeCode(false);setIncludeReport(true);
  setQuestion('请根据这次检查报告，解释失败原因，并告诉我下一步该检查哪里。');
  setOpen(true);
 }
 return {open,setOpen,askReport,reportId:job?.id??sqlReportId,scope,question,setQuestion,level,setLevel,includeLesson,setIncludeLesson,includeCode,setIncludeCode,includeReport,setIncludeReport,answer,busy,error,send,stop,askAgain,canCode:!!submissionId&&!!token,canReport:!!sqlReportId||!!job&&!!token,stale:job?.stale,active:tutorActive(answer?.status),hasPending:!!receipt.pending,restore:()=>setResume(value=>value+1)};
}
const TutorContext=createContext<ReturnType<typeof useTutorSession>|null>(null);
export function TutorProvider({scope,submissionId,job,token,sqlReportId,children}:{scope:Scope;submissionId?:string;job?:CheckJob|null;token?:string;sqlReportId?:string;children:ReactNode}){
 const value=useTutorSession(scope,submissionId,job,token,sqlReportId);return <TutorContext.Provider value={value}>{children}</TutorContext.Provider>;
}
export function useTutor(){const value=useContext(TutorContext);if(!value)throw new Error('TutorProvider is required');return value}

export const useOptionalTutor=()=>useContext(TutorContext);
