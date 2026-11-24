export type Mode = 'guided' | 'open';
export type ModuleId = 'http' | 'sql';
export type Unlock = 'skip_quiz' | 'completed';
export type Skill = 'java' | 'http' | 'sql' | 'boot';
export type Familiarity = 'new' | 'seen' | 'used';
export type Goal = 'endpoint' | 'crud';

type Base = {id:string; title:string; prompt:string; tag:string; explanation:string; hints:[string,string,string]};
export type Choice = {id:string; label:string; feedback?:string};
export type Anatomy = Base & {kind:'anatomy'; lines:{text:string; hotspot?:{id:string; token:string; role:string; meaning:string; application:string}}[]};
export type Trace = {line:number; note:string};
export type Predict = Base & {kind:'predict'; code:string[]; input:string; choices:Choice[]; answer:string; trace:Trace[]};
export type FillSlot = {id:string; label:string; answers:string[]; literal?:boolean; misconceptions?:Record<string,string>};
export type Fill = Base & {kind:'fill'; template:string; slots:FillSlot[]; chips:string[]};
export type Parsons = Base & {kind:'parsons'; blocks:{id:string; code:string; decoy?:boolean}[]; solution:string[]};
export type Bug = Base & {kind:'bug'; symptom:string; code:string[]; line:number; guidance:string; choices:Choice[]; answer:string; corrected:string; result:string};
export type TaskRow = {id:number; title:string; completed:boolean};
export type HttpExperiment = {id:string; method:string; path:string; branch:string; status:number; body:string};
export type SqlControls = {where:'all'|'0'|'1'; order:'ASC'|'DESC'; limit:number};
export type Flow = Base & {kind:'flow'} & (
 {template:'http-pipeline'; experiments:HttpExperiment[]; required:string[]} |
 {template:'sql-table-filter'; rows:TaskRow[]; target:SqlControls; question:string; choices:Choice[]; answer:string}
);
export type Step = Anatomy | Predict | Fill | Parsons | Bug | Flow;
export type Lesson = {id:string; module:ModuleId; title:string; description:string; minutes:number; steps:Step[]};
export type Module = {id:ModuleId; title:string; description:string; bridge:string; bridgeTitle:string; challenge:[Predict|Fill|Bug,Predict|Fill|Bug,Predict|Fill|Bug]};

export type StepRecord = {misses:number; hints:number};
export type Progress = {
 completed:boolean; currentStep:number; bestAccuracy:number; xp:number; bestCombo:number;
 hintsUsed:number; mistakes:string[]; steps:StepRecord[]; revision:number; updatedAt:string;
};
export type Profile = {
 background:Record<Skill,Familiarity>; goal:Goal; results:boolean[]; recommendedLessonId:string;
 completedAt:string|null; mode:Mode; xp:number; streakDays:number; bestCombo:number; revision:number;
};
export type LearningState = {profile:Profile; progress:Record<string,Progress>; unlocks:Partial<Record<ModuleId,Unlock>>};
export type ProgressCommand = {revision:number; action:'record'|'restart'; step?:number; passed?:boolean; misses?:number; hints?:number};
