import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session=process.argv.includes('--sql-only')?'cs-r9-sql-'+Date.now():'cs-r9-smoke',base='http://127.0.0.1:5179',out=path.resolve('new-system/docs/acceptance/R9');const checks=[];
function run(...args){console.log('Browser:',args[0],String(args[1]||'').slice(0,80));const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:190000});assert.equal(r.status,0,args.join(' ')+'\n'+r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
const click=name=>run('find','role','button','click','--name',name,'--exact');const wait=text=>run('wait','--text',text,'--timeout','180000');
function editor(value){run('wait','--fn',`document.querySelector('.monaco-editor [role=textbox]')!==null`);run('focus','.monaco-editor [role=textbox]');run('press','Control+a');run('clipboard','write',value);run('press','Control+v')}
try{
 if(!process.argv.includes('--sql-only')){run('open',base+'/learn/boot-foundations/1.0/boot-start?tab='+encodeURIComponent('任务'));wait('编写并运行代码');
 click('HealthController.java');editor(fs.readFileSync('new-system/course-packs/boot-foundations/1.0.0/boot-start/reference/src/main/java/dev/codesomething/lab/HealthController.java','utf8'));wait('已保存到服务器');click('运行并检查');wait('功能检查通过，继续理解验证');checks.push('Boot multi-file source compiles and passes real isolated checks');run('screenshot',path.join(out,'boot-real-check-passed.png'));
 click('功能检查通过，继续理解验证 →');wait('正式理解验证');checks.push('Boot passed snapshot connects to understanding step');}
 run('open',base+'/learn/sql/1.0/db-connect?tab='+encodeURIComponent('任务'));wait('SQL代码');if(ev(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='启动教学环境')`)){click('启动教学环境');wait('检查连接')}editor('SELECT 1 AS connected;');click('试运行SQL');wait('试运行完成');assert(ev(`document.querySelector('main').innerText.includes('connected')`));checks.push('SQL editor executes against real MySQL and displays query result');run('screenshot',path.join(out,'sql-real-result.png'));
 console.log(JSON.stringify(checks));
}finally{fs.writeFileSync(path.join(out,process.argv.includes('--sql-only')?'sql-smoke.json':'course-smoke.json'),JSON.stringify({checks},null,2));run('close')}
