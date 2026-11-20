import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const browser=process.env.CS_BROWSER_BIN,session='cs-r23-finish-'+Date.now(),front='http://127.0.0.1:5179';
const evidence=path.resolve('new-system/docs/acceptance/R2.3'),workspace=path.resolve('new-system/runtime/r23-finish-practice');fs.mkdirSync(workspace,{recursive:true});
const file=path.join(workspace,'TaskServer.java');fs.writeFileSync(file,'public class TaskServer { broken }');
const report=JSON.parse(fs.readFileSync(path.join(evidence,'web-checks.json'),'utf8'));delete report.error;
function run(...args){console.log(args.slice(0,3).join(' '));const r=spawnSync(browser,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:55000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return r.stdout.trim()}
function evaluate(code){const r=spawnSync(browser,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function assert(value,message){if(!value)throw new Error(message);report.checks.push(message)}
function click(name){run('find','role','button','click','--name',name)}
function wait(text){run('wait','--text',text,'--timeout','55000')}
async function api(route,body,token){const r=await fetch(front+'/api/v1'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const result=await r.json();if(!r.ok)throw new Error(result.message);return result}
try {
 const preview=await api('/workspace-previews',{directory:workspace,courseId:'http-json-basics',courseVersion:'1.1.0',stageId:'fix-response'});
 const binding=await api('/workspace-bindings',{previewId:preview.id,pairingCode:preview.pairingCode});
 const submission=await api('/submissions',{bindingId:binding.id,expectedDigest:preview.digest},binding.token);
 run('open',front+'/learn/http-json/1.1/fix-response?tab='+encodeURIComponent('任务'));wait('跟着步骤做');
 evaluate(`sessionStorage.setItem('cs-workspace-1.1.0-fix-response',${JSON.stringify(JSON.stringify(binding))});sessionStorage.setItem('cs-submission-1.1.0-fix-response',${JSON.stringify(submission.id)});true`);
 run('reload');wait('快照已保存');click('运行代码检查');wait('编译未通过');
 run('click','[role=tabpanel]:not([hidden]) .check-report details summary');
 assert(evaluate(`document.querySelector('.check-log').textContent.includes('TaskServer.java')`),'Compilation report names the learner source file');
 run('find','role','tab','click','--name','检查报告');wait('编译未通过');
 assert(evaluate(`document.querySelector('[role=tabpanel]:not([hidden]) .check-report').textContent.includes('编译未通过')`),'Report tab shows the same real report');
 run('screenshot',path.join(evidence,'compile-report-tab.png'));
 run('find','role','tab','click','--name','任务');
 fs.writeFileSync(file,'public class TaskServer { public static void main(String[] args) { while(true){} } }');
 click('预览最新文件');wait('本次快照预览');click('保存这份快照');click('运行代码检查');wait('正在隔离环境中');click('取消检查');wait('检查已取消');
 assert(evaluate(`document.querySelector('.check-report').textContent.includes('检查已取消')`),'Running check can be cancelled from the browser');
 run('reload');wait('检查已取消');assert(evaluate(`document.querySelector('.check-report').textContent.includes('检查已取消')`),'Cancellation persists after refresh');
 const jobs=await api('/submissions/'+submission.id+'/jobs',null,binding.token);
 fs.writeFileSync('new-system/runtime/r23-restart-record.json',JSON.stringify({jobId:jobs[0].id,token:binding.token}));
 report.result='passed';
}catch(e){report.result='failed';report.error=e.stack;throw e}
finally{fs.writeFileSync(path.join(evidence,'web-checks.json'),JSON.stringify(report,null,2));run('close')}
