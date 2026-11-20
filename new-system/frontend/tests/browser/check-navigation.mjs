import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const bin=process.env.CS_BROWSER_BIN,session='cs-nav-check-1112',base='http://127.0.0.1:5178';
if(!bin)throw new Error('Set CS_BROWSER_BIN.');
const out=path.resolve('../docs/acceptance/navigation');fs.mkdirSync(out,{recursive:true});
const report={checks:[],layouts:[],audits:[],errors:[]};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return r.stdout.trim();}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return JSON.parse(r.stdout);}
function check(pass,name){report.checks.push({pass:!!pass,name});if(!pass)report.errors.push(name);}
function route(){return ev('location.pathname');}
function click(selector){run('click',selector);run('wait','100');}
function action(name){run('find','role','button','click','--name',name);run('wait','150');}
function audit(name){const r=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,'axe-'+name+'.json'),JSON.stringify(r,null,2));report.audits.push({name,counts:r.data.counts});if(r.data.counts.violations)report.errors.push('axe: '+name);}
try{
 run('set','viewport','1440','900');run('open',base+'/path');run('wait','200');
 check(ev('document.querySelector("button[aria-label=后退]").disabled && document.querySelector("button[aria-label=前进]").disabled'),'Fresh entry cannot navigate outside this app');
 click('.breadcrumb-root a');check(route()==='/learn','Learning space breadcrumb opens home');
 click('.sidebar nav a[href="/projects"]');check(route()==='/projects','Sidebar opens project library');
 action('后退');check(route()==='/learn','Header back follows actual visit order');
 check(ev('!document.querySelector("button[aria-label=前进]").disabled'),'Forward enabled after back');
 run('reload');run('wait','200');
 check(ev('!document.querySelector("button[aria-label=前进]").disabled'),'Forward availability survives reload');
 action('前进');check(route()==='/projects','Forward returns to project library');
 action('后退');click('.sidebar nav a[href="/reviews"]');check(route()==='/reviews','New branch opens review');
 check(ev('document.querySelector("button[aria-label=前进]").disabled'),'New branch discards old forward history');
 click('.breadcrumb-switcher>summary');check(ev('document.querySelector("details.breadcrumb-switcher").open'),'Current location expands section links');
 click('.section-links a[href="/path"]');check(route()==='/path','Section menu navigates');
 check(ev('!document.querySelector("details.breadcrumb-switcher").open'),'Section menu closes after navigation');
 run('focus','.breadcrumb-switcher>summary');run('press','Enter');check(ev('document.querySelector("details.breadcrumb-switcher").open'),'Keyboard opens section menu');
 run('press','Escape');check(ev('!document.querySelector("details.breadcrumb-switcher").open && document.activeElement.tagName==="SUMMARY"'),'Escape closes menu and returns focus');
 click('.breadcrumb-switcher>summary');click('h1');check(ev('!document.querySelector("details.breadcrumb-switcher").open'),'Outside click closes section menu');

 for(const mode of ['light','dark']){
  if(ev('document.documentElement.dataset.theme')!==mode)action(mode==='dark'?'切换到深色模式':'切换到浅色模式');
  click('.sidebar nav a[href="/projects"]');
  const before=ev('(()=>{const r=document.querySelector(".sidebar nav a").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()');
  for(const href of ['/learn','/path','/reviews','/learn'])run('hover',`.sidebar nav a[href="${href}"]`);
  run('wait','100');
  const hover=ev('(()=>{const a=document.querySelector(".sidebar nav a"),n=document.querySelector(".sidebar nav"),c=getComputedStyle(a),r=a.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,transition:c.transitionDuration,border:c.borderColor,svg:getComputedStyle(a.querySelector("svg")).translate,overlay:getComputedStyle(n,"::before").content,tracked:n.dataset.pointerActive}})()');
  check(hover.x===before.x&&hover.y===before.y&&hover.width===before.width&&hover.height===before.height,mode+': rapid hover keeps hit boxes stable');
  check(hover.overlay==='none'&&!hover.tracked,mode+': no sliding navigation overlay');
  check(hover.svg==='none',mode+': icon remains aligned');
  check(hover.transition.split(',').every(x=>parseFloat(x)<=.081),mode+': hover transition <=80ms');
  check(ev('document.querySelectorAll(".sidebar nav a.active").length===1 && document.querySelector(".sidebar nav a.active").getAttribute("href")==="/projects"'),mode+': hovering another row preserves a single selected page');
  run('mouse','move','600','100');run('wait','100');
  check(ev('!document.querySelector(".sidebar nav a:hover")'),mode+': leaving clears hover immediately');
  run('hover','.sidebar nav a[href="/learn"]');click('.sidebar nav a[href="/learn"]');
  check(ev('document.querySelector(".sidebar nav a.active").getAttribute("href")==="/learn"'),mode+': click immediately updates selected page');
  run('mouse','move','600','100');
  click('.breadcrumb-switcher>summary');audit(mode+'-menu');run('screenshot',path.join(out,mode+'-menu.png'));run('press','Escape');
  for(const target of ['/learn','/path','/projects','/settings','/learn/http-json/1.1/json']){
   // Protect the daily learning position during visual inspection.
   run('network','route','**/api/v1/learning/sessions/local','--body','{"id":"navigation-preview","revision":0}');
   run('open',base+target);run('wait','150');
   for(const width of [320,375,768,1024,1440]){
    run('set','viewport',String(width),'900');
    const v=ev('({width:innerWidth,scroll:document.documentElement.scrollWidth,header:document.querySelector(".topbar").scrollWidth})');
    const fits=v.scroll<=width+1&&v.header<=width+1;
    report.layouts.push({mode,target,...v,pass:fits});if(!fits)report.errors.push(`${mode} ${target} ${width} overflow`);
   }
  }
  run('open',base+'/learn');run('wait','150');run('set','viewport','320','900');click('.breadcrumb-switcher>summary');
  check(ev('document.documentElement.scrollWidth<=innerWidth'),mode+': open menu fits 320px');
  audit(mode+'-mobile-menu');run('screenshot',path.join(out,mode+'-mobile.png'));run('press','Escape');
  run('find','role','button','click','--name','打开导航');run('wait','100');
  check(ev('document.querySelector(".sidebar").contains(document.activeElement)'),mode+': mobile sidebar receives focus');
  run('press','Escape');check(ev('document.activeElement.classList.contains("mobile-menu")'),mode+': mobile sidebar returns focus');
  run('set','viewport','1440','900');
 }
 ev('document.documentElement.dataset.motion="reduce"');
 check(ev('getComputedStyle(document.querySelector(".sidebar nav a")).transitionDuration==="0s"'),'Reduced motion disables row transition');
}catch(e){report.errors.push(String(e));}finally{fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(report,null,2));run('close');}
console.log(JSON.stringify({checks:report.checks.length,layouts:report.layouts.length,audits:report.audits,errors:report.errors},null,2));if(report.errors.length)process.exitCode=1;
