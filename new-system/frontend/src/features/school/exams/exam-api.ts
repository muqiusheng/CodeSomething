import {apiFetch} from '../../../api/auth-api';
import {useCallback} from 'react';
import {useScopedRead} from '../../../hooks/useScopedRead';
import {schoolRequest, type RunResult} from '../school-api';

export type Kind = 'choice' | 'boolean' | 'blank' | 'sql';
export type Mode = 'exam' | 'practice';
export type Question = {id:string; kind:Kind; points:number; prompt:string; labId:string; tags:string[];
  options:{id:string; text:string}[]; template:string | null; blankCount:number};
export type Table = RunResult['tables'][number];
export type SqlDiagnostic = {line:number; code:number; raw:string; advice:string};
export type Check = {label:string; points:number; score:number; status:string; message:string;
  diff:null | {columnsDiffer:boolean; orderDiffers:boolean; missing:(string|null)[][]; extra:(string|null)[][]};
  expected:Table[]; actual:Table[]; kind?:string|null; errorLine?:number|null; advice?:string|null};
export type Item = {question:Question; answer:string[]; score:number; status:string; explanation:string;
  correct:string[]; acceptedBlanks:string[][]; referenceSql:string|null; checks:Check[];
  sqlError?:SqlDiagnostic|null};
export type Summary = {id:string; paperId:string; title:string; mode:Mode; score:number; maxScore:number; level:string;
  scores:Record<Kind,number>; elapsedSeconds:number; submittedAt:number; completeGrading:boolean};
export type Attempt = {summary:Summary; items:Item[]};
export type Mistake = {paperId:string; paperTitle:string; attemptId:string; item:Item; count:number; mastered:boolean; updatedAt:number};
export type Draft = {id:string; paperId:string; title:string; mode:Mode; minutes:number; startedAt:number; revision:number;
  questionIds:string[]; order:Record<string,string[]>; answers:Record<string,string[]>; stars:string[]};
export type Work = {draft:Draft; questions:Question[]; serverNow:number; outdated?:boolean; receivedAt?:number};
export type Paper = {id:string; title:string; group:'specialty'|'mock'; labId:string|null; count:number; best:number|null;
  latest:number|null; draftId:string|null; questionCount:number; maxScore:number; questionCounts:Record<Kind,number>};
export type Overview = {papers:Paper[]; completed:number; best:number|null; average:number|null; pending:number;
  topics:{tag:string;labId:string;points:number;score:number;percent:number}[]; history:Summary[]; reviewDraft:string|null; labTitles:Record<string,string>};
export type PaperInfo = {id:string;title:string;questions:Question[];history:Summary[]};
export type Debug = {status:string; elapsedMs:number; steps:{startLine:number;endLine:number;summary:string;status:string;
  elapsedMs:number|null;affectedRows:number|null;tables:Table[];changes:{table:string;before:string;after:string;preview?:Table|null}[]}[];
  error:null | SqlDiagnostic};

export const kindNames: Record<Kind,string> = {choice:'单项选择',boolean:'判断',blank:'SQL 填空',sql:'SQL 编程'};
export const stateNames: Record<string,string> = {
  correct:'正确',partial:'部分得分',wrong:'错误',unanswered:'未答',unavailable:'隔离 MySQL 不可用',
};
export const kinds = Object.keys(kindNames) as Kind[];
export const examApi = (course: string) => '/api/school/courses/' + encodeURIComponent(course) + '/exams';
export const examRoute = (course: string) => '/school/' + encodeURIComponent(course) + '/exams';
export const draftPath = (paper: string, id: string) => paper + '?draft=' + encodeURIComponent(id);

export async function discardExamDraft(endpoint:string,revision:number) {
  const response=await apiFetch(endpoint+'?revision='+revision,{method:'DELETE',cache:'no-store'});
  if (!response.ok) {
    const data=await response.json().catch(()=>null);
    throw new Error(data?.message || '暂时无法放弃草稿，请重试。');
  }
}

export function useExamRead<T>(url: string | null) {
  const read = useCallback(() => schoolRequest<T>(url!), [url]);
  return useScopedRead(url, read, {staleTime:0});
}


export function useExamWork(url: string | null) {
  const read = useCallback(async () => ({...await schoolRequest<Work>(url!),receivedAt:Date.now()}), [url]);
  return useScopedRead(url, read, {staleTime:0});
}
