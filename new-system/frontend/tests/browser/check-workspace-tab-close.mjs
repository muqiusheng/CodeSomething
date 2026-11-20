import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

const session = 'cs-workspace-tab-close';
const editor = '.folder-file-view .monaco-editor [role=textbox]';
const run = (...args) => {
 const result = spawnSync(process.env.CS_BROWSER_BIN, ['--session',session,...args], {encoding:'utf8',windowsHide:true,timeout:35000});
 assert.equal(result.status,0,`${args[0]}: ${result.stdout}${result.stderr}`);
 return result.stdout.trim();
};
const wait = (condition, timeout='12000') => run('wait','--fn',condition,'--timeout',timeout);
const button = name => run('find','role','button','click','--name',name,'--exact');
const file = name => {
 run('focus',`.folder-file-directory button[title="${name}"]`);
 run('press','Enter');
 wait(`!!document.querySelector('.project-open-files button[title="${name}"][aria-pressed="true"]')`);
};
const close = name => {
 run('focus',`.project-open-files button[aria-label="关闭 ${name}"]`);
 run('press','Enter');
 wait(`!document.querySelector('.project-open-files button[title="${name}"]')`);
};

try {
 run('open','http://127.0.0.1:5179/learn/http-json/1.1/run-server');
 run('wait','--text','浏览器授权连接（备用）');
 run('eval',`(async()=>{
  const root=await (await navigator.storage.getDirectory()).getDirectoryHandle('tab-close-${process.pid}',{create:true});
  window.putFile=async(name,value)=>{
   const writable=await (await root.getFileHandle(name,{create:true})).createWritable();
   await writable.write(value);
   await writable.close();
  };
  window.readFixture=async name=>(await (await root.getFileHandle(name)).getFile()).text();
  await window.putFile('notes.txt','disk notes');
  await window.putFile('TaskServer.java','package com.example.task; public class TaskServer {}');
  window.showDirectoryPicker=async()=>root;
 })()`);
 button('浏览器授权连接（备用）');
 wait(`!!document.querySelector('.folder-file-directory button[title="TaskServer.java"]')`);
 file('TaskServer.java');
 file('notes.txt');
 if(process.env.CS_WORKSPACE_TAB_SCREENSHOT)run('screenshot',process.env.CS_WORKSPACE_TAB_SCREENSHOT);
 wait(`!!document.querySelector('.project-open-files button[title="notes.txt"][aria-pressed="true"]')`);
 close('notes.txt');
 wait(`!!document.querySelector('.project-open-files button[title="TaskServer.java"][aria-pressed="true"]')`);
 file('notes.txt');
 wait(`document.querySelector('${editor}')?.value.includes('disk notes')`);
 run('focus',editor);
 run('press','Control+End');
 run('type',editor,' plus draft');
 run('wait','--text','保存到本地（1）');
 close('notes.txt');
 assert.equal(JSON.parse(run('eval',`window.readFixture('notes.txt')`)),'disk notes');
 button('查看已关闭的草稿（1）');
 wait(`document.querySelector('${editor}')?.value.includes('plus draft')`);
 close('notes.txt');
 close('TaskServer.java');
 console.log('PASS closing tabs switches editors, keeps unsaved drafts recoverable, and leaves files on disk');

 button('提交验证');
 wait(`document.querySelector('.check-log')?.textContent.includes('TaskServer 缺少启动入口')`,'25000');
 assert.equal(JSON.parse(run('eval',`document.querySelector('.check-log').textContent.includes('\uFFFD')`)),false);
 assert.equal(JSON.parse(run('eval',`window.readFixture('notes.txt')`)),'disk notes plus draft');
 assert.equal(JSON.parse(run('eval',`document.querySelector('.check-versions')?.textContent.includes('local-jdk:')`)),true);
 console.log('PASS closed tabs do not remove submitted files and missing main is reported by the local runner');

 const source='package com.example.task;\n'+fs.readFileSync('new-system/course-packs/http-json-basics/1.0.0/TaskServer.java','utf8');
 run('eval',`window.putFile('TaskServer.java',${JSON.stringify(source)})`);
 button('提交验证');
 wait(`!!document.querySelector('.check-pass')`,'28000');
 assert.equal(JSON.parse(run('eval',`document.querySelector('.check-versions')?.textContent.includes('local-jdk:')`)),true);
 console.log('PASS packaged HTTP source passes real local end-to-end verification');
} finally {
 run('close');
}
