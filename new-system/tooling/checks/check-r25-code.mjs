import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const browser=process.env.CS_BROWSER_BIN,session='codesomething-r25-code',front='http://127.0.0.1:5179',evidence=path.resolve('new-system/docs/acceptance/R2.5');
const report={checks:[]};
function run(...args){const r=spawnSync(browser,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:60000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return r.stdout.trim()}
function evaluate(code){const r=spawnSync(browser,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function assert(value,label){if(!value)throw new Error(label);report.checks.push(label)}
const click=name=>run('find','role','button','click','--name',name),wait=text=>run('wait','--text',text,'--timeout','55000');
try{
 const workspace=path.resolve('new-system/runtime/r25-practice');fs.mkdirSync(workspace,{recursive:true});fs.writeFileSync(path.join(workspace,'TaskServer.java'),fs.readFileSync('new-system/course-packs/http-json-basics/1.1.0/TaskServer.java'));
 run('open',front+'/learn/http-json/1.1/fix-response?tab='+encodeURIComponent('任务'));run('set','viewport','1440','1000');run('wait','#practice-directory');
 run('fill','#practice-directory',workspace);click('预览提交范围');wait('确认允许读取的文件');click('确认范围并配对');wait('目录已配对');click('预览最新文件');wait('本次快照预览');click('保存这份快照');wait('快照已保存');
 assert(evaluate(`!document.querySelectorAll('.desktop-tutor input[type=checkbox]')[1].disabled`),'Saving a snapshot enables code context');
 assert(evaluate(`!document.querySelectorAll('.desktop-tutor input[type=checkbox]')[1].checked`),'Code context still requires explicit selection');
 click('运行代码检查');wait('接口行为未符合约定');
 assert(evaluate(`!document.querySelectorAll('.desktop-tutor input[type=checkbox]')[2].disabled`),'Real failed check enables report context');
 run('select','.desktop-tutor select','locate');run('check','.desktop-tutor fieldset label:nth-of-type(2) input');run('check','.desktop-tutor fieldset label:nth-of-type(3) input');
 run('fill','.desktop-tutor textarea','请根据已选代码和检查报告，定位completed字段的类型问题，告诉我先检查哪里，不要给完整实现。');
 run('network','route','**/tutor/requests/*/events*','--abort');run('click','.desktop-tutor button[type=submit]');wait('恢复回答');
 assert(evaluate(`!!document.querySelector('.desktop-tutor [role=alert]')`),'Interrupted browser stream exposes a recovery action');
 const receipt=evaluate(`JSON.parse(sessionStorage.getItem('cs-tutor-1.1.0-fix-response'))`);let answer;
 for(let i=0;i<180;i++){const r=await fetch(front+'/api/v1/tutor/requests/'+receipt.id,{headers:{Authorization:'Bearer '+receipt.token}});answer=await r.json();if(!['queued','running','cancelling'].includes(answer.status))break;await new Promise(r=>setTimeout(r,200))}
 assert(answer.status==='completed','Provider continues while the browser stream is interrupted');
 assert(answer.contextManifest.includes('代码快照')&&answer.contextManifest.includes('检查报告'),'Real prompt binds selected source and failed report');
 assert(answer.answer.includes('completed')&&answer.answer.includes('字符串'),'Real locate hint identifies the submitted JSON type error');
 report.answer=answer;
 run('network','unroute','**/tutor/requests/*/events*');click('恢复回答');wait('回答已完成');
 assert(evaluate(`JSON.parse(sessionStorage.getItem('cs-tutor-1.1.0-fix-response')).id`)===receipt.id,'Recovery reads the original request without another inference');
 run('scrollintoview','.desktop-tutor .tutor-answer');run('screenshot',path.join(evidence,'code-report-answer-1440.png'));
 fs.appendFileSync(path.join(workspace,'TaskServer.java'),'\n// Edit after the selected snapshot.\n');click('刷新检查状态');wait('代码已变化');
 assert(evaluate(`document.querySelector('.desktop-tutor fieldset').textContent.includes('旧快照')`),'Changed local files label the selected report as old');
 run('reload');run('wait','.desktop-tutor .tutor-answer');wait('回答已完成');
 assert(evaluate(`document.querySelector('.desktop-tutor .tutor-answer').textContent.includes('completed')`),'Protected source/report answer survives refresh');
 assert(evaluate(`Array.from(document.querySelectorAll('.desktop-tutor input[type=checkbox]')).slice(1).every(x=>!x.checked)`),'Refresh requires selecting code/report again for a new question');
 const progress=await (await fetch(front+'/api/v1/learning/progress/http-json-basics/1.1.0')).json();assert(progress.completedCount===0,'Failed code plus an AI hint does not complete a chapter');
 report.result='passed';
}catch(e){report.result='failed';report.error=e.message;throw e}finally{fs.writeFileSync(path.join(evidence,'code-web-checks.json'),JSON.stringify(report,null,2));run('close')}
