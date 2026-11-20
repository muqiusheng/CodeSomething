import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const browser=process.env.CS_BROWSER_BIN,session='cs-foundations-finish-1111';
const directory=path.resolve('new-system/docs/acceptance/foundations');const report={checks:[]};
function run(...args){const result=spawnSync(browser,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:30000});if(result.status!==0)throw new Error(result.stdout+result.stderr);return result.stdout.trim()}
function evaluate(code){const result=spawnSync(browser,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});if(result.status!==0)throw new Error(result.stdout+result.stderr);return JSON.parse(result.stdout)}
function assert(value,message){if(!value)throw new Error(message);report.checks.push(message)}
try{
 run('open','http://127.0.0.1:5179/learn/http-json/1.1/fix-response?tab='+encodeURIComponent('任务'));run('set','viewport','1440','1000');run('wait','--text','跟着步骤做');
 evaluate(`document.documentElement.style.zoom='2';true`);
 const layout=evaluate(`({viewport:innerWidth,document:document.documentElement.scrollWidth})`);report.zoom=layout;assert(layout.document<=layout.viewport,'Runbook has no page overflow at CSS 200% zoom');
 run('find','role','button','click','--name','下一步');assert(evaluate(`document.querySelector('.runbook-current h4').textContent==='修复未找到分支'`),'Task steps remain usable at CSS 200% zoom');
 run('screenshot',path.join(directory,'task-zoom200.png'));evaluate(`document.documentElement.style.zoom='';true`);
 evaluate(`document.documentElement.dataset.motion='reduce';true`);run('open','http://127.0.0.1:5179/learn/http-json/1.1/response');run('wait','--text','响应剖析台');evaluate(`document.documentElement.dataset.motion='reduce';true`);run('find','role','button','click','--name','编号2');assert(evaluate(`document.querySelector('.anatomy-explanation').textContent.includes('404')`),'Response interaction works with reduced motion');
 const home=JSON.parse(fs.readFileSync(path.join(directory,'axe-home.json'),'utf8'));assert(home.data.counts.violations===0,'Updated primary button on home has zero axe violations');report.homeAccessibility=home.data.counts;
 const current=await fetch('http://127.0.0.1:5188/api/v1/courses/http-json-basics/versions/1.1.0').then(response=>response.json());assert(current.chapters.length===8,'Default backend on 5188 serves eight published chapters');
 report.result='passed';
}catch(error){report.result='failed';report.error=String(error);throw error}
finally{try{run('close')}catch(error){report.cleanupError=String(error)}fs.writeFileSync(path.join(directory,'finish-checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
