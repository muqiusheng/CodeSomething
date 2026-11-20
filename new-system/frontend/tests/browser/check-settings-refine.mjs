import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const bin='D:/Document/codex/杂项/skill-workbench/video-browser-runtime/node_modules/agent-browser/bin/agent-browser-win32-x64.exe',session='cs-settings-refine';
const out='D:/data/Java/lgh/vs code/CodeSomething/new-system/docs/acceptance/settings-refine';const report={checks:[],layouts:[],audits:[]};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw Error(r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function check(pass,name){report.checks.push({pass:!!pass,name});if(!pass)throw Error(name)}
run('network','unroute');run('open','http://127.0.0.1:5178/settings');run('wait','200');
for(const mode of ['light','dark']){
 run('set','viewport','1440','1000');
 if(ev('document.documentElement.dataset.theme')!==mode)run('find','role','button','click','--name',mode==='light'?'切换到浅色模式':'切换到深色模式');
 for(const w of [320,375,768,1024,1440]){run('set','viewport',String(w),'1000');const fits=ev('document.documentElement.scrollWidth<=innerWidth+1');report.layouts.push({mode,width:w,pass:fits});check(fits,mode+' layout '+w)}
 run('scrollintoview','.connection-settings');run('screenshot',out+'/'+mode+'-connection.png');run('scrollintoview','.motion-preferences');run('screenshot',out+'/'+mode+'-motion.png');
 const a=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(out+'/axe-'+mode+'.json',JSON.stringify(a,null,2));report.audits.push({mode,counts:a.data.counts});check(a.data.counts.violations===0,mode+' accessibility');
 run('set','viewport','320','1000');run('scrollintoview','.motion-preferences');run('screenshot',out+'/'+mode+'-mobile.png');
}
check(ev('!document.querySelector(".header-breadcrumbs") && document.querySelector("button[aria-label=后退]")!==null'),'Header only has history arrows');
run('network','route','**/api/v1/profiles/me/preferences','--body',JSON.stringify({dailyMinutes:60,motion:'reduce',revision:1,updatedAt:'2026-11-12T00:00:00Z'}));
run('check','.motion-option input[value=reduce]');run('wait','200');
check(ev('document.documentElement.dataset.motion==="reduce" && document.querySelector(".motion-option input[value=reduce]").checked'),'Motion selection updates immediately');
check(ev('document.querySelector(".motion-save").textContent.includes("已保存")'),'Motion save feedback');
run('network','route','**/api/v1/tutor/connection','--body',JSON.stringify({status:'unavailable',message:'本机登录已失效，请重新登录后重试。'}));
run('find','role','button','click','--name','检查连接');run('wait','250');check(ev('document.querySelector(".connection-result").textContent.includes("重新登录")'),'Connection recovery message');
run('network','unroute','**/api/v1/tutor/connection');
run('network','route','**/api/v1/tutor/connection','--body',JSON.stringify({status:'ready',message:'本机ChatGPT已连接',model:'verification-model'}));
run('find','role','button','click','--name','检查连接');run('wait','200');check(ev('document.querySelector(".connection-model code").textContent==="verification-model" && document.querySelector(".connection-badge").textContent==="已连接"'),'Connection model and state update');check(ev('document.querySelector(".connection-result").textContent===""'),'No repeated connected message');
fs.writeFileSync(out+'/checks.json',JSON.stringify(report,null,2));run('close');console.log(JSON.stringify(report));
