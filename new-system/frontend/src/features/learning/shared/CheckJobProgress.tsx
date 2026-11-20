import type {CheckJob} from '../../../api/learning-api';
import '../../../styles/check-progress.css';

const stages=['准备依赖','编译代码','启动应用','检查功能','整理结果'];
const activeStatuses=['queued','running','awaiting_runner','cancelling'];
export function CheckJobProgress({job}:{job:CheckJob}){
 const active=activeStatuses.includes(job.status);
 if(!active)return null;
 const progress=job.progress??{phase:job.status,label:active?'正在读取检查阶段':job.status==='passed'?'检查完成 · 功能通过':'检查已结束',step:job.status==='passed'?5:0,total:5};
 const step=Math.max(0,Math.min(5,progress.step));
 return <div className="check-job-progress" data-status={job.status} aria-label="检查进度">
  <div className="check-progress-heading"><span role="status">{progress.label}</span><span className="check-progress-count">{active?(step===0?'等待执行':`第${step}/5阶段`):job.status==='passed'?'已完成':job.status==='cancelled'?'已取消':'已结束'}</span></div>
  <progress className="progress" max={5} value={step} aria-label="检查阶段进度" aria-valuetext={progress.label+(active&&step>0?`，第${step}阶段，共5阶段`:'')}/>
  <ol className="check-progress-stages" aria-label="检查阶段">{stages.map((name,index)=><li key={name} data-state={job.status==='passed'||index+1<step?'done':index+1===step&&active?'current':'pending'} aria-current={index+1===step&&active?'step':undefined}><span aria-hidden="true"/>{name}</li>)}</ol>
 </div>;
}
