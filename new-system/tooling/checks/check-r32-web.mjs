import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const bin=process.env.CS_BROWSER_BIN;
if(!bin)throw new Error('Set CS_BROWSER_BIN');
const session='codesomething-r32',front='http://127.0.0.1:5179';
const evidence=path.resolve('new-system/docs/acceptance/R3.2');
const report={checks:[],layout:[],accessibility:[]};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:60000});if(r.status!==0||r.stdout.trim().startsWith('✗'))throw new Error(r.stdout+r.stderr);return r.stdout.trim()}
function evaluate(code){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function assert(value,label){if(!value)throw new Error(label);report.checks.push(label)}
const wait=text=>run('wait','--text',text,'--timeout','55000');
const click=name=>run('find','role','button','click','--name',name,'--exact');
const route=stage=>front+'/learn/sql/1.0/'+stage;
async function api(p){const r=await fetch(front+'/api/v1'+p);if(!r.ok)throw new Error(await r.text());return r.json()}
function axe(label){const data=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(evidence,'axe-'+label+'.json'),JSON.stringify(data,null,2));report.accessibility.push({label,...data.data.counts});assert(data.data.counts.violations===0,label+': axe has no violations')}
const stages=[
 ['db-connect','SELECT 1 AS connected,DATABASE() AS current_database;',1],
 ['db-model','CREATE TABLE tasks (id INT PRIMARY KEY,title VARCHAR(100) NOT NULL,completed BOOLEAN NOT NULL DEFAULT 0);',1],
 ['sql-read','SELECT id,title FROM tasks WHERE completed=0 ORDER BY id;',2],
 ['sql-write',"INSERT INTO tasks VALUES (9,'整理笔记',0); UPDATE tasks SET completed=1 WHERE id=1; DELETE FROM tasks WHERE id=2;",1],
 ['sql-page','SELECT id,title,completed FROM tasks ORDER BY completed,id LIMIT 2 OFFSET 2;',0],
 ['sql-transfer',"CREATE TABLE bookmarks (id INT PRIMARY KEY,title VARCHAR(100) NOT NULL,saved BOOLEAN NOT NULL DEFAULT 0); INSERT INTO bookmarks VALUES (1,'Java文档',0),(2,'SQL手册',0),(3,'接口笔记',0); UPDATE bookmarks SET saved=1 WHERE id=1; DELETE FROM bookmarks WHERE id=2; SELECT id,title FROM bookmarks WHERE saved=0 ORDER BY id;",1]
];
try {
 run('set','viewport','1440','1000');run('open',front+'/projects/sql-foundations');wait('六章，从连接到迁移');
 assert(evaluate(`document.querySelectorAll('.chapter-catalog-row').length===6`),'Six SQL chapters are available');axe('project');
 run('screenshot',path.join(evidence,'project-1440.png'));
 for(const [index,[stage,sql,answer]] of stages.entries()) {
  run('open',route(stage)+'?tab='+encodeURIComponent('任务'));run('wait','.sql-source');
  if(index===0){click('检查连接');wait('教学MySQL已就绪');}
  if(index===2) {
   run('fill','.sql-source','SELECT id,title FROM tasks WHERE completed=1 ORDER BY id;');click('提交正式检查');wait('结果不符合约定');
   assert(evaluate(`document.querySelectorAll('.sql-result-pair table').length===4`),'Wrong WHERE shows expected and actual rows for two datasets');
   run('screenshot',path.join(evidence,'wrong-where-1440.png'));click('返回任务修改SQL');run('wait','.sql-source');
  }
  run('fill','.sql-source',sql);click('提交正式检查');wait('功能检查通过，继续验证理解。');
  assert(evaluate(`document.querySelector('#sql-report-title').textContent==='功能通过'`),stage+': real MySQL functional check passes');
  assert((await api('/learning/progress/sql-foundations/1.0.0')).completedCount===index,stage+': function alone does not complete the stage');
  run('check',`.sql-understanding label:nth-of-type(${(index===0?0:answer)+1}) input`);click('提交理解验证');
  if(index===0){wait('请回看本章概念');assert((await api('/learning/progress/sql-foundations/1.0.0')).completedCount===0,'Wrong understanding does not produce completion');run('check',`.sql-understanding label:nth-of-type(${answer+1}) input`);click('提交理解验证');}
  wait('本关双结果证据已保存');
  assert((await api('/learning/progress/sql-foundations/1.0.0')).completedCount===index+1,stage+': double result produces one completion');
  if(index===2){axe('report');run('screenshot',path.join(evidence,'verified-report-1440.png'));run('reload');wait('本关双结果证据已保存');assert(evaluate(`document.querySelector('#sql-report-title').textContent==='功能通过'`),'Reload restores the persisted SQL report and understanding');}
 }
 run('open',front+'/learn');wait('任务数据实验室');assert(evaluate(`document.querySelector('#resume-title').textContent==='任务数据实验室'`),'Dashboard resumes the SQL course');
 run('open',front+'/profile');wait('6/6关达标');assert(evaluate(`document.querySelectorAll('a[href*="attempt="]').length===6`),'Profile links to the six exact SQL evidence attempts');
 run('open',route('sql-read')+'?tab='+encodeURIComponent('任务'));run('wait','.sql-source');
 run('fill','.sql-source','SELECT id,title FROM tasks WHERE id=1;');click('试运行SQL');wait('试运行完成；未写入关卡完成证据。');
 assert((await api('/learning/progress/sql-foundations/1.0.0')).completedCount===6,'Practice does not add or remove completion evidence');
 click('返回任务修改SQL');click('重置练习数据');wait('重置教学练习数据');assert(evaluate(`document.querySelector('[role=dialog]').textContent.includes('cs_practice')`),'Reset dialog names the exact practice database');axe('reset-dialog');
 run('press','Escape');assert(evaluate(`document.activeElement.textContent.includes('重置练习数据')`),'Escape cancels reset and restores trigger focus');
 click('重置练习数据');click('确认重置cs_practice');wait('cs_practice已恢复6条初始任务。');assert((await api('/learning/progress/sql-foundations/1.0.0')).completedCount===6,'Reset preserves formal completions');
 run('fill','.sql-source','SELECT id,title FROM tasks WHERE completed=0 ORDER BY id;');click('提交正式检查');wait('功能检查通过，继续验证理解。');
 for(const page of ['/projects/sql-foundations','/learn/sql/1.0/sql-read?tab='+encodeURIComponent('教学'),'/learn/sql/1.0/sql-read?tab='+encodeURIComponent('任务'),'/learn/sql/1.0/sql-read?tab='+encodeURIComponent('检查报告'),'/projects','/path','/learn','/profile']) {
  run('open',front+page);run('wait',page.includes('/learn/sql/')?'[role=tablist]':page==='/projects/sql-foundations'?'.chapter-catalog-row':page==='/profile'?'.profile-panel':page==='/projects'?'.project-card':page==='/path'?'.phase-surface':'.continue-card');
  for(const width of [1440,1024,768,375,320]){run('set','viewport',String(width),'1000');const size=evaluate('({width:innerWidth,document:document.documentElement.scrollWidth})');report.layout.push({page,...size});assert(size.document<=width,page+': no overflow at '+width)}
 }
 run('open',route('sql-read')+'?tab='+encodeURIComponent('任务'));run('wait','.sql-source');run('set','viewport','375','1000');axe('task-mobile');run('screenshot',path.join(evidence,'task-375.png'));
 run('set','viewport','1440','1000');run('click','[role=tab][data-state=active]');run('press','ArrowRight');run('press','Enter');assert(evaluate(`document.querySelector('[role=tab][data-state=active]').textContent==='检查报告'`),'Tabs support keyboard navigation');
 run('open',route('sql-read')+'?tab='+encodeURIComponent('教学'));run('wait','.sql-teaching');evaluate(`document.body.style.zoom='2'`);assert(evaluate('document.documentElement.scrollWidth<=innerWidth'),'SQL teaching fits CSS 200% zoom');evaluate(`document.body.style.zoom=''`);
 assert((await api('/learning/progress/http-json-basics/1.1.0')).completedCount===0,'SQL browser acceptance does not write HTTP completion records');
 report.result='passed';
}catch(e){report.result='failed';report.error=e.message;throw e}finally{fs.writeFileSync(path.join(evidence,'web-checks.json'),JSON.stringify(report,null,2));run('close')}
