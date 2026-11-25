import assert from 'node:assert/strict';
import {test} from 'node:test';
import {justCompletedLab} from '../../src/features/school/lab-progress.mjs';

test('only the last required question earns a celebration on a formal passing submission', () => {
  const required = [{id:'a'}, {id:'b', gradingRevision:'v2'}];
  const execution = (id, status='correct') => ({
    sql:id, grade:{status, question:{id:'lab-'+id+(id==='b'?'-v2':'')}},
  });
  const work = (executions, drafts={a:'a', b:'b'}) => ({executions,drafts});
  const first = work({a:execution('a')});
  const both = work({a:execution('a'), b:execution('b')});
  const check = (before,after,id,passed) => justCompletedLab('lab',required,before,after,id,passed);

  assert.equal(check(first,both,'b',true),true);
  assert.equal(check(both,both,'b',true),false);
  assert.equal(check(first,both,'optional',true),false);
  assert.equal(check(first,both,'b',false),false);
  assert.equal(check(work({}),first,'a',true),false);
  assert.equal(check(first,work({a:execution('a'), b:execution('b','partial')}),'b',true),false);
  assert.equal(check(first,work(both.executions,{a:'changed',b:'b'}),'b',true),false);
  assert.equal(check(first,work({...both.executions,b:{...execution('b'),grade:{status:'correct',question:{id:'lab-b-v1'}}}}),'b',true),false);
});
