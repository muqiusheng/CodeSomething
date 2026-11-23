import {useState} from 'react';
import {NextLessonAction} from './NextLessonAction';
import {PartyPopper} from 'lucide-react';
import {chapterTitles,learningRequest,refreshLearning,type CheckJob} from '../../../api/learning-api';
import {useLearningProgress} from '../../../hooks/useLearningProgress';
import '../../../styles/practice-steps.css';

export function CodeCompletion({job,token,context,nextHref,nextLabel,onComplete,beforeComplete,disabled=false}:{job:CheckJob|null;token?:string;context:{courseId:string;courseVersion:string;stageId:string};nextHref?:string;nextLabel?:string;onComplete?:()=>void;beforeComplete?:()=>Promise<void>;disabled?:boolean}){
 const [savedJob,setSavedJob]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const {progress}=useLearningProgress(`/learning/progress/${context.courseId}/${context.courseVersion}`);
 const recorded=progress?.courseId===context.courseId&&progress.courseVersion===context.courseVersion&&progress.completions.some(c=>c.stageId===context.stageId);
 const practiceNumber=context.courseId==='http-json-basics'&&context.courseVersion==='1.1.0'?(context.stageId==='workspace'?1:context.stageId==='workspace-http-text'?2:0):0;
 const successTitle=<><PartyPopper size={20} aria-hidden="true"/>检查全部通过！实际结果与预期完全一致。</>;
 if(practiceNumber){
  const passed=job?.report?.policy===(practiceNumber===1?'console-output-v1':'http-text-v1')&&job.status==='passed'&&!job.stale&&!disabled&&job.report.assertions.every(item=>item.passed);
  const history=progress?.passedPractices?.includes(context.stageId);
  if(!passed&&!history)return null;
  return <section className="completion-card" data-state={passed?'passed':'pending'} aria-label={`第 ${practiceNumber} 节检查结果`}>
   <div role="status"><h3>{passed?successTitle:`第 ${practiceNumber} 节已有通关记录`}</h3>
   <p>{passed?(practiceNumber===1?'已验证实际控制台输出。':'已收到 HTTP 200 和你写的正文。')+`第 ${practiceNumber} 节通关已保存，下一节继续修改同一个 TaskServer.java。`:'本次代码请以最新检查结果为准。'}</p></div>
   {passed&&nextHref&&<NextLessonAction success href={nextHref} label={nextLabel}/>}
  </section>;
 }
 const done=!!recorded||!!job&&savedJob===job.id;
 const fresh=job?.status==='passed'&&job.report?.functionalPassed===true&&!job.stale&&job.report.assertions.every(item=>item.passed);
 const ready=fresh&&!disabled;
 const passed=done&&ready;
 async function finish(){
  if(!job||!token||!fresh||disabled||busy)return false;
  setBusy(true);setError('');
  try{await beforeComplete?.();await learningRequest('/understanding-attempts/complete-code',{jobId:job.id},token);setSavedJob(job.id);refreshLearning(context.courseId);onComplete?.();return true}
  catch(e){setError((e as Error).message);return false}
  finally{setBusy(false)}
 }
 const title=ready?successTitle:done?'已有通关记录':'本关尚待通关';
 const detail=passed?`${chapterTitles[context.stageId]||'本关任务'}已达标，通关进度已保存。`
  :done?(job?.stale||disabled?'历史通关进度已保留。当前代码需要重新验证。':job?'历史通关进度已保留。请根据本次报告核对当前代码。':'可以继续学习或重新提交代码检查。')
  :ready?'继续时会保存通关进度。':'当前代码通过功能检查后，即可保存本关进度。';
 return <section className="code-completion completion-card" data-state={ready?'passed':'pending'} aria-label="编码完成">
  <div role="status"><h3>{title}</h3><p>{detail}</p></div>
  {error&&<p role="alert">{error}</p>}
  {!nextHref&&!done&&fresh&&<button type="button" className="button primary" disabled={!token||busy||disabled} onClick={()=>void finish()}>{busy?'正在保存…':'完成本关编码'}</button>}
  {ready&&nextHref&&<NextLessonAction success href={nextHref} label={nextLabel} disabled={disabled||busy||!done&&!token} beforeNavigate={done?undefined:finish}/>}
 </section>;
}
