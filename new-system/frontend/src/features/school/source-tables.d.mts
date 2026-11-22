import type {Question, SourceTable} from './school-api';

export function isConnectionTask(question: Question): boolean;
export function matchSourceTables(tables: SourceTable[], question: Question): SourceTable[];
