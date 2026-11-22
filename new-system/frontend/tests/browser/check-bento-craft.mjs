
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const bin=process.env.CS_BROWSER_BIN;
assert.ok(bin,'Set CS_BROWSER_BIN to the agent-browser executable.');
const session='cs-bento-craft';
const base=process.env.CS_FRONTEND_URL||'http://127.0.0.1:5278';
const output=process.env.CS_BENTO_OUTPUT||join(tmpdir(),'cs-bento-craft');
mkdirSync(output,{recursive:true});
const resultsFile=join(output,'results.json');
const evidence={layout:[],contrast:[],interactions:[]};
function run(args,input){
 const result=spawnSync(bin,['--session',session,...args],{input,encoding:'utf8',windowsHide:true,timeout:30000});
 assert.equal(result.status,0,result.stdout+result.stderr);
 return result.stdout.trim();
}
const evaluate=code=>JSON.parse(run(['eval','--stdin'],code));
const open=(url,selector)=>{run(['open',base+url]);run(['wait',selector]);run(['wait','.topbar']);};
const click=selector=>run(['click',selector]);
const sizes=[[1440,900],[1024,768],[768,1024],[390,844],[320,720]];
const http='/learn/http-json/1.1/workspace?tab='+encodeURIComponent('任务');
const workspaces=[
 ['http',http,'.foundation-lesson'],
 ['boot','/learn/boot-foundations/1.0/boot-start?tab='+encodeURIComponent('任务'),'.boot-learning'],
 ['sql','/learn/sql/1.0/sql-read?tab='+encodeURIComponent('任务'),'.sql-workbench'],
 ['project-a','/learn/task-manager/1.0/a-read?tab='+encodeURIComponent('任务'),'.boot-learning'],
 ['project-b','/learn/collaboration/1.0/b-login?tab='+encodeURIComponent('任务'),'.boot-learning'],
];

function inspect(id,w,h,capture=true){
 const layout=evaluate("(() => ({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,main:document.querySelector('#main').getBoundingClientRect().width,header:document.querySelector('.topbar').getBoundingClientRect().height,overflow:[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&getComputedStyle(e).position!=='absolute'}).slice(0,8).map(e=>e.className)}))()");
 evidence.layout.push({id,...layout});
 assert.equal(layout.width,w,id); assert.equal(layout.height,h,id);
 if(capture)run(['screenshot',join(output,id+'.png')]);
 assert.ok(layout.scroll<=w+1,id+' '+JSON.stringify(layout));
 if(w<=640)assert.ok(layout.header<=60,id+' header wraps');
}

