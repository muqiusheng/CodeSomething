import {test} from 'node:test';
import assert from 'node:assert/strict';
import {debugRunMode,answerState,remainingTime,restoreDraft,screenPosition,sqlItemDiagnostic,sqlErrorLine,isDuplicateSqlErrorCheck,primaryQueryPreview} from '../../src/features/school/exams/exam-state.mjs';

test('answer card distinguishes empty, partial and complete SQL blanks',()=>{
  const question = {kind:'blank',blankCount:2};
  assert.equal(answerState(question,['','   ']),'未答');
  assert.equal(answerState(question,['COUNT(*)','']),'部分已答');
  assert.equal(answerState(question,['COUNT(*)','HAVING']),'已答');
  assert.equal(answerState({kind:'boolean'},['false']),'已答');
});

test('autosave fallback is used only with the current server revision',()=>{
  const draft = {revision:3,answers:{},stars:[]};
  assert.deepEqual(restoreDraft(draft,'{"revision":2,"answers":{"q1":["A"]},"stars":[]}'),draft);
  assert.deepEqual(restoreDraft(draft,'corrupted'),draft);
  assert.deepEqual(restoreDraft(draft,'{"revision":3,"answers":{"q1":["C"]},"stars":["q1"]}'),
    {...draft,answers:{q1:['C']},stars:['q1']});
});

test('timer uses wall-clock deadlines and next question wraps',()=>{
  assert.equal(remainingTime(1000,90,1000),5400);
  assert.equal(remainingTime(1000,90,5_400_999),1);
  assert.equal(remainingTime(1000,90,5_401_000),0);
  assert.equal(remainingTime(1000,0,5_401_000),null);
  assert.equal(screenPosition(['first','second','third'],2,q=>q==='first'),0);
  assert.equal(screenPosition(['first','second','third'],2,q=>q==='fourth'),-1);
});

test('Ctrl+Enter runs the whole script unless the selection has SQL',()=>{
  assert.equal(debugRunMode(undefined),'run');
  assert.equal(debugRunMode(' \t\n'),'run');
  assert.equal(debugRunMode('SELECT 1;'),'selection');
});

test('SQL feedback helpers extract error line, deduplicate script errors, and pick full-score query preview',()=>{
  const sqlError = {line:2,code:1054,raw:"ERROR 1054 (42S22) at line 2: Unknown column 'x' in 'field list'",advice:'核对列名'};
  const failedItem = {
    question:{kind:'sql'},
    status:'wrong',
    sqlError,
    checks:[
      {label:'脚本执行成功',status:'failed',message:sqlError.raw,diff:null,expected:[],actual:[],kind:'execution',errorLine:2,advice:sqlError.advice},
      {label:'种子数据结果',status:'failed',message:sqlError.raw,diff:null,expected:[],actual:[],kind:'result_set',errorLine:2,advice:sqlError.advice},
      {label:'变更数据后仍符合题意',status:'failed',message:sqlError.raw,diff:null,expected:[],actual:[],kind:'result_set',errorLine:2,advice:sqlError.advice},
    ],
  };
  assert.deepEqual(sqlItemDiagnostic(failedItem),sqlError);
  assert.equal(sqlErrorLine(failedItem),2);
  assert.equal(failedItem.checks.every(check=>isDuplicateSqlErrorCheck(check,sqlError)),true);
  assert.equal(primaryQueryPreview(failedItem),null);

  const table = {columns:['cno','chosen'],rows:[['001','3']]};
  const passedQuery = {
    question:{kind:'sql'},
    status:'correct',
    sqlError:null,
    checks:[
      {label:'脚本执行成功',status:'passed',message:'通过',diff:null,expected:[],actual:[],kind:'execution'},
      {label:'种子数据结果',status:'passed',message:'通过',diff:null,expected:[table],actual:[table],kind:'result_set'},
      {label:'变更数据后仍符合题意',status:'passed',message:'通过',diff:null,expected:[table],actual:[table],kind:'result_set'},
    ],
  };
  assert.equal(sqlErrorLine(passedQuery),undefined);
  assert.equal(primaryQueryPreview(passedQuery)?.label,'种子数据结果');

  const passedDdl = {
    question:{kind:'sql'},
    status:'correct',
    checks:[
      {label:'脚本执行成功',status:'passed',message:'通过',diff:null,expected:[],actual:[],kind:'execution'},
      {label:'列、类型与复合主键',status:'passed',message:'通过',diff:null,expected:[table],actual:[table],kind:'state_check'},
    ],
  };
  assert.equal(primaryQueryPreview(passedDdl),null);
});
