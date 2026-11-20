import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const base=process.env.CS_JOURNEY_QA_URL||'http://127.0.0.1:5179';
const workspace='/learn/http-json/1.1/';
const folderCompletion='.folder-project-workspace .completion-card';
const run=(...args)=>{
 const result=spawnSync(process.env.CS_BROWSER_BIN,['--session','cs-first-program-completion',...args],{encoding:'utf8',windowsHide:true,timeout:40000});
 assert.equal(result.status,0,`${args.join(' ').slice(0,160)}: ${result.stdout}${result.stderr}`);
 return result.stdout.trim();
};
const wait=(condition,timeout='12000')=>run('wait','--fn',condition,'--timeout',timeout);
const text=value=>run('wait','--text',value,'--timeout','12000');
const click=name=>run('find','role','button','click','--name',name,'--exact');
const evaluate=code=>JSON.parse(run('eval',code));
const firstProgram='public class TaskServer { public static void main(String[] args) {System.out.println("今天我写出了第一个程序");} }';
const service=readFileSync('new-system/course-packs/http-json-basics/1.0.0/TaskServer.java','utf8');

try{
 run('set','viewport','1366','768');
 run('open',base+workspace+'workspace?tab=任务&journey=01');
 text('让 Java 打印一句话');
 wait('Boolean(document.querySelector(".folder-project-options"))');
 run('eval',`(async()=>{
  const root=await (await navigator.storage.getDirectory()).getDirectoryHandle('completion-${process.pid}',{create:true});
  window.putCompletionFixture=async source=>{
   const file=await root.getFileHandle('TaskServer.java',{create:true});
   const writable=await file.createWritable();
   await writable.write(source);await writable.close();
  };
  await window.putCompletionFixture('public class TaskServer { public static void main(String[] args) {} }');
  for(const name of ['HELP.md','pom.xml'])await root.getFileHandle(name,{create:true});
  await root.getDirectoryHandle('.mvn',{create:true});
  window.showDirectoryPicker=async()=>root;
 })()`);
 run('click','.folder-project-options > summary');
 click('浏览器授权连接（备用）');
 click('项目文件');
 wait(`!!document.querySelector('.folder-file-directory button[title="TaskServer.java"]')`);
 assert.deepEqual(evaluate(`Array.from(document.querySelectorAll('.project-file-tree summary,.project-file-tree button'))
  .map(row=>[row.textContent,getComputedStyle(row).minHeight,getComputedStyle(row).fontSize,getComputedStyle(row).opacity])
  .sort((a,b)=>a[0].localeCompare(b[0]))`),[
  ['.mvn','24px','13px','0.55'],['HELP.md','24px','13px','0.55'],
  ['pom.xml','24px','13px','1'],['TaskServer.java','24px','13px','1'],
 ]);
 click('项目文件');
 assert.ok(evaluate("!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='我看到输出了')"));
 click('运行并检查');
 wait("document.querySelector('.check-assertions li[data-passed=false]')?.textContent.includes('没有收到文字')",'32000');
 run('eval',`window.putCompletionFixture(${JSON.stringify(firstProgram)})`);
 click('运行并检查');
 text('第 1 节通关');
 assert.ok(evaluate(`document.querySelector('.project-run[data-passed=true]').textContent.includes('运行通过')`));
 assert.ok(evaluate(`document.querySelector('.check-report').firstElementChild.querySelector('h3').textContent.includes('检查全部通过')`));
 assert.ok(evaluate(`document.querySelector('[aria-label="实际控制台输出"]').textContent.includes('今天我写出了第一个程序')`));
 run('reload');
 wait(`!!document.querySelector('${folderCompletion} a[href="/learn/journey/02"]')`);
 run('press','Enter');
 text('让浏览器显示你写的文字');
 run('open',base+workspace+'workspace?tab=任务&journey=02');
 text('运行并检查');
 click('运行并检查');
 wait("document.querySelector('.check-assertions li[data-passed=false]')?.textContent.includes('正常退出')",'32000');
 const lessonTwo=readFileSync('new-system/frontend/src/features/learning/journey/foundations.ts','utf8').split('export const firstResponse = `')[1].split('`;')[0];
 run('eval',`(async()=>{
  const root=await (await navigator.storage.getDirectory()).getDirectoryHandle('completion-${process.pid}');
  const writable=await (await root.getFileHandle('TaskServer.java')).createWritable();
  await writable.write(${JSON.stringify(lessonTwo)});await writable.close();
 })()`);
 click('运行并检查');
 text('第 2 节通关');
 assert.ok(evaluate(`!!document.querySelector('${folderCompletion} a[href="/learn/journey/03"]')`));
 console.log('PASS real console and HTTP practice check distinct outcomes and save progress automatically');

 run('open',base+workspace+'run-server?tab=任务&journey=11');
 wait(`!!document.querySelector('.project-tree-trigger')`);
 run('eval',`window.putCompletionFixture=async source=>{const root=await (await navigator.storage.getDirectory()).getDirectoryHandle('completion-${process.pid}');const writable=await (await root.getFileHandle('TaskServer.java')).createWritable();await writable.write(source);await writable.close()};window.putCompletionFixture(${JSON.stringify(firstProgram)})`);
 const submit=()=>run('click','.project-run');
 const failed=`document.querySelector('.check-assertions li[data-passed=false]')?.textContent.includes('正常退出')`;
 submit();
 wait(failed,'32000');
 assert.ok(evaluate("document.querySelector('.check-log')?.textContent.includes('今天我写出了第一个程序')"));
 assert.ok(evaluate(`document.querySelector('${folderCompletion}')?.textContent.includes('尚待通关')`));
 assert.ok(evaluate(`!document.querySelector('${folderCompletion} a')`));
 console.log('PASS real HTTP check explains normal exit and marks the missing service as a failed step');

 run('eval',`window.putCompletionFixture(${JSON.stringify(service)})`);
 submit();
 wait(`!!document.querySelector('${folderCompletion}[data-state=passed] button:not([disabled])')`,'32000');
 assert.ok(evaluate(`(() => {
  const next=document.querySelector('${folderCompletion} .completion-next').getBoundingClientRect();
  const dock=document.querySelector('.workspace-dock-results .workspace-output').getBoundingClientRect();
  return next.bottom<=dock.bottom+1 && next.bottom<=innerHeight;
 })()`),'The next action should fit in the initial results dock');
 if(process.env.CS_COMPLETION_SCREENSHOT)run('screenshot',process.env.CS_COMPLETION_SCREENSHOT);
 run('press','Enter');
 wait('location.pathname==="/learn/journey/12"');
 run('open',base+workspace+'run-server?tab=任务&journey=11');
 wait(`!!document.querySelector('${folderCompletion}[data-state=passed] a[href="/learn/journey/12"]')`);
 run('eval',`window.putCompletionFixture=async source=>{const root=await (await navigator.storage.getDirectory()).getDirectoryHandle('completion-${process.pid}');const writable=await (await root.getFileHandle('TaskServer.java')).createWritable();await writable.write(source);await writable.close()}`);
 run('eval',`window.putCompletionFixture(${JSON.stringify(firstProgram)})`);
 wait('Boolean(document.querySelector(".workspace-dock-results .check-stale"))');
 assert.ok(evaluate('!document.querySelector(".project-run[data-passed=true],.workspace-dock-results .completion-next:not(:disabled)")'));
 run('press','Enter');
 assert.ok(evaluate('location.pathname.endsWith("/run-server")'));
 submit();
 wait(failed,'32000');
 wait(`document.querySelector('${folderCompletion}')?.textContent.includes('已有通关记录')`);
 assert.ok(evaluate(`!document.querySelector('${folderCompletion}[data-state=passed]')`));
 assert.ok(evaluate(`!document.querySelector('${folderCompletion} a[href="/learn/journey/12"]')`));
 run('open',base+'/projects');
 text('已完成 1/3 关');
 console.log('PASS a verified snapshot saves the milestone; a later failed snapshot preserves historical progress with separate wording');
}finally{run('close');}
