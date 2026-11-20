import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session='cs-native-project',out=path.resolve('new-system/docs/acceptance/native-project');
const fixtures=JSON.parse(fs.readFileSync('new-system/runtime/native-bridge-qa/qa-connections.json','utf8')),checks=[],sizes=[];
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:180000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(code){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
const wait=text=>run('wait','--text',text,'--timeout','120000'),click=name=>run('find','role','button','click','--name',name,'--exact');
function check(label,work){work();checks.push(label);console.log('PASS '+label)}
function open(route,ready){run('open','http://127.0.0.1:5179'+route);wait(ready)}
function seed(key,connection){const {id,token,name}=connection;ev(`localStorage.setItem(${JSON.stringify(key+'-native')},${JSON.stringify(JSON.stringify({id,token,name}))});true`)}
function layout(label){for(const width of [390,768,1280]){run('set','viewport',String(width),'900');assert(ev('document.documentElement.scrollWidth<=innerWidth'));sizes.push({label,width})}run('set','viewport','1280','900');run('screenshot',path.join(out,label+'.png'))}
try{
 open('/learn','继续学习');ev('sessionStorage.clear();true');seed('cs-folder-project-http-json-basics-1.1.0',fixtures.http);seed('cs-folder-project-boot-foundations-1.0.0',fixtures.boot);
 open('/learn/http-json/1.1/run-server','工程可读取');wait('http-project');wait('TaskServer.java');
 check('Real native HTTP connection restores by capability and lists the physical directory',()=>assert(ev(`document.querySelector('.folder-read-status').innerText.includes('本机服务连接')`)));
 click('notes.txt');run('wait','--fn',`!!document.querySelector('.folder-file-view .monaco-editor [role=textbox]')`);
 run('focus','.folder-file-view .monaco-editor [role=textbox]');run('press','Control+End');run('type','.folder-file-view .monaco-editor [role=textbox]','\nWebsite saved');wait('保存到本地（1）');click('保存到本地（1）');wait('所有网页修改均已保存');
 check('Web editing writes the actual local file through the backend',()=>assert.equal(fs.readFileSync(path.join(fixtures.http.path,'notes.txt'),'utf8').replace(/\r\n/g,'\n'),'local-only notes\nWebsite saved'));
 run('focus','.folder-file-view .monaco-editor [role=textbox]');run('press','Control+End');run('type','.folder-file-view .monaco-editor [role=textbox]','\nUnsaved web edit');wait('保存到本地（1）');fs.writeFileSync(path.join(fixtures.http.path,'notes.txt'),'IDE update');click('保存到本地（1）');wait('文件已被IDE');
 check('External IDE edits block the old web buffer without discarding it',()=>{assert.equal(fs.readFileSync(path.join(fixtures.http.path,'notes.txt'),'utf8'),'IDE update');assert(ev(`document.querySelector('.folder-file-view [role=textbox]').value.includes('Unsaved web edit')`))});
 ev("history.pushState({},'', '/learn');window.dispatchEvent(new PopStateEvent('popstate'));true");wait('继续学习');run('reload');open('/learn/http-json/1.1/run-server','http-project');click('notes.txt');wait('保存到本地（1）');check('An unsaved web buffer survives refresh',()=>assert(ev(`document.querySelector('.folder-file-view [role=textbox]').value.includes('Unsaved web edit')`)));
 click('丢弃此文件网页修改并重新读取');wait('所有网页修改均已保存');click('恢复刚才的网页修改');wait('保存到本地（1）');click('丢弃此文件网页修改并重新读取');wait('所有网页修改均已保存');
 click('提交验证');wait('当前代码检查通过');checks.push('HTTP submitted from the native file snapshot passes a real runner');click('完成本关编码');wait('本关编码已完成');
 layout('http-native');
 const source=path.join(fixtures.http.path,'TaskServer.java');fs.appendFileSync(source,'\n// External IDE revision');click('刷新目录');wait('代码已变化');checks.push('An external source change marks the prior pass stale');
 run('reload');wait('http-project');wait('代码已变化');checks.push('Refresh restores the connection and still rejects the obsolete report');
 open('/learn/http-json/1.1/fix-response','http-project');wait('TaskServer.java');checks.push('The next chapter uses the same native project without a new picker');
 ev(`window.nativeRequests=[];window.originalNativeFetch=window.fetch;window.fetch=(...args)=>{window.nativeRequests.push(String(args[0]));return window.originalNativeFetch(...args)};window.dispatchEvent(new Event('focus'));true`);run('wait','--fn',`window.nativeRequests.some(p=>p.includes('/stamp?'))`);
 check('Background refresh checks metadata without recapturing source snapshots',()=>assert(!ev(`window.nativeRequests.some(p=>p.includes('/snapshot?'))`)));
 // Simulate a moved directory and recovery, only on our isolated fixture.
 fs.renameSync(fixtures.http.path,fixtures.http.path+'-moved');try{click('刷新目录');wait('原目录已移动');check('A moved root produces a recovery instruction rather than a raw browser exception',()=>assert(!ev(`document.querySelector('.folder-project-workspace').innerText.includes('A requested file')`)))}finally{fs.renameSync(fixtures.http.path+'-moved',fixtures.http.path)}click('刷新目录');wait('工程可读取');
 open('/learn/boot-foundations/1.0/boot-start','boot-project');wait('pom.xml');click('pom.xml');run('wait','--fn',`!!document.querySelector('.folder-file-view .monaco-editor [role=textbox]')`);click('提交验证');wait('当前代码检查通过');checks.push('Boot project with its original Maven sources passes a real runner through the native bridge');layout('boot-native');
 // The fallback remains usable, with a real OPFS directory and streams at the browser boundary.
 open('/learn/task-manager/1.0/a-read','浏览器授权连接（备用）');ev(`(async()=>{const parent=await navigator.storage.getDirectory();window.fallbackRoot=await parent.getDirectoryHandle('native-fallback',{create:true});let f=await fallbackRoot.getFileHandle('pom.xml',{create:true});let w=await f.createWritable();await w.write('<project/>');await w.close();await fallbackRoot.getDirectoryHandle('src',{create:true});window.showDirectoryPicker=async()=>fallbackRoot;return true})()`);click('浏览器授权连接（备用）');wait('native-fallback');check('Browser-granted directory fallback remains separate and usable',()=>assert(ev(`document.querySelector('.folder-read-status').innerText.includes('浏览器授权连接')`)));
 const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,'axe-workspace.json'),JSON.stringify(audit,null,2));
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,sizes,axe:audit.data.counts},null,2));console.log(JSON.stringify({checks,sizes},null,2));
}finally{fs.writeFileSync(path.join(out,'browser-partial.json'),JSON.stringify({checks,sizes},null,2));}
