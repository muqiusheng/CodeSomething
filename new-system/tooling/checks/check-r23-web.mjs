import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const browser=process.env.CS_BROWSER_BIN;if(!browser)throw new Error('Set CS_BROWSER_BIN');
const session='cs-r23-'+Date.now();const front='http://127.0.0.1:5179';
const evidence=path.resolve('new-system/docs/acceptance/R2.3');fs.mkdirSync(evidence,{recursive:true});
const workspace=path.resolve('new-system/runtime/r23-practice');fs.mkdirSync(workspace,{recursive:true});
const starter=fs.readFileSync('new-system/course-packs/http-json-basics/1.1.0/TaskServer.java','utf8');
const file=path.join(workspace,'TaskServer.java');fs.writeFileSync(file,starter);
const report={checks:[],layout:[],accessibility:[]};
function run(...args){console.log(args.slice(0,4).join(' '));const r=spawnSync(browser,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:55000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return r.stdout.trim()}
function evaluate(code){const r=spawnSync(browser,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function assert(value,message){if(!value)throw new Error(message);report.checks.push(message)}
function click(name){run('find','role','button','click','--name',name)}
function wait(text){run('wait','--text',text,'--timeout','55000')}
function inspectAndSave(){click('预览最新文件');wait('本次快照预览');click('保存这份快照');wait('快照已保存')}
try {
 for(let attempt=0;attempt<30;attempt++){try{const r=await fetch(front+'/api/v1/courses/http-json-basics/versions/1.1.0');if(r.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
 run('open',front+'/learn/http-json/1.1/fix-response?tab='+encodeURIComponent('任务'));wait('跟着步骤做');run('snapshot','-i');
 // Tabs are navigated by their accessible names, just as a learner would.
 run('wait','#practice-directory');
 run('fill','#practice-directory',workspace);click('预览提交范围');wait('确认允许读取的文件');click('确认范围并配对');wait('目录已配对');inspectAndSave();
 click('运行代码检查');wait('接口行为未符合约定');
 assert(evaluate(`document.querySelector('.check-report').textContent.includes('未通过 · GET /api/tasks/1 JSON字段')`),'Unfixed starter reports the wrong JSON type');
 assert(evaluate(`document.querySelector('.check-report').textContent.includes('未通过 · GET /api/tasks/2 状态码')`),'Unfixed starter reports the wrong not-found status');
 run('set','viewport','1440','1000');run('screenshot',path.join(evidence,'business-error-1440.png'));
 run('reload');wait('接口行为未符合约定');assert(evaluate(`document.querySelectorAll('[role=tabpanel]:not([hidden]) .check-assertions li').length===7`),'Refresh restores the persisted report');
 let fixed=starter.replace('"completed":"false"','"completed":false');const last=fixed.lastIndexOf('status = 200;');fixed=fixed.slice(0,last)+fixed.slice(last).replace('status = 200;','status = 404;');fs.writeFileSync(file,fixed);
 click('刷新检查状态');wait('代码已变化');assert(evaluate(`!!document.querySelector('.check-stale')`),'Editing local code marks the old report stale');
 inspectAndSave();click('运行代码检查');wait('功能检查通过');
 assert(evaluate(`document.querySelectorAll('[role=tabpanel]:not([hidden]) .check-assertions li[data-passed=false]').length===0`),'Corrected interface passes all seven checks');
 assert(evaluate(`document.querySelector('.check-report').textContent.includes('关卡完成还需要理解验证')`),'Functional pass does not claim chapter completion');
 for(const width of [1440,1024,768,375,320]){run('set','viewport',String(width),'1000');const size=evaluate(`({width:innerWidth,document:document.documentElement.scrollWidth})`);report.layout.push(size);assert(size.document<=width,`Report has no page overflow at ${width}`)}
 run('screenshot',path.join(evidence,'passed-320.png'));run('set','viewport','1440','1000');run('screenshot',path.join(evidence,'passed-1440.png'));
 const axe=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(evidence,'axe-report.json'),JSON.stringify(axe,null,2));report.accessibility.push(axe.data.counts);assert(axe.data.counts.violations===0,'Report has zero axe violations');
 fs.writeFileSync(file,'public class TaskServer { broken }');inspectAndSave();click('运行代码检查');wait('编译未通过');
 run('click','[role=tabpanel]:not([hidden]) .check-report details summary');assert(evaluate(`document.querySelector('.check-log').textContent.includes('TaskServer.java')`),'Compilation report names the learner source file');
 fs.writeFileSync(file,'public class TaskServer { public static void main(String[] args) { while(true){} } }');inspectAndSave();click('运行代码检查');wait('正在隔离环境中');click('取消检查');wait('检查已取消');
 assert(evaluate(`document.querySelector('.check-report').textContent.includes('检查已取消')`),'Running check can be cancelled from the browser');
 run('reload');wait('检查已取消');assert(evaluate(`document.querySelector('.check-report').textContent.includes('检查已取消')`),'Cancellation persists after refresh');
 report.result='passed';
} catch(e){report.result='failed';report.error=e.stack;throw e;}
finally {fs.writeFileSync(path.join(evidence,'web-checks.json'),JSON.stringify(report,null,2));run('close')}


