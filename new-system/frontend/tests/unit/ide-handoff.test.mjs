import test from 'node:test';
import assert from 'node:assert/strict';
import {receiveIdeHandoff,handoffFailure} from '../../src/api/ide-handoff.ts';

test('an expired transfer opens the task tab so the recovery reason is visible',async()=>{
 const urls=[];
 const result=await receiveIdeHandoff({href:'http://127.0.0.1:5179/learn/boot-foundations/1.0/boot-start#ide-handoff=expired'},
  {replaceState:(_s,_t,url)=>urls.push(url)},{setItem:()=>assert.fail('no credential should be saved')},
  async()=>{throw new Error('网页交接已失效')});
 assert.equal(result,'网页交接已失效');
 assert.equal(handoffFailure(),'网页交接已失效');
 const final=new URL(urls.at(-1),'http://127.0.0.1:5179');
 assert.equal(final.searchParams.get('tab'),'任务');
 assert.equal(final.searchParams.get('ide-handoff-error'),'1');
});

test('IDE transfer removes its one-time fragment and restores the same submission in the browser tab',async()=>{
 const saved=new Map();const urls=[];
 const location={href:'http://127.0.0.1:5179/learn/boot-foundations/1.0/boot-start#ide-handoff=single-use'};
 const result=await receiveIdeHandoff(location,{replaceState:(_s,_t,url)=>urls.push(url)},
  {setItem:(key,value)=>saved.set(key,value)},async(path,body)=>{
   assert.ok(!urls[0].includes('single-use'));
   assert.equal(path,'/ide-handoffs/consume');assert.deepEqual(body,{code:'single-use'});
   return {binding:{id:'b1',token:'secret',directory:'D:/practice'},courseId:'boot-foundations',courseVersion:'1.0.0',stageId:'boot-start',submissionId:'s1',jobId:'j1'};
  });
 assert.equal(result,null);
 assert.equal(saved.get('cs-submission-boot-foundations-1.0.0-boot-start'),'s1');
 assert.equal(JSON.parse(saved.get('cs-submission-auth-s1')).id,'b1');
 assert.ok(urls.at(-1).includes('submission=s1&job=j1'));
 assert.ok(urls.every(url=>!url.includes('secret')));
});
