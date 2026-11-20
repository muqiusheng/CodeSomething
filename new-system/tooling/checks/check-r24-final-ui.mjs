import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const browser=process.env.CS_BROWSER_BIN,session='codesomething-r24-final-ui',front='http://127.0.0.1:5179';
const evidence=path.resolve('new-system/docs/acceptance/R2.4'),checks=[];
function run(...args){const result=spawnSync(browser,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:55000});if(result.status!==0)throw new Error(result.stdout+result.stderr);return result.stdout.trim()}
function evaluate(code){const result=spawnSync(browser,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});if(result.status!==0)throw new Error(result.stdout+result.stderr);return JSON.parse(result.stdout)}
function assert(value,label){if(!value)throw new Error(label);checks.push(label)}
let result='failed';
try{
 run('open',front+'/learn/http-json/1.1/fix-response');run('wait','--text','功能结果请以本次检查报告为准');
 assert(!evaluate(`document.querySelector('.chapter-teaching').textContent.includes('隔离运行器仍待接入')`),'Runtime status correction replaces the obsolete runner notice');
 run('wait','.chapter-strip [data-completed=true]');assert(evaluate(`document.querySelectorAll('.chapter-strip [data-completed=true]').length===3`),'Chapter navigation shows all three real completions');
 run('open',front+'/learn');run('wait','--text','查看项目总结');
 assert(evaluate(`document.querySelector('.tactile-button').getAttribute('href')==='/projects/backend-foundations'`),'Completed project summary stays the home destination after reviewing an earlier chapter');
 run('open',front+'/projects/backend-foundations');run('wait','--text','HTTP/JSON项目已达标');
 assert(evaluate(`Array.from(document.querySelectorAll('.chapter-dependency')).filter(item=>item.textContent.includes('已达标')).length===3`),'Project catalog uses the same three completion records');
 run('set','viewport','320','1000');assert(evaluate('document.documentElement.scrollWidth<=innerWidth'),'Final catalog labels fit the narrow viewport');
 run('set','viewport','1440','1000');run('screenshot',path.join(evidence,'final-catalog.png'));
 result='passed';
}finally{fs.writeFileSync(path.join(evidence,'final-ui-checks.json'),JSON.stringify({result,checks},null,2));run('close')}
