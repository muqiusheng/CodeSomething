import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const {boot} = JSON.parse(fs.readFileSync('new-system/runtime/native-bridge-qa/qa-connections.json', 'utf8'));
const session = 'cs-workspace-file-sync';
const base = path.join(boot.path, `SyncProbe${process.pid}`);
const original = base + '.txt';
const renamed = base + 'Renamed.txt';
const draftMoved = base + 'DraftMoved.txt';
const required = path.join(boot.path, 'TaskServer.java');
let createdRequired = false;
const name = path.basename(original);
const newName = path.basename(renamed);
const nestedName = path.basename(base);
const nestedFile = path.join(base, name);
const run = (...args) => {
 const result = spawnSync(process.env.CS_BROWSER_BIN, ['--session', session, ...args], {encoding:'utf8', windowsHide:true, timeout:20000});
 assert.equal(result.status, 0, `${args[0]}: ${result.stdout}${result.stderr}`);
 return result.stdout.trim();
};
const wait = text => run('wait', '--text', text, '--timeout', '8000');
const click = label => run('find', 'role', 'button', 'click', '--name', label, '--exact');
const evaluate = script => JSON.parse(run('eval', script));

try {
 fs.writeFileSync(original, 'original disk content', {flag:'wx'});
 fs.mkdirSync(base);
 fs.writeFileSync(nestedFile, 'same filename in a different directory', {flag:'wx'});
 run('open', 'http://127.0.0.1:5179/learn');
 const {id, token, name:rootName} = boot;
 run('eval', `localStorage.setItem('cs-folder-project-http-json-basics-1.1.0-native', ${JSON.stringify(JSON.stringify({id,token,name:rootName}))})`);
 // The HTTP chapter can browse a valid directory that lacks its required root file.
 run('open', 'http://127.0.0.1:5179/learn/http-json/1.1/run-server');
 wait(name);
 click(name);
 run('wait', '--fn', `!!document.querySelector('.project-open-files button[title="${name}"]')`);
 run('find', 'text', nestedName, 'click', '--exact');
 const nestedPath = `${nestedName}/${name}`;
 run('wait', '--fn', `!!document.querySelector('.folder-file-directory button[title="${nestedPath}"]')`);
 run('click', `.folder-file-directory button[title="${nestedPath}"]`);
 run('wait', '--fn', `document.querySelector('.project-open-files button[title="${nestedPath}"]')?.textContent === '${nestedPath}'`);
 run('focus', `.project-open-files button[title="${name}"]`);
 run('press', 'Enter');
 run('wait', '--fn', `!!document.querySelector('.project-open-files button[title="${name}"][aria-pressed="true"]')`);
 fs.renameSync(original, renamed);
 click('刷新目录');
 wait(newName);
 run('wait', '--fn', `!document.querySelector('.project-open-files button[title="${name}"]')`);
 assert.equal(evaluate(`!!document.querySelector('.project-open-files button[title="${nestedPath}"]')`), true, 'rename leaves the other file with the same name open');
 assert.equal(evaluate(`document.querySelector('.folder-project-workspace').innerText.includes('工程已记住，但文件暂时无法读取')`), false, 'required file does not invalidate the root');
 wait('课程要求根目录包含 TaskServer.java');
 click(newName);
 run('wait', '--fn', `!!document.querySelector('.project-open-files button[title="${newName}"][aria-pressed="true"]')`);
 if(process.env.CS_WORKSPACE_SYNC_SCREENSHOT){
  run('set', 'viewport', '1310', '920');
  run('screenshot', process.env.CS_WORKSPACE_SYNC_SCREENSHOT);
 }
 console.log('PASS missing HTTP entry does not freeze the tree, and a renamed file can be opened');

 const editor = '.folder-file-view .monaco-editor [role=textbox]';
 run('wait', '--fn', `!!document.querySelector('${editor}')`);
 run('focus', editor);
 run('press', 'Control+End');
 run('type', editor, ' unsaved web draft');
 wait('保存到本地（1）');
 fs.renameSync(renamed, draftMoved);
 click('刷新目录');
 wait('网页草稿已保留，可以复制到新位置');
 assert.equal(evaluate(`Array.from(document.querySelectorAll('.project-sync-actions button')).find(button => button.textContent.startsWith('保存到本地')).disabled`), true);
 assert.equal(evaluate(`document.querySelector('${editor}').value.trim()`), 'original disk content unsaved web draft');
 assert.equal(fs.readFileSync(draftMoved, 'utf8'), 'original disk content');
 assert.equal(fs.existsSync(renamed), false);
 click('丢弃此文件网页草稿');
 wait('所有网页修改均已保存');
 click('恢复刚才的网页修改');
 wait('网页草稿已保留，可以复制到新位置');
 run('wait', '--fn', `document.querySelector('${editor}')?.value.includes('unsaved web draft')`);
 click('丢弃此文件网页草稿');
 console.log('PASS a moved file keeps its draft accessible and supports undo after discarding');

 fs.writeFileSync(required, 'public class TaskServer {}', {flag:'wx'});
 createdRequired = true;
 click('刷新目录');
 run('wait', '--fn', `Array.from(document.querySelectorAll('.project-sync-actions button')).some(button => button.textContent==='提交验证' && !button.disabled)`);
 assert.equal(evaluate(`document.querySelector('.folder-project-workspace').innerText.includes('课程要求根目录包含 TaskServer.java')`), false);
 console.log('PASS restoring the required root file re-enables submission');

 run('open', 'http://127.0.0.1:5179/learn/boot-foundations/1.0/boot-start');
 wait('浏览器授权连接（备用）');
 run('eval', `(async()=>{
  const parent=await navigator.storage.getDirectory();
  const root=await parent.getDirectoryHandle('sync-fallback-${process.pid}',{create:true});
  const stale=await root.getFileHandle('before.txt',{create:true});
  const stream=await stale.createWritable();
  await stream.write('browser project');
  await stream.close();
  window.showDirectoryPicker=async()=>root;
  window.replaceTestFile=async()=>{
   await root.getFileHandle('after.txt',{create:true});
   await root.removeEntry('before.txt');
  };
 })()`);
 click('浏览器授权连接（备用）');
 wait('before.txt');
 click('before.txt');
 run('wait', '--fn', `!!document.querySelector('.project-open-files button[title="before.txt"]')`);
 run('eval', 'window.replaceTestFile()');
 click('刷新目录');
 wait('after.txt');
 run('wait', '--fn', `!document.querySelector('.project-open-files button[title="before.txt"]')`);
 console.log('PASS browser-granted project also refreshes while the chapter entry is missing');
} finally {
 fs.rmSync(original, {force:true});
 fs.rmSync(renamed, {force:true});
 fs.rmSync(draftMoved, {force:true});
 if(fs.existsSync(nestedFile))fs.rmSync(nestedFile);
 if(fs.existsSync(base))fs.rmdirSync(base);
 if(createdRequired)fs.rmSync(required);
 run('close');
}
