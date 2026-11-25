import type {Item} from './exams/exam-api';
import type {Question, Work} from './school-api';
type GradeQuestion = Pick<Question, 'id' | 'gradingRevision'>;
export function currentLabGrade(labId:string, question:GradeQuestion, work:Work, sql?:string): Item | null | undefined;
export function justCompletedLab(labId:string, required:GradeQuestion[], before:Work, after:Work, submittedId:string, passed:boolean): boolean;
