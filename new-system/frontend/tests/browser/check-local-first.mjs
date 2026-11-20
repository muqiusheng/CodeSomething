import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session='cs-local-first',base='http://127.0.0.1:5179';
const out=path.resolve('new-system/docs/acceptance/local-first');fs.mkdirSync(out,{recursive:true});
const checks=[],sizes=[],audits=[];
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:70000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(code){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
const open=url=>run('open',base+url),wait=text=>run('wait','--text',text,'--timeout','60000'),click=name=>run('find','role','button','click','--name',name,'--exact');
function layout(label){for(const width of [375,768,1440]){run('set','viewport',String(width),'900');const v=ev('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert(v.scroll<=v.width+1,JSON.stringify({label,...v}));sizes.push({label,...v})}run('set','viewport','1440','900')}
const workspace=path.resolve('new-system/runtime/local-first-acceptance/http');fs.mkdirSync(workspace,{recursive:true});
const source=fs.readFileSync('new-system/course-packs/http-json-basics/1.1.0/TaskServer.java','utf8').replace('"completed":"false"','"completed":false').replace('status = 200;\n                body =','status = 404;\n                body =')+'\n// local-first-marker\n';
fs.writeFileSync(path.join(workspace,'TaskServer.java'),source);
try {
 open('/learn/http-json/1.1/run-server');wait('本地项目与提交');
 assert.equal(ev('document.querySelectorAll(".monaco-editor").length'),0);checks.push('HTTP defaults to local reading without initializing a web editor');
 run('fill','#practice-directory',workspace);click('读取文件范围');wait('确认允许读取的文件');click('确认范围并配对');wait('本地文件 · 只读快照');
 assert(ev('document.querySelector(".local-source-view").textContent.includes("local-first-marker")'));checks.push('Paired directory shows the actual local source in a read-only snapshot');
 click('重新读取本地文件');wait('保存这份快照');click('保存这份快照');wait('快照已保存');click('运行代码检查');wait('功能检查通过');checks.push('Local disk snapshot compiles and runs in the real isolated checker');
 click('完成本关编码');wait('本关编码已完成');checks.push('Local result can complete code without requiring a quiz');
 fs.appendFileSync(path.join(workspace,'TaskServer.java'),'\n// changed-on-disk\n');
 run('eval','window.dispatchEvent(new Event("focus"))');wait('代码已变化');checks.push('A disk edit makes the historical report stale');
 click('重新读取本地文件');wait('changed-on-disk');layout('HTTP local reader');run('screenshot',path.join(out,'http-local-reader.png'));
 audits.push({page:'HTTP local reader',result:JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'))});
 open('/learn/http-json/1.1/fix-response');wait('本地项目与提交');assert.equal(ev('document.querySelector("#practice-directory").value'),workspace);checks.push('Next chapter remembers the same project directory');
 open('/learn/boot-foundations/1.0/boot-start');wait('本地项目与提交');click('打开IDEA');wait('已发送打开请求');checks.push('Open IDEA button receives a real process-launch response');
 layout('Boot local guide');run('screenshot',path.join(out,'boot-local-guide.png'));
 click('网页编辑（辅助）');wait('已恢复本项目代码');assert(ev('document.querySelector(".code-editor-shell")!==null'));click('本地工程 · 读取与检查');wait('本地项目与提交');checks.push('Web editing remains an explicit auxiliary mode');
 for(const [course,stage] of [['task-manager','a-read'],['collaboration','b-login']]){open(`/learn/${course}/1.0/${stage}`);wait('本地项目与提交');layout(course);checks.push(course+' defaults to the local workflow')}
 open('/learn/sql/1.0/db-connect');wait('当前章节脚本');wait('网页编辑（辅助）');assert(ev('document.body.textContent.includes("默认在本地编写")'));layout('SQL import');checks.push('SQL defaults to importing a local script with optional editing');
 open('/learn/tlias/start');wait('我的Tlias工程');wait('读取本地Tlias工程');assert(ev('document.body.textContent.includes("自动判题尚未接入")'));layout('Tlias reader');run('screenshot',path.join(out,'tlias-local-reader.png'));checks.push('Tlias offers local reading and states the actual checker availability');
 console.log(JSON.stringify({checks,sizes:sizes.length},null,2));
} finally {fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,sizes,audits},null,2));run('close')}
