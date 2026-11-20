import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const bin=process.env.CS_BROWSER_BIN;if(!bin)throw new Error('Set CS_BROWSER_BIN');
const session='codesomething-r33-web',front='http://127.0.0.1:5179',root=path.resolve('new-system'),evidence=path.join(root,'docs/acceptance/R3.3');
const report={checks:[],layout:[],accessibility:[]};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:60000});if(r.status!==0||r.stdout.trim().startsWith('✗'))throw new Error(r.stdout+r.stderr);return r.stdout.trim()}
function evaluate(code){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function assert(ok,label){if(!ok)throw new Error(label);report.checks.push(label)}
const wait=text=>run('wait','--text',text,'--timeout','55000');
const click=name=>run('find','role','button','click','--name',name,'--exact');
function axe(label){const r=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(evidence,'axe-'+label+'.json'),JSON.stringify(r,null,2));report.accessibility.push({label,...r.data.counts});assert(r.data.counts.violations===0,label+': zero axe violations')}
try {
 const directory=path.join(root,'runtime/r33-browser-workspace');if(!fs.existsSync(directory))fs.cpSync(path.join(root,'course-packs/boot-foundations/1.0.0/boot-start/starter'),directory,{recursive:true});
 const source=path.join(directory,'src/main/java/dev/codesomething/lab/HealthController.java');
 fs.writeFileSync(source,fs.readFileSync(path.join(root,'course-packs/boot-foundations/1.0.0/boot-start/starter/src/main/java/dev/codesomething/lab/HealthController.java'),'utf8'));
 run('set','viewport','1440','1000');run('open',front+'/learn/boot-foundations/1.0/boot-start?tab='+encodeURIComponent('任务'));run('wait','#practice-directory');
 run('fill','#practice-directory',directory);click('预览提交范围');wait('确认允许读取的文件');assert(evaluate(`document.querySelectorAll('.snapshot-preview li').length===3`),'Preview shows POM and two Java files');
 click('确认范围并配对');wait('目录已配对');click('预览最新文件');wait('本次快照预览');click('保存这份快照');wait('快照已保存');click('运行代码检查');wait('接口行为未符合约定');assert(evaluate(`document.querySelector('[data-passed=false]')!==null`),'Wrong starter displays a failing assertion');
 fs.writeFileSync(source,fs.readFileSync(source,'utf8').replace('new Health("todo")','new Health("ok")'));
 click('预览最新文件');wait('本次快照预览');click('保存这份快照');wait('快照已保存');click('运行代码检查');wait('功能检查通过；关卡完成还需要理解验证。');
 click('继续正式理解验证');wait('正式理解验证');run('wait','input[name=apply]');run("check","input[name=apply][value='0']");run("check","input[name=transfer][value='0']");click('提交理解验证');wait('再想一想');assert(evaluate(`document.querySelector('.understanding-result').textContent.includes('再想一想')`),'Wrong understanding displays actionable retry');
 run("check","input[name=apply][value='1']");click('重新验证理解');wait('理解验证通过');assert(evaluate(`document.querySelector('.understanding-result').textContent.includes('理解验证通过')`),'Correct understanding is saved');
 run('reload');wait('正式理解验证通过，双结果证据已保存。');assert(evaluate(`document.querySelector('.check-report').textContent.includes('boot-start-v1')`),'Refresh restores exact report and understanding');axe('boot-report');run('screenshot',path.join(evidence,'boot-report-1440.png'));
 run('open',front+'/learn/boot-foundations/1.0/boot-http');wait('本章要解决的问题');run('focus','[role=tab][data-state=active]');run('press','ArrowRight');assert(evaluate(`document.querySelector('[role=tab][data-state=active]').textContent==='任务'`),'Arrow key switches the shared course tabs');
 run('fill','#practice-directory','D:\\missing-r33-workspace');click('预览提交范围');run('wait','#workspace-error');assert(evaluate(`document.activeElement.id==='workspace-error'`),'Invalid directory error receives focus');
 for(const route of ['/projects/boot-foundations','/projects/task-manager','/learn/boot-foundations/1.0/boot-http','/learn/boot-foundations/1.0/boot-jdbc?tab='+encodeURIComponent('任务'),'/learn/task-manager/1.0/a-transfer?tab='+encodeURIComponent('任务'),'/learn/boot-foundations/1.0/boot-start?tab='+encodeURIComponent('检查报告'),'/projects','/path','/learn','/profile']) {
  run('open',front+route);run('wait','700');
  for(const width of [320,375,768,1024,1440]){run('set','viewport',String(width),'1000');run('wait','150');const overflow=evaluate(`document.documentElement.scrollWidth>innerWidth+1`);report.layout.push({route,width,overflow});assert(!overflow,route+' fits '+width+'px');}
 }
 run('open',front+'/projects/boot-foundations');wait('章节目录');axe('boot-project');run('screenshot',path.join(evidence,'boot-project-1440.png'));
 run('open',front+'/projects/task-manager');wait('六关，从读取到独立迁移');axe('task-project');run('screenshot',path.join(evidence,'task-project-1440.png'));
 run('open',front+'/learn/task-manager/1.0/a-transfer?tab='+encodeURIComponent('任务'));wait('验收清单');axe('transfer-task');run('set','viewport','375','1000');run('screenshot',path.join(evidence,'transfer-task-375.png'));
 assert(evaluate(`getComputedStyle(document.querySelector('.boot-chapter-select')).display!=='none'`),'Phone exposes a labelled chapter selector');run('select','.boot-chapter-select select','a-read');wait('读取任务');assert(evaluate(`location.pathname.endsWith('/a-read')`),'Phone selector navigates to the chosen chapter');
 run('open',front+'/learn/boot-foundations/1.0/boot-http');wait('本章要解决的问题');evaluate(`document.documentElement.style.zoom='2';true`);assert(!evaluate(`document.documentElement.scrollWidth>innerWidth+1`),'200% CSS zoom preserves page width');evaluate(`document.documentElement.style.zoom='';true`);
 run('open',front+'/learn');wait('继续学习');assert(evaluate(`['个人任务管理','接口启动实验室'].includes(document.querySelector('#resume-title').textContent)`),'Dashboard names the current Boot/A course');
 run('open',front+'/profile');wait('项目A验证证据');assert(evaluate(`document.querySelectorAll('a[href*="submission="]').length===10`),'Profile links ten exact Boot/A evidence snapshots');axe('profile');
 fs.writeFileSync(path.join(evidence,'web-checks.json'),JSON.stringify(report,null,2));console.log('Web passed:',report.checks.length,'assertions,',report.layout.length,'viewports');
} catch(error){fs.writeFileSync(path.join(evidence,'web-failed.json'),JSON.stringify({...report,error:String(error)},null,2));throw error}
finally{try{run('close')}catch{}}
