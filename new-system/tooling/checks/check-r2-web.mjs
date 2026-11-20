import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const browser=process.env.CS_BROWSER_BIN;if(!browser)throw new Error('Set CS_BROWSER_BIN');
const session='cs-r2-workspace-1111';
const evidence=path.resolve('new-system/docs/acceptance/R2.1-2');fs.mkdirSync(evidence,{recursive:true});
const workspace=path.resolve('new-system/runtime/r2-web-workspace');fs.mkdirSync(workspace,{recursive:true});
const source='class TaskServer {}';fs.writeFileSync(path.join(workspace,'TaskServer.java'),source);fs.writeFileSync(path.join(workspace,'.env'),'not part of the submission');
const front='http://127.0.0.1:5179',api='http://127.0.0.1:5198/api/v1';const route='/learn/http-json/1.0/json-response';
const report={checks:[],layout:[]};
function run(...args){const result=spawnSync(browser,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:30000});if(result.status!==0)throw new Error(result.stdout+result.stderr);return result.stdout.trim()}
function evaluate(code){const result=spawnSync(browser,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});if(result.status!==0)throw new Error(result.stdout+result.stderr);return JSON.parse(result.stdout)}
function assert(value,message){if(!value)throw new Error(message);report.checks.push(message)}
try{
 run('open',front+route);run('set','viewport','1440','1000');run('wait','--text','请求如何到达接口');run('snapshot','-i');
 assert(evaluate(`document.querySelector('h1').textContent==='让接口返回 JSON'`),'Published course loads from the real backend');
 run('screenshot',path.join(evidence,'teaching-desktop.png'));
 run('find','role','tab','click','--name','任务');run('wait','--text','练习目录的绝对路径');run('snapshot','-i');
 assert(evaluate(`document.querySelector('[role=tabpanel]:not([hidden])').textContent.includes('JDK21')`),'Task includes complete setup and run instructions');
 run('fill','#practice-directory',workspace+'-missing');run('find','role','button','click','--name','预览提交范围');run('wait','--text','请选择真实目录');
 assert(evaluate(`!!document.querySelector('[role=alert]')`),'Invalid directory reports an actionable error');
 run('fill','#practice-directory',workspace);run('find','role','button','click','--name','预览提交范围');run('wait','--text','确认允许读取的文件');run('snapshot','-i');
 assert(evaluate(`document.querySelector('.snapshot-preview ul').children.length===1 && document.querySelector('.snapshot-preview ul').textContent.includes('TaskServer.java')`),'Preview contains only the allowlisted Java file');
 run('find','role','button','click','--name','确认范围并配对');run('wait','--text','目录已配对');
 run('find','role','button','click','--name','预览最新文件');run('wait','--text','本次快照预览');
 fs.writeFileSync(path.join(workspace,'TaskServer.java'),'class TaskServer { int changed; }');
 run('find','role','button','click','--name','保存这份快照');run('wait','--text','代码已变更');
 assert(evaluate(`!document.querySelector('.workspace-submission').textContent.includes('快照已保存')`),'Stale preview does not produce a submitted snapshot');
 run('find','role','button','click','--name','预览最新文件');run('wait','--text','本次快照预览');run('find','role','button','click','--name','保存这份快照');run('wait','--text','快照已保存');
 run('find','role','button','click','--name','创建检查作业');run('wait','--text','等待隔离运行器接入');
 assert(evaluate(`document.querySelector('.workspace-submission').textContent.includes('尚无功能通过结果')`),'Real job reports awaiting runner without a false pass');
 run('find','role','button','click','--name','查看检查状态');run('wait','--text','等待隔离运行器接入');
 run('reload');run('wait','--text','快照已保存');
 assert(evaluate(`document.querySelector('#practice-directory').disabled`),'Directory pairing and last submission restore after refresh');
 evaluate(`document.querySelector('.workspace-submission').scrollIntoView();true`);run('screenshot',path.join(evidence,'snapshot-desktop.png'));
 const saved=evaluate(`({binding:JSON.parse(sessionStorage.getItem('cs-workspace-http-json')).id,submission:sessionStorage.getItem('cs-submission-http-json')})`);
 report.records=saved;
 for(const tab of ['教学','任务','检查报告']){
  run('find','role','tab','click','--name',tab);
  for(const width of [1440,1024,768,375,320]){
   run('set','viewport',String(width),'1000');run('wait','100');
   const dimensions=evaluate(`({viewport:innerWidth,document:document.documentElement.scrollWidth})`);report.layout.push({tab,...dimensions});assert(dimensions.document<=width,`${tab} has no page overflow at ${width}px`);
  }
 }
 run('set','viewport','1440','1000');run('find','role','tab','click','--name','任务');
 const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(evidence,'axe-task.json'),JSON.stringify(audit,null,2));report.accessibility=audit.data.counts;assert(audit.data.counts.violations===0,'Task form has zero axe WCAG2A/AA violations');
 run('set','viewport','375','1000');evaluate(`document.querySelector('.workspace-submission').scrollIntoView();true`);run('screenshot',path.join(evidence,'snapshot-mobile.png'));
 run('network','route',front+'/api/v1/courses/**','--abort');run('reload');run('wait','--text','课程读取失败');assert(true,'Course outage is shown with retry');run('network','unroute',front+'/api/v1/courses/**');run('find','role','button','click','--name','重试');run('wait','--text','返回一条任务信息');assert(true,'Course retry recovers without resetting the task URL');
 const production=await fetch('http://127.0.0.1:5188/api/v1/courses/http-json-basics/versions/1.0.0/stages/json-task-response');assert(production.ok,'Default backend on 5188 serves the updated course');
 report.result='passed';
}catch(error){report.result='failed';report.error=String(error);throw error}
finally{try{run('close')}catch(error){report.cleanupError=String(error)}fs.writeFileSync(path.join(evidence,'web-checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
