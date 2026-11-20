import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const bin=process.env.CS_BROWSER_BIN,session='cs-themes-finish-1112',base='http://127.0.0.1:5178';
if(!bin)throw new Error('Set CS_BROWSER_BIN.');
const out=path.resolve('../docs/acceptance/palette-refresh'),report={audits:[],checks:[],errors:[]};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return r.stdout.trim();}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return JSON.parse(r.stdout);}
function open(route){run('open',base+route);run('wait','250');}
function check(pass,name){report.checks.push({pass:!!pass,name});if(!pass)report.errors.push(name);}
function audit(name){const r=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,'axe-'+name+'.json'),JSON.stringify(r,null,2));report.audits.push({name,counts:r.data.counts});if(r.data.counts.violations)report.errors.push(name);}
function shot(name){run('screenshot',path.join(out,name+'.png'));}
try{
 run('set','viewport','1440','1000');open('/learn');
 run('network','route','**/api/v1/learning/sessions/local','--body','{"id":"appearance-preview","revision":0}');
 for(const mode of ['light','dark']){
  open('/settings');run('check',`.theme-option input[value=${mode}]`);run('wait','200');
  const prefix=mode==='light'?'cupcake':'synthwave';shot(prefix+'-settings');
  open('/projects');audit(mode+'-projects');shot(prefix+'-projects');
  open('/learn');shot(prefix+'-home');
  run('find','role','button','click','--name','快捷导航');run('wait','250');audit(mode+'-dialog');shot(prefix+'-dialog');
  for(let i=0;i<14;i++){run('press','Tab');check(ev('!!document.querySelector("[role=dialog]")?.contains(document.activeElement)'),mode+': dialog traps focus '+i);}
  run('press','Escape');check(ev('document.activeElement.classList.contains("quick-trigger")'),mode+': command restores trigger');
  open('/learn/http-json/1.1/json');shot(prefix+'-lesson');
  const ratios=ev(`(()=>{function rgb(color){const c=document.createElement('canvas'),x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3)}function lum(a){const v=a.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return .2126*v[0]+.7152*v[1]+.0722*v[2]}return [...document.querySelectorAll('.tab-index')].map(e=>{const a=lum(rgb(getComputedStyle(e).color)),b=lum(rgb(getComputedStyle(e.closest('.lesson-main')).backgroundColor));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)})})()`);
  check(ratios.every(x=>x>=4.5),mode+': tab-index contrast '+ratios.map(x=>x.toFixed(2)).join('/'));
  run('set','viewport','375','1000');run('wait','200');
  run('find','role','button','click','--name','学习辅导');run('wait','250');audit(mode+'-tutor-mobile');shot(prefix+'-tutor-mobile');
  run('press','Escape');check(ev('!!document.activeElement.closest(".tutor-drawer-trigger")'),mode+': tutor restores focus');
  open('/learn');shot(prefix+'-home-mobile');open('/settings');shot(prefix+'-settings-mobile');
  run('set','viewport','1440','1000');
 }
 open('/settings');run('check','.theme-option input[value=light]');
 const originalTab=JSON.parse(run('tab','--json')).data.tabs.find(t=>t.active).tabId;
 run('tab','new',base+'/settings');run('wait','250');run('check','.theme-option input[value=dark]');run('tab',originalTab);run('wait','200');
 check(ev('document.documentElement.dataset.theme==="dark" && document.querySelector("input[value=dark]").checked'),'Cross-tab preference synchronizes');
 run('check','.theme-option input[value=light]');
}catch(e){report.errors.push(String(e));}finally{fs.writeFileSync(path.join(out,'finish-checks.json'),JSON.stringify(report,null,2));run('close');}
console.log(JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;
