import type {Item} from './exams/exam-api';
import {apiFetch} from '../../api/auth-api';
export type LabProgress = {id: string; title: string; questions: number; executed: number; totalQuestions: number};
export type SchoolCourse = {id: string; title: string; school: string; major: string; summary: string; engine: 'mysql' | 'manual'};
export type CourseGroup = {term: string; title: string; courses: {course: SchoolCourse; labs: LabProgress[]; examCount?: number}[]};
export type Question = {id: string; title: string; requirement: string; hint: string; optional: boolean; starterSql: string; originalText?: string | null; gradingRevision?: string | null };
export type SourceTable = {title: string; columns: string[]; rows: string[][]};
export type SchemaColumn = {name: string; type: string; primaryKey: boolean; nullable: boolean; defaultValue: string | null; extra: string};
export type SchoolSchema = {
  database: string;
  views: {name: string; columns: SchemaColumn[]}[];
  procedures: string[];
  tables: {
    name: string;
    engine: string;
    columns: SchemaColumn[];
    foreignKeys: {
      name: string; onUpdate: string; onDelete: string;
      columns: {column: string; referencedSchema: string; referencedTable: string; referencedColumn: string}[];
    }[];
    triggers: {name: string; timing: string; event: string}[];
  }[];
};
export type RunResult = {
  status: string;
  database?: string | null;
  elapsedMs: number;
  affectedRows: number | null;
  tables: {columns: string[]; rows: (string | null)[][]}[];
  message: string | null;
};
export type Work = {revision: number; drafts: Record<string, string>; executions: Record<string, {sql: string; result: RunResult; grade?: Item | null}>};
export type Student = {name: string; number: string};
export type LabDetails = {
  course: SchoolCourse & {labs: {id: string; title: string}[]};
  outline: {id: string; title: string};
  lab: {
    objective: string; requirements: string; questions: Question[];
    originalObjective?: string | null;
    originalNotes?: string | null;
    sourceTables?: SourceTable[] | null;
    fixtureSql?: string | null;
  };
  work: Work;
  grading?: boolean;
  student: Student;
  database: string | null;
};

export function labUrl(courseId: string, labId: string) {
  return '/api/school/courses/' + encodeURIComponent(courseId) + '/labs/' + encodeURIComponent(labId);
}

export async function schoolRequest<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(url, {cache: 'no-store', signal, ...(body === undefined ? {} : {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
  })});
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) throw new Error(data?.message || '无法读取课内实战服务，请重试。');
  return data as T;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试。';
}
