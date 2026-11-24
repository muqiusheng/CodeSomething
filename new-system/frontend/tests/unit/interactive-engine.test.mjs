import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lessons, modules, placement} from '../../src/features/learning/interactive/catalog.ts';
import {validateCatalog, gradeFill, gradeOrder, award, metrics, lessonAvailable, moduleAvailable, filterRows, recordStep} from '../../src/features/learning/interactive/engine.ts';

test('four progressive lessons and three-question challenges have valid references',()=>{
 assert.deepEqual(validateCatalog(lessons, modules, placement), []);
 assert.equal(lessons.length,4);
 assert.equal(new Set(lessons.flatMap(lesson=>lesson.steps.map(step=>step.kind))).size,6);
 assert.ok(validateCatalog([{...lessons[0],steps:[]}],modules,placement).length);
});

test('typed and chip answers share grading and preserve whitespace inside literals',()=>{
 const step=lessons[2].steps[2];
 assert.equal(gradeFill(step,[' equals ','application/json; charset=utf-8','status']).correct,true);
 assert.match(gradeFill(step,['==','application/json; charset=utf-8','200']).diagnostics.join(' '),/字符内容.*404/);
 assert.equal(gradeFill(step,['equals','application/json; charset= utf-8','status']).correct,false);
 assert.equal(gradeFill(lessons[3].steps[2],['completed=0','2']).correct,true);
});

test('ordering exposes each misplaced and unnecessary row',()=>{
 const step=lessons[2].steps[1];
 const wrong=gradeOrder(step,['branch','path','decoy','write']);
 assert.deepEqual(wrong.positions,['misplaced','misplaced','decoy','misplaced']);
 assert.equal(gradeOrder(step,step.solution).correct,true);
});

test('replays cannot add XP and assisted answers retain their learning credit',()=>{
 const steps=[{misses:0,hints:1},{misses:0,hints:0},{misses:2,hints:2},{misses:0,hints:0}];
 assert.deepEqual(metrics(steps),{xp:100,accuracy:75,combo:1,bestCombo:2,hints:3});
 assert.deepEqual(award(0,true,4),{xp:100,delta:100});
 assert.deepEqual(award(100,true,4),{xp:100,delta:0});
 assert.equal(recordStep(steps,4).length,4);
});

test('guided opens the first lesson, then the sequence, with module skips recorded explicitly',()=>{
 const state={profile:{mode:'guided'},progress:{},unlocks:{}};
 assert.equal(lessonAvailable(lessons[0],state),true);
 assert.equal(lessonAvailable(lessons[2],state),false);
 assert.equal(moduleAvailable('http',state),false);
 assert.equal(lessonAvailable(lessons[3],state),false);
 const passed={...state,progress:{[lessons[0].id]:{completed:true}}};
 assert.equal(lessonAvailable(lessons[1],passed),true);
 const skipped={...passed,unlocks:{sql:'skip_quiz'}};
 assert.equal(lessonAvailable(lessons[3],skipped),true);
 assert.equal(moduleAvailable('sql',skipped),true);
 assert.equal(lessonAvailable(lessons[2],{...state,profile:{mode:'open'}}),true);
});

test('SQL WHERE filters before ORDER BY and LIMIT',()=>{
 const result=filterRows([{id:1,title:'a',completed:false},{id:2,title:'b',completed:true},{id:3,title:'c',completed:false}], '0', 'DESC', 1);
 assert.deepEqual(result.map(row=>[row.id,row.reason]),[[3,'命中'],[1,'超出 LIMIT'],[2,'不满足 WHERE']]);
});
