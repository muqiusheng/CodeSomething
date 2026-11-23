import {TutorReportHelp} from '../../tutor/LessonTutor';
import type {ReactNode} from 'react';
import type {CheckJob} from '../../../api/learning-api';
import {RunExperience} from './RunExperience';
import {CheckJobProgress} from './CheckJobProgress';

export const isChecking=(job:CheckJob|null)=>!!job&&['queued','running','cancelling'].includes(job.status);
export function CheckJobReport({job,action}:{job:CheckJob;action?:ReactNode}) {
 const report=job.report;
 const showActionFirst=job.status==='passed'&&!job.stale;
 const stdout=report?.policy==='console-output-v1'?report.assertions.find(item=>item.name==='控制台输出'&&item.passed):undefined;
 const responseBody=report?.policy==='http-text-v1'?report.assertions.find(item=>item.name==='响应正文'&&item.passed):undefined;
 const startupFailure=job.status==='business_error'&&report?.log.startsWith('应用启动失败：');
 const passedCount=report?.assertions.filter(a=>a.passed).length??0;
 const interrupted=job.status==='timed_out'?'检查超时':job.status==='cancelled'?'检查已取消':job.status==='environment_error'?'环境异常':null;
 const detailSummary=interrupted?`已执行步骤 · ${interrupted}`:report&&job.status==='business_error'&&passedCount===report.assertions.length?'已执行步骤 · 功能未通过':`检查明细 · ${passedCount}/${report?.assertions.length??0} 项通过`;
 return <section className="check-report" aria-label="代码检查报告">
  {showActionFirst&&action}
  <CheckJobProgress job={job}/>
  {!['queued','running','cancelling','awaiting_runner'].includes(job.status)&&<p role="status" className={job.status==='passed'&&!job.stale?'check-pass':''}>{startupFailure?'HTTP 服务没有启动。本次未通过接口检查。':job.message}</p>}
  {job.status==='running'&&job.progress?.phase==='preparing'&&<p className="check-meta">首次使用新的依赖配置，准备时间可能较长。</p>}
  {job.stale&&<p className="check-stale" role="status">{job.freshness==='changed'?'代码已变化：这份结果只对应已保存的旧快照，请重新预览并提交。':'暂时无法读取练习文件：这份结果仅对应已保存快照，当前代码尚未核对。'}</p>}
  {responseBody&&<section aria-label="实际 HTTP 响应正文"><h3>实际 HTTP 响应正文</h3><pre className="check-log">{responseBody.actual}</pre></section>}
  {stdout&&<section aria-label="实际控制台输出"><h3>实际控制台输出</h3><pre className="check-log">{stdout.actual}</pre></section>}
  {!showActionFirst&&action}
  {report&&<><RunExperience key={job.id} assertions={report.assertions} stale={job.stale} smokeOnly={report.policy==='server-smoke-v1'}/><p className="check-meta">{new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(report.finishedAt))} · {report.policy}</p>
   {report.assertions.length>0&&<details open={job.status!=='passed'}><summary>{detailSummary}</summary><ul className="check-assertions">{report.assertions.map((item,index)=><li key={index} data-passed={item.passed}><strong>{item.passed?'通过':'未通过'} · {item.name}</strong><p>预期：{item.expected}</p>{item.actual.length>500?<details><summary>查看详细输出</summary><pre>{item.actual}</pre></details>:<pre>{item.actual}</pre>}</li>)}</ul></details>}
   {report.log&&<details open={!!interrupted||startupFailure}><summary>编译与运行日志</summary><pre className="check-log">{report.log}</pre></details>}
   <details><summary>本次检查版本</summary><dl className="check-versions"><dt>课程与章节</dt><dd>{report.courseVersion} / {report.stageId}</dd><dt>代码SHA-256</dt><dd>{report.snapshotDigest}</dd><dt>运行镜像</dt><dd>{report.image}</dd><dt>探针SHA-256</dt><dd>{report.harnessDigest||'未启动'}</dd></dl></details>
  </>}
  {(['business_error','environment_error'].includes(job.status))&&<TutorReportHelp id={job.id}/>}
 </section>;
}
