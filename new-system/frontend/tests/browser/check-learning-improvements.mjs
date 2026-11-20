import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session='cs-improvement-20261118',base='http://127.0.0.1:5179',out=path.resolve('new-system/docs/acceptance/learning-improvements');
fs.mkdirSync(out,{recursive:true});
const prior=process.env.CS_IMPROVEMENT_CONTINUE==='true'?JSON.parse(fs.readFileSync(path.join(out,'browser-partial.json'),'utf8')):{checks:[],sizes:[]};
const checks=prior.checks,sizes=prior.sizes;
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:90000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(code){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:90000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
const click=name=>run('find','role','button','click','--name',name,'--exact');
const wait=text=>run('wait','--text',text,'--timeout','80000');
function open(route){run('open',base+route)}
function layout(page){for(const width of [1440,390,320]){run('set','viewport',String(width),'900');const v=ev('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert(v.scroll<=v.width+1,JSON.stringify({page,...v}));sizes.push({page,...v})}run('set','viewport','1440','1000')}
function record(name,value=true){assert(value,name);checks.push(name)}
try{
 if(process.env.CS_IMPROVEMENT_CONTINUE!=='true'){
 open('/learn');wait('打开入门项目');
 record('Empty account starts at the project instead of a fabricated task');
 ev(`window.originalFetch=window.fetch;window.fetch=(input,options)=>String(input).endsWith('/learning/continue')?Promise.resolve(new Response(JSON.stringify(window.resumeFixture),{status:200,headers:{'Content-Type':'application/json'}})):window.originalFetch(input,options);true`);
 for(const [courseId,stage,title,prefix] of [['http-json-basics','fix-response','后端入门实验室','/learn/http-json/1.1/'],['sql-foundations','db-connect','任务数据实验室','/learn/sql/1.0/'],['boot-foundations','boot-jdbc','接口启动实验室','/learn/boot-foundations/1.0/'],['task-manager','a-read','个人任务管理','/learn/task-manager/1.0/'],['collaboration','b-login','学习计划与任务协作','/learn/collaboration/1.0/']]){
  for(const [step,tab,label] of [['teaching','教学','继续阅读'],['task','任务','继续当前任务'],['report','检查报告','继续查看报告']]){
   ev(`window.resumeFixture=${JSON.stringify({session:{courseId,courseVersion:courseId==='http-json-basics'?'1.1.0':'1.0.0',stageId:stage,step,revision:1},progress:{completedCount:0,totalCodeStages:6,projectCompleted:false},nextAction:step})};window.dispatchEvent(new Event('learning-progress'));true`);
   run('wait','--fn',`document.querySelector('#resume-title')?.textContent===${JSON.stringify(title)}&&document.querySelector('.resume-action a')?.textContent.includes(${JSON.stringify(label)})`);
   const links=ev(`[...document.querySelectorAll('.continue-card a')].map(a=>({text:a.textContent,href:a.getAttribute('href')}))`);
   assert.equal(links[0].href,prefix+stage+'?tab='+encodeURIComponent(tab));
   assert(links.filter(a=>!a.href.startsWith('/projects/')).every(a=>a.href.startsWith(prefix+stage)));
   record(`${courseId} ${step}: label and all actions stay in the current course`);
  }
 }
 ev(`window.resumeFixture={session:{courseId:'sql-foundations',courseVersion:'1.0.0',stageId:'db-connect',step:'task'},progress:{completedCount:0,totalCodeStages:6,projectCompleted:false}};window.dispatchEvent(new Event('learning-progress'));true`);wait('任务数据实验室');layout('home');
 run('set','viewport','390','844');run('screenshot',path.join(out,'home-mobile.png'));
 record('Mobile first viewport exposes the review entry',ev(`document.querySelector('.improved-home>.review-entry').getBoundingClientRect().top<innerHeight`));
 open('/learn/http-json/1.1/workspace');wait('先看懂一次请求');layout('http-primer');
 click('查看解释');wait('端口选择服务');click('已经理解，开始动手');wait('重新查看本章起步讲解');record('HTTP primer predicts input, explains it and can be skipped');
 ev(`window.showDirectoryPicker=async()=>{throw new DOMException('cancelled','AbortError')};true`);click('选择项目根目录');wait('已取消选择目录');record('Cancelled folder picker gives a recoverable visible status');
 open('/learn/http-json/1.1/fix-response?tab='+encodeURIComponent('理解验证'));wait('练习并看解释');
 record('Concept options are enabled without a code job',ev(`document.querySelectorAll('.formal-verification input:not(:disabled)').length===6`));
 ev(`document.querySelector('input[name=status][value="0"]').click();document.querySelector('input[name=type][value="1"]').click();true`);click('练习并看解释');wait('此次为即时练习');record('Practice explains answers without recording completion');
 record('Practice left the completion count unchanged',ev(`(async()=>{const p=await(await fetch('/api/v1/learning/progress/http-json-basics/1.1.0')).json();return p.completedCount===0})()`));
 run('screenshot',path.join(out,'concept-practice.png'));
 open('/learn/boot-foundations/1.0/boot-jdbc?tab='+encodeURIComponent('教学'));wait('跟着一个编号');layout('jdbc-teaching');
 ev(`document.querySelector('[aria-label="JDBC完整数据流讲解"] details').open=true;true`);wait('TaskRepository.java');record('JDBC includes parameter binding, mapping, missing-row and connection failure explanations');run('screenshot',path.join(out,'jdbc-teaching.png'));
 open('/learn/task-manager/1.0/a-read');wait('用自己的页面');ev(`document.querySelector('details.learning-primer')?.setAttribute('open','');true`);wait('tasks.html');layout('frontend-bridge');record('Optional page bridge stays inside the current Boot project');
 }
 open('/learn/http-json/1.1/run-server');wait('选择项目根目录');
 const source=fs.readFileSync('new-system/course-packs/http-json-basics/1.0.0/TaskServer.java','utf8').replace('"completed":"false"','"completed":false').replace('status = 200;\n                body','status = 404;\n                body');
 ev(`(async()=>{const root=await(await navigator.storage.getDirectory()).getDirectoryHandle('improvement-http',{create:true});const file=await root.getFileHandle('TaskServer.java',{create:true});const writer=await file.createWritable();await writer.write(${JSON.stringify(source)});await writer.close();window.showDirectoryPicker=async()=>root;return true})()`);
 click('选择项目根目录');wait('工程已连接');click('TaskServer.java');click('提交验证');run('wait','--fn',"!document.querySelector('.check-job-progress')&&!!document.querySelector('.code-completion button:not(:disabled)')",'--timeout','80000');wait('功能检查通过');record('A real HTTP snapshot compiles, runs and returns functional evidence');
 ev(`(async()=>{const root=await(await navigator.storage.getDirectory()).getDirectoryHandle('improvement-http');const file=await root.getFileHandle('TaskServer.java');const writer=await file.createWritable();await writer.write(${JSON.stringify(source+'\n// IDE change')});await writer.close();return true})()`);click('刷新目录');
 record('An external edit makes the previous completion action unavailable',ev(`document.querySelector('.code-completion button').disabled`));
 click('提交验证');run('wait','--fn',"!document.querySelector('.check-job-progress')&&!!document.querySelector('.code-completion button:not(:disabled)')",'--timeout','80000');wait('功能检查通过');click('完成本关编码');wait('本关编码已完成');record('Current code can finish without a formal concept submission');
 open('/learn/http-json/1.1/trace');wait('已自动连接上次工程');click('TaskServer.java');record('Next chapter keeps the same native directory and source',ev(`(async()=>{const root=await(await navigator.storage.getDirectory()).getDirectoryHandle('improvement-http');const file=await root.getFileHandle('TaskServer.java');return (await(await file.getFile()).text()).includes('IDE change')&&document.querySelector('.folder-file-directory').innerText.includes('improvement-http')})()`));
 open('/learn/http-json/1.1/run-server');wait('已自动连接上次工程');record('Revisiting a prior chapter keeps the latest project');
 open('/learn/sql/1.0/db-connect');wait('当前脚本');layout('sql-task');
 record('SQL chapter navigation is compact and files do not masquerade as chapter links',ev(`document.querySelectorAll('.sql-chapter-nav,.sql-task .workspace-files a').length===0`));
 click('直达当前代码');record('One action reaches SQL code',ev(`document.activeElement.id==='sql-current-code'`));run('screenshot',path.join(out,'sql-code.png'));
 // Keep trial SQL entirely in this independent account and isolated database.
 ev(`localStorage.setItem('cs-sql-1.0.0-db-connect','SELECT 1 AS connected, DATABASE() AS current_database;');true`);open('/learn/sql/1.0/db-connect');wait('当前脚本');
 ev(`document.querySelector('.sql-environment-details').open=true;true`);click('启动教学环境');wait('MySQL已就绪');click('提交正式检查');wait('SQL检查通过');
 record('SQL completion is before raw results',ev(`document.querySelector('.code-completion').getBoundingClientRect().top<document.querySelector('.sql-assertion').getBoundingClientRect().top`));record('SQL passed copy keeps concepts optional',ev(`!document.querySelector('.sql-report').innerText.includes('继续验证理解')`));
 run('screenshot',path.join(out,'sql-report.png'));
 for(const theme of ['light','dark']){
  ev(`localStorage.setItem('cs-theme',${JSON.stringify(theme)});document.documentElement.dataset.theme=${JSON.stringify(theme)};true`);
  open('/learn');wait('继续学习');run('press','Tab');run('press','Enter');
  record(`${theme} skip link reaches main`,ev(`document.activeElement.id==='main'`));layout(theme+'-home');
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,sizes,picker:'Native OPFS handles and IndexedDB; OS picker result substituted in the test',at:new Date().toISOString()},null,2));
 console.log(JSON.stringify({checks:checks.length,sizes:sizes.length},null,2));
}catch(error){console.error(run('get','text','body'));fs.writeFileSync(path.join(out,'browser-partial.json'),JSON.stringify({checks,sizes,error:String(error)},null,2));throw error}finally{run('close')}
