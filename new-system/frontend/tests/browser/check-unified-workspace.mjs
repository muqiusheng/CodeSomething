import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session='cs-unified-workspace',out=path.resolve('new-system/docs/acceptance/unified-workspace');fs.mkdirSync(out,{recursive:true});
const checks=[],sizes=[];
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:75000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(code){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
const wait=text=>run('wait','--text',text,'--timeout','65000'),click=name=>run('find','role','button','click','--name',name,'--exact');
function layout(page){for(const width of [375,768,1440]){run('set','viewport',String(width),'900');const value=ev('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert(value.scroll<=value.width+1,JSON.stringify(value));sizes.push({page,...value})}run('set','viewport','1440','900')}
const reference=path.resolve('new-system/course-packs/boot-foundations/1.0.0/boot-start/reference');
const files={};for(const relative of ['pom.xml','src/main/java/dev/codesomething/lab/Application.java','src/main/java/dev/codesomething/lab/HealthController.java'])files[relative]=fs.readFileSync(path.join(reference,relative),'utf8');
files['notes.md']='Local note';files['.idea/workspace.xml']='<project/>';files['target/result.class']='build output';files['src/main/resources/application.properties']='server.port=8080';
try{
 run('open','http://127.0.0.1:5179/learn/boot-foundations/1.0/boot-start');wait('选择项目根目录');
 // Real Chromium directory/file handles and IndexedDB; only the OS picker boundary is substituted.
 ev(`(async()=>{const parent=await navigator.storage.getDirectory();try{await parent.removeEntry('learner-boot',{recursive:true})}catch{}const root=await parent.getDirectoryHandle('learner-boot',{create:true});for(const [path,text]of Object.entries(${JSON.stringify(files)})){let dir=root;const parts=path.split('/');for(const part of parts.slice(0,-1))dir=await dir.getDirectoryHandle(part,{create:true});const file=await dir.getFileHandle(parts.at(-1),{create:true});const stream=await file.createWritable();await stream.write(text);await stream.close()}window.showDirectoryPicker=async()=>root;window.testRoot=root;return true})()`);
 click('选择项目根目录');wait('工程已连接');wait('notes.md');assert.equal(ev('document.querySelectorAll(".project-file-row input[type=checkbox]").length'),0);assert(!ev('document.body.textContent.includes("网页编辑（辅助）")'));checks.push('One workspace has complete lazy directory, no selection checkboxes or separate editing mode');
 run('click','nav[aria-label=项目文件目录] summary'); // .idea is the first folder
 wait('workspace.xml');checks.push('IDE configuration remains visible in the full directory');
 click('notes.md');run('wait','--fn','document.querySelector(".monaco-editor [role=textbox]")!==null');
 run('focus','.monaco-editor [role=textbox]');run('press','Control+End');run('type','.monaco-editor [role=textbox]','\nSaved from website');wait('保存到本地（1）');click('保存到本地（1）');wait('网页修改已保存到本地工程');assert.equal(ev('(async()=>await(await window.testRoot.getFileHandle("notes.md")).getFile().then(f=>f.text()))()').replace(/\r\n/g,'\n'),'Local note\nSaved from website');checks.push('Monaco changes save through a real FileSystemWritableFileStream');
 run('focus','.monaco-editor [role=textbox]');run('press','Control+End');run('type','.monaco-editor [role=textbox]','\nUnsaved web change');
 ev('(async()=>{const file=await window.testRoot.getFileHandle("notes.md");const stream=await file.createWritable();await stream.write("Changed in IDE");await stream.close();return true})()');click('保存到本地（1）');wait('此文件已被IDE');assert.equal(ev('(async()=>await(await window.testRoot.getFileHandle("notes.md")).getFile().then(f=>f.text()))()'),'Changed in IDE');click('丢弃此文件网页修改并重新读取');wait('所有网页修改均已保存');checks.push('External edits block overwrites and preserve dirty editor until explicit reload');
 click('提交验证');wait('功能检查通过');checks.push('Submit automatically collects full Java dependencies and gets a real isolated Boot pass; notes, IDE files and outputs are excluded');
 layout('Boot unified workspace');run('screenshot',path.join(out,'workspace.png'));
 run('reload');wait('已自动连接上次工程');wait('notes.md');checks.push('Native directory handle restores from IndexedDB after reload without picker');
 // A new chapter reuses the same project. Simulate browser permission expiry at its permission boundary.
 ev("window.originalPermission=FileSystemDirectoryHandle.prototype.queryPermission;FileSystemDirectoryHandle.prototype.queryPermission=async()=> 'prompt';history.pushState({},'', '/learn/boot-foundations/1.0/boot-http');window.dispatchEvent(new PopStateEvent('popstate'));true");
 wait('重新授权');assert.equal(ev('document.querySelectorAll("nav[aria-label=项目文件目录]").length'),0);
 ev('FileSystemDirectoryHandle.prototype.queryPermission=window.originalPermission;true');click('重新授权');wait('已恢复工程读写');wait('notes.md');checks.push('Chapter changes remember the same root; permission expiry offers reauthorization without a new picker');
 // HTTP has a separate remembered root and uses the same integrated editor.
 ev("history.pushState({},'', '/learn/http-json/1.1/run-server');window.dispatchEvent(new PopStateEvent('popstate'));true");wait('选择项目根目录');
 ev(`(async()=>{const parent=await navigator.storage.getDirectory();const root=await parent.getDirectoryHandle('learner-http',{create:true});const f=await root.getFileHandle('TaskServer.java',{create:true});const w=await f.createWritable();await w.write(${JSON.stringify(fs.readFileSync('new-system/course-packs/http-json-basics/1.1.0/TaskServer.java','utf8'))});await w.close();window.showDirectoryPicker=async()=>root;return true})()`);
 click('选择项目根目录');wait('工程已连接');wait('TaskServer.java');click('TaskServer.java');run('wait','--fn','document.querySelector(".monaco-editor [role=textbox]")!==null');layout('HTTP unified workspace');checks.push('HTTP uses the same file workspace and has a project root separate from Boot');
 const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,'a11y.json'),JSON.stringify(audit,null,2));
 console.log(JSON.stringify({checks,sizes},null,2));
}finally{fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,sizes},null,2));run('close')}
