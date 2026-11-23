import {InlineSpinner,PulseDots} from '../../components/shared/LoadingState';
import {TutorMarkdown} from './TutorMarkdown';
import {useId} from 'react';
import {Link} from 'react-router-dom';
import {PanelRightOpen,Lightbulb,Send,Square} from 'lucide-react';
import {Modal} from '../../components/ui/modal';
import {useOptionalTutor,useTutor} from './TutorSession';

export function LessonTutorBody() {
  const tutor=useTutor(),id=useId();const disabled=tutor.busy||tutor.active;
  return <div className="tutor-body tutor-connected">
   <form onSubmit={e=>{e.preventDefault();void tutor.send()}}>
    <label htmlFor={id+'-level'}>帮助等级</label>
    <select id={id+'-level'} name="helpLevel" value={tutor.level} onChange={e=>tutor.setLevel(e.target.value)} disabled={disabled}>
     <option value="concept">概念提示</option><option value="locate">定位问题</option><option value="example">示例讲解</option>
    </select>
    <p className="tutor-help">{tutor.level==='concept'?'解释概念，留一个问题让你自己想。':tutor.level==='locate'?'找出问题原因，给出下一步检查。':'用局部示例讲解，再由你完成修改。'}</p>
    <fieldset disabled={disabled}><legend>本次发送的上下文</legend>
     <label><input type="checkbox" checked={tutor.includeLesson} onChange={e=>tutor.setIncludeLesson(e.target.checked)}/>当前章节的课程片段</label>
     <label><input type="checkbox" checked={tutor.includeCode&&tutor.canCode} disabled={!tutor.canCode} onChange={e=>tutor.setIncludeCode(e.target.checked)}/>已保存的代码快照{!tutor.canCode&&'（需先保存）'}</label>
     <label><input type="checkbox" checked={tutor.includeReport&&tutor.canReport} disabled={!tutor.canReport} onChange={e=>tutor.setIncludeReport(e.target.checked)}/>本次检查报告{!tutor.canReport?'（暂无）':tutor.stale?'（旧快照）':''}</label>
    </fieldset>
    <label htmlFor={id+'-question'}>想问什么</label>
    <textarea id={id+'-question'} name="tutorQuestion" rows={4} maxLength={2000} required autoComplete="off" value={tutor.question} disabled={disabled} onChange={e=>tutor.setQuestion(e.target.value)} placeholder="例如：false为什么不能加引号…" aria-describedby={id+'-scope'}/>
    <p className="tutor-help" id={id+'-scope'}>发送当前任务约定、所在小节和勾选内容；代码使用已保存快照。</p>
    <div className="button-row">{tutor.active?<button className="button secondary full" type="button" disabled={tutor.busy||tutor.answer?.status==='cancelling'} onClick={()=>void tutor.stop()}><Square size={14} aria-hidden="true"/>{tutor.answer?.status==='cancelling'?'正在停止…':'停止回答'}</button>:<button className="button primary full" type="submit" disabled={tutor.busy}>{tutor.busy?<InlineSpinner/>:<Send size={15} aria-hidden="true"/>}{tutor.busy?'正在发送…':'发送问题'}</button>}</div>
   </form>
   {tutor.hasPending&&!tutor.active&&<div className="tutor-recovery"><p>发送结果尚未确认，可按原编号重试。</p><button className="button secondary" disabled={tutor.busy} onClick={()=>void tutor.send(true)}>重试发送</button></div>}
   {tutor.error&&<div className="tutor-recovery" role="alert"><p>{tutor.error}</p>{tutor.answer&&<button className="button secondary" onClick={tutor.restore}>恢复回答</button>}</div>}
   {tutor.answer&&<section className="tutor-response" aria-label="本次辅导回答">
    <div className="tutor-response-heading"><h3>本次回答</h3><span className="text-pill">{({concept:'概念提示',locate:'定位问题',example:'示例讲解'} as Record<string,string>)[tutor.answer.level]}</span></div>
    {tutor.scope.stageId==='workspace'&&<p className="tutor-task-basis">当前任务：亲手编写任务接口响应。<Link to="?tab=%E4%BB%BB%E5%8A%A1">回到任务核对</Link></p>}{tutor.scope.stageId==='workspace'&&/不需要[^。\n]*(?:写|编写)[^。\n]*(?:服务器|响应)|只[^。\n]*准备工作台/.test(tutor.answer.answer)&&<p role="alert">回答中的行动建议与当前任务可能冲突。请以任务要求为准，可填回问题重新提问。</p>}<p className="tutor-question">{tutor.answer.question}</p>
    <div className="tutor-answer" aria-busy={tutor.active}><TutorMarkdown text={tutor.answer.answer|| (tutor.active?'正在准备回答…':'本次未生成回答。')}/></div>
    <p role="status" className="tutor-result-status">{tutor.active&&<PulseDots/>}{tutor.answer.message||'正在连接本机ChatGPT…'}</p>
    <details><summary>查看本次上下文</summary><p>v{tutor.answer.courseVersion} · {tutor.answer.stageId}</p><p>{tutor.answer.contextManifest||'仅当前章节标识与问题'}</p></details>
    {!tutor.active&&<button className="text-button" onClick={tutor.askAgain}>填回此问题</button>}
   </section>}
   <div className="ai-state"><span className="tiny-dot"/>本机ChatGPT<Link to="/settings">检查连接</Link></div>
  </div>;
}

export function TutorReportHelp({id}:{id:string}){
 const tutor=useOptionalTutor();
 if(!tutor||tutor.reportId!==id)return null;
 return <button type="button" className="btn button secondary" onClick={tutor.askReport}><Lightbulb size={16} aria-hidden="true"/>向 AI 导师求助此错误</button>;
}

export function LessonTutorDrawer() {
  const {open,setOpen}=useTutor();
  return <div className="tutor-drawer-trigger">
    <button className="button secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}><PanelRightOpen size={16} aria-hidden="true"/>学习辅导</button>
    <Modal open={open} onOpenChange={setOpen} title="学习辅导" description="选择上下文，按需要获取提示" className="tutor-drawer">
      <LessonTutorBody/>
    </Modal>
  </div>;
}