try {
 for(const [palette,mode] of [['emerald','light'],['emerald','dark'],['cupcake-synthwave','light'],['cupcake-synthwave','dark']]){
  open('/learn','.home-sandbox');
  evaluate("(() => {localStorage.setItem('cs-palette',"+JSON.stringify(palette)+");localStorage.setItem('cs-theme',"+JSON.stringify(mode)+");return true})()");
  open('/learn','.home-hero');
  const appearance=evaluate("({palette:document.documentElement.dataset.palette,mode:document.documentElement.dataset.theme})");
  assert.deepEqual(appearance,{palette,mode});
  for(const [w,h] of sizes){
   run(['set','viewport',String(w),String(h)]);
   open('/learn','.home-hero');
   inspect('home-'+palette+'-'+mode+'-'+w,w,h);
   open(http,'.foundation-lesson');
   inspect('http-'+palette+'-'+mode+'-'+w,w,h);
  }
 }
 run(['set','viewport','1440','900']);
 open('/learn','.home-hero');
 const primaryToggle=".header-right button[aria-label^='切换到']";
 const before=evaluate("document.documentElement.dataset.theme");
 click(primaryToggle);
 assert.notEqual(evaluate("document.documentElement.dataset.theme"),before);
 click('.palette-toggle');
 run(['wait','.palette-popover']);
 run(['press','Escape']);
 evidence.interactions.push('顶栏明暗切换和配色菜单');
 const rail=()=>evaluate("(() => {const first=document.querySelector('.sidebar nav svg').getBoundingClientRect(),toggle=document.querySelector('.desktop-sidebar-toggle svg').getBoundingClientRect();return {open:document.querySelector('.sidebar').dataset.expanded,first:first.x+first.width/2,toggle:toggle.x+toggle.width/2}})()");
 assert.equal(rail().open,'false');
 assert.ok(Math.abs(rail().first-rail().toggle)<=1);
 click('.desktop-sidebar-toggle');assert.equal(rail().open,'true');
 run(['wait','250']);assert.ok(Math.abs(rail().first-rail().toggle)<=1);
 inspect('rail-expanded',1440,900);click('.desktop-sidebar-toggle');
 click('.sandbox-states button:nth-child(2)');
 assert.match(evaluate("document.querySelector('.home-example-response').innerText"),/404 Not Found/);
 click('.sandbox-states button:nth-child(3)');
 assert.match(evaluate("document.querySelector('.home-example-task').innerText"),/服务暂时无法读取任务/);
 click('.sandbox-states button:first-child');click('.home-example-preview button');
 assert.match(evaluate("document.querySelector('.home-example-response pre').innerText"),/"completed": true/);
 assert.match(evaluate("document.querySelector('.home-example-task').innerText"),/已完成/);
 evidence.interactions.push('桌面侧栏收放和图标同轴','沙盒 200/404/500 切换及任务状态联动');
 run(['set','viewport','320','720']);
 run(['wait','.mobile-menu']);
 click('.mobile-menu');run(['wait','220']);
 assert.equal(evaluate("document.querySelector('.mobile-nav-slot').dataset.open"),'true');
 const targets=evaluate("[...document.querySelectorAll('.topbar :is(.mobile-menu,.theme-toggle,.quick-trigger,.personal-trigger.compact)')].map(e=>[e.offsetWidth,e.offsetHeight])");
 assert.ok(targets.every(([w,h])=>w>=44&&h>=44),JSON.stringify(targets));
 inspect('mobile-menu-open',320,720);
 run(['press','Escape']);assert.equal(evaluate("document.activeElement.classList.contains('mobile-menu')"),true);
 evidence.interactions.push('320 px 菜单、Esc 焦点归还和 44 px 顶栏触控');

 const palettes=['emerald','indigo','terracotta','ocean','graphite','forest','rose','amber','cupcake-synthwave'];
 open('/learn','.home-hero');
 for(const mode of ['light','dark'])for(const palette of palettes){
  const report=evaluate('('+((palette,mode)=>{
   const root=document.documentElement;
   root.dataset.theme=mode;root.dataset.palette=palette;
   const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   function rgb(color){ctx.clearRect(0,0,1,1);ctx.fillStyle='#000';ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3)}
   function luminance(c){return rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}
   function ratio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
   const primary=getComputedStyle(document.querySelector('.home-hero .primary'));
   const brand=getComputedStyle(document.querySelector('.brand-symbol'));
   const accent=getComputedStyle(document.querySelector('.home-status'));
   const code=getComputedStyle(document.querySelector('.home-code-card'));
   return {palette,mode,button:ratio(primary.color,primary.backgroundColor),brand:ratio(brand.color,brand.backgroundColor),accentBrand:ratio(getComputedStyle(document.querySelector('.brand-stroke-secondary')).fill,brand.backgroundColor),badge:ratio(accent.color,accent.backgroundColor),code:ratio(code.color,code.backgroundColor)};
  }).toString()+')('+JSON.stringify(palette)+','+JSON.stringify(mode)+')');
  evidence.contrast.push(report);
  const minimum=palette==='cupcake-synthwave'&&mode==='light'?5:4.5;
  assert.ok(report.button>=minimum&&report.brand>=minimum&&report.accentBrand>=minimum&&report.badge>=4.5&&report.code>=4.5,JSON.stringify(report));
 }
 run(['set','media','dark','reduced-motion']);
 open('/learn','.home-hero');
 evaluate("(() => {localStorage.setItem('cs-theme','system');return true})()");
 open('/learn','.home-hero');
 assert.equal(evaluate("document.documentElement.dataset.theme"),'dark');
 run(['set','media','light','reduced-motion']);
 assert.equal(evaluate("document.documentElement.dataset.theme"),'light');
 assert.equal(evaluate("getComputedStyle(document.querySelector('.mobile-nav-slot')).transitionDuration"),'0s');
 evidence.interactions.push('跟随系统主题及减少动态效果');
 run(['set','viewport','1440','900']);
 open(http,'.workspace-results-mode');
 const divider=evaluate("document.querySelector('.guided-coding-layout > .workspace-divider')?.getBoundingClientRect().width || 0");
 assert.equal(divider,12);
 const sectionWidth=()=>evaluate("document.querySelector('.workspace-task-pane').getBoundingClientRect().width");
 const beforeResize=sectionWidth();
 run(['focus','.guided-coding-layout > .workspace-divider']);
 run(['press','ArrowRight']);
 assert.ok(sectionWidth()>beforeResize);
 click('.workspace-results-mode');
 run(['wait','.workspace-results[data-floating=true]']);
 const geometry=()=>evaluate("(() => {const r=document.querySelector('.workspace-results[data-floating=true]').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()");
 const floating=geometry();
 run(['focus','.workspace-results-move']);
 run(['press','ArrowRight']);run(['press','ArrowDown']);
 assert.ok(geometry().x>floating.x&&geometry().y>floating.y);
 run(['focus','.workspace-results-resize']);
 run(['press','ArrowRight']);run(['press','ArrowDown']);
 assert.ok(geometry().w>floating.w&&geometry().h>floating.h);
 run(['screenshot',join(output,'results-floating.png')]);
 click('.workspace-results-mode');
 evidence.interactions.push('HTTP 分隔条键盘调宽、结果浮窗、双轴移动和缩放');
 for(const [w,h] of sizes){
  run(['set','viewport',String(w),String(h)]);
  for(const [name,url,sel] of workspaces.slice(1)){open(url,sel);inspect(name+'-'+w,w,h,w===1440||w===390);}
  open('/school','.school-home');
  const lab=evaluate("document.querySelector('.school-lab-list a')?.getAttribute('href') || null");
  assert.ok(lab,'课内实战缺少可打开的实验');
  open(lab,'.school-workspace');inspect('school-'+w,w,h,w===1440||w===390);
 }
} finally {
 writeFileSync(resultsFile,JSON.stringify(evidence,null,2));
 run(['close']);
}
