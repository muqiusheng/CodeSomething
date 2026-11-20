import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session='cs-folder-selection',out=path.resolve('new-system/docs/acceptance/folder-selection');fs.mkdirSync(out,{recursive:true});
const checks=[],sizes=[];
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:75000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(code){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
const wait=text=>run('wait','--text',text,'--timeout','65000'),click=name=>run('find','role','button','click','--name',name,'--exact');
function layout(page){for(const width of [375,768,1440]){run('set','viewport',String(width),'900');const v=ev('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert(v.scroll<=v.width+1);sizes.push({page,...v})}run('set','viewport','1440','900')}
const folder=path.resolve('new-system/runtime/folder-selection-acceptance/boot-project');fs.mkdirSync(folder,{recursive:true});
fs.cpSync('new-system/course-packs/boot-foundations/1.0.0/boot-start/reference',folder,{recursive:true});fs.writeFileSync(path.join(folder,'src/main/java/dev/codesomething/lab/ExtraController.java'),'This is deliberately invalid Java');fs.writeFileSync(path.join(folder,'private.txt'),'excluded secret placeholder');
try{
 run('open','http://127.0.0.1:5179/learn/boot-foundations/1.0/boot-start');wait('选择项目文件夹');assert.equal(ev('document.querySelectorAll("#practice-directory").length'),0);checks.push('No absolute path input or pairing step in the default task');
 run('upload','input[name=project-folder]',folder);wait('读取成功');wait('HealthController.java');assert(ev('document.querySelector("nav[aria-label=项目文件目录]").textContent.includes("src")'));assert(!ev('document.querySelector("nav[aria-label=项目文件目录]").textContent.includes("private.txt")'));checks.push('Directory selection reads files immediately and shows nested relative directories, excluding unrelated files');
 const extra='src/main/java/dev/codesomething/lab/ExtraController.java';run('find','role','checkbox','click','--name','提交 '+extra,'--exact');click('HealthController.java');wait('RestController');checks.push('File name opens read-only source independently from the submission checkbox');
 const selected=ev('Array.from(document.querySelectorAll(".project-file-row input:checked")).length');assert.equal(selected,3);click('提交选中的3个文件验证');wait('功能检查通过');checks.push('Only selected files are compiled: an excluded invalid Java file does not break the real Boot check');
 run('find','role','checkbox','check','--name','提交 '+extra,'--exact');wait('代码已变化');checks.push('Changing selection marks the previous result stale');
 layout('Boot directory');run('screenshot',path.join(out,'boot-directory-selection.png'));
 run('reload');wait('已恢复上次读取的副本');assert(ev('document.querySelector(".folder-project-workspace>button.btn.button.primary").disabled'));checks.push('Refresh restores the project tree but requires a fresh folder read before submitting');
 run('open','http://127.0.0.1:5179/learn/http-json/1.1/run-server');wait('选择项目文件夹');const http=path.resolve('new-system/runtime/folder-selection-acceptance/http-project');fs.mkdirSync(http,{recursive:true});fs.copyFileSync('new-system/course-packs/http-json-basics/1.1.0/TaskServer.java',path.join(http,'TaskServer.java'));run('upload','input[name=project-folder]',http);wait('读取成功');layout('HTTP directory');checks.push('HTTP uses the same folder picker and mandatory single-file selection');
 const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,'a11y.json'),JSON.stringify(audit,null,2));console.log(JSON.stringify({checks,sizes:sizes.length},null,2));
}finally{fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,sizes},null,2));run('close')}
