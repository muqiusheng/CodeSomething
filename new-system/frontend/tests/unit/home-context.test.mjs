import test from 'node:test';
import assert from 'node:assert/strict';
import {homeContext} from '../../src/features/home/home-context.mjs';

test('first visit opens the first lesson directly and a newer active lesson wins over an older formal task',()=>{
 assert.equal(homeContext(null).href,'/learn/journey/01');
 const resume={session:{courseId:'sql-foundations',courseVersion:'1.0.0',stageId:'db-connect',step:'task',updatedAt:'2026-11-19T07:00:00Z'},progress:{projectCompleted:false}};
 const lesson={title:'返回第一条HTTP响应',number:2,courseId:'http-json-basics',href:'/learn/journey/02',updatedAt:Date.parse('2026-11-19T08:00:00Z')};
 assert.equal(homeContext(resume,lesson).href,'/learn/journey/02');
 assert.match(homeContext(resume,{...lesson,updatedAt:0}).href,/^\/learn\/sql\//);
});

test('SQL resume restores the exact report and every learning action stays in SQL',()=>{
 const context=homeContext({session:{courseId:'sql-foundations',courseVersion:'1.0.0',stageId:'db-connect',step:'report'},progress:{completedCount:0,totalCodeStages:6,projectCompleted:false}});
 assert.equal(context.title,'任务数据实验室');
 assert.equal(context.href,'/learn/sql/1.0/db-connect?tab='+encodeURIComponent('检查报告'));
 assert.equal(context.action,'继续查看报告');
 assert.ok(context.links.every(link=>link.to.startsWith('/learn/sql/1.0/db-connect')));
 assert.match(context.development,/本地.*SQL/);
});

test('persisted practice passes recover the next lesson when browser storage is gone',()=>{
 const resume={session:null,progress:{completedCount:0,passedPractices:['workspace']}};
 assert.equal(homeContext(resume).href,'/learn/journey/02');
 resume.progress.passedPractices.push('workspace-http-text');
 assert.equal(homeContext(resume).href,'/learn/journey/03');
});
test('each supported project restores its own task, completed summary and empty start safely',()=>{
 for(const [courseId,stageId,project,prefix] of [['http-json-basics','transfer','backend-foundations','/learn/http-json/1.1/'],['boot-foundations','boot-jdbc','boot-foundations','/learn/boot-foundations/1.0/'],['task-manager','a-read','task-manager','/learn/task-manager/1.0/'],['collaboration','b-login','collaboration','/learn/collaboration/1.0/']]){
  const resume={session:{courseId,stageId,courseVersion:courseId==='http-json-basics'?'1.1.0':'1.0.0',step:'task'},progress:{projectCompleted:false}};
  assert.equal(homeContext(resume).href,prefix+stageId+'?tab='+encodeURIComponent('任务'));
  assert.equal(homeContext({...resume,progress:{projectCompleted:true}}).href,'/projects/'+project);
 }
 assert.equal(homeContext(null).href,'/learn/journey/01');
 assert.equal(homeContext({session:{courseId:'unknown'}}).href,'/projects');
 assert.deepEqual(homeContext({session:{courseId:'unknown'}}).links,[]);
});
