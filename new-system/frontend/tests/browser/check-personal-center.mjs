import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN;assert(bin,'Activate browser runtime');
const session='cs-profile-r9',base='http://127.0.0.1:5179',out=path.resolve('new-system/docs/acceptance/R9');fs.mkdirSync(out,{recursive:true});
const report={checks:[],layouts:[],audits:[],startedAt:new Date().toISOString()};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:45000});assert.equal(r.status,0,args.join(' ')+'\n'+r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
const click=name=>run('find','role','button','click','--name',name,'--exact');
const wait=text=>run('wait','--text',text);
const text=()=>ev('document.querySelector("main").innerText');
function check(pass,name){report.checks.push({pass:!!pass,name});assert(pass,name)}
function layouts(label){for(const theme of ['light','dark']){if(ev('document.documentElement.dataset.theme')!==theme)click(theme==='light'?'切换到浅色模式':'切换到深色模式');for(const width of [320,375,768,1024,1440]){run('set','viewport',String(width),'1000');run('wait','--fn',`innerWidth===${width}`);const pass=ev('document.documentElement.scrollWidth<=innerWidth+1');report.layouts.push({label,theme,width,pass});check(pass,`${label} ${theme} ${width} no overflow`)}run('screenshot',path.join(out,label+'-'+theme+'.png'));const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));report.audits.push({label,theme,counts:audit.data.counts});fs.writeFileSync(path.join(out,'axe-'+label+'-'+theme+'.json'),JSON.stringify(audit,null,2));check(audit.data.counts.violations===0,label+' '+theme+' axe zero violations')}}
try{
 if(!process.argv.includes('--finish')&&!process.argv.includes('--sql-only')){
 run('open',base+'/profile');wait('代码运行');run('wait','--fn',`document.querySelectorAll('.activity-cell').length===30`);
 check(ev(`document.querySelectorAll('.ability-radar').length===1`),'five-dimensional radar rendered');
 check(ev(`document.querySelectorAll('.learning-stat-card').length===6`),'six statistics cards use API data');
 run('select','select','7');run('wait','--fn',`document.querySelectorAll('.activity-cell').length===7`);check(text().includes('统计近7天'),'period filter updates actual API data');run('select','select','30');run('wait','--fn',`document.querySelectorAll('.activity-cell').length===30`);
 click('启动接口，课程已验证');wait('以下练习共同验证这项能力');check(text().includes('查看依据与纠正记录'),'capability reveals evidence on demand');click('收起详情');layouts('personal-center');
 click('切换到浅色模式');run('click','.sidebar .personal-trigger');check(ev(`document.querySelectorAll('[role=menuitem]').length===6`),'avatar menu contains personal center and all configuration links');
 run('screenshot',path.join(out,'personal-menu.png'));run('press','ArrowDown');check(ev(`document.activeElement.textContent`)==='学习画像与数据','menu supports arrow-key navigation');run('press','Escape');check(ev(`document.activeElement.classList.contains('personal-trigger')`),'Escape closes menu and returns focus');
 run('click','.sidebar .personal-trigger');run('find','role','menuitem','click','--name','学习偏好','--exact');wait('每日计划时长');check(ev(`location.hash`)==='#learning','preferences menu deep-links to learning settings');
 run('click','.header-right .personal-trigger');run('find','role','menuitem','click','--name','模型连接','--exact');wait('模型连接');check(ev('location.hash')==='#model','model configuration deep-link works');layouts('settings');
 run('open',base+'/learn/http-json/1.1/workspace?tab='+encodeURIComponent('任务'));wait('你的网页编程工作区已经准备好');check(!text().includes('在终端执行版本命令'),'preparation no longer requires IDE setup');check(!ev(`Array.from(document.querySelectorAll('[role=tab]')).some(e=>e.textContent.includes('检查报告'))`),'preparation has no irrelevant report tab');
 run('open',base+'/learn/http-json/1.1/run-server?tab='+encodeURIComponent('任务'));wait('编写并运行代码');run('wait','--fn',`document.querySelector('.monaco-editor')!==null`);layouts('http-workspace');
 // Use real browser File System handles in its origin-private filesystem to verify the save flow.
 ev(`window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('r9-save-verification',{create:true})};true`);
 click('保存到本地目录');wait('保存工程到本地');check(text().includes('代码')||ev(`document.querySelector('[role=dialog]').textContent.includes('TaskServer.java')`),'local-save preview lists declared files');click('保存这些文件');wait('已将1个文件保存到');
 check(ev(`(async()=>{const root=await navigator.storage.getDirectory();const dir=await root.getDirectoryHandle('r9-save-verification');return (await (await dir.getFileHandle('TaskServer.java')).getFile()).size>0})()`),'directory save writes actual file contents');
 }
 if(!process.argv.includes('--sql-only')){run('open',base+'/learn/boot-foundations/1.0/boot-start?tab='+encodeURIComponent('任务'));wait('编写并运行代码');run('wait','--fn',`document.querySelector('.monaco-editor')!==null`);check(text().includes('Application.java')&&text().includes('pom.xml'),'Boot multi-file workspace is available');layouts('boot-workspace');}
 run('open',base+'/learn/sql/1.0/db-connect?tab='+encodeURIComponent('任务'));wait('SQL代码');run('wait','--fn',`document.querySelector('.monaco-editor')!==null`);check(text().includes('保存到本地目录'),'SQL has code editor and local save');layouts('sql-workspace');
 run('set','viewport','375','1000');click('打开导航');run('click','.sidebar .personal-trigger');check(ev(`document.querySelector('[role=menu]').getBoundingClientRect().right<=innerWidth`),'personal menu fits mobile viewport');run('press','Escape');
 run('open',base+'/profile');wait('我的学习数据');run('set','viewport','1440','1000');run('screenshot',path.join(out,'personal-center-final.png'));check(!text().includes('从读懂接口'),'removed introductory banner stays removed');
 console.log(JSON.stringify({checks:report.checks.length,layouts:report.layouts.length,audits:report.audits},null,2));
}finally{fs.writeFileSync(path.join(out,(process.argv.includes('--finish')||process.argv.includes('--sql-only'))?'personal-center-finish-report.json':'personal-center-report.json'),JSON.stringify(report,null,2))}
