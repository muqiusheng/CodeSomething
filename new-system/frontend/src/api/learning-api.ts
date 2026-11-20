import {milestoneLabels} from '../features/learning/journey/catalog';
import {preferFormalPosition} from '../features/learning/journey/study-position';

export type CourseStage = {
  courseId:string;courseVersion:string;stageId:string;status:string;title:string;estimatedMinutes:number;
  teaching:{title:string;body:string}[];task:string;runInstructions:string[];requirements:string[];
  starter:string;allowedFiles:string[];completionRule:string;
  understanding:{id:string;prompt:string;options:string[]}[];sources:{title:string;url:string}[];
};
export type Preview={id:string;directory:string;digest:string;files:{path:string;bytes:number;sha256:string}[];pairingCode?:string;expiresAt?:string};
export type Binding={id:string;directory:string;token:string};
export type Submission={id:string;bindingId:string;digest:string;courseVersion:string;createdAt:string};
export type CheckReport={snapshotDigest:string;courseVersion:string;stageId:string;policy:string;image:string;harnessDigest:string;functionalPassed:boolean;assertions:{name:string;passed:boolean;expected:string;actual:string}[];log:string;finishedAt:string};
export type CheckJob={id:string;submissionId:string;status:string;message:string;progress?:{phase:string;label:string;step:number;total:number};report:CheckReport|null;stale:boolean;freshness:'current'|'changed'|'unknown'};
export async function learningRequest<T>(path:string,body?:unknown,token?:string):Promise<T>{
 const response=await fetch('/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000),cache:'no-store'});
 const result=await response.json();if(!response.ok)throw new Error(result.message||'请求未完成，请重试。');return result as T;
}
export const coursePath='/courses/http-json-basics/versions/1.0.0/stages/json-task-response';
export type Chapter={
 stageId:string;title:string;phase:string;minutes:number;dependsOn:string[];mode:'reading'|'code';interactive?:'request'|'response'|'json'|'trace';goal:string;
 concepts:{title:string;body:string;items?:string[];example?:string;caption?:string}[];
 taskTitle:string;taskSummary:string;steps:{title:string;instruction:string;command?:string;expected:string}[];requirements:string[];
 pitfall:{title:string;body:string};question:{prompt:string;options:string[];answer:number;explanation:string};checkPolicy?:string;
};
export type FoundationProject={courseId:string;courseVersion:string;projectId:string;title:string;subtitle:string;description:string;prerequisites:string[];outcomes:string[];completionRule:string;sources:{title:string;url:string}[];chapters:Chapter[];starter:string};
export const foundationPath='/courses/http-json-basics/versions/1.1.0';
export const foundationProjectRoute='/projects/backend-foundations';
export const chapterRoute=(id:string)=>'/learn/http-json/1.1/'+id;
export const milestoneTitles:Readonly<Partial<Record<string,string>>> = {
 workspace:milestoneLabels[0], request:milestoneLabels[1],
 'boot-start':milestoneLabels[0], 'boot-http':milestoneLabels[1],
 'boot-layers':milestoneLabels[2], 'boot-jdbc':milestoneLabels[3],
};
export const chapterTitles:Record<string,string>={'boot-start':'启动Boot应用','boot-http':'接收与返回HTTP数据','boot-layers':'分层与依赖注入','boot-jdbc':'接入JDBC数据库','a-read':'持久化任务查询','a-create':'新增任务','a-update-delete':'修改与删除任务','a-validation':'输入校验','a-pagination':'稳定分页','a-transfer':'独立迁移','b-login':'登录与可撤销会话','b-roles':'角色与对象权限','b-plans':'计划、成员与数据关系','b-pagination':'按计划筛选与稳定分页','b-transaction':'批量分配与事务回滚','b-errors-logs':'统一异常与请求日志','b-tests':'集成测试与有效断言','b-deploy':'部署与前端演示',workspace:'开发工作台',request:'HTTP请求',response:'HTTP响应',json:'JSON数据','run-server':'运行第一个接口',trace:'追踪请求代码','fix-response':'修复接口',transfer:'笔记接口迁移','json-task-response':'原版JSON响应单元','db-connect':'连接数据库','db-model':'任务建表','sql-read':'筛选任务','sql-write':'安全增改删','sql-page':'稳定分页','sql-transfer':'书签迁移',...milestoneTitles} as Record<string,string>;

export type Completion={id:string;courseId:string;courseVersion:string;stageId:string;submissionId:string;jobId:string;understandingId:string|null;snapshotDigest:string;ruleVersion:string;completedAt:string};
export type LearningProgress={courseId:string;courseVersion:string;completions:Completion[];completedCount:number;totalCodeStages:number;projectCompleted:boolean;nextCodeStage:string|null;passedPractices?:string[]};
export type LearningCursor={courseId:string;courseVersion:string;stageId:string;step:string;revision:number;updatedAt?:string};
export type LearningResume={session:LearningCursor|null;nextAction:string;checksAvailable:boolean;nextStageId:string|null;progress:LearningProgress};
export const progressPath='/learning/progress/http-json-basics/1.1.0';
export const refreshLearning=()=>window.dispatchEvent(new Event('learning-progress'));
export function resumeRoute(resume:LearningResume){
 if(resume.session&&['boot-foundations','task-manager','collaboration'].includes(resume.session.courseId))return resume.progress.projectCompleted?'/projects/'+resume.session.courseId:'/learn/'+resume.session.courseId+'/1.0/'+resume.session.stageId+'?tab='+encodeURIComponent(resume.session.step==='teaching'?'教学':resume.session.step==='task'?'任务':'检查报告');
 if(resume.session?.courseId==='sql-foundations')return resume.progress.projectCompleted?'/projects/sql-foundations':'/learn/sql/1.0/'+resume.session.stageId+'?tab='+encodeURIComponent(resume.session.step==='teaching'?'教学':resume.session.step==='task'?'任务':'检查报告');
 if(resume.progress.projectCompleted)return foundationProjectRoute;
 const session=resume.session;if(!session)return foundationProjectRoute;
 if(resume.nextAction==='project-summary')return foundationProjectRoute;
 const route=session.courseVersion==='1.0.0'?'/learn/http-json/1.0/json-response':chapterRoute(session.stageId);
 const tab=({teaching:'教学',task:'任务',report:'检查报告',understanding:'理解验证'} as Record<string,string>)[session.step]||'教学';
 return route+'?tab='+encodeURIComponent(tab);
}
let positionQueue:Promise<unknown>=Promise.resolve();
export function saveLearningPosition(context:{courseId:string;courseVersion:string;stageId:string},step:string,isCurrent:()=>boolean):Promise<string>{
 const task=positionQueue.catch(()=>{}).then(async()=>{
  if(!isCurrent())return '';
  const resume=await learningRequest<LearningResume>('/learning/continue');
  if(!isCurrent())return '';
  const old=resume.session;
  if(old?.courseId===context.courseId&&old.courseVersion===context.courseVersion&&old.stageId===context.stageId&&old.step===step){
   preferFormalPosition();
   return '阅读位置已保存';
  }
  const response=await fetch('/api/v1/learning/sessions/local',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...context,step,expectedRevision:old?.revision||0}),signal:AbortSignal.timeout(10000)});
  const result=await response.json();
  if(!response.ok){if(result.code==='PREVIEW_ONLY')return '预览中 · 正式续学位置保持不变';throw new Error(result.message||'位置保存失败，请重试。')}
  if(isCurrent())preferFormalPosition();
  return '阅读位置已保存';
 });positionQueue=task;return task;
}
