import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const browser=process.env.CS_BROWSER_BIN,session='codesomething-r25-web',front='http://127.0.0.1:5179';
if(!browser)throw new Error('Set CS_BROWSER_BIN');
const evidence=path.resolve('new-system/docs/acceptance/R2.5');fs.mkdirSync(evidence,{recursive:true});
const report={checks:[],layout:[],accessibility:[],realAnswers:[]};
function run(...args){const r=spawnSync(browser,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:60000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return r.stdout.trim()}
function evaluate(code){const r=spawnSync(browser,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function assert(value,label){if(!value)throw new Error(label);report.checks.push(label)}
const wait=text=>run('wait','--text',text,'--timeout','55000');
async function api(route){const r=await fetch(front+'/api/v1'+route);if(!r.ok)throw new Error(await r.text());return r.json()}
function idFor(stage='json'){return evaluate(`JSON.parse(sessionStorage.getItem('cs-tutor-1.1.0-${stage}')).id`)}
async function terminal(id){let state;const samples=[];for(let i=0;i<220;i++){state=await api('/tutor/requests/'+id);samples.push({revision:state.revision,status:state.status,characters:state.answer.length});if(!['queued','running','cancelling'].includes(state.status))return {state,samples};await new Promise(r=>setTimeout(r,200))}throw new Error('Tutor request timed out')}
function axe(label){const data=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(evidence,'axe-'+label+'.json'),JSON.stringify(data,null,2));report.accessibility.push({label,...data.data.counts});assert(data.data.counts.violations===0,label+': no axe violations')}
try{
 run('set','viewport','1440','1000');run('open',front+'/learn/http-json/1.1/json');run('wait','.desktop-tutor textarea');
 assert(evaluate(`document.querySelector('.desktop-tutor input[type=checkbox]').checked`),'Lesson context selected by default');
 assert(evaluate(`Array.from(document.querySelectorAll('.desktop-tutor input[type=checkbox]')).slice(1).every(x=>!x.checked&&x.disabled)`),'Code and report are unavailable and unchecked without a saved snapshot');
 run('fill','.desktop-tutor textarea','请用两句话解释JSON中的false为什么不能加双引号，并提出一个引导问题。');run('click','.desktop-tutor button[type=submit]');
 const first=idFor(),result=await terminal(first);report.realAnswers.push(result);
 assert(result.state.status==='completed','Official ChatGPT produces a completed web answer');
 assert(result.state.answer.includes('布尔'),'Real answer explains the boolean type');
 assert(!result.state.answer.includes('Spring Boot'),'HTTP/JSON tutor does not substitute a Spring Boot lesson');
 assert(result.state.contextManifest==='课程片段','Sent context manifest contains the selected lesson only');
 assert(result.samples.some(x=>x.status==='running'&&x.characters>0),'Partial answer is observable before completion');
 wait('回答已完成');assert(evaluate(`document.querySelector('.desktop-tutor .tutor-answer').textContent.length>20`),'Streamed answer renders in the tutor');
 run('screenshot',path.join(evidence,'answer-1440.png'));axe('desktop-answer');
 for(const width of [1440,1024,768,375,320]){run('set','viewport',String(width),'1000');const size=evaluate('({width:innerWidth,document:document.documentElement.scrollWidth})');report.layout.push(size);assert(size.document<=width,'No lesson page overflow at '+width)}
 run('set','viewport','375','1000');run('find','role','button','click','--name','学习辅导');
 assert(evaluate(`document.querySelector('.tutor-drawer .tutor-answer').textContent.length>20`),'Drawer shares the existing answer without another inference');
 run('screenshot',path.join(evidence,'answer-drawer-375.png'));axe('drawer-answer');run('press','Escape');
 assert(evaluate(`document.activeElement===document.querySelector('.tutor-drawer-trigger button')`),'Closing the drawer restores trigger focus');
 run('reload');run('wait','.tutor-drawer-trigger button');run('find','role','button','click','--name','学习辅导');wait('回答已完成');
 assert(idFor()===first,'Reload restores the same persisted request');
 assert(evaluate(`document.querySelector('.tutor-drawer .tutor-answer').textContent.length>20`),'Reload restores the saved answer');
 run('press','Escape');run('set','viewport','1440','1000');
 run('select','.desktop-tutor select','example');run('fill','.desktop-tutor textarea','请逐步分析JSON字段的类型转换，给出局部示例，并解释每一步的原因。');run('click','.desktop-tutor button[type=submit]');
 const stopId=idFor();run('find','role','button','click','--name','停止回答');const stopped=await terminal(stopId);report.realAnswers.push(stopped);
 assert(stopped.state.status==='cancelled','Web stop ends the real provider request');wait('已停止');
 assert(stopped.state.level==='example','Example help level is bound to its request');
 run('open',front+'/learn/http-json/1.1/request');run('wait','.desktop-tutor textarea');
 assert(!evaluate(`!!document.querySelector('.desktop-tutor .tutor-response')`),'Other chapters do not inherit the previous chapter answer');
 run('open',front+'/settings');wait('检查ChatGPT连接');run('find','role','button','click','--name','检查ChatGPT连接');wait('本机ChatGPT已连接');
 assert(evaluate(`document.body.textContent.includes('gpt-6.1-sol')`),'Settings show the model returned by the local account');
 run('set','viewport','320','1000');assert(evaluate('document.documentElement.scrollWidth<=innerWidth'),'Connection settings fit 320px');axe('connection-settings');
 assert((await api('/learning/progress/http-json-basics/1.1.0')).completedCount===0,'AI answers and stops do not create completion evidence');
 report.result='passed';
}catch(e){report.result='failed';report.error=e.message;throw e}finally{fs.writeFileSync(path.join(evidence,'web-checks.json'),JSON.stringify(report,null,2));run('close')}
