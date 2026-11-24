import type {Fill, Lesson, Module, ModuleId, Parsons, Progress, Profile, SqlControls, Step, StepRecord, TaskRow, Unlock} from './types.ts';

const unit = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[\p{L}\p{N}_$]+|==|!=|<=|>=|&&|\|\||\S/gu;
const tokens = (answer:string) => (answer.match(unit) || []).join('\u0000');
export function gradeFill(step:Fill, values:readonly string[]) {
 const diagnostics = step.slots.map((slot,index)=>{
  const normalize=slot.literal?(value:string)=>value.trim():tokens;
  const actual=normalize(values[index]||'');
  if(slot.answers.some(answer=>normalize(answer)===actual))return '';
  const misconception=Object.entries(slot.misconceptions||{}).find(([key])=>normalize(key)===actual);
  return misconception?.[1] || (actual?'再核对「'+slot.label+'」在这段代码中的用途。':'请补上「'+slot.label+'」。');
 });
 return {correct:diagnostics.every(item=>!item),diagnostics};
}

export function gradeOrder(step:Parsons, order:readonly string[]) {
 const positions=order.map((id,index)=>step.blocks.find(block=>block.id===id)?.decoy?'decoy':step.solution[index]===id?'correct':'misplaced');
 return {correct:order.length===step.solution.length&&positions.every(value=>value==='correct'),positions};
}

export function metrics(steps:readonly StepRecord[]) {
 let combo=0, bestCombo=0, firstTries=0, hints=0;
 for(const step of steps){
  combo=step.misses===0?combo+1:0;
  bestCombo=Math.max(combo,bestCombo);
  firstTries+=Number(step.misses===0);
  hints+=step.hints;
 }
 return {xp:steps.length*25,accuracy:steps.length?Math.round(firstTries*100/steps.length):0,combo,bestCombo,hints};
}
export function award(previous:number,completed:boolean,stepCount:number) {
 const xp=completed?Math.max(previous,stepCount*25):previous;
 return {xp,delta:xp-previous};
}
export function recordStep(steps:readonly StepRecord[],index:number,record?:StepRecord) {
 if(!record||index!==steps.length)return steps;
 return [...steps,record];
}

type Access = {profile:Pick<Profile,'mode'>;progress:Record<string,Pick<Progress,'completed'>>;unlocks:Partial<Record<ModuleId,Unlock>>};
const httpOrder=['http-01-request-lifecycle','http-02-json-contract','http-03-java-to-endpoint'];
export const moduleAvailable=(id:ModuleId,state:Access)=>state.profile.mode==='open'||Boolean(state.unlocks[id]);
export function lessonAvailable(lesson:Lesson,state:Access):boolean {
 if(moduleAvailable(lesson.module,state)||state.progress[lesson.id]?.completed)return true;
 if(lesson.module==='sql')return Boolean(state.unlocks.http);
 const index=httpOrder.indexOf(lesson.id);
 return index===0||(index>0&&Boolean(state.progress[httpOrder[index-1]]?.completed));
}

export function filterRows(rows:readonly TaskRow[],where:SqlControls['where'],order:SqlControls['order'],limit:number) {
 const sorted=[...rows].sort((a,b)=>(a.id-b.id)*(order==='ASC'?1:-1));
 const matches=sorted.filter(row=>where==='all'||Number(row.completed)===Number(where));
 const excluded=sorted.filter(row=>!matches.includes(row));
 return [...matches.map((row,index)=>({...row,reason:index<limit?'命中':'超出 LIMIT'})),
  ...excluded.map(row=>({...row,reason:'不满足 WHERE'}))];
}

export function validateCatalog(lessons:Lesson[],modules:Module[],placement:Step[]) {
 const errors:string[]=[];
 const unique=(items:string[])=>new Set(items).size===items.length;
 const validChoice=(step:{choices:{id:string}[];answer:string})=>unique(step.choices.map(choice=>choice.id))&&step.choices.some(choice=>choice.id===step.answer);
 function validate(step:Step) {
  if(step.hints.length!==3||step.hints.some(hint=>!hint.trim()))errors.push(step.id+' hints');
  switch(step.kind){
   case 'anatomy': {
    const hotspots=step.lines.flatMap(line=>line.hotspot?[line.hotspot]:[]);
    if(step.lines.length<5||step.lines.length>12||hotspots.length<3||hotspots.length>5||!unique(hotspots.map(item=>item.id))||step.lines.some(line=>line.hotspot&&!line.text.includes(line.hotspot.token)))errors.push(step.id+' hotspots');
    break;
   }
   case 'predict':
    if(step.code.length<5||step.code.length>10||!validChoice(step)||!step.trace.length||step.trace.some(item=>item.line<1||item.line>step.code.length))errors.push(step.id+' prediction');
    break;
   case 'fill': {
    const placeholders=Array.from(step.template.matchAll(/\{\{(\w+)\}\}/g),match=>match[1]);
    if(step.slots.length<1||step.slots.length>3||!unique(placeholders)||placeholders.join()!==step.slots.map(slot=>slot.id).join()||step.slots.some(slot=>!slot.answers.some(answer=>step.chips.includes(answer))))errors.push(step.id+' slots');
    break;
   }
   case 'parsons':
    if(step.blocks.length<4||step.blocks.length>6||!unique(step.blocks.map(block=>block.id))||!unique(step.solution)||step.solution.length!==step.blocks.filter(block=>!block.decoy).length||step.solution.some(id=>!step.blocks.some(block=>block.id===id&&!block.decoy)))errors.push(step.id+' order');
    break;
   case 'bug':
    if(step.line<1||step.line>step.code.length||!validChoice(step)||step.choices.length<3||step.choices.length>4||step.code[step.line-1]===step.corrected)errors.push(step.id+' bug');
    break;
   case 'flow':
    if(step.template==='http-pipeline'&&(!step.required.length||!unique(step.experiments.map(item=>item.id))||step.required.some(id=>!step.experiments.some(item=>item.id===id))))errors.push(step.id+' experiments');
    if(step.template==='sql-table-filter'&&(!validChoice(step)||!step.rows.length||!unique(step.rows.map(row=>String(row.id)))))errors.push(step.id+' table');
  }
 }
 if(!unique(lessons.map(lesson=>lesson.id))||!unique(modules.map(module=>module.id))||placement.length!==3)errors.push('catalog IDs or placement count');
 for(const lesson of lessons){
  if(lesson.steps.length<4||lesson.steps.length>6||!modules.some(module=>module.id===lesson.module))errors.push(lesson.id+' structure');
 }
 const steps=[...lessons.flatMap(lesson=>lesson.steps),...modules.flatMap(module=>module.challenge),...placement];
 if(!unique(steps.map(step=>step.id))||modules.some(module=>module.challenge.length!==3))errors.push('step IDs or challenge count');
 steps.forEach(validate);
 return errors;
}
