import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN;assert(bin,'Activate browser runtime');
const session='cs-web-r9',base='http://127.0.0.1:5179',out=path.resolve('new-system/docs/acceptance/R9');fs.mkdirSync(out,{recursive:true});
const report={checks:[],layouts:[],audits:[],startedAt:new Date().toISOString()};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:45000});assert.equal(r.status,0,args.join(' ')+'\n'+r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
const click=name=>run('find','role','button','click','--name',name,'--exact');
const tab=name=>run('find','role','tab','click','--name',name,'--exact');
const wait=text=>run('wait','--text',text);
const text=()=>ev('document.querySelector("main").innerText');
function check(pass,name){report.checks.push({pass:!!pass,name});assert(pass,name)}
function editor(value){run('wait','--fn',`document.querySelector('.monaco-editor [role=textbox]')!==null`);run('focus','.monaco-editor [role=textbox]');run('press','Control+a');run('clipboard','write',value);run('press','Control+v')}
async function terminal(){run('wait','--fn',`!document.querySelector('.workspace-toolbar .button')?.disabled`,{timeout:45000});}
if(process.argv.includes('--inspect')){const actual=JSON.parse(ev(`localStorage.getItem('cs-browser-http-json-basics-1.1.0-run-server-draft')`)).files['TaskServer.java'];const expected=fs.readFileSync('new-system/course-packs/http-json-basics/1.1.0/TaskServer.java','utf8').replace(/\r\n/g,'\n');let i=0;while(actual[i]===expected[i]&&i<expected.length)i++;console.log({actualLength:actual.length,expectedLength:expected.length,firstDifference:i,actual:actual.slice(Math.max(0,i-20),i+70),expected:expected.slice(Math.max(0,i-20),i+70)});process.exit(0)}
try{
 run('open',base+'/learn/http-json/1.1/run-server?tab='+encodeURIComponent('任务'));wait('编写并运行代码');
 editor('public class TaskServer { broken }');run('wait','--fn',`JSON.parse(localStorage.getItem('cs-browser-http-json-basics-1.1.0-run-server-draft')||'{}').dirty===false`);
 check(JSON.parse(ev(`localStorage.getItem('cs-browser-http-json-basics-1.1.0-run-server-draft')`)).files['TaskServer.java']==='public class TaskServer { broken }','editor saves complete typed source');
 click('运行并检查');wait('编译未通过');
 check(text().includes('定位 TaskServer.java:1'),'compiler error exposes line location');
 click('定位 TaskServer.java:1');
 check(ev(`document.activeElement.closest('.monaco-editor')!==null`),'compiler location focuses code editor');
 const starter=fs.readFileSync('new-system/course-packs/http-json-basics/1.1.0/TaskServer.java','utf8').replace(/\r\n/g,'\n');
 editor(starter);run('wait','--fn',`JSON.parse(localStorage.getItem('cs-browser-http-json-basics-1.1.0-run-server-draft')||'{}').dirty===false`);
 run('wait','--text','代码已变化');check(text().includes('代码已变化')||text().includes('旧快照'),'editing marks old report stale');
 run('reload');wait('编写并运行代码');run('wait','--fn',`document.querySelector('.monaco-editor')!==null`);
 check(JSON.parse(ev(`localStorage.getItem('cs-browser-http-json-basics-1.1.0-run-server-draft')`)).files['TaskServer.java'].replace(/\r\n/g,'\n')===starter,'saved draft survives reload');
 click('运行并检查');wait('功能检查通过，继续理解验证');
 check(text().includes('继续理解验证'),'current passed report enables understanding');
 run('screenshot',path.join(out,'http-editor-passed.png'));
 click('功能检查通过，继续理解验证 →');wait('正式理解验证');
 run('find','role','radio','click','--name','停止旧程序，重新运行，再请求8090','--exact');run('find','role','radio','click','--name','程序是否启动并监听8090','--exact');
 const submit=ev(`Array.from(document.querySelectorAll('button')).find(b=>/^(提交理解验证|重新验证理解)$/.test(b.textContent))?.textContent`);click(submit);wait('理解验证通过');check(text().includes('本关已达标'),'functional and understanding results persist completion');
 run('open',base+'/profile');wait('我的能力图');check(text().includes('课程已验证'),'profile updates from actual completion');run('screenshot',path.join(out,'profile-after-completion.png'));
 console.log(JSON.stringify(report,null,2));
}finally{fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2))}
