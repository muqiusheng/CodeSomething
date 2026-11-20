import {useCallback,useEffect,useState} from 'react';
import {learningRequest} from './learning-api';

export type Skill={stageId:string;courseId:string;courseVersion:string;title:string;route:string};
export type Evidence={id:string;type:string;at:string;ruleVersion:string;digest:string;detail:string};
export type Knowledge={skill:Skill;state:string;reason:string;independence:string;retention:string;businessErrors:number;environmentErrors:number;evidence:Evidence[];corrections:{id:string;kind:string;reason:string;created_at:string}[]};
export type Plan={revision:number;review_minutes:number;focus_course:string};
export type Retrospective={courseId:string;completed:number;total:number;helpCount:number;reviewCount:number;nextRoute:string;next:string;independence:string};
export type LearnerProfile={snapshotId:string;ruleVersion:string;knowledge:Knowledge[];summary:{completed:number;total:number;independence:string;next:string;courses:Retrospective[]};plan:Plan};
export type Review={id:string;skill:Skill;ruleVersion:string;status:string;help:string;variant:number;prompt:string;options:string[];dueAt:string;answer?:number;passed?:boolean;correct?:number;explanation?:string};
export type ReviewItem={skill:Skill;state:string;retention:string;recommended:boolean;reason:string;dueAt:string;lastStatus:string;focus:boolean};
export type ReviewQueue={items:ReviewItem[];history:Review[];plan:Plan;dailyLimit:number};
export type Adjustment={id:string;kind:string;status:string;beforeMinutes:number;afterMinutes:number;beforeFocus:string;afterFocus:string;reason:string;impact:string};
export const courses:Record<string,string>={'http-json-basics':'HTTP / JSON','sql-foundations':'SQL基础','boot-foundations':'Spring Boot基础','task-manager':'个人任务管理','collaboration':'学习计划与任务协作'};
export const stateLabels:Record<string,string>={unverified:'尚无证据',verified:'课程已验证',assisted:'借助帮助完成','needs-review':'需要巩固',disputed:'结论待核实'};
export const reviewLabels:Record<string,string>={open:'待作答',completed:'已完成',later:'稍后一天',skipped:'已跳过七天',new:'尚未开始'};
export const learnerRequest=<T,>(path:string,body?:unknown)=>learningRequest<T>('/learner'+path,body);
export function useLearnerResource<T>(path:string){
 const [data,setData]=useState<T|null>(null);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 const reload=useCallback(()=>setRevision(r=>r+1),[]);
 useEffect(()=>{let active=true;setError('');void learnerRequest<T>(path).then(value=>{if(active)setData(value)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'读取失败，请重试。')});return()=>{active=false}},[path,revision]);
 return {data,error,reload};
}
