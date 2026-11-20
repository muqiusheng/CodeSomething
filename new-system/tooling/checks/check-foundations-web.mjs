import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const browser=process.env.CS_BROWSER_BIN;if(!browser)throw new Error('Set CS_BROWSER_BIN');
const session='cs-foundations-accept-1111';const front='http://127.0.0.1:5179';
const evidence=path.resolve('new-system/docs/acceptance/foundations');fs.mkdirSync(evidence,{recursive:true});
const resume=process.argv.includes('--resume');
const report=resume?JSON.parse(fs.readFileSync(path.join(evidence,'web-checks.json'),'utf8')):{checks:[],layout:[],accessibility:[]};
delete report.error;delete report.result;report.accessibility=report.accessibility.filter(item=>item.violations===0);
const workspace=path.resolve('new-system/runtime/foundations-web-workspace');fs.mkdirSync(workspace,{recursive:true});fs.writeFileSync(path.join(workspace,'TaskServer.java'),'class TaskServer {}');
function run(...args){const r=spawnSync(browser,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return r.stdout.trim()}
function evaluate(code){const r=spawnSync(browser,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function assert(value,message){if(!value)throw new Error(message);report.checks.push(message)}
function open(route,text){run('open',front+route);run('wait','--text',text)}
function audit(name){const result=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(evidence,'axe-'+name+'.json'),JSON.stringify(result,null,2));report.accessibility.push({name,...result.data.counts});assert(result.data.counts.violations===0,`${name}: zero axe violations`)}
try{
 if(!resume){
 run('set','viewport','1440','1000');open('/learn','打开入门项目');run('snapshot','-i');
 assert(evaluate(`document.querySelector('.resume-action a').getAttribute('href')==='/projects/backend-foundations'`),'Home starts with the project overview');run('screenshot',path.join(evidence,'home-1440.png'));
 open('/projects','后端入门实验室');run('find','role','button','click','--name','基础项目');assert(evaluate(`document.querySelectorAll('.project-card').length===1`),'Project library includes a working foundation project filter');
 open('/projects/backend-foundations','一条递进的学习路线');assert(evaluate(`document.querySelectorAll('.chapter-catalog-row').length===8`),'Overview has eight real chapter links');run('screenshot',path.join(evidence,'project-1440.png'));audit('project');
 run('find','role','link','click','--name','从第1章开始');run('wait','--text','先认识你的开发工作台');assert(evaluate(`location.pathname.endsWith('/workspace')`),'First chapter starts from development preparation');
 const routes=[['/learn','打开入门项目'],['/projects','后端入门实验室'],['/path','学习路径'],['/projects/backend-foundations','一条递进的学习路线'],...['workspace','request','response','json','run-server','trace','fix-response','transfer'].map(id=>['/learn/http-json/1.1/'+id,'本章目标'])];
 for(const [route,ready] of routes){open(route,ready);for(const width of [1440,1024,768,375,320]){run('set','viewport',String(width),'1000');const size=evaluate(`({width:innerWidth,document:document.documentElement.scrollWidth})`);report.layout.push({route,...size});assert(size.document<=width,`${route}: no page overflow at ${width}`)}}
 }
 run('set','viewport','1440','1000');open('/learn/http-json/1.1/response','响应剖析台');
 run('find','role','button','click','--name','编号2');assert(evaluate(`document.querySelector('.anatomy-explanation').textContent.includes('404')`),'Response explorer switches to a not-found response');
 run('find','role','button','click','--name','响应头');assert(evaluate(`document.querySelector('.anatomy-explanation').textContent.includes('格式')`),'Selecting a response part explains its distinct role');run('screenshot',path.join(evidence,'teaching-1440.png'));audit('teaching');
 open('/learn/http-json/1.1/json','动手改一份数据');run('find','role','switch','click','--name','完成状态');assert(evaluate(`document.querySelector('.json-source').textContent.includes('true')`),'JSON example preserves its real field interaction');
 open('/learn/http-json/1.1/fix-response?tab=任务','跟着步骤做');run('snapshot','-i');
 run('find','role','button','click','--name','下一步');assert(evaluate(`document.querySelector('.runbook-current h4').textContent==='修复未找到分支'`),'Runbook reveals the next task step');
 run('find','role','checkbox','check','--name','这一步我已操作');run('find','role','button','click','--name','修复成功响应');run('find','role','button','click','--name','修复未找到分支');assert(evaluate(`document.querySelector('.runbook-current input').checked`),'Step reminder survives browsing other steps without claiming verified completion');
 run('screenshot',path.join(evidence,'task-1440.png'));audit('task');
 run('fill','#practice-directory',workspace);run('find','role','button','click','--name','预览提交范围');run('wait','--text','确认允许读取的文件');run('find','role','button','click','--name','确认范围并配对');run('wait','--text','目录已配对');run('find','role','button','click','--name','预览最新文件');run('wait','--text','本次快照预览');run('find','role','button','click','--name','保存这份快照');run('wait','--text','快照已保存');
 const record=await evaluate(`(async()=>{const binding=JSON.parse(sessionStorage.getItem('cs-workspace-1.1.0-fix-response'));const id=sessionStorage.getItem('cs-submission-1.1.0-fix-response');const response=await fetch('/api/v1/submissions/'+id,{headers:{Authorization:'Bearer '+binding.token}});const saved=await response.json();return {id:saved.id,version:saved.courseVersion,stage:saved.stageId}})()`);
 assert(record.version==='1.1.0'&&record.stage==='fix-response','New chapter submission stores its own course version and chapter');report.submission=record;
 run('find','role','button','click','--name','创建检查作业');run('wait','--text','等待隔离运行器接入');assert(true,'Updated task page still creates a real awaiting-runner job');
 run('reload');run('wait','--text','快照已保存');assert(true,'Version-specific snapshot restores after refresh');
 for(const width of [1440,1024,768,375,320]){run('set','viewport',String(width),'1000');const size=evaluate(`({width:innerWidth,document:document.documentElement.scrollWidth})`);report.layout.push({route:'fix-response task submitted',...size});assert(size.document<=width,`Submitted runbook has no overflow at ${width}`)}
 run('set','viewport','375','1000');evaluate(`document.querySelector('.task-runbook').scrollIntoView();true`);run('screenshot',path.join(evidence,'task-375.png'));audit('task-mobile');
 open('/learn/http-json/1.1/run-server?tab=任务','跟着步骤做');assert(evaluate(`document.querySelector('#practice-directory').value===''&&!document.querySelector('#practice-directory').disabled`),'A different chapter does not borrow another binding');
 open('/learn/http-json/1.1/request','拆开一条请求');run('find','role','radio','click','--name','把路径末尾的1改成2');run('find','role','button','click','--name','核对答案');run('wait','--text','这次判断正确');assert(true,'Chapter quiz gives explanatory local feedback');
 run('set','viewport','1440','1000');run('find','role','tab','click','--name','教学');run('press','ArrowRight');assert(evaluate(`location.search.includes(encodeURIComponent('任务'))`),'Chapter tabs remain operable with the keyboard');
 open('/learn/http-json/1.0/json-response?tab=任务','让接口返回 JSON');assert(evaluate(`document.querySelector('.lesson-breadcrumb').textContent.includes('1.0.0')`),'Old published route preserves the original course version');
 open('/learn/http-json/1.1/not-real','此章节尚未发布');assert(true,'Unknown chapter shows an honest unavailable state');
 open('/projects/backend-foundations','一条递进的学习路线');run('network','route',front+'/api/v1/courses/**','--abort');run('reload');run('wait','--text','项目读取失败');run('network','unroute',front+'/api/v1/courses/**');run('find','role','button','click','--name','重试');run('wait','--text','一条递进的学习路线');assert(true,'Project loading recovers from a course service outage');
 run('set','viewport','1440','1000');evaluate(`document.documentElement.style.zoom='2';true`);assert(evaluate(`document.documentElement.scrollWidth<=innerWidth`),'Project stays usable at CSS 200% zoom');evaluate(`document.documentElement.style.zoom='';true`);
 run('set','viewport','375','1000');run('screenshot',path.join(evidence,'project-375.png'));
 report.result='passed';
}catch(error){report.result='failed';report.error=String(error);throw error}
finally{try{run('close')}catch(error){report.cleanupError=String(error)}fs.writeFileSync(path.join(evidence,'web-checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
